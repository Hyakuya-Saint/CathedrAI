// Ears: microphone capture, human-voice detection, dictation, and the Whisper "hearing module".
// Contract: docs/MODULE_API.md section 3. Pure DSP lives in dsp.js (unit-tested in node).
import { Vad, FRAME, SR, Resampler, isHallucination } from './dsp.js';

/* ---------------------------------------------------------------- microphone manager (shared by live talk and dictation) */
const WORKLET = `class CaCap extends AudioWorkletProcessor{constructor(){super();this.b=new Float32Array(1024);this.n=0}
process(i){const c=i[0]&&i[0][0];if(c){for(let k=0;k<c.length;k++){this.b[this.n++]=c[k];if(this.n===1024){this.port.postMessage(this.b.slice(0));this.n=0}}}return true}}
registerProcessor('ca-cap',CaCap);`;

const mic = {
  subs: new Set(), stream: null, ctx: null, node: null, src: null, sink: null, rs: null, acc: new Float32Array(FRAME * 8), accN: 0, opening: null,
  async open() {
    if (this.ctx) return;
    if (this.opening) return this.opening;
    this.opening = (async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('This browser has no microphone access (getUserMedia unavailable).');
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      } catch (e) {
        const n = e && e.name;
        throw new Error(n === 'NotAllowedError' || n === 'SecurityError' ? 'Microphone permission was denied. Allow the microphone for CathedrAI in Android settings, then try again.'
          : n === 'NotFoundError' ? 'No microphone was found on this device.' : n === 'NotReadableError' ? 'The microphone is busy (another app is using it).' : 'Could not open the microphone: ' + ((e && e.message) || e));
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      let ctx;
      try { ctx = new AC({ sampleRate: SR, latencyHint: 'interactive' }); } catch (e) { ctx = new AC({ latencyHint: 'interactive' }); }
      try { await ctx.resume(); } catch (e) { /* needs a gesture; the shell calls from one */ }
      this.stream = stream; this.ctx = ctx; this.rs = new Resampler(ctx.sampleRate, SR);
      this.src = ctx.createMediaStreamSource(stream);
      const sink = ctx.createGain(); sink.gain.value = 0; sink.connect(ctx.destination); this.sink = sink;
      let ok = false;
      if (ctx.audioWorklet) {
        try {
          const url = URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' }));
          await ctx.audioWorklet.addModule(url); URL.revokeObjectURL(url);
          const node = new AudioWorkletNode(ctx, 'ca-cap', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
          node.port.onmessage = e => this._chunk(e.data);
          this.src.connect(node); node.connect(sink); this.node = node; ok = true;
        } catch (e) { /* fall through to ScriptProcessor */ }
      }
      if (!ok) {
        const sp = ctx.createScriptProcessor(2048, 1, 1);
        sp.onaudioprocess = e => this._chunk(e.inputBuffer.getChannelData(0).slice(0));
        this.src.connect(sp); sp.connect(sink); this.node = sp;
      }
      stream.getAudioTracks().forEach(t => { t.onended = () => this._lost(); });
    })();
    try { await this.opening; } finally { this.opening = null; }
  },
  _lost() { for (const s of this.subs) s.onError && s.onError('The microphone stopped (another app took it?).'); this.close(); },
  _chunk(x) {
    const y = this.rs.process(x);
    if (this.accN + y.length > this.acc.length) { const n = new Float32Array((this.accN + y.length) * 2); n.set(this.acc.subarray(0, this.accN)); this.acc = n; }
    this.acc.set(y, this.accN); this.accN += y.length;
    let p = 0;
    while (this.accN - p >= FRAME) {
      const fr = this.acc.subarray(p, p + FRAME);
      for (const s of this.subs) s.frame(fr);
      p += FRAME;
    }
    if (p) { this.acc.copyWithin(0, p, this.accN); this.accN -= p; }
  },
  close() {
    try { this.node && this.node.disconnect(); this.src && this.src.disconnect(); this.sink && this.sink.disconnect(); } catch (e) { /* ignore */ }
    try { this.stream && this.stream.getTracks().forEach(t => { t.onended = null; t.stop(); }); } catch (e) { /* ignore */ }
    try { this.ctx && this.ctx.state !== 'closed' && this.ctx.close(); } catch (e) { /* ignore */ }
    this.stream = this.ctx = this.node = this.src = this.sink = this.rs = null; this.accN = 0;
  },
  async add(sub) { this.subs.add(sub); try { await this.open(); } catch (e) { this.subs.delete(sub); throw e; } },
  remove(sub) { this.subs.delete(sub); if (!this.subs.size) this.close(); }
};

