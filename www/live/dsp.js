// Pure DSP helpers shared by ears.js (and unit-tested in node: test/voice-test.mjs). No DOM, no WebAudio.

export const SR = 16000;           // all voice detection runs at 16 kHz mono
export const FRAME = 512;          // 32 ms

/* ---------- radix-2 FFT (in place) ---------- */
const tw = new Map();
function twiddles(n) {
  let t = tw.get(n);
  if (!t) {
    t = { c: new Float32Array(n / 2), s: new Float32Array(n / 2) };
    for (let i = 0; i < n / 2; i++) { t.c[i] = Math.cos(-2 * Math.PI * i / n); t.s[i] = Math.sin(-2 * Math.PI * i / n); }
    tw.set(n, t);
  }
  return t;
}
export function fft(re, im) {
  const n = re.length, t = twiddles(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let x = re[i]; re[i] = re[j]; re[j] = x; x = im[i]; im[i] = im[j]; im[j] = x; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1, step = n / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0, w = 0; k < half; k++, w += step) {
        const a = i + k, b = a + half;
        const xr = re[b] * t.c[w] - im[b] * t.s[w], xi = re[b] * t.s[w] + im[b] * t.c[w];
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
      }
    }
  }
}

/* ---------- resampler (any rate -> 16 kHz) with a one-pole-pair low-pass; streaming ---------- */
export class Resampler {
  constructor(inRate, outRate = SR) {
    this.ratio = inRate / outRate; this.pos = 0; this.last = 0; this.same = Math.abs(inRate - outRate) < 1;
    const fc = Math.min(0.45 * outRate, 0.45 * inRate) / inRate; // normalised cutoff
    this.a = Math.exp(-2 * Math.PI * fc); this.y1 = 0; this.y2 = 0;
  }
  // returns a new Float32Array (small); callers append it to their own buffer
  process(x) {
    if (this.same) return x;
    const out = new Float32Array(Math.ceil(x.length / this.ratio) + 2); let n = 0;
    const a = this.a, b = 1 - a;
    // low-pass (2 cascaded one-pole filters), stored in-place copy
    const f = new Float32Array(x.length);
    let y1 = this.y1, y2 = this.y2;
    for (let i = 0; i < x.length; i++) { y1 = b * x[i] + a * y1; y2 = b * y1 + a * y2; f[i] = y2; }
    this.y1 = y1; this.y2 = y2;
    let pos = this.pos, last = this.last;
    while (pos < f.length) {
      const i = Math.floor(pos), fr = pos - i;
      const s0 = i === 0 ? last : f[i - 1], s1 = f[i]; // pos is offset by one sample so index -1 means "previous chunk's last"
      out[n++] = s0 + (s1 - s0) * fr;
      pos += this.ratio;
    }
    this.pos = pos - f.length; this.last = f[f.length - 1];
    return out.subarray(0, n);
  }
}

/* ---------- noise reduction (v0.6): streaming Wiener-style spectral gate, 512 window / 256 hop, sqrt-Hann WOLA ----------
   Per-bin noise power is tracked (fast down, slow up, frozen while a voice segment is open), the gain is a decision-directed
   Wiener filter smoothed over frequency and time, and never goes below `floor` (default -14 dB), so it is a "somewhat"
   reduction: steady hiss / fans / hum / traffic drop clearly, speech keeps its natural sound for the recogniser.
   Latency: 256 samples (16 ms). Input and output frames are FRAME (512) samples. */
