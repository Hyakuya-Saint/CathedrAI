// v0.6: noise reduction + near/far voice gate (node, pure DSP).  node test/nr-test.mjs
import { Vad, Denoiser, FRAME, SR, NR_LEVELS } from '../www/live/dsp.js';
let seed = 777; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
const sec = (s) => Math.round(s * SR);
const noise = (n, a) => { const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = gauss() * a; return x; };
function speech(dur, f0 = 120, amp = 0.1, syl = 4) {
  const n = sec(dur), x = new Float32Array(n); let ph = 0; const F = [[700, 1100, 2500], [350, 2200, 3000], [500, 1500, 2500], [300, 800, 2300]];
  for (let i = 0; i < n; i++) { const t = i / SR, f = f0 * (1 + .04 * Math.sin(2 * Math.PI * 5 * t) + .1 * Math.sin(2 * Math.PI * .7 * t)); ph += f / SR; const fm = F[Math.floor(t * syl) % 4]; let v = 0;
    for (let h = 1; h * f < 4000; h++) { const hf = h * f; let g = 0; for (const c of fm) g += 1 / (1 + Math.pow((hf - c) / 120, 2)); v += g * Math.sin(2 * Math.PI * h * ph) / h; }
    x[i] = v * Math.pow(Math.sin(Math.PI * ((t * syl) % 1)), .6) * Math.min(1, t * 20) * Math.min(1, (dur - t) * 20) * amp * .5; }
  return x;
}
const hum = (n, hz, a) => { const x = new Float32Array(n); for (let i = 0; i < n; i++) { let v = 0; for (let h = 1; h <= 5; h++) v += Math.sin(2 * Math.PI * hz * h * i / SR) / h; x[i] = v * a; } return x; };
const add = (a, b, at = 0) => { const o = Float32Array.from(a); for (let i = 0; i < b.length && at + i < o.length; i++) o[at + i] += b[i]; return o; };
const rms = (x, a = 0, b = x.length) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, b - a)); };
const db = (v) => 20 * Math.log10(v + 1e-12);
function denoise(sig, level = 'medium') { const d = new Denoiser({ floor: NR_LEVELS[level] }), out = new Float32Array(sig.length); for (let p = 0; p + FRAME <= sig.length; p += FRAME) out.set(d.process(sig.subarray(p, p + FRAME), false), p); return out; }
function run(sig, o = {}, dn) { const v = new Vad(o), ev = []; const D = dn ? new Denoiser({ floor: NR_LEVELS[dn] }) : null;
  for (let p = 0; p + FRAME <= sig.length; p += FRAME) { let fr = sig.subarray(p, p + FRAME); if (D) fr = D.process(fr, v.active); const r = v.push(fr); if (r) ev.push({ ...r, t: p / SR, pcm: r.pcm && r.pcm.length }); } return ev; }
let fails = 0; const T = (n, ok, i = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + n + ' ' + i); if (!ok) fails++; };

// 1. steady noise is reduced a lot and the speech is kept: measured as SNR against the clean speech (best lag, latency <= 512 samples)
function snrOf(out, clean) { let best = -1e9; for (let lag = 0; lag <= 512; lag += 8) { let e = 0, c = 0; for (let i = sec(1); i < clean.length - 600; i++) { const d = out[i + lag] - clean[i]; e += d * d; c += clean[i] * clean[i]; } best = Math.max(best, 10 * Math.log10(c / (e + 1e-12))); } return best; }
{ const nz = noise(sec(6), 0.02), sp = add(new Float32Array(sec(6)), speech(2.5, 120, .3), sec(3)), sig = add(nz, sp);
  const inSnr = snrOf(sig, sp);
  for (const lv of ['light', 'medium', 'strong']) { const o = denoise(sig, lv), outSnr = snrOf(o, sp), nIn = rms(sig, sec(1), sec(2.8)), nOut = rms(o, sec(1), sec(2.8));
    T('noise floor reduced (' + lv + ')', db(nIn) - db(nOut) > (lv === 'light' ? 6 : 9), '-' + (db(nIn) - db(nOut)).toFixed(1) + ' dB');
    T(' speech SNR improved (' + lv + ')', outSnr - inSnr > 1.5, inSnr.toFixed(1) + ' -> ' + outSnr.toFixed(1) + ' dB'); } }
