// node test/kitten-test.mjs [path-to-kitten-folder]   (folder with model*.onnx, voices.bin, tokens.txt; optional, those checks are skipped without it)
import fs from 'fs'; import path from 'path';
import { readOnnxMeta, parseTokens, parseSpeakerMap, phonemesToIds, styleFor, parseVoicesBin } from '../www/live/kitten.js';
import { prosodyFor, canonMood, MOOD_NAMES, NEUTRAL } from '../www/live/emotion.js';
let fails = 0; const T = (n, ok, i = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + n + (i ? '  ' + i : '')); if (!ok) fails++; };

/* ---- emotion ---- */
T('every mood has a canonical name', MOOD_NAMES.every(m => canonMood(m) === m));
T('aliases', canonMood('MAD') === 'angry' && canonMood('[shy]') === 'love' && canonMood('nonsense') === null && canonMood(null) === null);
T('neutral when mood unknown or strength 0', JSON.stringify({ ...prosodyFor('zzz', 1), mood: 0 }) === JSON.stringify({ ...NEUTRAL, mood: 0 }) && prosodyFor('angry', 0).speed === 1);
const sad = prosodyFor('sad'), ang = prosodyFor('angry'), hap = prosodyFor('happy');
T('sad is slower, lower, quieter than happy', sad.speed < 1 && sad.pitch < 1 && sad.vol < hap.vol && sad.speed < hap.speed && sad.pitch < hap.pitch);
T('angry is faster, lower pitch, brighter', ang.speed > 1 && ang.pitch < 1 && ang.bright > 0);
T('strength scales between neutral and preset', Math.abs(prosodyFor('sad', 0.5).speed - (1 + (0.85 - 1) * 0.5)) < 1e-9 && prosodyFor('sad', 1.5).speed < sad.speed);
T('all moods stay inside safe ranges even at 150 %', MOOD_NAMES.every(m => { const p = prosodyFor(m, 1.5); return p.pitch >= .85 && p.pitch <= 1.15 && p.speed >= .6 && p.speed <= 1.5 && p.vol <= 1.08 && p.noise >= .4 && p.trem <= .25; }));
T('only scared/dizzy tremble', MOOD_NAMES.filter(m => prosodyFor(m).trem > 0).sort().join() === 'dizzy,scared');

/* ---- tokens / ids (synthetic) ---- */
const tk = parseTokens('$ 0\n; 1\n, 3\n. 4\n! 5\n? 6\n  16\nh 50\nə 83\nl 55\n\r\n');
T('tokens: space symbol survives', tk.get(' ') === 16 && tk.get('$') === 0 && tk.get('ə') === 83 && tk.size === 10, 'size ' + tk.size);
T('ids are [0, ..., 0]', JSON.stringify(phonemesToIds(['h', 'ə', 'l'], tk)) === JSON.stringify([0, 50, 83, 55, 0]));
T('unknown symbols skipped', JSON.stringify(phonemesToIds(['h', '#', 'l'], tk)) === JSON.stringify([0, 50, 55, 0]));
T('sentence stop glued to next word gets a space', JSON.stringify(phonemesToIds(['l', '.', 'h'], tk)) === JSON.stringify([0, 55, 4, 16, 50, 0]));
T('no extra space when one is already there', JSON.stringify(phonemesToIds(['l', '.', ' ', 'h'], tk)) === JSON.stringify([0, 55, 4, 16, 50, 0]));
{ const v = new Float32Array(8 * 256).map((_, i) => i); T('style: one row per speaker (v0.2)', styleFor(v, 8, 5, 40)[0] === 5 * 256 && styleFor(v, 8, 99, 0)[0] === 7 * 256 && styleFor(v, 8, -3, 0)[0] === 0);
  const w = new Float32Array(2 * 4 * 256).map((_, i) => i); T('style: several rows per speaker pick by text length (v0.8 rule)', styleFor(w, 2, 1, 2)[0] === (1 * 4 + 2) * 256 && styleFor(w, 2, 1, 99)[0] === (1 * 4 + 3) * 256); }
T('metadata parser rejects non-ONNX', await readOnnxMeta(new Uint8Array(2000).fill(255)).then(() => false, () => true));

/* ---- the real model ---- */
const dir = process.argv[2] || process.env.KITTEN_DIR;
if (dir && fs.existsSync(dir)) {
  const onnx = fs.readdirSync(dir).find(f => /\.onnx$/.test(f));
  const buf = fs.readFileSync(path.join(dir, onnx));
  const meta = await readOnnxMeta(new Uint8Array(buf));
  T('real model: metadata (Uint8Array)', meta.model_type === 'kitten-tts' && meta.sample_rate === '24000' && meta.n_speakers === '8', Object.keys(meta).length + ' keys');
  const metaB = await readOnnxMeta(new Blob([buf]));
  T('real model: metadata (Blob, header reads only)', JSON.stringify(metaB) === JSON.stringify(meta));
  const sp = parseSpeakerMap(meta);
  T('real model: speaker 5 is expr-voice-4-f', sp.length === 8 && sp[5].name === 'expr-voice-4-f' && sp[0].name === 'expr-voice-2-m', sp.map(s => s.id + ':' + s.name).join(' '));
  const vb = parseVoicesBin(fs.readFileSync(path.join(dir, 'voices.bin')));
  T('real voices.bin: 8 x 256', vb.length === 2048 && styleFor(vb, 8, 5, 30).length === 256 && styleFor(vb, 8, 5, 30)[0] === vb[5 * 256]);
  const toks = parseTokens(fs.readFileSync(path.join(dir, 'tokens.txt'), 'utf8'));
  T('real tokens.txt', toks.size >= 170 && toks.get(' ') === 16 && toks.get('ˈ') === 156 && toks.get('ɹ') === 123, toks.size + ' symbols');
  const ph = 'həlˈoʊ ðˈɛɹ, maɪ tʃˈaɪld.aɪ hɐvbɪn wˈeɪɾɪŋ fɔːɹ juː.'.split('');
  const ids = phonemesToIds(ph, toks);
  T('real ids: framed with 0 and sentence stop spaced', ids[0] === 0 && ids.at(-1) === 0 && ids.includes(16) && ids.length === ph.length + 3, ids.length + ' ids');
}
console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed'); process.exit(fails ? 1 : 0);