const HOP = FRAME / 2;
const SQH = (() => { const w = new Float32Array(FRAME); for (let i = 0; i < FRAME; i++) w[i] = Math.sqrt(0.5 - 0.5 * Math.cos(2 * Math.PI * i / FRAME)); return w; })();
export const NR_LEVELS = { off: 0, light: 0.35, medium: 0.2, strong: 0.12 };   // gain floor per level
export class Denoiser {
  constructor(o = {}) {
    this.floor = o.floor ?? NR_LEVELS.medium; this.enabled = this.floor < 1 && !o.off;
    const K = FRAME / 2 + 1;
    this.inb = new Float32Array(FRAME); this.ola = new Float32Array(FRAME);
    this.re = new Float32Array(FRAME); this.im = new Float32Array(FRAME);
    this.N = new Float32Array(K).fill(NaN); this.G = new Float32Array(K).fill(1); this.Xp = new Float32Array(K);
    this.g2 = new Float32Array(K); this.init = 0; this.out = new Float32Array(FRAME);
  }
  setLevel(name) { const f = NR_LEVELS[name]; if (f === undefined) return; this.enabled = f > 0; if (f > 0) this.floor = f; }
  // x: Float32Array(FRAME); speaking = a voice segment is open (freezes the noise estimate). Returns Float32Array(FRAME) (reused buffer).
  process(x, speaking) {
    const out = this.out;
    if (!this.enabled) { out.set(x); return out; }
    const K = FRAME / 2 + 1, re = this.re, im = this.im, N = this.N, G = this.G, Xp = this.Xp, g2 = this.g2, fl = this.floor;
    for (let h = 0; h < 2; h++) {
      this.inb.copyWithin(0, HOP); this.inb.set(x.subarray(h * HOP, (h + 1) * HOP), HOP);
      for (let i = 0; i < FRAME; i++) { re[i] = this.inb[i] * SQH[i]; im[i] = 0; }
      fft(re, im);
      const warm = this.init < 24;
      for (let k = 0; k < K; k++) {
        const p = re[k] * re[k] + im[k] * im[k] + 1e-12;
        if (Number.isNaN(N[k])) N[k] = p;
        if (warm) N[k] += (Math.min(p, N[k] * 4) - N[k]) / (this.init + 2);
        else if (p < N[k]) N[k] += (p - N[k]) * 0.05;
        else if (!speaking) N[k] += (Math.min(p, N[k] * 3) - N[k]) * 0.035;
        const Nn = N[k] * 1.5 + 1e-12;                       // slight over-estimate: random noise peaks stay below the gate
        const gam = p / Nn;
        const xi = 0.9 * (Xp[k] / Nn) + 0.1 * Math.max(gam - 1, 0);
        g2[k] = Math.max(fl, xi / (1 + xi));
      }
      if (warm) this.init++;
      // smooth across frequency (3 taps), limit how fast the gain can fall (no pumping), floor the sub-60 Hz rumble
      for (let k = 0; k < K; k++) {
        let g = (g2[Math.max(0, k - 1)] + 2 * g2[k] + g2[Math.min(K - 1, k + 1)]) / 4;
        if (k < 2) g = fl;
        g = g < G[k] ? Math.max(g, G[k] * 0.6) : g;
        G[k] = g;
      }
      for (let k = 0; k < K; k++) {
        re[k] *= G[k]; im[k] *= G[k]; Xp[k] = (re[k] * re[k] + im[k] * im[k]);
        if (k > 0 && k < FRAME / 2) { re[FRAME - k] = re[k]; im[FRAME - k] = -im[k]; }
      }
      // inverse FFT via conjugate trick
      for (let i = 0; i < FRAME; i++) im[i] = -im[i];
      fft(re, im);
      for (let i = 0; i < FRAME; i++) this.ola[i] += (re[i] / FRAME) * SQH[i];
      out.set(this.ola.subarray(0, HOP), h * HOP);
      this.ola.copyWithin(0, HOP); this.ola.fill(0, HOP);
    }
    return out;
  }
  reset() { this.inb.fill(0); this.ola.fill(0); this.Xp.fill(0); this.G.fill(1); }
}

/* ---------- voice activity detector ---------- */
const HANN = (() => { const w = new Float32Array(FRAME); for (let i = 0; i < FRAME; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FRAME - 1)); return w; })();
const BIN = SR / FRAME;                       // 31.25 Hz per bin
const B_LO = Math.round(200 / BIN), B_HI = Math.round(3800 / BIN), B_MID = Math.round(1000 / BIN), B_L0 = Math.round(120 / BIN);
// 16 log-spaced display bands between 80 Hz and 6 kHz
const BANDS = (() => { const e = []; for (let i = 0; i <= 16; i++) e.push(Math.round(80 * Math.pow(6000 / 80, i / 16) / BIN)); return e; })();

