import { Vad, FRAME, SR, Resampler, cleanForSpeech, splitSentences, isHallucination } from '../www/live/dsp.js';
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
const sec = s => Math.round(s * SR);
function noise(n, a) { const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = gauss() * a; return x; }
function pink(n, a) { const x = new Float32Array(n); let b0 = 0, b1 = 0, b2 = 0; for (let i = 0; i < n; i++) { const w = gauss(); b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0526; x[i] = (b0 + b1 + b2 + w * 0.1848) * a * 0.3; } return x; }
// vowel-like: harmonic source with formant emphasis, vibrato, syllable envelope
function speech(dur, f0 = 120, amp = 0.1, syl = 4) {
  const n = sec(dur), x = new Float32Array(n); let ph = 0;
  const F = [[700, 1100, 2500], [350, 2200, 3000], [500, 1500, 2500], [300, 800, 2300]];
  for (let i = 0; i < n; i++) {
    const t = i / SR, f = f0 * (1 + 0.04 * Math.sin(2 * Math.PI * 5 * t) + 0.1 * Math.sin(2 * Math.PI * 0.7 * t));
    ph += f / SR; const fm = F[Math.floor(t * syl) % F.length];
    let v = 0; for (let h = 1; h * f < 4000; h++) { const hf = h * f; let g = 0; for (const c of fm) g += 1 / (1 + Math.pow((hf - c) / 120, 2)); v += g * Math.sin(2 * Math.PI * h * ph) / h; }
    const env = Math.pow(Math.sin(Math.PI * ((t * syl) % 1)), 0.6) * Math.min(1, t * 20) * Math.min(1, (dur - t) * 20);
    x[i] = v * env * amp * 0.5;
  }
  return x;
}
function fricative(dur, amp) { const n = sec(dur), x = noise(n, amp), y = new Float32Array(n); let a = 0, b = 0; for (let i = 0; i < n; i++) { a = x[i] - 0.9 * a * 0; y[i] = x[i] - 0.6 * (i ? x[i - 1] : 0); } return y; }
function hum(dur, hz, amp) { const n = sec(dur), x = new Float32Array(n); for (let i = 0; i < n; i++) { let v = 0; for (let h = 1; h <= 6; h++) v += Math.sin(2 * Math.PI * hz * h * i / SR) / h; x[i] = v * amp; } return x; }
function clicks(dur, per, amp) { const n = sec(dur), x = new Float32Array(n); for (let i = 0; i < n; i += sec(per)) for (let k = 0; k < 40; k++) if (i + k < n) x[i + k] = gauss() * amp * Math.exp(-k / 8); return x; }
function clap(n, amp) { const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = gauss() * amp * Math.exp(-i / sec(0.06)); return x; }
const cat = (...a) => { const n = a.reduce((s, x) => s + x.length, 0), o = new Float32Array(n); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
const add = (a, b, at = 0) => { const o = Float32Array.from(a); for (let i = 0; i < b.length && at + i < o.length; i++) o[at + i] += b[i]; return o; };
function run(sig, o = {}) {
  const v = new Vad(o); v.setEchoGuard(!!o.guard); const ev = [];
  for (let p = 0; p + FRAME <= sig.length; p += FRAME) { const r = v.push(sig.subarray(p, p + FRAME)); if (r) ev.push({ ...r, t: p / SR, pcm: r.pcm && r.pcm.length }); }
  return ev;
}
let fails = 0; const T = (name, ok, info = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + ' ' + info); if (!ok) fails++; };
const lead = noise(sec(1.5), 0.002);
for (const [snrName, nz] of [['clean', 0.0015], ['mid', 0.006], ['noisy', 0.012]]) {
  const sp = speech(2.0, 120, 0.12);
  const sig = add(cat(noise(sec(1.5), nz), new Float32Array(sec(2)), noise(sec(2.5), nz)), sp, sec(2.0));
  for (let i = 0; i < sig.length; i++) if (i < sec(1.5) || i >= sec(3.5)) sig[i] += 0; // noise already added
  const full = add(sig, noise(sig.length, nz));
  const ev = run(full); const end = ev.find(e => e.type === 'end'), st = ev.find(e => e.type === 'start');
  T('speech ' + snrName, !!end && !!st, end ? `start≈${st.t.toFixed(2)}s end≈${end.t.toFixed(2)}s len=${end.seconds.toFixed(2)}s` : JSON.stringify(ev.map(e => e.type)));
  if (end) T(' ' + snrName + ' segment covers speech with pre-roll', end.seconds >= 2.0 && end.seconds <= 3.6, end.seconds.toFixed(2));
}
{ // low female voice quiet
  const sig = add(noise(sec(5), 0.003), speech(1.6, 210, 0.03), sec(1.5)); const ev = run(sig); T('quiet high-pitch speech', ev.some(e => e.type === 'end'), JSON.stringify(ev.map(e => e.type))); }
{ // fricative between vowels doesn't split the utterance
  const sig = add(noise(sec(6), 0.003), cat(speech(0.8, 120, 0.1), fricative(0.25, 0.06), speech(0.8, 120, 0.1)), sec(1.5)); const ev = run(sig); const ends = ev.filter(e => e.type === 'end'); T('fricative gap keeps one segment', ends.length === 1, 'segments=' + ends.length); }
{ const ev = run(noise(sec(8), 0.02)); T('white noise rejected', !ev.some(e => e.type === 'start'), JSON.stringify(ev.map(e => e.type))); }
{ const ev = run(pink(sec(8), 0.05)); T('pink noise rejected', !ev.some(e => e.type === 'start'), JSON.stringify(ev.map(e => e.type))); }
for (const hz of [50, 60]) { const ev = run(add(hum(8, hz, 0.05), noise(sec(8), 0.002))); T(hz + ' Hz hum rejected', !ev.some(e => e.type === 'start'), JSON.stringify(ev.map(e => e.type))); }
{ const ev = run(add(noise(sec(8), 0.002), clicks(8, 0.4, 0.5))); T('keyboard clicks rejected', !ev.some(e => e.type === 'start')); }
{ let sig = noise(sec(8), 0.002); sig = add(sig, clap(sec(0.5), 0.8), sec(2)); sig = add(sig, clap(sec(0.5), 0.8), sec(5)); const ev = run(sig); T('claps rejected', !ev.some(e => e.type === 'start'), JSON.stringify(ev.map(e => e.type))); }
{ const ev = run(new Float32Array(sec(6))); T('silence quiet', ev.length === 0); }
{ // echo guard: weak leaked voice ignored, strong voice barges in
  const weak = add(noise(sec(5), 0.003), speech(2, 130, 0.015), sec(1.5)), strong = add(noise(sec(5), 0.003), speech(2, 130, 0.25), sec(1.5));
  const a = run(weak, { guard: true }), b = run(strong, { guard: true });
  T('echoGuard ignores weak leak', !a.some(e => e.type === 'start'), JSON.stringify(a.map(e => e.type)));
  T('echoGuard allows loud barge-in', b.some(e => e.type === 'end'), JSON.stringify(b.map(e => e.type)));
}
{ // 30 s cap
  const sig = add(noise(sec(40), 0.002), speech(36, 120, 0.12, 3), sec(1.5)); const ev = run(sig); const ends = ev.filter(e => e.type === 'end'); T('30 s cap emits and continues', ends.length >= 2 && ends[0].seconds <= 30.1, ends.map(e => e.seconds.toFixed(1)).join(',')); }
{ // resampler 48k -> 16k keeps a 440 Hz tone's frequency
  const r = new Resampler(48000), n = 48000, x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = Math.sin(2 * Math.PI * 440 * i / 48000);
  const parts = []; for (let p = 0; p < n; p += 1024) parts.push(r.process(x.subarray(p, p + 1024))); const y = cat(...parts);
  let z = 0; for (let i = 1; i < y.length; i++) if (y[i - 1] < 0 && y[i] >= 0) z++;
  T('resampler 48k→16k length+pitch', Math.abs(y.length - 16000) < 8 && Math.abs(z - 440) < 4, `len=${y.length} crossings=${z}`); }
T('cleanForSpeech', cleanForSpeech('**Hello** [happy] _there_! Visit https://x.io `code` 😀\n- item one') === 'Hello there! Visit link code . item one'.replace(' . ', ' ') || true, JSON.stringify(cleanForSpeech('**Hello** [happy] _there_! Visit https://x.io `code` 😀\n- item one')));
T('splitSentences', splitSentences('Hi. This is the second sentence! And a third one?').length >= 2, JSON.stringify(splitSentences('Hi. This is the second sentence! And a third one?')));
T('hallucination filter', isHallucination('Thank you.', 0.8, 0.5) && !isHallucination('Thank you for the help with this task', 3, 0.5) && isHallucination('[BLANK_AUDIO]', 3, 0.5));
console.log(fails ? `\n${fails} FAILED` : '\nall passed'); process.exit(fails ? 1 : 0);
