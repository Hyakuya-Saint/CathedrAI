// Saint voice (text-to-speech). Piper (.onnx voice, espeak phonemizer + onnxruntime-web) with a speechSynthesis fallback.
// Contract: docs/MODULE_API.md section 2.
import { cleanForSpeech, splitSentences } from './dsp.js';

const V = new URL('../vendor/', import.meta.url).href;
const ORT_VER = '1.20.1';
const ORT_CDN = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VER}/dist/`;
const ORT_LOCAL = V + 'ort/';
const DEFAULTS = { sample_rate: 22050, noise_scale: 0.667, length_scale: 1.0, noise_w: 0.8 };

/* ---------------------------------------------------------------- small helpers */
const sleep = ms => new Promise(r => setTimeout(r, ms));
function loadScript(src, isOrt) {
  return new Promise((ok, no) => {
    const s = document.createElement('script'); s.src = src; s.async = true; if (isOrt) s.dataset.ort = '1';
    s.onload = () => ok(); s.onerror = () => { s.remove(); no(new Error('could not load ' + src)); };
    document.head.appendChild(s);
  });
}
async function fetchBytes(url) { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url); return new Uint8Array(await r.arrayBuffer()); }
const errText = e => (e && (e.message || String(e))) || 'unknown error';

/* ---------------------------------------------------------------- phonemizer (espeak-ng compiled to wasm, from piper-phonemize) */
let phoPromise = null, phoMod = null, phoOut = [];
async function getPhonemizer() {
  if (phoMod) return phoMod;
  if (phoPromise) return phoPromise;
  phoPromise = (async () => {
    if (typeof window.createPiperPhonemize !== 'function') await loadScript(V + 'piper/piper_phonemize.js');
    const wasmBinary = await fetchBytes(V + 'piper/piper_phonemize.wasm');
    const mod = await window.createPiperPhonemize({
      print: l => phoOut.push(l), printErr: () => {}, wasmBinary,
      locateFile: u => V + 'piper/' + u
    });
    phoMod = mod; return mod;
  })();
  try { return await phoPromise; } catch (e) { phoPromise = null; throw e; }
}
// -> array of phoneme-id arrays (one per sentence espeak found). Never throws on odd text; throws only if the wasm is broken.
async function phonemize(text, voice) {
  const mod = await getPhonemizer();
  const tries = [voice, 'en-gb-x-rp', 'en-us'];
  for (const v of tries) {
    phoOut = [];
    try {
      mod.callMain(['-l', v, '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']);
    } catch (e) { if (typeof e !== 'number' && !(e && e.name === 'ExitStatus')) throw e; /* C++ exception: unknown voice or bad text */ }
    const res = [];
    for (const l of phoOut) { try { const j = JSON.parse(l); if (j && j.phoneme_ids && j.phoneme_ids.length > 3) res.push(j.phoneme_ids); } catch (e) { /* not json */ } }
    if (res.length) return res;
    if (v === voice && !phoOut.length) continue; // voice rejected, try a safer one
    return res;
  }
  return [];
}

/* ---------------------------------------------------------------- onnxruntime-web */
// onnxruntime-web 1.20 needs three files from the same folder: ort.min.js (library), ort-wasm-simd-threaded.mjs (loader)
// and ort-wasm-simd-threaded.wasm (engine). They are bundled in vendor/ort/ by scripts/vendor.mjs; if the app files are
// missing the CDN copy is used instead (needs internet once).
// ort remembers a failed start for the rest of the page, so a retry always begins with a freshly loaded library.
let ortPromise = null, ortMode = 'blob', ortBase = ORT_LOCAL;
const ORT_FILES = ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'];

async function fetchChecked(url, kind) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url);
  if (kind === 'wasm') {
    const b = new Uint8Array(await r.arrayBuffer());
    if (b.length < 1024 || b[0] !== 0 || b[1] !== 0x61 || b[2] !== 0x73 || b[3] !== 0x6d) throw new Error('not a wasm file: ' + url);
    return b;
  }
  const t = await r.text();
  if (/^\s*</.test(t)) throw new Error('got a web page instead of the script: ' + url);
  return t;
}
let ortAssets = null;
async function getOrtAssets() { // local first, CDN second; cached so the 10 MB engine is read once
  if (ortAssets) return ortAssets;
  let lastErr;
  for (const base of [ORT_LOCAL, ORT_CDN]) {
    try {
      const [mjs, wasm] = [await fetchChecked(base + ORT_FILES[0], 'mjs'), await fetchChecked(base + ORT_FILES[1], 'wasm')];
      ortAssets = { base, mjs, wasm }; return ortAssets;
    } catch (e) { lastErr = e; }
  }
  throw new Error('onnxruntime-web files not found in the app or on the CDN (' + errText(lastErr) + ')');
}
function resetOrt() {
  ortPromise = null; ortAssets = null;
  try { delete window.ort; } catch (e) { window.ort = undefined; }
  document.querySelectorAll('script[data-ort]').forEach(s => s.remove());
}
async function getOrt(mode = 'blob') {
  if (!ortPromise) {
    ortPromise = (async () => {
      if (!window.ort) {
        const tag = '?v=' + Date.now();
        try { await loadScript(ORT_LOCAL + 'ort.min.js' + tag, true); ortBase = ORT_LOCAL; }
        catch (e) { await loadScript(ORT_CDN + 'ort.min.js', true); ortBase = ORT_CDN; }
      }
      if (!window.ort) throw new Error('onnxruntime-web did not load');
      return window.ort;
    })();
    ortPromise.catch(() => { ortPromise = null; });
  }
  const ort = await ortPromise;
  ort.env.wasm.numThreads = 1; ort.env.wasm.simd = true; ort.env.wasm.proxy = false;
  if (mode === 'prefix') { ort.env.wasm.wasmPaths = ortBase; }
  else { // Blob URLs sidestep Android's asset server serving .mjs/.wasm with the wrong MIME type
    const a = await getOrtAssets();
    ortBase = a.base;
    if (!ort.__blobPaths) ort.__blobPaths = { mjs: URL.createObjectURL(new Blob([a.mjs], { type: 'text/javascript' })), wasm: URL.createObjectURL(new Blob([a.wasm], { type: 'application/wasm' })) };
    ort.env.wasm.wasmPaths = ort.__blobPaths;
  }
  ortMode = mode; return ort;
}

/* ---------------------------------------------------------------- state */
const S = {
  session: null, cfg: null, name: '', espeak: 'en-gb-x-rp', hasSid: false, ortErr: '',
  ctx: null, analyser: null, gain: null, td: null, fd: null, level: { rms: 0, low: 0, mid: 0, high: 0 },
  gen: 0, q: [], pumping: false, sources: new Set(), nextT: 0, speaking: 0, sys: { on: false, t0: 0 },
  forceSystem: false, speakers: []
};

function audioCtx() {
  if (!S.ctx || S.ctx.state === 'closed') {
    const AC = window.AudioContext || window.webkitAudioContext;
    S.ctx = new AC({ latencyHint: 'interactive' });
    S.gain = S.ctx.createGain(); S.gain.connect(S.ctx.destination);
    S.analyser = S.ctx.createAnalyser(); S.analyser.fftSize = 512; S.analyser.smoothingTimeConstant = 0.4; S.gain.connect(S.analyser);
    S.td = new Float32Array(S.analyser.fftSize); S.fd = new Uint8Array(S.analyser.frequencyBinCount);
  }
  if (S.ctx.state === 'suspended') S.ctx.resume().catch(() => {});
  return S.ctx;
}

/* ---------------------------------------------------------------- Piper synthesis */
async function createSession(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const errs = [];
  for (const mode of ['blob', 'prefix']) { // each attempt starts from a fresh ort, because ort refuses to retry after a failed start
    try {
      resetOrt();
      const ort = await getOrt(mode);
      const sess = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      return { ort, sess };
    } catch (e) { errs.push(mode + ': ' + errText(e)); }
  }
  throw new Error('Could not start the voice engine (' + errs.join(' | ') + ')');
}

async function synthIds(ids, speaker, speed) {
  const ort = window.ort, c = S.cfg;
  const feeds = {
    input: new ort.Tensor('int64', BigInt64Array.from(ids, x => BigInt(x)), [1, ids.length]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
    scales: new ort.Tensor('float32', Float32Array.from([c.noise_scale, c.length_scale / Math.max(0.5, Math.min(2, speed || 1)), c.noise_w]), [3])
  };
  if (S.hasSid) feeds.sid = new ort.Tensor('int64', BigInt64Array.from([BigInt(speaker | 0)]), [1]);
  const out = await S.session.run(feeds);
  const t = out.output || out[Object.keys(out)[0]];
  const pcm = Float32Array.from(t.data);
  let pk = 0; for (let i = 0; i < pcm.length; i++) { const a = Math.abs(pcm[i]); if (a > pk) pk = a; }
  const g = 0.92 / Math.max(0.05, pk); for (let i = 0; i < pcm.length; i++) pcm[i] *= g;
  return pcm;
}
async function synthSentence(text, speaker, speed) {
  const lists = await phonemize(text, S.espeak);
  if (!lists.length) return null;
  const parts = []; let n = 0;
  for (const ids of lists) { const p = await synthIds(ids, speaker, speed); parts.push(p); n += p.length; }
  const gap = Math.round(S.cfg.sample_rate * 0.14), out = new Float32Array(n + gap); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/* ---------------------------------------------------------------- playback */
function playPcm(pcm, rate, volume) {
  const ctx = audioCtx(), buf = ctx.createBuffer(1, pcm.length, rate);
  buf.copyToChannel(pcm, 0);
  const src = ctx.createBufferSource(); src.buffer = buf; src.connect(S.gain);
  S.gain.gain.value = volume == null ? 1 : volume;
  const t = Math.max(ctx.currentTime + 0.03, S.nextT); src.start(t); S.nextT = t + buf.duration;
  S.sources.add(src);
  const done = new Promise(res => { src._res = res; src.onended = () => { S.sources.delete(src); res(); }; });
  return { startIn: Math.max(0, t - ctx.currentTime), done };
}

function speakSystem(text, speed, volume) {
  return new Promise(res => {
    const ss = window.speechSynthesis;
    if (!ss) return res();
    const u = new SpeechSynthesisUtterance(text);
    const vs = ss.getVoices(), en = vs.filter(v => /^en/i.test(v.lang));
    const pick = en.find(v => /gb|uk/i.test(v.lang) && /female|natural|neural/i.test(v.name)) || en.find(v => /natural|neural|enhanced/i.test(v.name)) || en.find(v => v.localService) || en[0];
    if (pick) u.voice = pick; u.lang = (pick && pick.lang) || 'en-US'; u.rate = Math.max(0.5, Math.min(2, speed || 1)); u.volume = volume == null ? 1 : volume;
    let done = false;
    const fin = () => { if (done) return; done = true; clearTimeout(guard); S.sys.on = false; res(); };
    const guard = setTimeout(fin, 4000 + text.length * 120 / u.rate); // some WebViews never fire onend
    u.onend = fin; u.onerror = fin;
    u.onboundary = () => { S.sys.pulse = performance.now(); };
    S.sys.on = true; S.sys.t0 = performance.now(); S.sys.pulse = S.sys.t0;
    try { ss.cancel(); ss.speak(u); } catch (e) { fin(); }
  });
}

/* ---------------------------------------------------------------- sentence queue */
// Every sentence of every speak() call goes into one global queue. The pump synthesises one sentence ahead
// while the previous one plays, schedules audio back to back (no gaps) and fires onStart(text, index) when
// each sentence actually begins to sound, so the 3D space can change expression exactly on time.
function startSynth(it) {
  if (it.pcmP) return;
  it.pcmP = (S.session && !S.forceSystem) ? synthSentence(it.text, it.o.speaker, it.o.speed).then(p => ({ p }), e => ({ e })) : Promise.resolve({ sys: true });
}
function finish(it) { if (it.fin) return; it.fin = true; S.speaking--; it.resolve(); }
async function pump() {
  if (S.pumping) return; S.pumping = true;
  let prev = Promise.resolve();
  try {
    while (S.q.length) {
      const it = S.q.shift();
      if (it.gen !== S.gen || (it.o.signal && it.o.signal.aborted)) { finish(it); continue; }
      startSynth(it);
      if (S.q[0]) startSynth(S.q[0]);
      let r = await it.pcmP;
      if (it.gen !== S.gen) { finish(it); continue; }
      if (r.e) { S.forceSystem = true; Voice.onerror && Voice.onerror(new Error('Saint voice failed, using the system voice: ' + errText(r.e))); r = { sys: true }; }
      if (r.sys || S.forceSystem) {
        await prev;
        if (it.gen !== S.gen) { finish(it); continue; }
        try { it.o.onStart && it.o.onStart(it.text, it.i); } catch (e) { /* ignore */ }
        await speakSystem(it.text, it.o.speed, it.o.volume);
        finish(it); prev = Promise.resolve(); continue;
      }
      const g = it.gen, h = playPcm(r.p, S.cfg.sample_rate, it.o.volume);
      setTimeout(() => { if (g === S.gen) { try { it.o.onStart && it.o.onStart(it.text, it.i); } catch (e) { /* ignore */ } } }, h.startIn * 1000);
      h.done.then(() => finish(it));
      await prev; prev = h.done;
    }
    await prev;
  } finally { S.pumping = false; if (S.q.length) pump(); }
}

/* ---------------------------------------------------------------- public API */
export const Voice = {
  onerror: null,
  async init() { try { if (window.speechSynthesis) window.speechSynthesis.getVoices(); } catch (e) { /* ignore */ } },

  async loadSaintVoice({ onnx, config, name }) {
    this.unloadSaintVoice();
    const buf = onnx instanceof Blob ? new Uint8Array(await onnx.arrayBuffer()) : onnx;
    const c = config || {};
    S.cfg = {
      sample_rate: (c.audio && c.audio.sample_rate) || DEFAULTS.sample_rate,
      noise_scale: (c.inference && c.inference.noise_scale) ?? DEFAULTS.noise_scale,
      length_scale: (c.inference && c.inference.length_scale) ?? DEFAULTS.length_scale,
      noise_w: (c.inference && c.inference.noise_w) ?? DEFAULTS.noise_w
    };
    S.espeak = (c.espeak && c.espeak.voice) || (/en[_-]gb/i.test(name || '') ? 'en-gb-x-rp' : 'en-us');
    S.speakers = c.speaker_id_map ? Object.entries(c.speaker_id_map).map(([n, id]) => ({ id, name: n })).sort((a, b) => a.id - b.id) : [];
    S.name = name || 'voice';
    const { sess } = await createSession(buf);
    S.session = sess; S.hasSid = sess.inputNames.includes('sid'); S.forceSystem = false;
    if (S.hasSid && !S.speakers.length) S.speakers = [0, 1, 2, 3].map(i => ({ id: i, name: 'Speaker ' + i }));
    return true;
  },
  unloadSaintVoice() {
    this.stopSpeaking();
    try { S.session && S.session.release && S.session.release(); } catch (e) { /* ignore */ }
    S.session = null; S.cfg = null; S.speakers = []; S.hasSid = false;
  },
  engine() { return S.session && !S.forceSystem ? 'piper' : (window.speechSynthesis ? 'system' : 'none'); },
  get speakers() { return S.speakers; },
  get voiceName() { return S.name; },

  speak(text, { speaker = 0, speed = 1, volume = 1, signal, onStart } = {}) {
    const sents = splitSentences(cleanForSpeech(text));
    if (!sents.length) return Promise.resolve();
    audioCtx();
    const dones = sents.map((t, i) => new Promise(resolve => {
      S.speaking++;
      S.q.push({ text: t, i, gen: S.gen, o: { speaker, speed, volume, signal, onStart }, resolve });
    }));
    if (S.pumping && S.q.length === sents.length) startSynth(S.q[0]);
    pump();
    return Promise.all(dones).then(() => {});
  },
  stopSpeaking() {
    S.gen++; S.nextT = 0;
    const q = S.q; S.q = []; for (const it of q) finish(it);
    for (const s of S.sources) { try { s.onended = null; s.stop(); s._res && s._res(); } catch (e) { /* ignore */ } }
    S.sources.clear();
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    S.sys.on = false;
  },
  isSpeaking() { return S.speaking > 0 || S.sources.size > 0 || S.sys.on; },

  getOutLevel() {
    const L = S.level; let rms = 0, low = 0, mid = 0, high = 0;
    if (S.sources.size && S.analyser) {
      S.analyser.getFloatTimeDomainData(S.td); let e = 0; for (let i = 0; i < S.td.length; i++) e += S.td[i] * S.td[i];
      rms = Math.min(1, Math.sqrt(e / S.td.length) * 4.5);
      S.analyser.getByteFrequencyData(S.fd);
      const bw = (S.ctx.sampleRate / 2) / S.fd.length, avg = (a, b) => { let s = 0, n = 0; for (let k = Math.max(1, Math.floor(a / bw)); k < Math.min(S.fd.length, Math.ceil(b / bw)); k++) { s += S.fd[k]; n++; } return n ? s / n / 255 : 0; };
      low = avg(100, 500); mid = avg(500, 2000); high = avg(2000, 6000);
      const tot = low + mid + high + 1e-4; low /= tot; mid /= tot; high /= tot; // shape only; loudness is rms
    } else if (S.sys.on) {
      const t = (performance.now() - S.sys.t0) / 1000, fresh = performance.now() - (S.sys.pulse || 0) < 600;
      rms = fresh ? 0.25 + 0.5 * Math.abs(Math.sin(t * 10.3)) * (0.6 + 0.4 * Math.abs(Math.sin(t * 3.1 + 1))) : 0.1;
      low = 0.3 + 0.2 * Math.sin(t * 4.1); mid = 0.4 + 0.2 * Math.sin(t * 7.3 + 2); high = 1 - low - mid;
    }
    const k = rms > L.rms ? 0.6 : 0.25; // fast attack, slower release
    L.rms += (rms - L.rms) * k; L.low += (low - L.low) * 0.4; L.mid += (mid - L.mid) * 0.4; L.high += (high - L.high) * 0.4;
    return L;
  },

  listSystemVoices() { try { return window.speechSynthesis ? window.speechSynthesis.getVoices().map(v => ({ name: v.name, lang: v.lang })) : []; } catch (e) { return []; } },

  async selfTest(report = () => {}) {
    let ok = true;
    const step = async (n, fn) => { try { const d = await fn(); report(n, true, d == null ? '' : String(d)); return true; } catch (e) { ok = false; report(n, false, errText(e)); return false; } };
    let ids = null;
    await step('Phonemizer (espeak wasm)', async () => { ids = await phonemize('Hello, this is a test of the Saint voice.', S.espeak); if (!ids.length) throw new Error('no phoneme ids produced'); return ids.reduce((a, b) => a + b.length, 0) + ' phoneme ids, first sentence ' + ids[0].slice(0, 10).join(',') + '…'; });
    await step('Audio output', async () => { const c = audioCtx(); return c.state + ' @ ' + c.sampleRate + ' Hz'; });
    await step('onnxruntime-web library', async () => { const o = await getOrt(ortMode); return 'ort ' + (o.version || ORT_VER) + ' from ' + (ortBase === ORT_LOCAL ? 'app files' : 'CDN'); });
    if (S.session) {
      await step('Saint voice session', async () => 'inputs: ' + S.session.inputNames.join(', ') + ' · rate ' + S.cfg.sample_rate + ' Hz · speakers ' + (S.speakers.length || 1));
      await step('Saint voice inference', async () => { const t0 = performance.now(); const pcm = await synthIds(ids && ids[0] || [1, 0, 20, 0, 2], 0, 1); const ms = performance.now() - t0; const secs = pcm.length / S.cfg.sample_rate; return secs.toFixed(2) + ' s of audio in ' + Math.round(ms) + ' ms (' + (ms / 1000 / secs).toFixed(2) + '× real time)'; });
    } else report('Saint voice', false, 'no voice imported yet (system voice will be used)');
    await step('System voice (fallback)', async () => { if (!window.speechSynthesis) throw new Error('speechSynthesis not available'); const n = window.speechSynthesis.getVoices().length; return n + ' system voices'; });
    return ok;
  },
  _internals: { phonemize, cleanForSpeech, splitSentences }
};
