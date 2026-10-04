// Tone blending between sentences (live/emotion.js createMoodBlender). node test/mood-blend-test.mjs
import { createMoodBlender, prosodyFor } from '../www/live/emotion.js';
let ok = 0, bad = 0; const t = (n, c) => { c ? ok++ : (bad++, console.log('FAIL', n)); };
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
const B = createMoodBlender(); let now = 1000;
const sad = prosodyFor('sad', 1), happy = prosodyFor('happy', 1);
const s1 = B.step('sad', 1, now); now += 2000;
t('first sentence ramps from neutral (not full sad)', s1.speed > sad.speed && s1.speed < 1);
B.step('sad', 1, now += 2000); const s3 = B.step('sad', 1, now += 2000);
t('after 3 sad sentences exactly sad', near(s3.speed, sad.speed) && near(s3.vol, sad.vol) && near(s3.bright, sad.bright));
const h1 = B.step('happy', 1, now += 2000);
t('sad->happy: first happy sentence is NOT full happy', h1.speed < happy.speed && h1.vol < happy.vol && h1.bright < happy.bright);
t('sad->happy: first happy sentence already moved off sad', h1.speed > sad.speed && h1.vol > sad.vol);
t('prev carries the sad end values for the glide', near(h1.prev.vol, sad.vol) && near(h1.prev.bright, sad.bright));
const h2 = B.step('happy', 1, now += 2000), h3 = B.step('happy', 1, now += 2000);
t('monotonic approach', h1.speed < h2.speed && h2.speed < h3.speed && near(h3.speed, happy.speed));
t('arrives exactly', near(h3.vol, happy.vol) && near(h3.noise, happy.noise));
// interrupted ramp: switch mid-way continues from where it is
const C = createMoodBlender(); now = 5000; C.step('sad', 1, now); C.step('sad', 1, now += 1); C.step('sad', 1, now += 1);
const m1 = C.step('angry', 1, now += 1), m2 = C.step('sad', 1, now += 1);
t('switch back mid-ramp does not jump to full sad', m2.speed > prosodyFor('sad', 1).speed && m2.speed < m1.speed + 1);
// long silence relaxes toward neutral
const D = createMoodBlender(); now = 9000; for (let i = 0; i < 3; i++) D.step('sad', 1, now += 1);
const after = D.step('sad', 1, now += 60000);
t('after a long pause the tone starts nearer neutral', after.speed > sad.speed);
// off / strength 0 = neutral always
const E = createMoodBlender(); const z = E.step('sad', 0, 1);
t('strength 0 stays neutral', near(z.speed, 1) && near(z.vol, 1));
// unknown mood = neutral target, still blends from previous
const F = createMoodBlender(); now = 1; for (let i = 0; i < 3; i++) F.step('sad', 1, now += 1);
const u = F.step(null, 1, now += 1);
t('sad -> unknown eases back', u.speed > sad.speed && u.speed < 1);
t('ranges stay clamped', [s1, h1, h2, u].every(p => p.pitch >= .85 && p.pitch <= 1.15 && p.vol <= 1.08 && p.speed >= .6 && p.speed <= 1.5));
console.log(`${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
