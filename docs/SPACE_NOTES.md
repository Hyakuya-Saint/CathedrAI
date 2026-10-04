# 3D Live Space notes (module: `www/live/space.js`)

## What exists
- `www/live/space.js` core: library loader, `createSpace`, `probeVessel`, rig driver, layers, intro/exit, render loop. Also exports `EMOTES`, `loadLibs`.
- `www/live/space-env.js` grey neon horizon (1 floor quad with shader grid, gradient dome + horizon glow, 90 shader-animated particles, blob shadow, Neon Cyber lights) and the ink/halftone post pass (own full-screen triangle, no Pass.js).
- `www/live/space-poses.js` data-driven pose library: 15 emote poses (`talk` = speaking base state), 8 idle animations, intro and exit scripts, finger presets.
- `www/vendor/three/` three r160 (`build/three.module.js`, GLTFLoader, BufferGeometryUtils) and `www/vendor/three-vrm.module.js` (three-vrm 3.0.0 built with `bun build` from the v3.0.0 tag; only imports `three`).
- `test/make-test-vrm.py`, `test/space-test.html`, `test/run-space-test.py` (Playwright). Fixtures and screenshots live in `/home/claude/work/fixtures/` (not in www).

## Using it
```js
const { createSpace, probeVessel } = await import('./live/space.js');
const space = await createSpace(hostEl, { /* options */ });   // creates canvas + environment, starts the loop
space.onevent = (type, data) => {};                           // ready | intro-done | exit-done | idle-anim | error | fps
await space.enter({ vessel: arrayBufferOrBlob });             // resolves when the intro finished
space.emote('pout', { hold: 3 }); space.setSpeaking(true); space.setMouth({open,low,mid,high}); await space.exit();
```
Library resolution: local `www/vendor` first, then jsdelivr, then unpkg. GLTFLoader/three-vrm are fetched as text, the bare `three` import is rewritten to the real URL and they are imported from Blob URLs, so no import map and no `.mjs`/MIME dependence.
Extra methods: `setFraming('upper'|'full')`, `screenshot()`, `advance(sec)`, `poseNow(name)`, `triggerIdle(name)`, `state()`.

## Behaviour notes
- Emotes: each is body pose + VRM expressions with fallbacks (no `surprised` -> small `oh`/`aa`; no `relaxed` -> weak `happy`; no `blinkLeft/Right` -> `blink`). Transient emotes return to base after `hold`; transitions are exponential smoothing of Euler targets (equivalent of the reference blend()). Auto-blink is suppressed while an expression owns the eyelids. `emote('talk')` = synthetic-mouth talking for `hold` s; `emote('idle')` clears.
- If `setSpeaking(true)` but no `setMouth` for 250 ms, a synthetic vowel cycle drives the mouth so speech never looks frozen.
- Idle director: random animation 6-14 s after the last activity; `onevent('idle-anim',{name})`.
- Chop: only bone poses are held ('mixed' = 1/24,1/12,1/12,1/8; '2'; '3'); expressions, camera, particles stay smooth. Chop also turns on the print misregistration shift in the post pass.
- VRM0: after `rotateVRM0` the normalized rig still lives in the VRM0 frame; the module detects this structurally (left lower arm local x < 0) and conjugates all rotations. Verified with the VRM0 fixture.
- `prefers-reduced-motion`: intro/exit run at 0.6x duration (still played).
- After `exit-done` the loop auto-pauses 1.2 s later (battery); `enter()` resumes. The model is left hidden under the floor.
- `enter()` rejects (and emits `error`) on an invalid vessel. `enter({})` with no vessel re-enters the previously loaded model.
- Ink lines (`edges`) are the post-shader lines (default off). The model's own MToon outlines stay on unless `modelOutline:false`.

## Tuning knobs
Options: `chop, ink, halftone, edges, neon, toonModel, fps (30|60), pixelRatio (default min(dpr,1.25)), framing, modelOutline, particles, idleMin, idleMax`.
In code: `NEON/PLAIN/GREY` (space-env.js) colours; `CHOP_MIXED`; framing factors in `computeFraming`; per-emote numbers in space-poses.js; smoothing rates in `applyPose` (9 emote / 7 base / 24 sequences); `LIM` joint clamps.

## Verified (headless Chromium, SwiftShader, see `/home/claude/work/fixtures/shots/`, `results.json`)
- Static: `node --check` on all modules; `bun build www/live/space.js` bundles.
- Fixtures VRM1 (MToon, springbone, full fingers), VRM0 (detected flip, standard materials) and sparse VRM1 (no upperChest/toes/eyes/fingers/surprised/relaxed): enter, intro, all 16 emotes, talking with fake mouth signal (mouth weights up to 0.95), synthetic mouth, listening, 8 idle anims + auto idle director (4 fired in 25 s sim), chop modes (pose updates per 90 steps: off 90, mixed ~31, 2: 30, 3: 22), edges/plain/neon-off options, exit (crouch, jump, fall below floor, `exit-done`), re-enter, dispose, calls before enter / after dispose. Zero page errors, zero console errors/warnings (the only warning is three-vrm noting duplicate thumb entries in my VRM0 fixture, filtered).
- `probeVessel` on all fixtures + garbage buffer; bad vessel rejects with an `error` event.
- Portrait and landscape framing screenshots (`framing.png`).
- Real-time SwiftShader at pixelRatio 1, 360x480: ~35-45 fps with post on (software GL). Pose/step cost ~0.04 ms per step; JS heap flat over 60 s simulated (coarse `performance.memory`, 10 MB granularity); hot path has no per-frame allocations by construction (typed arrays, shared Euler/Quaternion).

## Not verified
- Real VRoid models (VRM0 exports from VRoid Studio, MToon outlines, hair springbones, real expression binds such as VRoid `happy` closing the eyes), real GPU and Android WebView (half-float render target fallback to UInt8 sRGB is coded but untested), Capacitor asset server, CDN fallback (blocked here; the real three-vrm CDN build may import `three/examples/jsm/...` or `three/webgpu`, only the first is handled), actual TTS audio feeding `setMouth`.
- Poses were tuned on a box-figure fixture; arm/hand contact (chin, hip, face) may need small per-model tweaks on real proportions.

## v0.6 additions
- `space-anim.js`: studio-page animation data + adapter. `space-poses.js` aliases moods onto it; `EMOTES` now also lists the studio names and `dance`.
- New Space methods: `setHearing(on)` (cupped-ear pose while the user talks), `setCalm(on)` (breathing-only base; default on with prefers-reduced-motion), `setOrbit(on)`, `resetCamera(snap)`, `cameraRotate(dx,dy)`, `cameraZoom(f)`, `cameraPan(dx,dy)`, `getCamera()`. `setFraming('face'|'upper'|'full')`. Options `bubbly` (bool), `bounce` (0..2). Event `camera` on double-tap reset.
- Body ownership: seq (intro/exit) > emote (sentence mood / idle flourish) > idle bit > talk > hearing > standby (curious idle). Any change starts a bubbly eased transition; steady motion is untouched.
- `state()` additionally returns owner, hearing, calm, gaze, morph, faceMorphs, cam, bubbly, transitioning.
