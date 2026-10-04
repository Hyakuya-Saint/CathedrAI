# CathedrAI: engine, import and diagnostics (v0.3)

## How the pieces fit
- `www/index.html` is the whole UI.
- `native-android/` holds everything native. CI copies it into the generated `android/` project with `patch-android.py`.
  - `CathedraPlugin.java`: file picker, streaming import, resumable download, engine control, diagnostics.
  - `GgufInfo.java`: reads the GGUF header (validation + architecture, quant, native context, layers).
  - `Diag.java`: persistent logs, "operation in flight" markers, Java crash capture, Android exit reasons.
  - `cpp/cathedrai_jni.cpp`: llama.cpp wrapper (load, streaming generate, stop, unload, KV-cache reuse).
- The two third-party plugins (file picker, filesystem) are gone. Models are copied once, straight from Android's
  document picker into app-private storage, with progress, free-space check and header validation.

## If something fails
Open **Diagnostics** (sidebar) then **Share report**. The report contains device/RAM/CPU info, why Android says earlier runs ended,
the operation that was in progress if the app died, the engine log and the UI log. **Run self-test** loads the appointed model and generates 16 tokens.

## Build knobs (Actions > Build APK > Run workflow, or repository variables)
- `llama_tag` / `LLAMA_TAG`: llama.cpp release to build (default b9842, the first build line that knows Gemma 4). Use a newer one if a new model architecture is "unknown".
- `arm_arch` / `CATHEDRAI_ARM_ARCH`: default `armv8.2-a+dotprod` (nearly every phone since ~2018). `armv8-a` is slower but runs everywhere.

## New in v0.3
- **Gemma 4**: engine bumped to llama.cpp b9842; the prompt is built by hand in Gemma 4's `<|turn>` format and `<turn|>` is a stop token.
- **Images**: build includes libmtmd. A model needs its own vision file (the `mmproj-*.gguf` from the same model page); add it from the model card. Without it the Saint is text-only. If the image-enabled build ever fails, CI retries without it automatically.
- **Files**: PDF, DOCX, PPTX, XLSX, ODT/ODP/ODS, EPUB, RTF, HTML, CSV and code are read in the app (PDF loads pdf.js once from a CDN). Tap any attachment chip to preview it.
- **Web**: globe button next to the output type. *Blend* = one search + quick read of the top pages. *Intensive* = three searches, deeper page reads, structured analysis. Uses DuckDuckGo (Bing as fallback), fetched natively.
- **Canvas**: documents (editable), slides (editable, exports a slideshow .html) and web apps (live preview + code), saved through Android's Save-as picker.
- **BMO**: the model starts each reply with a one-word mood tag, stripped before display; a tiny keyword guess reacts to your prompt instantly.
- Launcher icon and favicon come from `cathedral_ai_icon_512x512.png`.

## v0.5 — what's new
- Slides: real designer (themes, backgrounds, layouts, decorations, title styles, editor tabs, animated HTML export).
- Power button beside the Saint selector (off / standby / awake; same unload as idle sleep; configurable in Hub).
- Copy keeps bold for Word/Docs without `**`; plain and Markdown copy in the menu.
- Hierarchy → Persona: one default + your own personalities (prompt, story, scenario, greeting, lore + docs, examples, user profile, boundaries, vessel/voice binding), every section switchable, optional save state.
- Prompt whitespace and Shift+Enter preserved.
- Dictation, live talk, 3D VRM space, Piper voice import, Whisper fallback hearing.

## Not verified on real hardware
Piper inference through onnxruntime-web, Whisper via transformers.js (needs internet once), Gemma 4 audio tower (detected at load: `audio` flag), real VRoid models, Android WebView mic/TTS. The CI step `scripts/vendor.mjs` bundles ONNX runtime. Piper synthesis runs on the main thread, so expect brief UI hitches while a sentence is generated.
"Ink lines" are off by default (toggle in Hub → Live space look).

## v0.5.1 — voice engine fix
- **Fixed** `HTTP 404 ... vendor/ort/ort-wasm-simd-threaded.wasm`: `scripts/vendor.mjs` skipped every filename containing "threaded", which is exactly the runtime file onnxruntime-web 1.20 needs. It now skips only `jsep`, `webgpu` and `training`, and **fails the build** if `ort.min.js`, `ort-wasm-simd-threaded.mjs` or `ort-wasm-simd-threaded.wasm` is missing.
- The Web Preview workflow now also runs `npm install` + `vendor.mjs` (it used to publish `www/` without the runtime).
- `live/voice.js`: the runtime files are checked before use (HTTP status, wasm header, not an HTML error page), local copy first then CDN, handed to ort as Blob URLs, and every start attempt uses a freshly loaded ort (ort refuses to retry after a failed start). The error now lists what each attempt hit.
- Voice import picks the `.json` that belongs to the `.onnx` (`<name>.onnx.json`). Multi-speaker voices such as en_GB-semaine-medium (prudence, spike, obadiah, poppy) list their speakers from the config.
- Existing imported voices stay as they are; just install the new APK.

