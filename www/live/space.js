// CathedrAI 3D Live Space (module contract: docs/MODULE_API.md section 1).
//   import { createSpace, probeVessel } from './live/space.js'
// three r160 + @pixiv/three-vrm 3.0.0 are resolved local-first (www/vendor/…) then from the pinned CDN.
// Helper modules: space-env.js (grey neon horizon + post), space-poses.js (emote / idle / intro / exit pose library).
import { createEnv, createPost } from './space-env.js';
import { EMOTES, FP, POSE, IDLE_ANIMS, introPose, exitPose, INTRO_DUR } from './space-poses.js';

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
  modelOutline: true, particles: true, idleMin: 6, idleMax: 14 };

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

  function computeFraming() {
    const h = model.h || 1.65, vf = camera.fov * Math.PI / 360, asp = W / Hh;
    let visH, cy, needW;
    if (O.framing === 'upper') { visH = h * .62; cy = h * .74; needW = h * .72; }
    else { visH = h * 1.72; cy = h * .6; needW = h * 1.0; }
    const d = Math.max((visH / 2) / Math.tan(vf), (needW / 2) / (Math.tan(vf) * asp));
    goalTgt.set(0, cy, 0); goalPos.set(0, cy + d * .1, d);
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
  const model = { vrm: null, h: 1.65, hs: 1, drop: 2, hipsRest: new THREE.Vector3(), flip: false, nodes: new Array(NS).fill(null), hips: null };
  const tgt = new Float32Array(NS * 3), cur = new Float32Array(NS * 3);
  const hipT = new Float32Array(3), hipC = new Float32Array(3);
  const fTgt = [new Float32Array(5), new Float32Array(5)], fCur = [new Float32Array(5), new Float32Array(5)];
  const exT = new Float32Array(EXN.length), exO = new Float32Array(EXN.length), exC = new Float32Array(EXN.length), exAvail = new Uint8Array(EXN.length);
  let FJ = []; // finger joints {node, ax, k, hand, fi}
  const E = new THREE.Euler(), Q = new THREE.Quaternion(), vtmp = new THREE.Vector3();
  let lookOn = true;
  const toonOrig = new Map();

  /* ---- writer API handed to the pose library ---- */
  const S = {
    drop: 2,
    k(key, x, y, z) { const a = KEYMAP[key]; if (!a) return; for (let j = 0; j < a.length; j++) { const i = a[j], m = SLOTS[i].m; tgt[i * 3] = x; tgt[i * 3 + 1] = y * m; tgt[i * 3 + 2] = z * m; } },
    a(key, x, y, z) { const a = KEYMAP[key]; if (!a) return; for (let j = 0; j < a.length; j++) { const i = a[j], m = SLOTS[i].m; tgt[i * 3] += x; tgt[i * 3 + 1] += y * m; tgt[i * 3 + 2] += z * m; } },
    hip(x, y, z) { hipT[0] = x; hipT[1] = y; hipT[2] = z; },
    hipA(x, y, z) { hipT[0] += x; hipT[1] += y; hipT[2] += z; },
    f(side, name) { const p = FP[name] || FP.Relaxed; if (side !== 'R') fTgt[0].set(p); if (side !== 'L') fTgt[1].set(p); },
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
  let speaking = false, listening = false, forceTalkUntil = 0;
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
    tgt.fill(0); hipT[0] = hipT[1] = hipT[2] = 0; exT.fill(0); lookOn = true;
    POSE.base(S);
    const sc = seq, em = emoteSt, id = idleSt;
    const free = !sc && !em && !id;
    S.drop = model.drop;
    let layerAmt = 1;
    if (sc) { layerAmt = .35; sc.fn(sc.tt, S, sc.ev); }
    else if (em) { const p = POSE[em.name]; if (p) p(simT - em.t0, S); layerAmt = .45; }
    else if (id) { id.def.fn(simT - id.t0, S); layerAmt = .5; }
    // talking body language (arms/gestures only when nothing else owns them)
    if (tb > .01 && free) {
      S.k('B.upperArm', 0, -.1 * tb, -1.2 + .2 * tb); S.k('B.lowerArm', 0, -.15 - .6 * tb, 0); if (tb > .5) S.f('B', 'Loose');
      S.a('B.hand', 0, 0, .1 * tb);
    } else if (lb > .01 && free) {
      S.k('B.upperArm', 0, -.12 * lb, -1.2 + .1 * lb); S.k('B.lowerArm', 0, -.15 - .35 * lb, 0);
    }
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
      S.a('head', (-.03 + nod * .12) * lb, 0, .1 * lb); S.a('spine', .04 * lb, 0, 0); S.a('neck', nod * .04 * lb, 0, 0);
    }
    if (hidden) S.hip(0, -model.drop, 0);
    if (model.flip) { // normalized frame is rotated 180 deg about Y (VRM0): conjugate the rotations
      for (let i = 0; i < NS; i++) { tgt[i * 3] = -tgt[i * 3]; tgt[i * 3 + 2] = -tgt[i * 3 + 2]; }
      hipT[0] = -hipT[0]; hipT[2] = -hipT[2];
    }
  }

  function applyPose(dt) {
    const rate = seq ? 24 : emoteSt ? 9 : 7, a = snapNext ? 1 : 1 - Math.exp(-dt * rate);
    for (let i = 0; i < NS * 3; i++) cur[i] += (tgt[i] - cur[i]) * a;
    const ah = snapNext ? 1 : 1 - Math.exp(-dt * (seq ? 30 : 10));
    for (let i = 0; i < 3; i++) hipC[i] += (hipT[i] - hipC[i]) * ah;
    for (let i = 0; i < NS; i++) {
      const n = model.nodes[i]; if (!n) continue;
      const s = SLOTS[i], l = s.lim;
      n.quaternion.setFromEuler(E.set(clampL(cur[i * 3], l), clampL(cur[i * 3 + 1], l), clampL(cur[i * 3 + 2], l), s.order));
    }
    if (model.hips) model.hips.position.set(model.hipsRest.x + hipC[0] * model.hs, model.hipsRest.y + hipC[1] * model.hs, model.hipsRest.z + hipC[2] * model.hs);
    const af = snapNext ? 1 : 1 - Math.exp(-dt * 12);
    for (let h = 0; h < 2; h++) for (let i = 0; i < 5; i++) fCur[h][i] += (fTgt[h][i] - fCur[h][i]) * af;
    for (let i = 0; i < FJ.length; i++) { const j = FJ[i]; j.node.quaternion.setFromAxisAngle(j.ax, fCur[j.hand][j.fi] * j.k); }
  }

  /* ---------------------------------------------------------------- per real-time-frame layers (smooth, never chopped) */
  function updateExpressions(dt) {
    const em = model.vrm && model.vrm.expressionManager; if (!em) return;
    // blink (auto) - suppressed when an expression owns the eyelids
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
  }

  function updateDirector(dt) {
    const busy = speaking || listening || emoteSt || seq || idleSt || simT < forceTalkUntil;
    if (idleSt && simT - idleSt.t0 > idleSt.def.dur) idleSt = null;
    if (busy) { if (!idleSt) idleTimer = rnd(O.idleMin, O.idleMax); return; }
    idleTimer -= dt;
    if (idleTimer <= 0) triggerIdle();
  }
  function triggerIdle(name) {
    if (dead || !model.vrm || seq) return false;
    let def = name && IDLE_ANIMS.find((d) => d.name === name);
    if (!def) { const pool = IDLE_ANIMS.filter((d) => d.name !== lastIdle); def = pool[(Math.random() * pool.length) | 0]; }
    lastIdle = def.name; idleSt = { def, t0: simT }; idleTimer = rnd(O.idleMin, O.idleMax);
    emit('idle-anim', { name: def.name });
    return true;
  }

  function stepCamera(dt) {
    const k = camSnap ? 1 : 1 - Math.exp(-dt * 3.5); camSnap = false;
    camPos.lerp(goalPos, k); camTgt.lerp(goalTgt, k);
    const d = camPos.z / 3.6, t = simT;
    camera.position.set(camPos.x + Math.sin(t * .31) * .13 * d, camPos.y + Math.sin(t * .23 + 1) * .035 * d, camPos.z + Math.sin(t * .17) * .12 * d);
    camera.lookAt(camTgt.x + Math.sin(t * .27) * .03, camTgt.y + Math.sin(t * .2) * .02, camTgt.z);
    env.update(t, camera);
    const mv = model.vrm;
    if (mv && mv.lookAt) mv.lookAt.target = lookOn ? camera : null;
  }

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
    if (model.vrm) {
      poseDt += dt;
      let doPose = true;
      if (chopOn() && !snapNext && !seq?.noChop) { chopAcc += dt; if (chopAcc < chopNext) doPose = false; else { chopAcc = 0; chopNext = chopInterval(); } }
      if (doPose) {
        resolveFrame(); applyPose(poseDt); poseDt = 0; snapNext = false; poseCount++;
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
    model.vrm = null; toonOrig.clear(); FJ = []; model.nodes.fill(null);
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
    model.h = Math.max(.5, (hy - fy) * 1.15); model.hs = Math.min(1.5, Math.max(.7, model.h / 1.65)); model.drop = (model.h + .35) / model.hs;
    // is the normalized frame rotated (VRM0)? left arm chain must run along local +x in a VRM1-style normalized rig
    const lLow = bone('leftLowerArm'), rLow = bone('rightLowerArm');
    model.flip = !!(lLow && lLow.position.x < 0 && (!rLow || rLow.position.x > 0));
    exAvail.fill(0);
    const em = v.expressionManager;
    EXN.forEach((n, i) => { exAvail[i] = em && em.getExpression(n) ? 1 : 0; });
    exC.fill(0); exT.fill(0);
    calcAxes(); applyToon();
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
      camSnap = true; poseDt = 0; chopAcc = 0;
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
    setSpeaking(on) { if (dead) return; speaking = !!on; if (speaking) idleSt = null; },
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
        if (k === 'framing') v = v === 'upper' ? 'upper' : 'full';
        if (k === 'pixelRatio') { v = Math.min(3, Math.max(.5, +v || 1)); }
        O[k] = v;
      }
      post.uniforms.edge.value = O.edges ? 1 : 0; post.uniforms.ht.value = O.halftone ? 1 : 0; post.uniforms.ink.value = O.ink ? 1 : 0;
      post.uniforms.sh.value = chopOn() ? 1.5 : 0;
      env.setNeon(O.neon); env.setParticles(O.particles ? 1 : 0); applyToon();
      if ('pixelRatio' in p) resize(); else computeFraming();
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
      drop: model.drop, hipsY: hipC[1], expr: Array.from(exC).map((x) => +x.toFixed(2)), exprNames: EXN.filter((n, i) => exAvail[i]), libs: source, chop: O.chop, poseCount }; },
    dispose() {
      if (dead) return; dead = true; stopLoop();
      if (autoPauseT) clearTimeout(autoPauseT);
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('webglcontextlost', onLost); canvas.removeEventListener('webglcontextrestored', onRestored);
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