/* ---------------------------------------------------------------- Ears */
let live = null; // the continuous-listening subscription

function makeSub(vad, cb) {
  return {
    vad, paused: false, onError: cb.onError,
    frame(fr) {
      if (this.paused) return;
      const r = vad.push(fr);
      if (cb.onLevel) cb.onLevel(vad.level.rms);
      if (!r) return;
      if (r.type === 'start') cb.onSpeechStart && cb.onSpeechStart();
      else if (r.type === 'end') cb.onSpeechEnd && cb.onSpeechEnd({ pcm: r.pcm, seconds: r.seconds, peak: r.peak });
      else if (r.type === 'drop') cb.onDrop && cb.onDrop();
    }
  };
}

/* ---------------------------------------------------------------- Whisper (transformers.js v3) */
const WKEY = 'cathedrai.whisper';
const WMODELS = { 'tiny.en': ['Xenova/whisper-tiny.en', 40], 'base.en': ['Xenova/whisper-base.en', 80], 'small.en': ['Xenova/whisper-small.en', 250] };
const W = { pipe: null, model: null, loading: null, lib: null, cancel: false, chain: Promise.resolve() };
const ls = { get() { try { return JSON.parse(localStorage.getItem(WKEY) || 'null'); } catch (e) { return null; } }, set(v) { try { localStorage.setItem(WKEY, JSON.stringify(v)); } catch (e) { /* ignore */ } }, del() { try { localStorage.removeItem(WKEY); } catch (e) { /* ignore */ } } };