export class Vad {
  constructor(o = {}) {
    this.sens = o.sensitivity ?? 0.5;
    this.echoGuard = false;
    this.maxSeconds = o.maxSeconds ?? 30;
    this.hangMs = o.hangMs ?? 900;
    this.preroll = 10;                        // frames kept before the opening (320 ms)
    this.re = new Float32Array(FRAME); this.im = new Float32Array(FRAME);
    this.prev = new Float32Array(FRAME);      // previous frame for 2-frame autocorrelation
    this.dec = new Float32Array(FRAME);       // decimated by 2 (8 kHz) copy of prev+cur
    this.ring = [];                           // pre-roll frames
    this.seg = null;                          // active segment frames
    this.nf = [NaN, NaN];                     // noise floors (dB) for the low (120-1000 Hz) and high (1-3.8 kHz) speech sub-bands
    this.init = 0;
    this.run = 0; this.silence = 0; this.voiced = 0; this.peak = 0;
    this.hp = 0; this.hpx = 0;
    this.level = { rms: 0, bands: new Float32Array(16) };
    this.last = { snr: 0, period: 0, flat: 1, speech: false };
    this.mag = new Float32Array(FRAME / 2);
    // near/far voice gate (v0.6): the level of the voice that has been talking to us is remembered (refDb, dBFS rms of voiced frames);
    // frames far below it (a TV across the room, someone in the next room) do not count as speech, and a segment whose voiced
    // frames sit far below it is dropped. `near` 0 = off, 1 = strict. The reference relaxes slowly if the speaker moves away.
    this.near = o.near ?? 0.5; this.refDb = NaN; this.segDb = []; this.lastFar = false;
    this.dbNow = -90;
  }
  setNear(v) { this.near = Math.max(0, Math.min(1, +v || 0)); }
  forgetNear() { this.refDb = NaN; }
  get margin() { return 20 - 14 * this.near; }   // dB below the reference that still counts as "near"
  get nearOn() { return this.near > 0.02 && !Number.isNaN(this.refDb); }
  setSensitivity(s) { this.sens = Math.max(0, Math.min(1, s)); }
  setEchoGuard(g) { this.echoGuard = !!g; }
  get active() { return !!this.seg; }
  reset() { this.seg = null; this.run = 0; this.silence = 0; this.voiced = 0; this.ring.length = 0; }

