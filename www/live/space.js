// CathedrAI 3D Live Space (module contract: docs/MODULE_API.md section 1).
//   import { createSpace, probeVessel } from './live/space.js'
// three r160 + @pixiv/three-vrm 3.0.0 are resolved local-first (www/vendor/…) then from the pinned CDN.
// Helper modules: space-env.js (grey neon horizon + post), space-poses.js (emote / idle / intro / exit pose library).
import { createEnv, createPost } from './space-env.js';
import { EMOTES, EMOTE_ALIAS, FP, POSE, IDLE_ANIMS, introPose, exitPose, INTRO_DUR, ANIM, DANCE_NAMES, LEGACY_ENERGY, LEGACY_REACT } from './space-poses.js';

export { EMOTES };

/* ------------------------------------------------------------------------------------------------ library loading */
const V = { three: '0.160.0', vrm: '3.0.0' };
const LOCAL = {
  three: new URL('../vendor/three/build/three.module.js', import.meta.url).href,
  gltf: new URL('../vendor/three/examples/jsm/loaders/GLTFLoader.js', import.meta.url).href,
  vrm: new URL('../vendor/three-vrm.module.js', import.meta.url).href,
};
const CDN = {
  three: `https://cdn.jsdelivr.net/npm/three@${V.three}/build/three.module.js`,
  gltf: `https://cdn.jsdelivr.net/npm/three@${V.three}/examples/jsm/loaders/GLTFLoader.js`,
  vrm: `https://cdn.jsdelivr.net/npm/@pixiv/three-vrm@${V.vrm}/lib/three-vrm.module.js`,
};
const CDN2 = { three: CDN.three.replace('cdn.jsdelivr.net/npm', 'unpkg.com'), gltf: CDN.gltf.replace('cdn.jsdelivr.net/npm', 'unpkg.com'), vrm: CDN.vrm.replace('cdn.jsdelivr.net/npm', 'unpkg.com') };