// 2. hum removed
{ const sig = add(hum(sec(6), 60, .05), noise(sec(6), .002)), o = denoise(sig, 'medium'); const red = db(rms(sig, sec(2), sec(6))) - db(rms(o, sec(2), sec(6))); T('hum reduced', red > 8, red.toFixed(1) + ' dB'); }
// 3. output length / finite, off = passthrough
{ const sig = noise(FRAME * 20, .1), d = new Denoiser({ floor: 1 }); d.enabled = false; let same = true; for (let p = 0; p + FRAME <= sig.length; p += FRAME) { const o = d.process(sig.subarray(p, p + FRAME)); for (let i = 0; i < FRAME; i++) if (o[i] !== sig[p + i]) same = false; } T('off is passthrough', same);
  const o = denoise(add(noise(sec(3), .05), speech(1, 150, .2), sec(1))); T('output finite', o.every(Number.isFinite)); }
// 4. VAD still finds speech through the denoiser in noisy rooms
for (const [nm, nzA] of [['mid', .008], ['noisy', .02]]) { const sig = add(noise(sec(7), nzA), speech(2, 120, .15), sec(3)); const ev = run(sig, {}, 'medium');
  T('speech found through denoiser (' + nm + ')', ev.some((e) => e.type === 'end'), JSON.stringify(ev.map((e) => e.type))); }
// 5. near / far: my voice first (near), then the same voice far away (much quieter) -> ignored; near again -> heard
{ const base = noise(sec(30), .003); let sig = add(base, speech(2, 120, .18), sec(2)); sig = add(sig, speech(2, 120, .035), sec(7)); sig = add(sig, speech(2, 140, .17), sec(12)); sig = add(sig, speech(2, 120, .035), sec(17));
  const ev = run(sig, { near: .6 }, 'medium'), ends = ev.filter((e) => e.type === 'end').map((e) => +e.t.toFixed(1)), far = ev.filter((e) => e.far).length;
  const evAll = run(sig, { near: 0 }, 'medium').filter((e) => e.type === 'end').length;
  T('near gate ignores the far voice that the off setting hears', evAll === 4 && ends.length === 2 && ends[0] < 6 && ends[1] > 12 && ends[1] < 16, 'gate off hears ' + evAll + ' | '); T('near voice heard, far voice ignored', ends.length === 2 && ends[0] < 6 && ends[1] > 12 && ends[1] < 16, 'ends@' + ends.join(',') + ' far-drops=' + far); }
{ const base = noise(sec(12), .003); let sig = add(base, speech(2, 120, .18), sec(2)); sig = add(sig, speech(2, 120, .035), sec(7));
  const ev = run(sig, { near: 0 }, 'medium'); T('near gate off: quiet voice still heard', ev.filter((e) => e.type === 'end').length === 2, ev.map((e) => e.type).join(',')); }
// 6. TV/radio-like steady non-voice noise next to my voice: speech still heard, noise alone never opens
{ const sig = noise(sec(10), .03); const ev = run(sig, { near: .5 }, 'medium'); T('loud steady noise never opens', !ev.some((e) => e.type === 'start')); }
// 7. echo guard + near do not fight: loud barge-in still allowed
{ const sig = add(noise(sec(6), .003), speech(2, 130, .25), sec(2)); const v = new Vad({ near: .8 }); v.setEchoGuard(true); let ok = false; const D = new Denoiser({ floor: NR_LEVELS.medium });
  for (let p = 0; p + FRAME <= sig.length; p += FRAME) { const r = v.push(D.process(sig.subarray(p, p + FRAME), v.active)); if (r && r.type === 'end') ok = true; } T('echoGuard barge-in survives', ok); }
// 8. cost
{ const d = new Denoiser({ floor: .2 }), x = noise(FRAME, .05), t0 = performance.now(); for (let i = 0; i < 2000; i++) d.process(x, false); const ms = (performance.now() - t0) / 2000; T('denoiser cost per 32 ms frame', ms < 3, ms.toFixed(3) + ' ms'); }
console.log(fails ? fails + ' FAILED' : 'ALL PASSED'); process.exit(fails ? 1 : 0);
