# CathedrAI v0.5 — module contract

`www/index.html` (the app shell) talks to three lazily-loaded ES modules. Each lives in `www/live/`,
resolves its own assets with `new URL('../vendor/…', import.meta.url)` and **never touches the DOM outside what it is given**.
The shell is a classic script; it loads them with `await import('./live/xxx.js')`.

The app runs inside an Android WebView (Capacitor, origin `https://localhost`, Chromium 100+), but must also run in
desktop Chrome for testing. No SharedArrayBuffer (no cross-origin isolation) => single-thread WASM only.
The Android asset server may serve `.mjs`/`.wasm` with a wrong MIME type, so: name our own files `.js`, fetch `.wasm`
as bytes and instantiate from the bytes, and turn any `.mjs` you must import into a `Blob` URL with type `text/javascript`.

Libraries are resolved **local-first, CDN-second**: try `www/vendor/...` (HEAD/fetch probe); if absent, use the pinned CDN URL.
Only these CDNs are acceptable: `https://cdn.jsdelivr.net/npm/…` (preferred), `https://unpkg.com/…`.

## 1. `live/space.js` — the 3D Live Space (owner: agent "space")

```js
export async function createSpace(host /*HTMLElement, position:relative, sized by the shell*/, opts?) -> Space
export async function probeVessel(arrayBuffer) -> { ok, version:'0'|'1', name, expressions:string[], missingBones:string[], error? }

Space = {
  async enter({ vessel: ArrayBuffer|Blob, name?: string }) // build scene, load VRM, play the friendly "pop up from below" intro. Resolves when the intro finished.
  async exit()                       // model jumps then drops below the floor, resolves when finished (shell then fades the UI in)
  emote(name, { hold = 3 } = {})     // name in EMOTES (below); transient: returns to the base state after `hold` seconds. Unknown names ignored.
  setSpeaking(on)                    // talking body language on/off (head/hand motion, mouth driven by setMouth)
  setMouth({ open, low, mid, high }) // 0..1 each; called every animation frame by the shell while audio plays (lip-sync). open=overall loudness
  setListening(on)                   // attentive pose (head tilt, look at camera, small nods) while the user is talking
  beat(strength = 1)                 // one emphasis gesture (nod / hand flick)
  setOptions(partial) / getOptions() // { chop:'mixed'|'2'|'3'|'off', ink:true, halftone:true, edges:false, neon:true, toonModel:true, fps:60|30, pixelRatio:number }
  resize()                           // host size changed
  pause() / resume()                 // stop/start the render loop (shell calls on hidden app / overlay closed)
  info                               // { metaVersion, expressions:[...], missingBones:[...] } after enter()
  onevent = (type, data)=>{}         // 'ready' | 'intro-done' | 'exit-done' | 'idle-anim' | 'error' | 'fps'
  dispose()                          // free GPU memory, remove canvas
}
EMOTES = ['idle','think','talk','happy','sad','angry','pout','confused','surprised','sleepy','love','wink','smug','scared','excited','dizzy']
```

## 2. `live/voice.js` — Saint voice (text-to-speech) (owner: agent "voice")

```js
export const Voice = {
  async init()                                    // cheap; no heavy loading
  async loadSaintVoice({ onnx: Blob|ArrayBuffer, config: object|null, name }) // Piper .onnx (+ its .onnx.json parsed, may be null)
  unloadSaintVoice()
  engine() -> 'piper' | 'system' | 'none'         // what speak() will use right now
  async speak(text, { speaker = 0, speed = 1, volume = 1, signal } = {}) -> Promise<void> // queued; resolves when this utterance finished playing (or was stopped)
  stopSpeaking()                                  // flush queue + stop audio immediately
  isSpeaking() -> boolean
  getOutLevel() -> { rms, low, mid, high }        // 0..1, sampled "now" from an AnalyserNode (or synthetic envelope for the system voice)
  speakers -> [{id,name}]                         // from config.speaker_id_map, [] if single speaker
  async selfTest(report /*(stepName, ok, detail)=>void*/) -> boolean
  onerror = (err)=>{}
}
```
Text passed to `speak` is already plain (no markdown/mood tags). Split long text into sentences internally so synthesis of
sentence N+1 overlaps playback of sentence N. The Piper path must use the espeak phonemizer in `www/vendor/piper/`
(`piper_phonemize.js/.wasm/.data`, the diffusionstudio build) to get phoneme ids, then `onnxruntime-web` for inference.
If Piper is not loaded or fails, fall back to `speechSynthesis` (system voice) so speech never silently dies.

## 3. `live/ears.js` — microphone, voice detection, speech-to-text (owner: agent "voice")

```js
export const Ears = {
  async start({ sensitivity = 0.5, onSpeechStart, onSpeechEnd, onLevel, onError }) // opens the mic, continuous VAD
      // onSpeechEnd({ pcm: Float32Array /*mono 16 kHz*/, seconds, peak })  — fired only for real human speech
  stop(); pause(); resume(); isActive()
  setSensitivity(0..1); setEchoGuard(bool)       // echoGuard: while the Saint is talking, require a much stronger voice (barge-in only on loud speech)
  getInLevel() -> { rms, bands:Float32Array(16) } // for the waveform button
  async recordOnce({ maxSeconds = 30, silenceSeconds = 1.2, onLevel }) -> { pcm, seconds } | null // dictation: waits for speech, stops after silence
  whisper: {
    status() -> { installed:boolean, model:string|null, sizeMB:number|null }
    async install(model /* 'tiny.en' | 'base.en' | 'small.en' */, onProgress /*(0..1, text)=>void*/)
    async transcribe(pcm /*Float32Array 16k*/, { language = 'en' } = {}) -> string   // '' for hallucinated / empty results
    async remove()
  }
}
```
Whisper = `@huggingface/transformers` v3 (`pipeline('automatic-speech-recognition','Xenova/whisper-tiny.en')`), loaded with a dynamic
`import()` from the CDN (local copy in `www/vendor/transformers/` if present), model files cached by the library in Cache Storage.

## 4. Native additions (owner: agent "native")

`Cathedra.loadModel(...)` result gains `audio: boolean` (true when the loaded mmproj has an audio encoder).
`Cathedra.generate({... images:[...], audios:[{pcm:'<base64 of little-endian float32 mono 16 kHz samples>'}] })`: each audio becomes one
`<__media__>` marker + `mtmd_bitmap_init_from_audio` bitmap in the user turn, exactly like images. Everything lives behind `#ifdef CATHEDRAI_VISION`.
Manifest gets RECORD_AUDIO, MODIFY_AUDIO_SETTINGS and the `<queries>` entries for TTS_SERVICE / RecognitionService.