## v0.6.0 — animation merge, camera, web search, noise reduction
- **Animations**: every dance, pose, finger preset, the 7-minute "curious idle" attention script, gaze saccades, brow / eye-widen morphs and blink timing of the VRoid Anime Studio page (`index.html`) now live in `www/live/space-anim.js` (data copied verbatim, so it plays exactly as there). Moods map onto them: think→Thinking, happy→Idol Step, love→Heart Hands, pout→Grumpy Sulking, confused→Shrug, excited→Victory Jump, wink→Peace Sign. Also directly callable: `wave peace bow kyun listen shrug hmm jojo shy grumpy pouting-think idol-step nyan victory catwalk groove` and `dance` (random). sad / angry / surprised / sleepy / smug / scared / dizzy have no counterpart on the studio page, so their original poses stay (with brows and bounce added).
- **Unchanged**: choppy Spider-Verse timing, toon model shader, ink + halftone, neon cyber lights and the framing code.
- **Bubbly transitions**: springy hop, bouncy knees, follow-through and an eased overshoot slerp whenever the pose changes (Hub → Live space look: on/off + bounciness).
- **Face focus** camera added (Hub → Camera, or the Face button in the space). **Camera control** in the space: drag = orbit, pinch / wheel = zoom, two fingers = move, double-tap = reset, buttons Face / Upper / Full / Orbit / Reset.
- **Idle**: while waiting for you the Saint plays the curious idle and now and then a studio pose or dance (plus the old stretch / yawn / hair-fix bits). When you start talking she switches to the cupped-ear listening pose.
- **Per-sentence animation kept**: each spoken sentence still triggers its mood pose (mood tag, else a keyword guess from the sentence, else a beat).
- **Web search in live talk fixed**. Two causes: the live path forced web off, and for voice messages the search ran before the words were known (empty query). Now the web setting is honoured, the search runs after hearing, and the words come from the hearing module or, with native hearing, a tiny transcript-only pass. Live answers are spoken (no citation numbers or URLs); "intensive" runs as "blend" in live talk. The chip shows what is happening ("Searching the web…").
- **Noise reduction** (`dsp.js` Denoiser, 16 ms latency, ~0.1 ms per frame): Wiener spectral gate on the mic before voice detection and before Whisper / native hearing. Off / Light / Balanced / Strong (Hub → Hearing).
- **Near voice only** (`Vad` near gate): learns the level of the voice that talks to the Saint and ignores voices much quieter than it (TV, other room) and non-voice noise. Off / Relaxed / Balanced / Strict, plus "Re-learn my voice". It learns from the first confident sentence, so if the very first thing it hears is a distant voice it may learn that one; use Re-learn.

### Tests (all in `test/`)
`node test/nr-test.mjs` (noise reduction + near/far, 17 checks), `node test/voice-test.mjs` (22, unchanged), `python3 test/run-v06-test.py <fixture>` (animations, transitions, hearing pose, gaze, camera; run on VRM1 / VRM0 / sparse, one at a time), `python3 test/app-smoke.py` (whole app incl. live web search and camera). Fixtures: `python3 test/make-test-vrm.py`.

### Not verified on real hardware
Real VRoid models (brow morphs `Fcl_BRW_Surprised` / `Fcl_EYE_Surprised` only exist on VRoid faces; the test fixtures have none, so that path ran without effect), the near-voice thresholds with a real phone microphone and real rooms (tested on synthetic voices and noise only), Android WebView touch gestures (tested with mouse), the transcript-only pre-pass on a real Gemma 4 audio tower (tested with a fake engine), DuckDuckGo / Bing page layout today.

