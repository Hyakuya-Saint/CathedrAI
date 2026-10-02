# CathedrAI: engine, import and diagnostics (v0.2)

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
- `llama_tag` / `LLAMA_TAG`: llama.cpp release to build (default b6200). Use a newer one if a new model architecture is "unknown".
- `arm_arch` / `CATHEDRAI_ARM_ARCH`: default `armv8.2-a+dotprod` (nearly every phone since ~2018). `armv8-a` is slower but runs everywhere.