// Dependents (GLTFLoader, three-vrm) import the bare specifier "three". Without relying on an import map (a document may
// already have one, and Android asset servers can mislabel MIME types) we fetch their source, point `three` at the real
// URL and import the result from a Blob URL (typed text/javascript).
const blobCache = new Map();
function blobModule(url, threeHref, jsmBase) {
  const key = url + '|' + threeHref;
  if (blobCache.has(key)) return blobCache.get(key);
  const p = (async () => {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
    let src = await r.text();
    const reps = new Map();
    for (const m of src.matchAll(/\bfrom\s*(["'])(three|three\/(?:examples\/jsm|addons)\/[^"']+|\.{1,2}\/[^"']*)\1/g)) {
      const spec = m[2];
      if (reps.has(spec)) continue;
      if (spec === 'three') reps.set(spec, threeHref);
      else if (spec.startsWith('three/')) reps.set(spec, await blobModule(jsmBase + spec.replace(/^three\/(examples\/jsm|addons)\//, ''), threeHref, jsmBase));
      else reps.set(spec, await blobModule(new URL(spec, url).href, threeHref, jsmBase));
    }
    for (const [spec, to] of reps) src = src.split(`"${spec}"`).join(`"${to}"`).split(`'${spec}'`).join(`'${to}'`);
    return URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  })();
  blobCache.set(key, p);
  return p;
}

let libsPromise = null;
export function loadLibs() {
  if (libsPromise) return libsPromise;
  libsPromise = (async () => {
    const tries = [
      { three: LOCAL.three, gltf: LOCAL.gltf, vrm: LOCAL.vrm, jsm: new URL('../vendor/three/examples/jsm/', import.meta.url).href, src: 'local' },
      { three: CDN.three, gltf: CDN.gltf, vrm: CDN.vrm, jsm: `https://cdn.jsdelivr.net/npm/three@${V.three}/examples/jsm/`, src: 'jsdelivr' },
      { three: CDN2.three, gltf: CDN2.gltf, vrm: CDN2.vrm, jsm: `https://unpkg.com/three@${V.three}/examples/jsm/`, src: 'unpkg' },
    ];
    let lastErr = null;
    for (const t of tries) {
      try {
        const THREE = await import(/* @vite-ignore */ t.three);
        const { GLTFLoader } = await import(/* @vite-ignore */ await blobModule(t.gltf, t.three, t.jsm));
        const VRM = await import(/* @vite-ignore */ await blobModule(t.vrm, t.three, t.jsm));
        return { THREE, GLTFLoader, VRM, source: t.src };
      } catch (e) { lastErr = e; }
    }
    libsPromise = null;
    throw new Error('Could not load three.js / three-vrm (local and CDN failed): ' + (lastErr && lastErr.message));
  })();
  return libsPromise;
}

/* ------------------------------------------------------------------------------------------------ probe (no WebGL, no three) */
const HUMAN_BONES = ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head', 'leftEye', 'rightEye', 'jaw',
  'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'leftToes', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot', 'rightToes',
  'leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand',
  ...['left', 'right'].flatMap((s) => [
    ...['Thumb'].flatMap((f) => ['Metacarpal', 'Proximal', 'Distal'].map((j) => s + f + j)),
    ...['Index', 'Middle', 'Ring', 'Little'].flatMap((f) => ['Proximal', 'Intermediate', 'Distal'].map((j) => s + f + j))])];
const REQUIRED = ['hips', 'spine', 'chest', 'neck', 'head', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot',
  'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand'];
const V0_PRESET = { joy: 'happy', angry: 'angry', sorrow: 'sad', fun: 'relaxed', a: 'aa', i: 'ih', u: 'ou', e: 'ee', o: 'oh', blink: 'blink', blink_l: 'blinkLeft', blink_r: 'blinkRight', neutral: 'neutral', lookup: 'lookUp', lookdown: 'lookDown', lookleft: 'lookLeft', lookright: 'lookRight' };

function glbJson(ab) {
  const dv = new DataView(ab);
  if (ab.byteLength < 20 || dv.getUint32(0, true) !== 0x46546C67) throw new Error('Not a binary glTF/VRM (.vrm / .glb) file');
  let off = 12;
  while (off + 8 <= ab.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    if (type === 0x4E4F534A) return JSON.parse(new TextDecoder().decode(new Uint8Array(ab, off + 8, len)));
    off += 8 + len + ((4 - (len % 4)) % 4);
  }
  throw new Error('glTF JSON chunk not found');
}

export async function probeVessel(arrayBuffer) {
  try {
    if (arrayBuffer && typeof arrayBuffer.arrayBuffer === 'function') arrayBuffer = await arrayBuffer.arrayBuffer();
    const j = glbJson(arrayBuffer), ex = j.extensions || {};
    let version, name, expressions = [], have = new Set();
    if (ex.VRMC_vrm) {
      const v = ex.VRMC_vrm; version = '1'; name = (v.meta && (v.meta.name || v.meta.title)) || '';
      const e = v.expressions || {};
      expressions = [...Object.keys(e.preset || {}), ...Object.keys(e.custom || {})];
      Object.entries((v.humanoid && v.humanoid.humanBones) || {}).forEach(([k, b]) => b && typeof b.node === 'number' && have.add(k));
    } else if (ex.VRM) {
      const v = ex.VRM; version = '0'; name = (v.meta && (v.meta.title || v.meta.name)) || '';
      const set = new Set();
      ((v.blendShapeMaster && v.blendShapeMaster.blendShapeGroups) || []).forEach((g) => {
        const p = String(g.presetName || '').toLowerCase();
        if (p && p !== 'unknown') set.add(V0_PRESET[p] || p); else if (g.name) set.add(g.name);
      });
      expressions = [...set];
      ((v.humanoid && v.humanoid.humanBones) || []).forEach((b) => b && typeof b.node === 'number' && have.add(b.bone));
    } else return { ok: false, version: '0', name: '', expressions: [], missingBones: [], error: 'No VRM extension found (is this a plain glTF?)' };
    const missingBones = HUMAN_BONES.filter((b) => !have.has(b) && b !== 'jaw');
    const missingRequired = REQUIRED.filter((b) => !have.has(b));
    return { ok: missingRequired.length === 0, version, name, expressions, missingBones, missingRequired,
      error: missingRequired.length ? 'Missing required bones: ' + missingRequired.join(', ') : undefined };
  } catch (e) {
    return { ok: false, version: '0', name: '', expressions: [], missingBones: [], error: String((e && e.message) || e) };
  }
}

/* ------------------------------------------------------------------------------------------------ rig tables */
const TORSO = ['hips', 'spine', 'chest', 'upperChest', 'neck', 'head'];
const SIDED = ['shoulder', 'upperArm', 'lowerArm', 'hand', 'upperLeg', 'lowerLeg', 'foot', 'toes'];
const LIM = { spine: .9, chest: .9, upperChest: .8, neck: .8, head: .9 };
const cap1 = (s) => s[0].toUpperCase() + s.slice(1);
const SLOTS = []; // {key, vrm, m (mirror sign for y/z), order, lim}
const KEYMAP = Object.create(null);
for (const n of TORSO) { KEYMAP[n] = [SLOTS.length]; SLOTS.push({ key: n, vrm: n, m: 1, order: 'YXZ', lim: LIM[n] ?? 3.1 }); }
for (const n of SIDED) {
  const leg = /Leg|foot|toes/.test(n);
  const iL = SLOTS.length; SLOTS.push({ key: 'L.' + n, vrm: 'left' + cap1(n), m: 1, order: leg ? 'ZXY' : 'ZYX', lim: 3.1 });
  const iR = SLOTS.length; SLOTS.push({ key: 'R.' + n, vrm: 'right' + cap1(n), m: -1, order: leg ? 'ZXY' : 'ZYX', lim: 3.1 });
  KEYMAP['L.' + n] = [iL]; KEYMAP['R.' + n] = [iR]; KEYMAP['B.' + n] = [iL, iR];
}
const NS = SLOTS.length;
const EXN = ['happy', 'angry', 'sad', 'relaxed', 'surprised', 'aa', 'ih', 'ou', 'ee', 'oh', 'blink', 'blinkLeft', 'blinkRight'];
const EXI = Object.create(null); EXN.forEach((n, i) => { EXI[n] = i; });
const IAA = EXI.aa, IIH = EXI.ih, IOU = EXI.ou, IEE = EXI.ee, IOH = EXI.oh, IBL = EXI.blink, IBLL = EXI.blinkLeft, IBLR = EXI.blinkRight;
const IHAPPY = EXI.happy, IRELAX = EXI.relaxed, ISUR = EXI.surprised, ISAD = EXI.sad;
const FINGERS = ['Index', 'Middle', 'Ring', 'Little', 'Thumb'];
const CHAIN = { Thumb: [['Metacarpal', .3], ['Proximal', .9], ['Distal', .9]], other: [['Proximal', 1.3], ['Intermediate', 1.5], ['Distal', .8]] };
const CHOP_MIXED = [1 / 24, 1 / 12, 1 / 12, 1 / 8];
const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const clampL = (v, l) => (v > l ? l : v < -l ? -l : v);
const rnd = (a, b) => a + Math.random() * (b - a);

const DEFAULTS = { chop: 'mixed', ink: true, halftone: true, edges: false, neon: true, toonModel: true, fps: 60, pixelRatio: null, framing: 'full',
  modelOutline: true, particles: true, idleMin: 6, idleMax: 14, bubbly: true, bounce: 1, flourish: .7 };
const FRAMINGS = ['full', 'upper', 'face'];
const MORPHS = ['Fcl_BRW_Surprised', 'Fcl_EYE_Surprised'], MORPH_IDX = { Fcl_BRW_Surprised: 0, Fcl_EYE_Surprised: 1 };
// friendly idle flourishes (poses / dances of the studio page). victory + grumpy stay mood-only; listen belongs to hearing.
const FLOURISH = ['idol-step', 'nyan', 'catwalk', 'groove', 'peace', 'wave', 'shy', 'kyun', 'shrug', 'hmm', 'pouting-think', 'jojo', 'bow'];

/* ------------------------------------------------------------------------------------------------ the space */
export async function createSpace(host, opts = {}) {
  const { THREE, GLTFLoader, VRM, source } = await loadLibs();
  const O = Object.assign({}, DEFAULTS, opts);
  if (O.pixelRatio == null) O.pixelRatio = Math.min((typeof devicePixelRatio === 'number' && devicePixelRatio) || 1, 1.25);

  let dead = false, userPaused = false, hiddenPaused = false, ctxLost = false;
  const space = { onevent: null, info: { metaVersion: null, expressions: [], missingBones: [] }, libSource: source };
  const emit = (type, data) => { try { space.onevent && space.onevent(type, data); } catch (e) { console.error('[space] onevent handler threw', e); } };

  /* ---- renderer / scene / camera ---- */
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(O.pixelRatio);
  const canvas = renderer.domElement;
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;';
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);
  const env = createEnv(THREE);
  const scene = env.scene;
  const camera = new THREE.PerspectiveCamera(30, 1, .1, 90);
  const post = createPost(THREE, renderer);
  env.setNeon(O.neon); env.setParticles(O.particles ? 1 : 0);
  const reduceMotion = () => { try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } };

  const camPos = new THREE.Vector3(0, 1.2, 4), camTgt = new THREE.Vector3(0, .9, 0), goalPos = new THREE.Vector3(0, 1.2, 4), goalTgt = new THREE.Vector3(0, .9, 0);
  const tmpV = new THREE.Vector3();
  let W = 1, Hh = 1, camSnap = true;
  // user camera: orbit (az/el), zoom multiplier and pan, all relative to the current framing preset; t* = target, c* = smoothed
  const uc = { az: 0, el: 0, zoom: 1, px: 0, py: 0, caz: 0, cel: 0, czoom: 1, cpx: 0, cpy: 0, orbit: false, active: 0 };
  const frameBase = { d: 4, ey: .4, cy: .9 };

  function computeFraming() {
    const h = model.h || 1.65, vf = camera.fov * Math.PI / 360, asp = W / Hh;
    let visH, cy, needW;
    if (O.framing === 'face') { const hs = model.hs || 1; visH = .46 * hs; cy = (model.headY || h * .88) + .02 * hs; needW = .36 * hs; }
    else if (O.framing === 'upper') { visH = h * .62; cy = h * .74; needW = h * .72; }
    else { visH = h * 1.72; cy = h * .6; needW = h * 1.0; }
    const d = Math.max((visH / 2) / Math.tan(vf), (needW / 2) / (Math.tan(vf) * asp));
    frameBase.d = d; frameBase.ey = d * (O.framing === 'face' ? .02 : .1); frameBase.cy = cy;
    goalTgt.set(0, cy, 0); goalPos.set(0, cy + frameBase.ey, d);
  }
  function resize() {
    if (dead) return;
    W = Math.max(1, host.clientWidth || 300); Hh = Math.max(1, host.clientHeight || 150);
    renderer.setPixelRatio(O.pixelRatio); renderer.setSize(W, Hh, false);
    camera.aspect = W / Hh; camera.updateProjectionMatrix(); post.resize(); computeFraming();
  }
  let ro = null;
  try { if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => resize()); ro.observe(host); } } catch (e) { /* ignore */ }

  /* ---- model state ---- */
  const model = { vrm: null, h: 1.65, hs: 1, headY: 1.45, faceMesh: null, drop: 2, hipsRest: new THREE.Vector3(), flip: false, nodes: new Array(NS).fill(null), hips: null };
  const tgt = new Float32Array(NS * 3), cur = new Float32Array(NS * 3);
  const hipT = new Float32Array(3), hipC = new Float32Array(3);
  const fTgt = [new Float32Array(5), new Float32Array(5)], fCur = [new Float32Array(5), new Float32Array(5)];
  const exT = new Float32Array(EXN.length), exO = new Float32Array(EXN.length), exC = new Float32Array(EXN.length), exAvail = new Uint8Array(EXN.length);
  let FJ = []; // finger joints {node, ax, k, hand, fi}
  const E = new THREE.Euler(), Q = new THREE.Quaternion(), vtmp = new THREE.Vector3();
  let lookOn = true;
  const toonOrig = new Map();
  // studio-page extras: raw face morphs (brows / eye-widen), one-shot blink ids, gaze commands
  const morphT = new Float32Array(2), morphC = new Float32Array(2);
  let gzMode = 0, gzA = 0, gzB = 0, blinkIdNew, blinkIdLast = -1;
  let BLEND = [];   // {node, q} for every humanoid bone (eased transitions)
  const BN = Object.create(null);   // bone-name -> node cache for the bubbly layer

  /* ---- writer API handed to the pose library ---- */
  const S = {
    drop: 2,
    k(key, x, y, z) { const a = KEYMAP[key]; if (!a) return; for (let j = 0; j < a.length; j++) { const i = a[j], m = SLOTS[i].m; tgt[i * 3] = x; tgt[i * 3 + 1] = y * m; tgt[i * 3 + 2] = z * m; } },
    a(key, x, y, z) { const a = KEYMAP[key]; if (!a) return; for (let j = 0; j < a.length; j++) { const i = a[j], m = SLOTS[i].m; tgt[i * 3] += x; tgt[i * 3 + 1] += y * m; tgt[i * 3 + 2] += z * m; } },
    hip(x, y, z) { hipT[0] = x; hipT[1] = y; hipT[2] = z; },
    hipA(x, y, z) { hipT[0] += x; hipT[1] += y; hipT[2] += z; },
    f(side, name) { const p = Array.isArray(name) ? name : (FP[name] || FP.Relaxed); if (side !== 'R') fTgt[0].set(p); if (side !== 'L') fTgt[1].set(p); },
    m(name, w) { const i = MORPH_IDX[name]; if (i !== undefined && w > morphT[i]) morphT[i] = w; },
    blinkId(id) { blinkIdNew = id; },
    gaze(yaw, pitch) { gzMode = 2; gzA = yaw; gzB = pitch; },
    eyeHead(yaw, pitch) { gzMode = 1; gzA = yaw; gzB = pitch; },
    look(b) { lookOn = !!b; },
    e(name, w) {
      const i = EXI[name]; if (i === undefined || !(w > 0)) return;
      if (exAvail[i]) { if (w > exT[i]) exT[i] = w; return; }
      // fallbacks for expressions this model does not have
      if (i === ISUR) { if (exAvail[IOH]) exT[IOH] = Math.max(exT[IOH], .55 * w); else if (exAvail[IAA]) exT[IAA] = Math.max(exT[IAA], .5 * w); }
      else if (i === IRELAX) { if (exAvail[IHAPPY]) exT[IHAPPY] = Math.max(exT[IHAPPY], .35 * w); }
      else if (i === IHAPPY) { if (exAvail[IRELAX]) exT[IRELAX] = Math.max(exT[IRELAX], .8 * w); }
      else if (i === IBLL || i === IBLR) { if (exAvail[IBL]) exT[IBL] = Math.max(exT[IBL], .85 * w); }
      else if (i === ISAD) { if (exAvail[IRELAX]) exT[IRELAX] = Math.max(exT[IRELAX], .25 * w); }
    },
  };

  /* ---- animation state ---- */
  let simT = 0, snapNext = false;
  let speaking = false, listening = false, hearing = false, hearT0 = 0, calm = reduceMotion(), talkOwn = false, ownerKey = '', forceTalkUntil = 0;
  let tb = 0, lb = 0, mouthFresh = 0, energy = 0, prevEnergy = 0;
  const mouth = { open: 0, low: 0, mid: 0, high: 0 };
  let lastMouthMs = -1e9, lipPh = 0;
  let emoteSt = null, idleSt = null, seq = null, pendingEmote = null, hidden = false;
  let idleTimer = rnd(O.idleMin, O.idleMax), lastIdle = '';
  let beatT = 9, beatAmp = 0, beatSide = 0, beatCool = 0, beatAuto = rnd(1.2, 2.4), lastBeatSide = 0;
  let nodT = 9, nodNext = rnd(2.5, 5);
  let blinkT = rnd(1.5, 3.5), blinkV = 0, blinkDouble = false;
  let ringT0 = -99;
  let chopAcc = 0, chopNext = 1 / 12, poseDt = 0;
  let exitPromise = null, poseCount = 0;

  function chopInterval() { const c = String(O.chop); return c === '2' ? 1 / 12 : c === '3' ? 1 / 8 : CHOP_MIXED[(Math.random() * 4) | 0]; }
  const chopOn = () => { const c = String(O.chop); return c !== 'off' && c !== 'false' && c !== '0'; };

  /* ---------------------------------------------------------------- pose evaluation */
  function resolveFrame() {
    tgt.fill(0); hipT[0] = hipT[1] = hipT[2] = 0; exT.fill(0); morphT.fill(0); lookOn = true; gzMode = 0; blinkIdNew = undefined;
    POSE.base(S);
    const sc = seq, em = emoteSt, id = idleSt;
    const free = !sc && !em && !id;
    S.drop = model.drop;
    let layerAmt = 1;
    if (sc) { layerAmt = .35; sc.fn(sc.tt, S, sc.ev); }
    else if (em) { const p = POSE[em.name]; if (p) p(simT - em.t0, S); layerAmt = .35; }
    else if (id) { id.def.fn(simT - id.t0, S); layerAmt = .5; }
    else if (talkOwn) {
      // talking body language (arms/gestures only when nothing else owns them); the eased transition hides the switch
      const k = Math.max(tb, .6);
      S.k('B.upperArm', 0, -.1 * k, -1.2 + .2 * k); S.k('B.lowerArm', 0, -.15 - .6 * k, 0); S.f('B', 'Loose');
      S.a('B.hand', 0, 0, .1 * k);
    } else if (hearing) { POSE.listen(simT - hearT0, S); layerAmt = .4; }
    else { (calm ? POSE.calm : POSE.standby)(simT, S); layerAmt = .3; }
    const t = simT, br = Math.sin(t * 1.6);
    // breathing
    S.a('chest', br * .03, 0, 0); S.a('spine', br * .01, 0, 0); S.a('upperChest', br * .012, 0, 0);
    S.a('B.shoulder', 0, 0, br * .015);
    // weight shift + head micro movement
    const ws = Math.sin(t * .55) * layerAmt;
    S.a('hips', 0, 0, ws * .025); S.a('spine', 0, 0, -ws * .02); S.hipA(ws * .012, 0, 0);
    S.a('L.upperLeg', 0, 0, ws * .02); S.a('R.upperLeg', 0, 0, ws * .02);
    S.a('head', Math.sin(t * .6 + 2) * .015, Math.sin(t * .8) * .03 + Math.sin(t * 1.7) * .01, Math.sin(t * .5) * .015);
    // speech: nods + beat gestures
    if (tb > .01) {
      const en = Math.min(1, energy * 1.6) * tb;
      S.a('head', (Math.sin(t * 5.2) * .05 + Math.sin(t * 2.1) * .03) * en, Math.sin(t * 1.9) * .05 * en, Math.sin(t * 1.3 + 1) * .04 * en);
      S.a('spine', -.02 * en, Math.sin(t * 1.3) * .03 * en, 0);
    }
    if (beatT < .8) {
      const env = Math.sin(Math.PI * beatT / .8) * beatAmp;
      S.a('head', .13 * env, 0, 0); S.a('chest', .03 * env, 0, 0);
      if (free || id) {
        const wr = beatSide !== 1 ? env : 0, wl = beatSide !== 0 ? env : 0;
        S.a('R.upperArm', 0, -.3 * wr, .55 * wr); S.a('R.lowerArm', 0, -.35 * wr, .0); S.a('R.hand', 0, 0, .35 * wr * Math.sin(beatT * 16));
        S.a('L.upperArm', 0, -.3 * wl, .55 * wl); S.a('L.lowerArm', 0, -.35 * wl, .0); S.a('L.hand', 0, 0, .35 * wl * Math.sin(beatT * 16));
      }
    }
    // listening
    if (lb > .01) {
      const nod = nodT < .55 ? Math.sin(Math.PI * nodT / .55) : 0;
      S.a('head', (-.03 + nod * .12) * lb, 0, .05 * lb); S.a('spine', .04 * lb, 0, 0); S.a('neck', nod * .04 * lb, 0, 0);
    }
    if (hidden) S.hip(0, -model.drop, 0);
    if (model.flip) { // normalized frame is rotated 180 deg about Y (VRM0): conjugate the rotations
      for (let i = 0; i < NS; i++) { tgt[i * 3] = -tgt[i * 3]; tgt[i * 3 + 2] = -tgt[i * 3 + 2]; }
      hipT[0] = -hipT[0]; hipT[2] = -hipT[2];
    }
  }

  function applyPose(dt) {
    const own = !!trans.from;   // an eased (bubbly) transition owns the motion: take the new pose as-is
    const rate = seq ? 24 : 26, a = (snapNext || own) ? 1 : 1 - Math.exp(-dt * rate);
    for (let i = 0; i < NS * 3; i++) cur[i] += (tgt[i] - cur[i]) * a;
    const ah = (snapNext || own) ? 1 : 1 - Math.exp(-dt * (seq ? 30 : 14));
    for (let i = 0; i < 3; i++) hipC[i] += (hipT[i] - hipC[i]) * ah;
    for (let i = 0; i < NS; i++) {
      const n = model.nodes[i]; if (!n) continue;
      const s = SLOTS[i], l = s.lim;
      n.quaternion.setFromEuler(E.set(clampL(cur[i * 3], l), clampL(cur[i * 3 + 1], l), clampL(cur[i * 3 + 2], l), s.order));
    }
    if (model.hips) model.hips.position.set(model.hipsRest.x + hipC[0] * model.hs, model.hipsRest.y + hipC[1] * model.hs, model.hipsRest.z + hipC[2] * model.hs);
    const af = (snapNext || own) ? 1 : 1 - Math.exp(-dt * 16);
    for (let h = 0; h < 2; h++) for (let i = 0; i < 5; i++) fCur[h][i] += (fTgt[h][i] - fCur[h][i]) * af;
    for (let i = 0; i < FJ.length; i++) { const j = FJ[i]; j.node.quaternion.setFromAxisAngle(j.ax, fCur[j.hand][j.fi] * j.k); }
  }

  /* ---------------------------------------------------------------- bubbly transitions (ported from the studio page)
     springy hop + bouncy knees + follow-through that fire ONLY when the pose changes and decay in ~1 s, plus an eased slerp
     (short hold, overshoot, tiny squash pulse) from the last visible pose into the new one. Steady-state motion is untouched. */
  const BUB = { t0: -99, k: 1 }, JS = { y: 0, v: 0 }, KS = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 };
  const trans = { from: null, t0: 0, hold: .1, dur: .85 };
  const lastH = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), qa = new THREE.Quaternion(), ea = new THREE.Euler();
  let lastHas = false;
  function stepSprings(dt) {
    const n = Math.max(1, Math.ceil(dt / .008)), h = dt / n;
    for (let i = 0; i < n; i++) {
      JS.v += (-170 * JS.y - 10 * JS.v) * h; JS.y += JS.v * h;
      for (const a of ['x', 'y', 'z']) { KS['v' + a] += (-120 * KS[a] - 8 * KS['v' + a]) * h; KS[a] += KS['v' + a] * h; }
    }
  }
  function react(kind, energyVal) {
    if (!O.bubbly) return;
    const A = O.bounce; BUB.t0 = simT; BUB.k = kind === 'tiny' ? .45 : 1; BUB.e = energyVal == null ? .3 : energyVal;
    const R = {
      pop() { JS.y = -.035; JS.v = 1.0; KS.vz += rnd(-2, 2); }, Joy() { JS.v = 1.1; KS.vz = 3; KS.vx = -1.5; }, Angry() { JS.v = -1; KS.vy = 3; KS.vx = 1.5; },
      Sorrow() { JS.y = -.03; KS.vx = 2; }, Fun() { JS.v = .6; KS.vz = -3; }, Surprise() { JS.v = 1.7; KS.vx = -3; }, Neutral() { JS.v = .3; }, tiny() { JS.v = .45; KS.vz += rnd(-1.5, 1.5); },
    };
    (R[kind] || R.pop)();
    JS.v *= A; JS.y *= A; KS.vx *= A; KS.vy *= A; KS.vz *= A;
  }
  function bn(name) { return BN[name] || (BN[name] = (model.vrm && model.vrm.humanoid.getNormalizedBoneNode(name)) || null); }
  function addRot(name, x, y, z, order = 'YXZ', m = 1) {
    const b = bn(name); if (!b) return;
    if (model.flip) { x = -x; z = -z; }
    b.quaternion.multiply(qa.setFromEuler(ea.set(x, y * m, z * m, order)));
  }
  function applyLayer(t) {
    if (!O.bubbly || seq || hidden) return;
    const A = O.bounce, tn = Math.max(0, t - BUB.t0), env = Math.exp(-tn * 3.4) * BUB.k, e = (BUB.e == null ? .3 : BUB.e) * A * env * 1.6, ph = tn * 10, b = Math.abs(Math.sin(ph)), lo = 1 - b;
    const crouch = Math.max(0, -JS.y) * 10, tuck = Math.max(0, JS.y) * 6, kb = lo * e * .4 + crouch;
    if (model.hips) model.hips.position.y += (JS.y - e * .03 * lo) * model.hs;
    for (const sd of ['left', 'right']) { addRot(sd + 'UpperLeg', -kb * .5 - tuck * .4, 0, 0, 'ZXY'); addRot(sd + 'LowerLeg', kb * .9 + crouch * .6 + tuck, 0, 0, 'ZXY'); }
    addRot('chest', Math.sin(ph - .7) * e * .035, 0, 0); addRot('head', Math.sin(ph - 1.1) * e * .05 + KS.x, KS.y, KS.z + Math.sin(ph * .5) * e * .04);
    const sh = Math.sin(ph - .5) * e * .04; addRot('leftShoulder', 0, 0, sh, 'ZYX', 1); addRot('rightShoulder', 0, 0, sh, 'ZYX', -1);
  }
  function beginTrans() {
    if (!lastHas) return;
    trans.from = { q: BLEND.map((b) => b.q.clone()), h: lastH.clone() }; trans.t0 = simT;
  }
  function blend() {
    const h = model.hips;
    if (trans.from) {
      const e = (simT - trans.t0 - trans.hold) / trans.dur, w = Math.min(1, Math.max(0, e));
      const k = O.bubbly ? 1 + 2.2 * (w - 1) ** 3 + 1.2 * (w - 1) ** 2 : w * w * (3 - 2 * w);
      if (model.vrm) model.vrm.scene.scale.setScalar(O.bubbly ? 1 + .03 * Math.sin(w * Math.PI * 2.5) * (1 - w) : 1);
      for (let i = 0; i < BLEND.length; i++) { const b = BLEND[i], f = trans.from.q[i]; if (f) { tmpQ.copy(b.node.quaternion); b.node.quaternion.copy(f).slerp(tmpQ, k); } }
      if (h) h.position.lerpVectors(trans.from.h, h.position, k);
      if (e >= 1) { trans.from = null; if (model.vrm) model.vrm.scene.scale.setScalar(1); }
    }
    for (let i = 0; i < BLEND.length; i++) BLEND[i].q.copy(BLEND[i].node.quaternion);
    if (h) lastH.copy(h.position);
    lastHas = BLEND.length > 0;
  }
  // energy / flavour of the pose that owns the body right now (how big the bounce is)
  function ownerInfo() {
    if (emoteSt) {
      const n = emoteSt.name, al = EMOTE_ALIAS[n] || n, an = ANIM[al];
      return { energy: an ? an.energy : (LEGACY_ENERGY[n] == null ? .3 : LEGACY_ENERGY[n]), react: an ? an.react : (LEGACY_REACT[n] || 'pop') };
    }
    if (idleSt) return { energy: .2, react: 'tiny' };
    return { energy: talkOwn ? .25 : .2, react: 'tiny' };
  }
  function ownerChanged(key) {
    const first = ownerKey === ''; ownerKey = key;
    if (first || seq) { trans.from = null; return; }
    beginTrans(); const oi = ownerInfo(); react(oi.react, oi.energy);
  }

  /* ---------------------------------------------------------------- per real-time-frame layers (smooth, never chopped) */
  function updateExpressions(dt) {
    const em = model.vrm && model.vrm.expressionManager; if (!em) return;
    // blink (auto) - suppressed when an expression owns the eyelids
    if (blinkIdNew !== undefined && blinkIdNew !== blinkIdLast) { blinkIdLast = blinkIdNew; if (blinkV === 0) blinkV = .001; }
    blinkT -= dt;
    if (blinkT < 0 && blinkV === 0) { blinkV = .001; blinkT = blinkDouble ? .22 : rnd(2, 5); blinkDouble = !blinkDouble && Math.random() < .18; }
    if (blinkV > 0) { blinkV += dt / .07 * (blinkV >= 1 ? 0 : 1); if (blinkV >= 1) blinkV = -1; } else if (blinkV < 0) { blinkV += dt / .1; if (blinkV >= 0) blinkV = 0; }
    const auto = blinkV >= 0 ? Math.min(1, blinkV) : 1 + blinkV;
    const own = Math.max(exT[IBL], exT[IBLL], exT[IBLR], exT[IHAPPY] * .9, exT[IRELAX] * .4, exT[ISAD] * .2);
    // lip sync
    const fresh = (performance.now() - lastMouthMs) < 250;
    let vA = 0, vI = 0, vU = 0, vE = 0, vO = 0;
    if (fresh) {
      const o = mouth.open;
      vA = Math.max(o * (.2 + .8 * mouth.mid), o * .3); vO = o * mouth.low * .9; vU = o * mouth.low * (1 - mouth.mid) * .5;
      vE = o * mouth.high * .8; vI = o * mouth.high * mouth.mid * .5;
      energy += (o - energy) * Math.min(1, dt * 10);
    } else if (speaking || simT < forceTalkUntil) {
      lipPh += dt * 7; const i = Math.floor(lipPh) % 5, f = lipPh % 1, ev = Math.sin(f * Math.PI) * (.55 + .25 * Math.sin(simT * 3));
      vA = i === 0 ? ev : 0; vI = i === 1 ? ev : 0; vU = i === 2 ? ev : 0; vE = i === 3 ? ev : 0; vO = i === 4 ? ev : 0;
      energy += (.45 - energy) * Math.min(1, dt * 4);
    } else energy += (0 - energy) * Math.min(1, dt * 6);
    mouthFresh = fresh ? 1 : 0;
    exO.set(exT);
    if (exAvail[IAA]) exO[IAA] = Math.max(exO[IAA], vA); if (exAvail[IIH]) exO[IIH] = Math.max(exO[IIH], vI);
    if (exAvail[IOU]) exO[IOU] = Math.max(exO[IOU], vU); if (exAvail[IEE]) exO[IEE] = Math.max(exO[IEE], vE); if (exAvail[IOH]) exO[IOH] = Math.max(exO[IOH], vO);
    if (exAvail[IBL]) exO[IBL] = Math.max(exO[IBL], auto * (1 - Math.min(1, own)));
    for (let i = 0; i < EXN.length; i++) {
      if (!exAvail[i]) continue;
      const vis = i >= IAA && i <= IOH;
      const k = Math.min(1, dt * (vis ? 22 : i === IBL ? 40 : 10));
      exC[i] += (exO[i] - exC[i]) * k;
      em.setValue(EXN[i], exC[i]);
    }
    // raw face morphs the VRM expression set does not cover (brows up / eyes wide); skipped on models without them
    const fm = model.faceMesh;
    if (fm) {
      const km = Math.min(1, dt * 9), d = fm.morphTargetDictionary;
      for (let i = 0; i < 2; i++) { morphC[i] += (morphT[i] - morphC[i]) * km; const mi = d[MORPHS[i]]; if (mi !== undefined) fm.morphTargetInfluences[mi] = morphC[i]; }
    }
  }

  function updateDirector(dt) {
    // waiting for the user (listening) is exactly when the Saint should fidget; only real activity blocks it
    const busy = speaking || hearing || (emoteSt && !emoteSt.idle) || seq || (idleSt && true) || simT < forceTalkUntil || talkOwn;
    if (idleSt && simT - idleSt.t0 > idleSt.def.dur) idleSt = null;
    if (emoteSt && emoteSt.idle && simT >= emoteSt.until) emoteSt = null;
    if (busy || (emoteSt && emoteSt.idle)) { if (!idleSt && !emoteSt) idleTimer = rnd(O.idleMin, O.idleMax); return; }
    if (calm) return;
    idleTimer -= dt;
    if (idleTimer <= 0) triggerIdle();
  }
  function triggerIdle(name) {
    if (dead || !model.vrm || seq || hidden) return false;
    // a studio-page pose / dance (most of the time), or one of the original idle bits (stretch, yawn, hair fix...)
    const legacy = name ? IDLE_ANIMS.find((d) => d.name === name) : null;
    const wantFlourish = name ? (!legacy && (FLOURISH.includes(name) || ANIM[name])) : Math.random() < O.flourish;
    if (wantFlourish) {
      let n = name;
      if (!n) { const pool = FLOURISH.filter((x) => x !== lastIdle); n = pool[(Math.random() * pool.length) | 0]; }
      const dur = ANIM[n].kind === 'dance' ? rnd(4.5, 7) : rnd(3, 4.6);
      lastIdle = n; idleSt = null; emoteSt = { name: n, t0: simT, until: simT + dur, idle: true }; idleTimer = rnd(O.idleMin, O.idleMax);
      emit('idle-anim', { name: n });
      return true;
    }
    let def = legacy;
    if (!def) { const pool = IDLE_ANIMS.filter((d) => d.name !== lastIdle); def = pool[(Math.random() * pool.length) | 0]; }
    lastIdle = def.name; idleSt = { def, t0: simT }; idleTimer = rnd(O.idleMin, O.idleMax);
    emit('idle-anim', { name: def.name });
    return true;
  }

  const gazeObj = new THREE.Object3D(); scene.add(gazeObj);
  const hp3 = new THREE.Vector3(), hq = new THREE.Quaternion(), CAMLIM = { zmin: .3, zmax: 2.4 };
  const wrap2pi = (a) => a - Math.round(a / (2 * Math.PI)) * 2 * Math.PI;
  function stepCamera(dt) {
    // user camera -> smoothed offsets (fast while a finger is down, gentle otherwise)
    if (uc.orbit && uc.active <= 0) uc.az += dt * .23;
    uc.active = Math.max(0, uc.active - dt);
    const ku = Math.min(1, dt * (uc.active > 0 ? 18 : 6));
    uc.caz += (uc.az - uc.caz) * ku; uc.cel += (uc.el - uc.cel) * ku; uc.czoom += (uc.zoom - uc.czoom) * ku; uc.cpx += (uc.px - uc.cpx) * ku; uc.cpy += (uc.py - uc.cpy) * ku;
    const el0 = Math.atan2(frameBase.ey, frameBase.d), R = Math.hypot(frameBase.ey, frameBase.d) * uc.czoom;
    const el = Math.max(-.1, Math.min(1.4, el0 + uc.cel)), ce = Math.cos(el), saz = Math.sin(uc.caz), caz = Math.cos(uc.caz);
    goalTgt.set(caz * uc.cpx, frameBase.cy + uc.cpy, -saz * uc.cpx);
    goalPos.set(goalTgt.x + R * saz * ce, Math.max(.12, goalTgt.y + R * Math.sin(el)), goalTgt.z + R * caz * ce);
    const k = camSnap ? 1 : 1 - Math.exp(-dt * (uc.active > 0 ? 16 : 3.5)); camSnap = false;
    camPos.lerp(goalPos, k); camTgt.lerp(goalTgt, k);
    const d = (R / 3.6) * (uc.active > 0 || uc.czoom !== 1 || uc.az !== 0 ? .45 : 1), t = simT;   // idle sway fades while the user holds the view
    camera.position.set(camPos.x + Math.sin(t * .31) * .13 * d, camPos.y + Math.sin(t * .23 + 1) * .035 * d, camPos.z + Math.sin(t * .17) * .12 * d);
    camera.lookAt(camTgt.x + Math.sin(t * .27) * .03, camTgt.y + Math.sin(t * .2) * .02, camTgt.z);
    env.update(t, camera);
    const mv = model.vrm;
    if (mv && mv.lookAt) {
      let want = lookOn ? camera : null;
      if (gzMode) {
        const h = model.vrm.humanoid.getNormalizedBoneNode('head');
        if (h) {
          h.getWorldPosition(hp3); const cp = Math.cos(gzB), sy = Math.sin(gzA), cy2 = Math.cos(gzA);
          if (gzMode === 2) gazeObj.position.set(hp3.x + sy * cp * 2, hp3.y + Math.sin(gzB) * 2, hp3.z + cy2 * cp * 2);   // world: +z is toward the viewer
          else { // head space: eyes lead, the head follows
            h.getWorldQuaternion(hq);
            gazeObj.position.set((model.flip ? -1 : 1) * sy * cp * 2, Math.sin(gzB) * 2, (model.flip ? -1 : 1) * cy2 * cp * 2).applyQuaternion(hq).add(hp3);
          }
          gazeObj.updateMatrixWorld(); want = gazeObj;
        }
      }
      mv.lookAt.target = want;
    }
  }

  /* ---- user camera controls: one finger/mouse = orbit, two fingers = pinch zoom + pan, wheel = zoom, double tap = reset ---- */
  const ptrs = new Map(); let pinch0 = 0, lastTap = 0, tapMoved = 0;
  const panScale = () => (2 * Math.tan(camera.fov * Math.PI / 360) * frameBase.d * uc.czoom) / Hh;
  const clampCam = () => { uc.zoom = Math.max(CAMLIM.zmin, Math.min(CAMLIM.zmax, uc.zoom)); uc.el = Math.max(-.9, Math.min(1.2, uc.el)); uc.px = Math.max(-1.3, Math.min(1.3, uc.px)); uc.py = Math.max(-1, Math.min(1, uc.py)); };
  function camRotate(dx, dy) { uc.az -= dx * .0085; uc.el += dy * .006; uc.active = .6; clampCam(); }
  function camZoom(f) { uc.zoom *= f; uc.active = .6; clampCam(); }
  function camPan(dx, dy) { const s = panScale(); uc.px -= dx * s; uc.py += dy * s; uc.active = .6; clampCam(); }
  function camReset(snap) { uc.az = Math.round(uc.az / (2 * Math.PI)) * 2 * Math.PI; uc.caz = Math.round(uc.caz / (2 * Math.PI)) * 2 * Math.PI; uc.el = uc.zoom = uc.px = uc.py = 0; uc.zoom = 1; if (snap) { uc.az = uc.caz = uc.cel = uc.cpx = uc.cpy = 0; uc.czoom = 1; } uc.active = 0; }
  const onDown = (e) => { try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptrs.size === 1) tapMoved = 0; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); } uc.active = .6; };
  const onMove = (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const nx = e.clientX, ny = e.clientY;
    if (ptrs.size === 1) { const dx = nx - p.x, dy = ny - p.y; tapMoved += Math.abs(dx) + Math.abs(dy); camRotate(dx, dy); p.x = nx; p.y = ny; }
    else if (ptrs.size === 2) {
      const before = [...ptrs.values()], mx0 = (before[0].x + before[1].x) / 2, my0 = (before[0].y + before[1].y) / 2;
      p.x = nx; p.y = ny; const after = [...ptrs.values()], d = Math.hypot(after[0].x - after[1].x, after[0].y - after[1].y);
      if (pinch0 > 8 && d > 8) camZoom(pinch0 / d); pinch0 = d; tapMoved += 20;
      camPan((after[0].x + after[1].x) / 2 - mx0, (after[0].y + after[1].y) / 2 - my0);
    }
  };
  const onUp = (e) => {
    const was = ptrs.size; ptrs.delete(e.pointerId); try { canvas.releasePointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    if (was === 1 && tapMoved < 8) { const now = performance.now(); if (now - lastTap < 320) { camReset(false); lastTap = 0; emit('camera', { reset: true }); } else lastTap = now; }
    if (ptrs.size < 2) pinch0 = 0;
  };
  const onWheel = (e) => { e.preventDefault(); camZoom(Math.exp((e.deltaY || 0) * .0015)); };
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp); canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  /* master step: dt seconds of simulated time */
  function step(dt) {
    simT += dt;
    // envelopes
    const tTalk = (speaking || simT < forceTalkUntil || mouthFresh) ? 1 : 0;
    tb += (tTalk - tb) * Math.min(1, dt * 4); lb += ((listening && !tTalk ? 1 : 0) - lb) * Math.min(1, dt * 4);
    beatT += dt; nodT += dt; beatCool -= dt;
    if (listening && nodT > nodNext) { nodT = 0; nodNext = rnd(2.2, 5); }
    if (tb > .3 && energy > .12) {
      beatAuto -= dt;
      if (beatAuto <= 0) { beat(.6 + energy); beatAuto = rnd(1.1, 2.6); }
      if (energy > .3 && prevEnergy <= .3 && beatCool <= 0 && Math.random() < .6) beat(.5 + energy);
    }
    prevEnergy = energy;
    // emote expiry
    if (emoteSt && simT >= emoteSt.until) emoteSt = null;
    if (seq) {
      seq.tt = (simT - seq.t0) / seq.scale;
    }
    updateDirector(dt);
    // who owns the body this frame? a change starts an eased, bubbly transition
    if (tb > .55) talkOwn = true; else if (tb < .12) talkOwn = false;
    if (model.vrm) {
      const key = seq ? 'seq:' + seq.kind : emoteSt ? 'e:' + emoteSt.name + ':' + emoteSt.t0 : idleSt ? 'i:' + idleSt.def.name + ':' + idleSt.t0 : talkOwn ? 'talk' : hearing ? 'hear' : calm ? 'calm' : 'standby';
      if (key !== ownerKey) ownerChanged(key);
      stepSprings(dt);
    }
    if (model.vrm) {
      poseDt += dt;
      let doPose = true;
      if (chopOn() && !snapNext && !seq?.noChop) { chopAcc += dt; if (chopAcc < chopNext) doPose = false; else { chopAcc = 0; chopNext = chopInterval(); } }
      if (doPose) {
        resolveFrame(); applyPose(poseDt); applyLayer(simT); blend(); poseDt = 0; snapNext = false; poseCount++;
        if (seq) {
          // sequences finish when their script returns false
          if (!seq.running) finishSeq();
        }
      }
      // expressions are resolved inside resolveFrame only on pose frames; keep the last targets between frames
      updateExpressions(dt);
      try { model.vrm.update(dt); } catch (e) { if (!step._warned) { step._warned = true; console.warn('[space] vrm.update failed', e); } }
      // blob shadow follows the hips offset
      const lift = hipC[1], hs = model.hs;
      const vis = sstep(-model.drop * .6, -.1, lift);
      env.setShadow((model.flip ? -hipC[0] : hipC[0]) * hs, (model.flip ? -hipC[2] : hipC[2]) * hs, model.h * .55 / (1 + Math.max(0, lift) * 1.1), .55 * vis * (hidden ? 0 : 1));
    }
    // ring pulse on the floor
    const rt = simT - ringT0;
    if (rt >= 0 && rt < 1.3) env.ring(true, rt * 2.6, (1 - rt / 1.3) * .5); else env.ring(false, 0, 0);
    stepCamera(dt);
  }

  // sequences (intro / exit) are scripted functions of script-time
  function startSeq(kind) {
    const scale = reduceMotion() ? .6 : 1;
    const ev = kind === 'intro' ? { onRing() { ringT0 = simT; } } : { onJump() { ringT0 = simT; } };
    const fn0 = kind === 'intro' ? introPose : exitPose;
    seq = { kind, t0: simT, tt: 0, scale, ev, running: true,
      fn(tt, Sx, e) { seq.running = fn0(tt, Sx, e); } };
    return seq;
  }
  let seqResolve = null;
  function finishSeq() {
    const k = seq.kind; seq = null;
    if (k === 'intro') {
      if (pendingEmote) { const p = pendingEmote; pendingEmote = null; emote(p.name, { hold: p.hold }); }
      emit('intro-done'); const r = seqResolve; seqResolve = null; r && r();
    } else {
      hidden = true; if (model.vrm) model.vrm.scene.visible = false; env.setShadow(0, 0, 1, 0);
      emit('exit-done'); const r = seqResolve; seqResolve = null; r && r();
      // nothing to look at any more: stop burning battery shortly after (enter() resumes)
      autoPauseT = setTimeout(() => { autoPauseT = 0; if (!dead && hidden) autoPaused = true; }, 1200);
    }
  }
  let autoPauseT = 0, autoPaused = false;

  /* ---------------------------------------------------------------- render loop */
  let raf = 0, lastFrameMs = 0, fpsAcc = 0, fpsN = 0, fpsT0 = 0;
  const wantRun = () => !dead && !userPaused && !hiddenPaused && !ctxLost && !autoPaused;
  function render() {
    const usePost = O.ink || O.halftone || O.edges;
    if (usePost) post.render(scene, camera); else renderer.render(scene, camera);
  }
  function frame(now) {
    raf = 0; if (!wantRun()) return;
    raf = requestAnimationFrame(frame);
    const min = 1000 / O.fps - 2.5;
    if (lastFrameMs && now - lastFrameMs < min) return;
    const dt = lastFrameMs ? Math.min((now - lastFrameMs) / 1000, .1) : 1 / 60;
    lastFrameMs = now;
    step(dt); render();
    fpsAcc += dt; fpsN++;
    if (now - fpsT0 > 2000) { if (fpsT0) emit('fps', { fps: Math.round(fpsN / fpsAcc), frameMs: +(fpsAcc / fpsN * 1000).toFixed(1) }); fpsT0 = now; fpsAcc = 0; fpsN = 0; }
  }
  function kick() { if (!raf && wantRun()) { lastFrameMs = 0; raf = requestAnimationFrame(frame); } }
  function stopLoop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  const onVis = () => { hiddenPaused = !!document.hidden; if (hiddenPaused) stopLoop(); else kick(); };
  document.addEventListener('visibilitychange', onVis); hiddenPaused = !!document.hidden;
  const onLost = (e) => { e.preventDefault(); ctxLost = true; stopLoop(); emit('error', { message: 'WebGL context lost' }); };
  const onRestored = () => { ctxLost = false; post.resize(); kick(); };
  canvas.addEventListener('webglcontextlost', onLost); canvas.addEventListener('webglcontextrestored', onRestored);

  /* ---------------------------------------------------------------- model loading */
  function applyToon() {
    const mv = model.vrm; if (!mv) return;
    mv.scene.traverse((o) => {
      if (!o.isMesh) return;
      [].concat(o.material).forEach((m) => {
        if (!m || !m.isMToonMaterial) return;
        if (!toonOrig.has(m)) toonOrig.set(m, { t: m.shadingToonyFactor, r: m.rimLightingMixFactor, o: m.outlineWidthMode });
        const g = toonOrig.get(m);
        m.shadingToonyFactor = O.toonModel ? .98 : g.t; m.rimLightingMixFactor = O.toonModel ? Math.max(g.r, .6) : g.r;
        const wantO = O.modelOutline ? g.o : 'none';
        if (m.outlineWidthMode !== wantO) { m.outlineWidthMode = wantO; m.needsUpdate = true; }
      });
    });
  }

  function calcAxes() {
    FJ = []; const D = new THREE.Vector3(0, -1, 0), axes = {};
    const bn = (n) => model.vrm.humanoid.getNormalizedBoneNode(n);
    ['left', 'right'].forEach((p, hand) => FINGERS.forEach((f, fi) => {
      const ch = (f === 'Thumb' ? CHAIN.Thumb : CHAIN.other); let last = null;
      ch.forEach(([j], i) => {
        const b = bn(p + f + j), nx = ch[i + 1] && bn(p + f + ch[i + 1][0]); let ax = last;
        if (b && nx) { ax = new THREE.Vector3().crossVectors(nx.position.clone().normalize(), D); ax = ax.lengthSq() < .01 ? (last || new THREE.Vector3(0, 0, -1)) : ax.normalize(); }
        if (b && ax) FJ.push({ node: b, ax, k: ch[i][1], hand, fi });
        last = ax;
      });
    }));
  }

  function disposeVrm() {
    const mv = model.vrm; if (!mv) return;
    scene.remove(mv.scene); try { VRM.VRMUtils.deepDispose(mv.scene); } catch (e) { /* ignore */ }
    model.vrm = null; model.faceMesh = null; toonOrig.clear(); FJ = []; model.nodes.fill(null); BLEND = []; trans.from = null; lastHas = false;
  }

  async function loadVessel(vessel) {
    let ab = vessel;
    if (vessel && typeof vessel.arrayBuffer === 'function') ab = await vessel.arrayBuffer();
    if (!(ab instanceof ArrayBuffer)) { if (ab && ab.buffer instanceof ArrayBuffer) ab = ab.buffer.slice(ab.byteOffset, ab.byteOffset + ab.byteLength); else throw new Error('vessel must be an ArrayBuffer or Blob'); }
    const loader = new GLTFLoader(); loader.register((p) => new VRM.VRMLoaderPlugin(p));
    const gltf = await loader.parseAsync(ab, '');
    const v = gltf.userData.vrm; if (!v) throw new Error('Not a VRM file (no VRM extension found)');
    try { VRM.VRMUtils.removeUnnecessaryJoints(gltf.scene); } catch (e) { /* older API */ }
    VRM.VRMUtils.rotateVRM0(v);
    v.scene.traverse((o) => { o.frustumCulled = false; });
    return v;
  }

  function adopt(v) {
    disposeVrm();
    model.vrm = v; scene.add(v.scene);
    const bone = (n) => v.humanoid.getNormalizedBoneNode(n) || null;
    SLOTS.forEach((s, i) => { model.nodes[i] = bone(s.vrm); });
    model.hips = bone('hips');
    model.hipsRest.copy(model.hips ? model.hips.position : vtmp.set(0, .9, 0));
    v.scene.updateMatrixWorld(true);
    const head = bone('head'), foot = bone('leftFoot');
    let hy = 1.45; if (head) { head.getWorldPosition(vtmp); hy = vtmp.y; }
    let fy = 0; if (foot) { foot.getWorldPosition(vtmp); fy = Math.max(0, vtmp.y - .05); }
    model.headY = hy; model.h = Math.max(.5, (hy - fy) * 1.15); model.hs = Math.min(1.5, Math.max(.7, model.h / 1.65)); model.drop = (model.h + .35) / model.hs;
    // is the normalized frame rotated (VRM0)? left arm chain must run along local +x in a VRM1-style normalized rig
    const lLow = bone('leftLowerArm'), rLow = bone('rightLowerArm');
    model.flip = !!(lLow && lLow.position.x < 0 && (!rLow || rLow.position.x > 0));
    exAvail.fill(0);
    const em = v.expressionManager;
    EXN.forEach((n, i) => { exAvail[i] = em && em.getExpression(n) ? 1 : 0; });
    exC.fill(0); exT.fill(0);
    calcAxes(); applyToon();
    for (const k of Object.keys(BN)) delete BN[k];
    BLEND = []; trans.from = null; lastHas = false; ownerKey = '';
    for (const n of Object.values(VRM.VRMHumanBoneName)) { const nd = bone(n); if (nd) BLEND.push({ node: nd, q: new THREE.Quaternion() }); }
    model.faceMesh = null; morphT.fill(0); morphC.fill(0);
    v.scene.traverse((o) => { if (!model.faceMesh && o.isMesh && o.morphTargetDictionary && (MORPHS[0] in o.morphTargetDictionary)) model.faceMesh = o; });
    const missing = Object.values(VRM.VRMHumanBoneName).filter((n) => !bone(n));
    space.info = { metaVersion: v.meta && v.meta.metaVersion, expressions: em ? em.expressions.map((e) => e.expressionName) : [], missingBones: missing };
    cur.fill(0); hipC.fill(0); fCur[0].fill(0); fCur[1].fill(0);
    computeFraming();
  }

  /* ---------------------------------------------------------------- public API */
  function beat(strength = 1) {
    if (dead) return; strength = +strength || 1;
    beatT = 0; beatAmp = Math.min(1.3, .55 + .4 * strength); beatCool = .7;
    lastBeatSide = (lastBeatSide + 1) % 3; beatSide = Math.random() < .2 ? 2 : lastBeatSide % 2;
  }
  function emote(name, { hold = 3 } = {}) {
    if (dead || !EMOTES.includes(name)) return;
    if (seq && seq.kind === 'intro') { pendingEmote = { name, hold }; return; }
    if (hidden || (seq && seq.kind === 'exit')) return;
    idleSt = null;
    if (name === 'idle') { emoteSt = null; forceTalkUntil = 0; return; }
    if (name === 'talk') { forceTalkUntil = simT + hold; emoteSt = null; return; }
    if (name === 'dance') name = DANCE_NAMES[(Math.random() * DANCE_NAMES.length) | 0];
    emoteSt = { name, t0: simT, until: simT + Math.max(.2, +hold || 3) };
  }

  Object.assign(space, {
    async enter({ vessel, name } = {}) {
      if (dead) return;
      if (autoPauseT) { clearTimeout(autoPauseT); autoPauseT = 0; } autoPaused = false;
      resize(); kick();
      try {
        if (vessel) { const v = await loadVessel(vessel); if (dead) { try { VRM.VRMUtils.deepDispose(v.scene); } catch (e) { /* */ } return; } adopt(v); }
        else if (!model.vrm) throw new Error('enter() needs a vessel (VRM ArrayBuffer/Blob)');
        else { model.vrm.scene.visible = true; }
      } catch (e) { emit('error', { message: String((e && e.message) || e), name }); throw e; }
      emoteSt = idleSt = null; hidden = false; pendingEmote = null; forceTalkUntil = 0; exitPromise = null;
      model.vrm.scene.visible = true;
      startSeq('intro');
      // first frame: already below the floor, no flash of the rest pose
      snapNext = true; seq.tt = 0; resolveFrame(); applyPose(1 / 60); snapNext = false; model.vrm.update(0);
      camSnap = true; poseDt = 0; chopAcc = 0; camReset(true); hearing = false; trans.from = null; ownerKey = '';
      emit('ready', { name: name || (space.info && space.info.name) || '' });
      render();
      return new Promise((res) => { seqResolve = res; });
    },
    async exit() {
      if (dead || !model.vrm || hidden) { if (!dead) emit('exit-done'); return; }
      if (exitPromise) return exitPromise;
      if (autoPauseT) { clearTimeout(autoPauseT); autoPauseT = 0; } autoPaused = false;
      emoteSt = idleSt = null; pendingEmote = null; if (seqResolve) { const r = seqResolve; seqResolve = null; r(); }
      startSeq('exit'); kick();
      exitPromise = new Promise((res) => { seqResolve = res; });
      return exitPromise;
    },
    emote,
    setSpeaking(on) { if (dead) return; speaking = !!on; if (speaking) { idleSt = null; if (emoteSt && (emoteSt.idle || emoteSt.name === 'think' || emoteSt.name === 'hmm')) emoteSt = null; } },
    // the user is talking right now: cupped-ear "listening" pose (studio page). Clears idle flourishes and the thinking pose.
    setHearing(on) { if (dead) return; on = !!on; if (on && !hearing) hearT0 = simT; hearing = on; if (on) { idleSt = null; if (emoteSt && (emoteSt.idle || emoteSt.name === 'think' || emoteSt.name === 'hmm')) emoteSt = null; } },
    // muted / reduced-motion: swap the ambient curious script for the gentle breathing idle
    setCalm(on) { if (dead) return; calm = !!on; },
    // ---- camera ------------------------------------------------------------------------------------------
    setOrbit(on) { if (dead) return; uc.orbit = !!on; },
    resetCamera(snap = false) { if (dead) return; camReset(!!snap); },
    cameraRotate: (dx, dy) => { if (!dead) camRotate(dx, dy); },
    cameraZoom: (f) => { if (!dead) camZoom(+f || 1); },
    cameraPan: (dx, dy) => { if (!dead) camPan(dx, dy); },
    getCamera() { return { az: +uc.az.toFixed(3), el: +uc.el.toFixed(3), zoom: +uc.zoom.toFixed(3), px: +uc.px.toFixed(3), py: +uc.py.toFixed(3), orbit: uc.orbit, framing: O.framing, pos: camera.position.toArray().map((x) => +x.toFixed(3)) }; },
    setMouth(m) {
      if (dead || !m) return;
      mouth.open = sat(+m.open || 0); mouth.low = sat(+m.low || 0); mouth.mid = sat(+m.mid || 0); mouth.high = sat(+m.high || 0);
      lastMouthMs = performance.now();
    },
    setListening(on) { if (dead) return; listening = !!on; if (listening) idleSt = null; },
    beat,
    setOptions(p = {}) {
      if (dead) return;
      for (const k of Object.keys(p)) {
        if (!(k in DEFAULTS)) continue;
        let v = p[k];
        if (k === 'chop') { v = v === true ? 'mixed' : v === false ? 'off' : String(v); if (!['mixed', '2', '3', 'off'].includes(v)) continue; }
        if (k === 'fps') v = +v === 30 ? 30 : 60;
        if (k === 'framing') v = FRAMINGS.includes(v) ? v : 'full';
        if (k === 'bounce') v = Math.min(2, Math.max(0, +v || 0));
        if (k === 'bubbly') v = !!v;
        if (k === 'pixelRatio') { v = Math.min(3, Math.max(.5, +v || 1)); }
        O[k] = v;
      }
      post.uniforms.edge.value = O.edges ? 1 : 0; post.uniforms.ht.value = O.halftone ? 1 : 0; post.uniforms.ink.value = O.ink ? 1 : 0;
      post.uniforms.sh.value = chopOn() ? 1.5 : 0;
      env.setNeon(O.neon); env.setParticles(O.particles ? 1 : 0); applyToon();
      if ('pixelRatio' in p) resize(); else computeFraming();
      if ('framing' in p) camReset(false);   // a new preset starts from a clean view (the camera glides there)
      if ('chop' in p) { chopNext = chopInterval(); chopAcc = 0; }
    },
    getOptions() { return Object.assign({}, O); },
    setFraming(f) { space.setOptions({ framing: f }); },
    resize,
    pause() { userPaused = true; stopLoop(); },
    resume() { userPaused = false; kick(); },
    screenshot() { if (dead) return null; render(); return canvas.toDataURL('image/png'); },
    // test / tooling helpers --------------------------------------------------
    advance(seconds = 1, { render: doRender = true } = {}) { if (dead) return; const n = Math.max(1, Math.round(seconds * 30)); for (let i = 0; i < n; i++) step(1 / 30); if (doRender) render(); },
    poseNow(name, seconds = 1.6) { if (dead) return; emote(name, { hold: 1e6 }); space.advance(seconds); },
    triggerIdle,
    state() { return { simT, emote: emoteSt && emoteSt.name, idle: idleSt && idleSt.def.name, seq: seq && seq.kind, speaking, listening, hidden, flip: model.flip, h: model.h,
      drop: model.drop, hipsY: hipC[1], expr: Array.from(exC).map((x) => +x.toFixed(2)), exprNames: EXN.filter((n, i) => exAvail[i]), libs: source, chop: O.chop, poseCount, owner: ownerKey, hearing, calm, talkOwn, gaze: gzMode, morph: Array.from(morphC).map((x) => +x.toFixed(2)), faceMorphs: !!model.faceMesh, cam: space.getCamera(), bubbly: O.bubbly, transitioning: !!trans.from }; },
    dispose() {
      if (dead) return; dead = true; stopLoop();
      if (autoPauseT) clearTimeout(autoPauseT);
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('webglcontextlost', onLost); canvas.removeEventListener('webglcontextrestored', onRestored);
      canvas.removeEventListener('pointerdown', onDown); canvas.removeEventListener('pointermove', onMove); canvas.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointercancel', onUp); canvas.removeEventListener('wheel', onWheel);
      try { ro && ro.disconnect(); } catch (e) { /* */ }
      disposeVrm(); try { env.dispose(); } catch (e) { /* */ } try { post.dispose(); } catch (e) { /* */ }
      try { renderer.dispose(); renderer.forceContextLoss(); } catch (e) { /* */ }
      try { canvas.remove(); } catch (e) { /* */ }
      if (seqResolve) { const r = seqResolve; seqResolve = null; r(); }
      space.onevent = null;
    },
  });
  space.setOptions({});
  resize();
  kick();
  return space;
}