## v0.6.1 — Kitten voices, speaker picker, emotional tone
- **Speaker picker (Piper and Kitten)**: Hub -> Saint voice now lists the speakers of the appointed voice; the choice is that voice's default. A personality can still pick its own (Persona -> Vessel & voice -> Speaker; first entry = "Voice default"). Multi-speaker Piper files without a `speaker_id_map` now list `num_speakers` speakers instead of a fixed four.
- **KittenTTS import**: pick the model `.onnx`, `voices.bin` and `tokens.txt` together (sherpa-onnx packaging, e.g. `kitten-nano-en-v0_2-fp16`). The `espeak-ng-data` folder is NOT needed (the bundled piper_phonemize already has it). Speaker names, count, sample rate and espeak voice are read from the ONNX metadata. `kitten-nano-en-v0_2` has 8 speakers; speaker 5 = `expr-voice-4-f`, which is the default on import. Pipeline: espeak IPA -> `tokens.txt` ids framed `[0, ..., 0]` -> `input_ids` + `style` (row of voices.bin) + `speed`.
- **Emotional tone** (Hub -> Saint voice: on/off, strength 0-150 %, one test button per mood): each sentence is spoken with the mood of the Saint's mood tag (or the keyword guess). Neither engine has an emotion input, so a mood changes speed, pitch (play-back-rate trick, the model speaks slower to keep the timing), loudness, brightness (shelf EQ), pauses, tremble (scared/dizzy) and, for Piper only, `noise_scale` / `noise_w`. It is a tone colour, not acting; the numbers are in `live/emotion.js`.
- **Tests**: `node test/kitten-test.mjs <kitten-folder>` (modules, real metadata/tokens/voices), `python3 test/kitten-browser-test.py <kitten-folder>` (real `voice.js` in Chromium; inference forwarded to Python onnxruntime because onnxruntime-web is not installed here), `python3 test/kitten-ui-test.py <kitten-folder>` (Hub import, speaker pick, persona override, reload, delete).
- **Not verified**: onnxruntime-web running `model.fp16.onnx` on a phone (the fp16 weights ran fine in Python onnxruntime; the wasm build must insert the fp16 casts too; if it refuses, use the fp32 or int8 Kitten package, same three files), how the moods actually sound, Kitten v0.8 packages (multi-row `voices.bin` follows upstream's rule but was not run).

## v0.6.2 — studio wave, smooth speaking, tone blending
- **Energetic Wave everywhere**: the intro greeting and the idle `small-wave` still used the original straight-arm wave (`space-poses.js`). Both now play the studio page's Energetic Wave (`ANIM.wave`) through `mixPose()`, which eases it in and out on top of the rest of the pose. The wave starts at its own phase 0. Test: intro bone angles match the `wave` emote to < 0.01 rad.
- **Smooth speaking / acting** (`space.js`). Causes found and fixed:
  - Chop timing (sample-and-hold poses at 8-24 Hz, random interval) was also applied while she talks and acts, which made a 1.2 Hz wave or a mouth beat judder. Chop is now only used for ambient idle. New option `smoothAction` (Hub -> "Smooth motion while speaking and acting", on by default; off = old behaviour).
  - Every sentence restarted its mood pose and ran a full bubbly transition (0.1 s freeze, overshoot, squash pulse, hop). Same mood on the next sentence now just extends the running pose; a sentence mood survives the gap to the next sentence (`EMOTE_GRACE` 2.5 s) instead of dropping to neutral and back; transitions while speaking are "soft" (no freeze, no overshoot, no scale pulse, 0.6 s).
  - `stepSprings` allocated an array and strings per sub-step per frame; now allocation-free.
  - `getOutLevel()` (FFT read + smoothing) ran twice per frame (mouth driver + waveform); now once per frame.
  - **Adaptive quality** (`adaptive` option, default on): if the real frame rate stays under 80 % of the target, the render scale steps down (floor 0.55 x), then an automatic 30 fps cap. Event `quality`. Resets on `enter()`.
- **Mood blending**:
  - Face: emotional expressions (happy / angry / sad / relaxed / surprised) cross-fade from what was showing to the new target over 1.4 s (smoothstep) whenever the owner of the body changes. Sad -> happy passes through the middle instead of snapping to full happy.
  - Voice: `createMoodBlender()` in `emotion.js` keeps the tone she is speaking in and walks to a new mood over three sentences (45 %, 80 %, 100 %); a long pause relaxes toward neutral first. `playPcm` glides volume and brightness from the previous sentence's values over 0.45 s. `Voice.speak(..., { blend:false })` = exact preset (used by the Hub test buttons). `Voice.resetTone()`.
- `ears.js`: guard against a last audio block arriving after the mic was closed (intermittent `reading 'process'` of null in the smoke test).
- Tests: `node test/mood-blend-test.mjs` (12), `python3 test/run-smooth-test.py <fixture>` (wave match, idle wave, chop vs smooth pose counts, continuity, soft transitions, expression cross-fade, adaptive quality). All earlier suites still pass.
- **Not changed / not verified**: Piper / Kitten synthesis still runs on the main thread (onnxruntime-web) and blocks for the duration of one sentence's inference. If you still see a hitch right when a new sentence begins, that is the cause; moving inference to a worker is the next step. Nothing here was run on a real phone or real VRoid model, so how the new tone blend sounds is untested by ear.