async function loadTransformers() {
  if (W.lib) return W.lib;
  const local = new URL('../vendor/transformers/transformers.min.js', import.meta.url).href;
  let lib = null, err = null;
  try { const r = await fetch(local, { method: 'GET' }); if (r.ok) lib = await import(/* webpackIgnore: true */ local); } catch (e) { err = e; }
  if (!lib) {
    try { lib = await import(/* webpackIgnore: true */ 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3'); } catch (e) { err = e; }
  }
  if (!lib) throw new Error('The speech-recognition library could not be loaded (needs internet the first time). ' + ((err && err.message) || ''));
  const env = lib.env;
  env.allowLocalModels = false; env.useBrowserCache = true;
  try { env.backends.onnx.wasm.numThreads = 1; env.backends.onnx.wasm.proxy = false; } catch (e) { /* ignore */ }
  W.lib = lib; return lib;
}

const whisper = {
  status() { const s = ls.get(); return { installed: !!(s && s.model), loaded: !!W.pipe, model: s ? s.model : null, sizeMB: s ? (WMODELS[s.model] || [0, null])[1] : null, models: Object.entries(WMODELS).map(([k, v]) => ({ id: k, sizeMB: v[1] })) }; },
  async verify() { // is the cache really still there?
    const s = ls.get(); if (!s) return false;
    try { if (!window.caches) return true; const c = await caches.open('transformers-cache'); const ks = await c.keys(); const ok = ks.some(r => r.url.includes(WMODELS[s.model][0])); if (!ok) ls.del(); return ok; } catch (e) { return true; }
  },
  cancelInstall() { W.cancel = true; },
  async install(model = 'tiny.en', onProgress) {
    const m = WMODELS[model]; if (!m) throw new Error('Unknown speech model ' + model);
    if (W.pipe && W.model === model) return true;
    if (W.loading) return W.loading;
    W.cancel = false;
    W.loading = (async () => {
      try {
        onProgress && onProgress(0, 'Loading the speech-recognition library…');
        const lib = await loadTransformers();
        const files = new Map();
        const cb = p => {
          if (W.cancel) throw new Error('cancelled');
          if (p && p.file && p.total) files.set(p.file, { l: p.loaded || 0, t: p.total });
          let l = 0, t = 0; files.forEach(v => { l += v.l; t += v.t; });
          if (onProgress) onProgress(t ? Math.min(0.99, l / t) : 0, p && p.status === 'ready' ? 'Starting…' : 'Downloading ' + model + ' · ' + Math.round(l / 1048576) + ' / ' + Math.round(t / 1048576) + ' MB');
        };
        let pipe;
        try { pipe = await lib.pipeline('automatic-speech-recognition', m[0], { dtype: 'q8', device: 'wasm', progress_callback: cb }); }
        catch (e) {
          if (/cancelled/.test((e && e.message) || '')) throw e;
          // some repos only ship fp32 weights: retry without a dtype hint
          pipe = await lib.pipeline('automatic-speech-recognition', m[0], { device: 'wasm', progress_callback: cb });
        }
        W.pipe = pipe; W.model = model; ls.set({ model, t: Date.now() });
        onProgress && onProgress(1, 'Ready');
        return true;
      } finally { W.loading = null; }
    })();
    return W.loading;
  },
  async warmup() { const s = ls.get(); if (!s) return false; if (!W.pipe) await this.install(s.model); try { await W.pipe(new Float32Array(SR / 2)); } catch (e) { /* ignore */ } return true; },
  async transcribe(pcm, { language = 'en' } = {}) {
    if (!W.pipe) { const s = ls.get(); if (!s) throw new Error('The hearing module is not installed yet.'); await this.install(s.model); }
    const run = async () => {
      let peak = 0; for (let i = 0; i < pcm.length; i++) { const a = Math.abs(pcm[i]); if (a > peak) peak = a; }
      const opts = { chunk_length_s: 30, return_timestamps: false };
      if (!/\.en$/.test(W.model)) { opts.language = language; opts.task = 'transcribe'; }
      let x = pcm;
      if (peak > 0 && peak < 0.3) { x = new Float32Array(pcm.length); const g = 0.5 / peak; for (let i = 0; i < pcm.length; i++) x[i] = pcm[i] * g; } // gentle normalise for quiet speakers
      const out = await W.pipe(x, opts);
      const text = ((out && (Array.isArray(out) ? out[0].text : out.text)) || '').replace(/\s+/g, ' ').trim();
      return isHallucination(text, pcm.length / SR, peak) ? '' : text;
    };
    const p = W.chain.then(run, run); W.chain = p.catch(() => {}); return p;
  },
  async remove() {
    try { W.pipe && W.pipe.dispose && (await W.pipe.dispose()); } catch (e) { /* ignore */ }
    W.pipe = null; W.model = null; ls.del();
    try { if (window.caches) { const c = await caches.open('transformers-cache'); for (const r of await c.keys()) if (/whisper/i.test(r.url)) await c.delete(r); } } catch (e) { /* ignore */ }
  }
};

/* ---------------------------------------------------------------- public API */
export const Ears = {
  async start({ sensitivity = 0.5, onSpeechStart, onSpeechEnd, onLevel, onError, onDrop } = {}) {
    if (live) this.stop();
    const vad = new Vad({ sensitivity });
    live = makeSub(vad, { onSpeechStart, onSpeechEnd, onLevel, onError, onDrop });
    await mic.add(live);
  },
  stop() { if (live) { const s = live; live = null; mic.remove(s); } },
  pause() { if (live) { live.paused = true; live.vad.reset(); } },
  resume() { if (live) { live.paused = false; live.vad.reset(); } },
  isActive() { return !!live && !live.paused; },
  isOpen() { return !!live; },
  setSensitivity(v) { if (live) live.vad.setSensitivity(v); },
  setEchoGuard(g) { if (live) { live.vad.setEchoGuard(g); } },
  getInLevel() { return live ? live.vad.level : { rms: 0, bands: new Float32Array(16) }; },
  // dictation: wait for the first real utterance, stop after `silenceSeconds`
  async recordOnce({ maxSeconds = 30, silenceSeconds = 1.2, onLevel, startTimeout = 12, signal } = {}) {
    const vad = new Vad({ sensitivity: live ? live.vad.sens : 0.55, hangMs: silenceSeconds * 1000, maxSeconds });
    return new Promise(async (resolve, reject) => {
      let done = false, t0 = null;
      const fin = (v, err) => { if (done) return; done = true; clearTimeout(t0); sub && mic.remove(sub); signal && signal.removeEventListener('abort', ab); err ? reject(err) : resolve(v); };
      const ab = () => fin(null);
      const sub = makeSub(vad, {
        onSpeechStart: () => clearTimeout(t0),
        onSpeechEnd: r => fin({ pcm: r.pcm, seconds: r.seconds }),
        onLevel: l => onLevel && onLevel(l),
        onError: m => fin(null, new Error(m))
      });
      if (signal) { if (signal.aborted) return fin(null); signal.addEventListener('abort', ab); }
      try { await mic.add(sub); } catch (e) { return fin(null, e); }
      t0 = setTimeout(() => fin(null), startTimeout * 1000);
    });
  },
  whisper
};