  _features(x) {
    // DC / rumble removal (first-order high-pass ~ 60 Hz) into re[]
    const re = this.re, im = this.im;
    let hp = this.hp, hpx = this.hpx, e = 0, pk = 0;
    for (let i = 0; i < FRAME; i++) {
      const v = x[i]; hp = 0.975 * (hp + v - hpx); hpx = v; re[i] = hp; e += hp * hp; const a = Math.abs(v); if (a > pk) pk = a;
    }
    this.hp = hp; this.hpx = hpx;
    const rms = Math.sqrt(e / FRAME);
    // decimated (average of pairs) signal over prev+cur for pitch search: 512 samples @ 8 kHz
    const d = this.dec, p = this.prev;
    for (let i = 0; i < FRAME / 2; i++) { d[i] = 0.5 * (p[2 * i] + p[2 * i + 1]); d[FRAME / 2 + i] = 0.5 * (re[2 * i] + re[2 * i + 1]); }
    for (let i = 0; i < FRAME; i++) p[i] = re[i];
    // spectrum
    for (let i = 0; i < FRAME; i++) { re[i] *= HANN[i]; im[i] = 0; }
    fft(re, im);
    const mag = this.mag; let pb = 0, geo = 0, n = 0;
    for (let k = 0; k < FRAME / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
    for (let k = B_LO; k <= B_HI; k++) { const pw = mag[k] * mag[k] + 1e-12; pb += pw; geo += Math.log(pw); n++; }
    const eDb = 10 * Math.log10(pb / n + 1e-12);
    let pl = 0, ph2 = 0;
    for (let k = B_L0; k < B_MID; k++) pl += mag[k] * mag[k];
    for (let k = B_MID; k <= B_HI; k++) ph2 += mag[k] * mag[k];
    const eL = 10 * Math.log10(pl / (B_MID - B_L0) + 1e-12), eH = 10 * Math.log10(ph2 / (B_HI - B_MID + 1) + 1e-12);
    const flat = Math.exp(geo / n) / (pb / n);            // 1 = white noise, ~0 = tonal / voiced
    // normalised autocorrelation on the 8 kHz copy: lags 20..114 = 400..70 Hz
    let best = 0;
    const N = FRAME, L0 = 20, L1 = 114;
    let e0 = 0; for (let i = 0; i < N - L1; i++) e0 += d[i] * d[i];
    for (let l = L0; l <= L1; l++) {
      let c = 0, e1 = 0;
      for (let i = 0; i < N - L1; i++) { c += d[i] * d[i + l]; e1 += d[i + l] * d[i + l]; }
      const r = c / Math.sqrt(e0 * e1 + 1e-12);
      if (r > best) best = r;
    }
    // display bands
    const lv = this.level; lv.rms += (Math.min(1, rms * 6) - lv.rms) * 0.5;
    for (let b = 0; b < 16; b++) { let s = 0, c = 0; for (let k = BANDS[b]; k < Math.max(BANDS[b] + 1, BANDS[b + 1]); k++) { s += mag[k]; c++; } const v = Math.min(1, Math.log10(1 + (s / c) * 0.02) * 1.6); lv.bands[b] += (v - lv.bands[b]) * 0.5; }
    return { eDb, eL, eH, flat, period: best, rms, peak: pk };
  }

  // x: Float32Array(FRAME). returns null | {type:'start'} | {type:'end', pcm, seconds, peak} | {type:'drop'}
  push(x) {
    const f = this._features(x);
    // noise floors: average during the first 0.5 s, then fast down / slow up (frozen while a segment is open)
    const e2 = [f.eL, f.eH], snrs = [0, 0];
    for (let b = 0; b < 2; b++) {
      if (Number.isNaN(this.nf[b])) this.nf[b] = e2[b];
      if (this.init < 16) this.nf[b] += (Math.min(e2[b], this.nf[b] + 6) - this.nf[b]) / (this.init + 2);
      else if (e2[b] < this.nf[b]) this.nf[b] += (e2[b] - this.nf[b]) * 0.12;
      else if (!this.seg) this.nf[b] += (Math.min(e2[b], this.nf[b] + 12) - this.nf[b]) * 0.015;
      snrs[b] = e2[b] - this.nf[b];
    }
    if (this.init < 16) this.init++;
    const snr = Math.max(snrs[0], snrs[1]);
    const s = this.sens, g = this.echoGuard;
    const hi = 15 - (s - 0.5) * 12 + (g ? 9 : 0);      // dB over floor for a confident frame
    const lo = hi - 5;
    const pth = 0.5 - (s - 0.5) * 0.2 + (g ? 0.1 : 0);
    const voiced = (snr > lo && f.period > pth && f.flat < 0.55) || (snr > lo - 5 && f.period > 0.72 && f.flat < 0.4);
    const fric = snr > hi + 6 && f.flat < 0.7 && f.period > 0.25;      // loud, not white, some structure
    let speech = this.init >= 16 && (voiced || fric);
    const db = 20 * Math.log10(f.rms + 1e-9); this.dbNow = db;
    if (this.nearOn) this.refDb -= 0.0002;                           // ~0.4 dB per minute of drift back down
    this.lastFar = false;
    if (speech && this.nearOn && db < this.refDb - this.margin && !g) { speech = false; this.lastFar = true; }
    this.last.snr = snr; this.nfv = this.nf[0]; this.last.period = f.period; this.last.flat = f.flat; this.last.speech = speech;
    if (f.peak > this.peak) this.peak = f.peak;
    const copy = () => { const c = new Float32Array(FRAME); c.set(x); return c; };
    const openN = g ? 10 : 6;
    const hang = Math.round(this.hangMs / 32 * (this.seg && this.voiced < 25 ? 1.3 : 1));
    if (!this.seg) {
      this.ring.push(copy()); if (this.ring.length > this.preroll + openN) this.ring.shift();
      this.run = speech ? this.run + 1 : Math.max(0, this.run - 1);
      if (this.run >= openN) {
        this.seg = this.ring.slice(); this.ring.length = 0; this.silence = 0; this.voiced = this.run; this.peak = f.peak; this.run = 0; this.segDb.length = 0; this.segDb.push(db);
        for (const fr of this.seg) for (let i = 0; i < FRAME; i++) { const a = Math.abs(fr[i]); if (a > this.peak) this.peak = a; }
        return { type: 'start' };
      }
      return null;
    }
    this.seg.push(copy());
    if (speech) { this.silence = 0; this.voiced++; if (voiced) this.segDb.push(db); } else this.silence++;
    const tooLong = this.seg.length * FRAME / SR >= this.maxSeconds;
    if (this.silence >= hang || tooLong) {
      const keep = this.seg.length - (tooLong ? 0 : Math.max(0, this.silence - 8)); // keep ~250 ms of tail
      const frames = this.seg.slice(0, Math.max(1, keep));
      const voicedN = this.voiced, pk = this.peak;
      this.seg = null; this.silence = 0; this.voiced = 0; this.run = 0; this.peak = 0;
      if (voicedN < 11 || pk < 0.004) { this.segDb.length = 0; return { type: 'drop' }; }
      // loudness of the utterance = 75th percentile of its voiced frames (robust against soft word endings)
      const sd = this.segDb.slice().sort((a, b) => a - b), segLvl = sd.length ? sd[Math.floor(sd.length * 0.75)] : -90; this.segDb.length = 0;
      if (this.nearOn && segLvl < this.refDb - this.margin && !g) return { type: 'drop', far: true };
      // learn / follow the near voice (only confident speech: enough voiced frames, above a minimal level)
      if (voicedN >= 14 && segLvl > -55) this.refDb = Number.isNaN(this.refDb) ? segLvl : (segLvl > this.refDb ? 0.5 : 0.25) * segLvl + (segLvl > this.refDb ? 0.5 : 0.75) * this.refDb;
      const pcm = new Float32Array(frames.length * FRAME);
      frames.forEach((fr, i) => pcm.set(fr, i * FRAME));
      return { type: 'end', pcm, seconds: pcm.length / SR, peak: pk, cut: tooLong };
    }
    return null;
  }
}

/* ---------- text cleanup for speech and Whisper filtering (pure, testable) ---------- */
export function cleanForSpeech(t) {
  return String(t || '')
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[(happy|glad|joy|sad|mad|angry|confused|surprised|sleepy|love|wink|smug|scared|excited|dizzy|calm|pout|think|thinking|neutral|idle|talk|serious|playful|shy|proud|bored|tired|sulk)\]/gi, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' link ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/[*_~]{1,3}([^*_~\n]+)[*_~]{1,3}/g, '$1')
    .replace(/[*_~#|<>^=\\]+/g, ' ')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, ' ')
    .replace(/\s*\n+\s*/g, '. ')
    .replace(/\.\s*\./g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function splitSentences(text, max = 220) {
  const raw = text.split(/(?<=[.!?…。！？])\s+/).map(s => s.trim()).filter(Boolean);
  const out = [];
  for (let s of raw) {
    while (s.length > max) {
      let cut = Math.max(s.lastIndexOf(', ', max), s.lastIndexOf('; ', max), s.lastIndexOf(' ', max));
      if (cut < max * 0.4) cut = max;
      out.push(s.slice(0, cut + 1).trim()); s = s.slice(cut + 1).trim();
    }
    if (s) out.push(s);
  }
  // merge very short fragments into the next one so the voice keeps natural prosody
  const merged = [];
  for (const s of out) {
    if (merged.length && merged[merged.length - 1].length < 14 && !/[?!]$/.test(merged[merged.length - 1])) merged[merged.length - 1] += ' ' + s; else merged.push(s);
  }
  return merged;
}

const HALLU = /^(you|thank you\.?|thanks\.?|thanks for watching\.?|thank you for watching\.?|bye\.?|\[?blank_audio\]?|\(?music\)?|\[music\]|♪+|\.+|,+|\s*)$/i;
export function isHallucination(text, seconds, peak) {
  const t = String(text || '').trim();
  if (!t) return true;
  if (/^[\p{P}\p{S}\s]+$/u.test(t)) return true;
  if (/^[\[(].{0,24}[\])]$/.test(t) && /(music|blank|silence|noise|applause|laughter)/i.test(t)) return true;
  const w = t.toLowerCase().split(/\s+/);
  if (w.length >= 4 && new Set(w).size === 1) return true;
  if ((seconds < 1.5 || peak < 0.02) && HALLU.test(t)) return true;
  return false;
}
