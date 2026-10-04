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
  }
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
    const speech = this.init >= 16 && (voiced || fric);
    this.last.snr = snr; this.nfv = this.nf[0]; this.last.period = f.period; this.last.flat = f.flat; this.last.speech = speech;
    if (f.peak > this.peak) this.peak = f.peak;
    const copy = () => { const c = new Float32Array(FRAME); c.set(x); return c; };
    const openN = g ? 10 : 6;
    const hang = Math.round(this.hangMs / 32 * (this.seg && this.voiced < 25 ? 1.3 : 1));
    if (!this.seg) {
      this.ring.push(copy()); if (this.ring.length > this.preroll + openN) this.ring.shift();
      this.run = speech ? this.run + 1 : Math.max(0, this.run - 1);
      if (this.run >= openN) {
        this.seg = this.ring.slice(); this.ring.length = 0; this.silence = 0; this.voiced = this.run; this.peak = f.peak; this.run = 0;
        for (const fr of this.seg) for (let i = 0; i < FRAME; i++) { const a = Math.abs(fr[i]); if (a > this.peak) this.peak = a; }
        return { type: 'start' };
      }
      return null;
    }
    this.seg.push(copy());
    if (speech) { this.silence = 0; this.voiced++; } else this.silence++;
    const tooLong = this.seg.length * FRAME / SR >= this.maxSeconds;
    if (this.silence >= hang || tooLong) {
      const keep = this.seg.length - (tooLong ? 0 : Math.max(0, this.silence - 8)); // keep ~250 ms of tail
      const frames = this.seg.slice(0, Math.max(1, keep));
      const voicedN = this.voiced, pk = this.peak;
      this.seg = null; this.silence = 0; this.voiced = 0; this.run = 0; this.peak = 0;
      if (voicedN < 11 || pk < 0.004) return { type: 'drop' };
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
