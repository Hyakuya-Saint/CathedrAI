# Audio input (v0.5.0)

## What changed
- `cpp/cathedrai_jni.cpp` (all new mtmd code is inside `#ifdef CATHEDRAI_VISION`, so the `vision.off` CI fallback still builds):
  - `nLoad` result gains `"audio": true|false` = `mtmd_support_audio(ctx)` (false when no mmproj / vision.off). Also logged.
  - `nGenerate` takes `byte[][] audios`; each clip is raw little-endian float32 mono 16 kHz PCM. Clips become `mtmd_bitmap_init_from_audio` bitmaps.
  - One `<__media__>` marker per image, then one per audio clip, is prefixed to the LAST user message (idempotent across the context-trimming loop). Bitmap order = marker order (images first, then audio). Works for Gemma 4 hand-built `<|turn>` prompts and for generic templates.
  - Audio/image turns bypass KV-cache reuse (cache is cleared first and marked dirty so the next text turn clears it again), same as images.
  - Result JSON gains `audioUsed`.
- `LlamaBridge.java`: `nGenerate(..., imgs, imgW, imgH, audios, cb)`.
- `CathedraPlugin.java`: `generate` parses `audios` (`[{pcm: base64}]`), Base64-decodes, passes through.
- `patch-android.py`: VERSION 0.5.0; manifest gets RECORD_AUDIO, MODIFY_AUDIO_SETTINGS, microphone `uses-feature` (required=false) and a `<queries>` block with TTS_SERVICE and RecognitionService intents (merged into an existing `<queries>`). Idempotent.
- Whitespace: there was NO trimming of message content in the C++ or in `CathedraPlugin.generate` (content goes through `getBytes(UTF_8)` untouched and is concatenated raw into the prompt). Nothing needed changing; the other `.trim()` calls in Java are for filenames/CPU info/headers.

## JS contract
```js
const r = await Cathedra.loadModel({path, nCtx, threads, proj});   // r.audio === true if the mmproj has an audio encoder
const g = await Cathedra.generate({
  messages: [...], /* ...existing options... */
  images: [{w, h, rgb: b64}],              // unchanged
  audios: [{pcm: b64}]                     // b64 of Float32 little-endian mono 16000 Hz samples, range -1..1
});
// g: existing fields + audioUsed:boolean. On a model without audio: {ok:false, audioIgnored:true, error:"..."}
```
Limits: max 2 clips (extras dropped, logged); each clip truncated to 480000 samples (30 s); byte length not a multiple of 4 loses the tail; empty clips rejected (all empty -> error "recording was empty"); NaN or |x|>4 samples become 0.

## Requirements
The mmproj (`mmproj-*.gguf`) must contain the audio tower (Gemma 3n / Gemma 4 E2B/E4B mmproj files do). Check the log line `LOAD vision projector ok: ... audio=1 audioRate=16000`. Engine tag must be b9842 or newer (API verified at b9842).

## Known failure modes
- mmproj without audio encoder: `audio:false`, generate with audios returns the `audioIgnored` error (no crash).
- Audio tokens count against the context: ~25 tokens/s of audio on Gemma-style encoders; a 30 s clip may need ~750+ tokens. Too large -> "media and your message need N tokens" error; raise Context size.
- Sample rate is not checked on the native side: JS must resample to 16 kHz (log prints the model's expected rate).
- Eval error code from mtmd -> "The model could not read the image/audio (code N)".
- Large IPC payload (30 s = 1.9 MB raw, 2.6 MB base64) through the Capacitor bridge is fine but slow on low-end phones.
