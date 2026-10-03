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
