// CathedrAI 3D Live Space - pose / emote library (pure data + functions, no THREE dependency).
// Conventions are the ones of the user's VRoid test page (normalized humanoid bones):
//   key 'L.upperArm' = left only, 'R.x' = right only, 'B.x' = both (right side mirrors y and z), 'head' = unsided.
//   arms: z swings in the frontal plane (-1.2 = hanging, 0 = T-pose, +1.3 = raised), y swings forward (negative = forward),
//   lowerArm y negative = elbow flex.  torso/head: x positive = bow forward, y = turn, z = tilt.
//   legs: upperLeg x negative = forward lift, lowerLeg x positive = knee bend.
// Each pose is fn(t, S, extra) with S = the writer API supplied by space.js:
//   S.k(key,x,y,z) set | S.a(key,x,y,z) add | S.hip(x,y,z) hips offset in metres | S.f(side,'Fist') finger preset
//   S.e(name, weight) expression target | S.look(bool) keep eyes on camera | S.drop = metres to hide the model under the floor
const sn = Math.sin, cs = Math.cos, abs = Math.abs, PI = Math.PI;
const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sstep = (a, b, x) => { const t = sat((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const eob = (u) => { const c1 = 1.70158, c3 = c1 + 1; u = sat(u) - 1; return 1 + c3 * u * u * u + c1 * u * u; };

export const EMOTES = ['idle', 'think', 'talk', 'happy', 'sad', 'angry', 'pout', 'confused', 'surprised', 'sleepy', 'love', 'wink', 'smug', 'scared', 'excited', 'dizzy'];

// finger curl presets: index, middle, ring, little, thumb (0 open .. 1 closed)
export const FP = {
  Relaxed: [.22, .28, .34, .4, .2], Open: [0, 0, 0, 0, 0], Fist: [1, 1, 1, 1, .8], Loose: [.55, .6, .65, .7, .4],
  V: [0, 0, 1, 1, .7], Claws: [.45, .45, .45, .45, .3], Heart: [.55, .55, .8, .8, .35], Point: [0, 1, 1, 1, .7],
  Chin: [.5, .5, .5, .5, .3], Splay: [0, 0, 0, 0, 0], Rock: [0, 1, 1, 0, 0],
};

export const POSE = {
  base(S) { // arms hanging, relaxed hands
    S.k('B.upperArm', 0, 0, -1.2); S.k('B.lowerArm', 0, -.15, 0); S.f('B', 'Relaxed'); S.look(true);
  },

  think(t, S) {
    const b = sn(t * 1.4);
    S.k('R.upperArm', 0, -.95, -.35); S.k('R.lowerArm', 0, -2.4, 0); S.k('R.hand', 0, 0, .2);
    S.k('L.upperArm', 0, -.45, -.85); S.k('L.lowerArm', 0, -1.85, 0);
    S.k('head', -.08 + b * .02, .22, .2); S.k('spine', .03, .06, 0); S.k('neck', 0, .08, .04);
    S.f('R', 'Chin'); S.f('L', 'Loose'); S.look(false);
    S.e('relaxed', .25);
    const tap = sat(sn(t * 7) * 3); S.a('R.hand', 0, 0, tap * .06);
  },
  talk(t, S) { // speaking base pose (the talking layer adds gestures)
    S.k('B.upperArm', 0, -.1, -1.0); S.k('B.lowerArm', 0, -.7, 0); S.f('B', 'Loose');
  },
  happy(t, S) {
    const s = sn(t * 8), b = abs(sn(t * 4));
    S.hip(0, b * .035, 0);
    S.k('B.upperArm', 0, -.25, -.55 + s * .08); S.k('B.lowerArm', 0, -1.0, 0); S.k('B.hand', 0, 0, .25);
    S.k('head', -.05, 0, s * .1); S.k('spine', -.04, 0, -s * .04); S.k('chest', -.03, 0, 0);
    S.k('B.upperLeg', -b * .1, 0, .06); S.k('B.lowerLeg', b * .2, 0, 0);
    S.f('B', 'Open'); S.e('happy', 1);
  },
  sad(t, S) {
    const sob = sn(t * 2.6) * .5 + .5, slow = sn(t * .9);
    S.hip(0, -.025, 0);
    S.k('spine', .22 + sob * .03, 0, 0); S.k('chest', .1, 0, 0); S.k('neck', .12, 0, 0); S.k('head', .32 + sob * .04, slow * .08, slow * .04);
    S.k('B.shoulder', 0, 0, -.14); S.k('B.upperArm', .15, .1, -1.38); S.k('B.lowerArm', 0, -.55, 0); S.k('B.hand', 0, 0, .1);
    S.k('B.upperLeg', 0, 0, .04); S.k('B.lowerLeg', .08, 0, 0);
    S.f('B', 'Loose'); S.e('sad', 1); S.look(false);
  },
  angry(t, S) {
    const sh = sn(t * 46) * .018, st = sat(sn(t * 4.2) * 2.5 + .5); // stomp
    S.hip(sh * .5, -.015, 0);
    S.k('spine', .1 + sh, 0, 0); S.k('chest', .04, 0, sh); S.k('head', .16 + sh, 0, 0); S.k('neck', .06, 0, 0);
    S.k('B.shoulder', 0, 0, .2);
    S.k('B.upperArm', .1, -.2, -1.0 + sh); S.k('B.lowerArm', 0, -.95, 0); S.k('B.hand', 0, 0, -.1);
    S.k('L.upperLeg', -st * .45, 0, .06); S.k('L.lowerLeg', st * .6, 0, 0); S.k('R.upperLeg', 0, 0, -.04);
    S.f('B', 'Fist'); S.e('angry', 1); S.look(true);
  },
  pout(t, S) {
    const huff = sn(t * 2.2) * .5 + .5;
    S.hip(0, 0, 0); S.k('hips', 0, .12, 0);
    S.k('spine', .1 + huff * .015, -.1, 0); S.k('chest', .04 + huff * .03, 0, 0);
    S.k('head', .12, -.45, .06); S.k('neck', 0, -.1, 0);
    // arms crossed over the chest, fists tucked
    S.k('L.upperArm', .55, -.55, -.55); S.k('L.lowerArm', 0, -2.55, -.15); S.k('L.hand', 0, 0, .1);
    S.k('R.upperArm', .55, -.7, -.55); S.k('R.lowerArm', 0, -2.55, -.15); S.k('R.hand', 0, 0, .1);
    S.k('R.upperLeg', -.05, 0, -.03);
    S.f('B', 'Fist'); S.e('angry', .5); S.e('ou', .5); S.e('sad', .12); S.look(false);
  },
  confused(t, S) {
    const sw = sn(t * 1.6), sc = sn(t * 9);
    S.k('head', -.04, sw * .3, .28 + sw * .05); S.k('neck', 0, sw * .08, .05); S.k('spine', 0, 0, -.05);
    S.k('R.upperArm', 0, -.2, -1.15 + 2.55); S.k('R.lowerArm', 0, 0, 1.95 + sc * .06); S.k('R.hand', 0, 0, sc * .15);
    S.k('L.upperArm', 0, -.25, -.55); S.k('L.lowerArm', 0, -.4, -1.55); // hand on hip
    S.k('B.shoulder', 0, 0, .05); S.k('hips', 0, 0, .05);
    S.f('R', 'Claws'); S.f('L', 'Loose');
    S.e('sad', .3); S.e('surprised', .2); S.look(true);
  },
  surprised(t, S) {
    const j = sat(1 - t * 3.5), settle = sstep(.0, .5, t);
    S.hip(0, j * .09, -j * .05);
    S.k('spine', -.14 - j * .12, 0, 0); S.k('chest', -.08, 0, 0); S.k('head', -.2 - j * .1, 0, 0); S.k('neck', -.06, 0, 0);
    S.k('B.shoulder', 0, 0, .22);
    S.k('B.upperArm', 0, -.35, -.55 + j * .25); S.k('B.lowerArm', 0, -1.15, 0); S.k('B.hand', 0, 0, .35);
    S.k('B.upperLeg', -j * .2, 0, .08); S.k('B.lowerLeg', j * .3, 0, 0);
    S.f('B', 'Splay'); S.e('surprised', 1); S.look(true);
  },
  sleepy(t, S) {
    const c = (t % 5.5) / 5.5, nod = c < .72 ? sstep(0, .72, c) : 1 - sstep(.72, .8, c), yawn = sstep(.05, .2, c) * (1 - sstep(.45, .55, c));
    S.hip(sn(t * .7) * .012, -.02, 0);
    S.k('spine', .08 + nod * .12, 0, sn(t * .5) * .03); S.k('neck', nod * .2, 0, 0); S.k('head', .06 + nod * .38, sn(t * .4) * .1, nod * .08);
    // right fist rubs eye / covers the yawn, left arm droops
    S.k('R.upperArm', 0, -.95, -.5); S.k('R.lowerArm', 0, -2.3 - yawn * .15, 0); S.k('R.hand', 0, 0, .35);
    S.k('L.upperArm', .1, -.1, -1.3); S.k('L.lowerArm', 0, -.35, 0);
    S.f('R', 'Fist'); S.f('L', 'Loose');
    S.e('relaxed', .55); S.e('blink', .5 + nod * .45); S.e('aa', yawn * .8); S.look(false);
  },
  love(t, S) {
    const s = sn(t * 3), b = abs(sn(t * 3));
    S.hip(0, b * .02, 0);
    S.k('B.upperArm', .2, -.7, -.6); S.k('B.lowerArm', 0, -1.95, 0); S.k('B.hand', 0, 0, .1);
    S.k('head', .02, 0, .2 + s * .04); S.k('spine', 0, 0, -s * .04); S.k('hips', 0, 0, s * .03);
    S.k('B.upperLeg', 0, 0, .05); S.k('R.upperLeg', -.3 * sat(s * 2), 0, -.03); S.k('R.lowerLeg', .45 * sat(s * 2), 0, 0);
    S.f('B', 'Heart'); S.e('happy', .85); S.e('relaxed', .2);
  },
  wink(t, S) {
    const s = sn(t * 2.4);
    S.k('R.upperArm', 0, -.7, -.32); S.k('R.lowerArm', 0, -2.25, 0); S.k('R.hand', 0, 0, .15);
    S.k('L.upperArm', 0, -.25, -.5); S.k('L.lowerArm', 0, -.3, -1.55); S.f('L', 'Loose'); S.f('R', 'V');
    S.k('head', -.04, .06, .2); S.k('spine', 0, 0, -.06); S.k('hips', 0, 0, .06);
    S.k('L.upperLeg', -.3, 0, .1); S.k('L.lowerLeg', .75, 0, 0); S.hip(0, s * .008, 0);
    S.e('blinkRight', 1); S.e('relaxed', .65); S.e('happy', .12);
  },
  smug(t, S) {
    const s = sn(t * 1.1);
    S.k('hips', 0, 0, .1); S.hip(.025, 0, 0);
    S.k('spine', -.07, -.12, -.08 - s * .01); S.k('chest', -.06, 0, 0); S.k('head', -.22, .26, -.14); S.k('neck', -.05, .06, 0);
    S.k('L.upperArm', 0, -.2, -.5); S.k('L.lowerArm', 0, -.35, -1.65); S.k('L.hand', 0, 0, .1);
    S.k('R.upperArm', .1, -.3, -1.0); S.k('R.lowerArm', 0, -.8, 0);
    S.k('R.upperLeg', -.12, 0, -.1); S.k('R.lowerLeg', .15, 0, 0); S.k('L.upperLeg', 0, 0, .06);
    S.f('L', 'Fist'); S.f('R', 'Loose');
    S.e('relaxed', .6); S.e('blink', .38); S.look(true);
  },
  scared(t, S) {
    const sh = sn(t * 38) * .022, sh2 = cs(t * 31) * .018;
    S.hip(sh * .6, -.09, .03);
    S.k('spine', .24 + sh, 0, sh2); S.k('chest', .14, 0, 0); S.k('neck', .1, 0, 0); S.k('head', .12 + sh2, sh * 2, 0);
    S.k('B.shoulder', 0, 0, .25);
    S.k('B.upperArm', .3, -.55, -.7); S.k('B.lowerArm', 0, -2.45, 0); S.k('B.hand', 0, 0, .1);
    S.k('B.upperLeg', -.4, 0, .1); S.k('B.lowerLeg', .8, 0, 0); S.k('B.foot', .1, 0, 0);
    S.f('B', 'Fist'); S.e('surprised', .55); S.e('sad', .55);
  },
  excited(t, S) {
    const w = t * PI * 3.4, j = abs(sn(w * .5)), bd = (1 - j) * .45, a = sn(w);
    S.hip(0, j * .2, 0);
    S.k('B.shoulder', 0, -.1, .25); S.k('L.upperArm', 0, -.2, 1.1 + a * .14); S.k('R.upperArm', 0, -.2, 1.1 - a * .14);
    S.k('B.lowerArm', 0, -.25, 0);
    S.k('B.upperLeg', -bd, 0, .1); S.k('B.lowerLeg', bd * 1.6, 0, 0);
    S.k('head', -.18, 0, a * .05); S.k('spine', -.06, 0, 0);
    S.f('B', 'Fist'); S.e('happy', .8); S.e('aa', .3 + .25 * sn(w * 2));
  },
  dizzy(t, S) {
    const w = t * 3.2, c = cs(w), s = sn(w);
    S.hip(s * .05, 0, c * .035);
    S.k('hips', 0, s * .1, c * .06);
    S.k('spine', c * .13, 0, s * .13); S.k('chest', c * .06, 0, s * .06);
    S.k('head', cs(w + 1) * .26, sn(w * .5) * .25, sn(w + 1) * .3); S.k('neck', 0, 0, s * .08);
    S.k('L.upperArm', 0, -.1, -.45 + c * .3); S.k('R.upperArm', 0, -.1, -.45 - c * .3);
    S.k('L.lowerArm', 0, -.4 + s * .2, 0); S.k('R.lowerArm', 0, -.4 - s * .2, 0);
    S.k('L.upperLeg', -.05, 0, .12 + c * .06); S.k('R.upperLeg', -.05, 0, -.12 + c * .06); S.k('B.lowerLeg', .12, 0, 0);
    S.f('B', 'Splay'); S.e('blinkLeft', .95); S.e('sad', .35); S.e('ou', .25); S.look(false);
  },
};

// ------------------------------------------------------------------ idle animations (random, when left alone)
const wave = (t, S, who = 'R') => {
  S.k(who + '.upperArm', 0, -.1, 1.3); S.k(who + '.lowerArm', 0, -.2, sn(t * 9) * .5); S.k(who + '.hand', 0, 0, sn(t * 9 + 1) * .35); S.f(who, 'Open');
};
export const IDLE_ANIMS = [
  { name: 'stretch', dur: 3.4, fn(t, S) {
      const up = sstep(.2, 1.1, t) * (1 - sstep(2.6, 3.3, t)), sh = sn(t * 26) * .02 * sstep(1.6, 1.8, t) * (1 - sstep(2.2, 2.4, t));
      S.k('B.upperArm', 0, -.1 + (1 - up) * .1, -1.2 + up * 2.6); S.k('B.lowerArm', 0, -.15 * (1 - up), 0); S.f('B', 'Open');
      S.k('spine', -.12 * up, 0, 0); S.k('chest', -.14 * up, 0, 0); S.k('head', -.3 * up + sh, 0, 0); S.k('B.shoulder', 0, 0, .15 * up);
      S.hip(0, up * .02, 0); S.k('B.foot', -.2 * up, 0, 0);
      S.e('blink', .95 * up); S.e('relaxed', .5 * up); S.look(false);
    } },
  { name: 'look-around', dur: 4.2, fn(t, S) {
      const a = sstep(.3, .9, t) - sstep(1.5, 2.1, t), b = sstep(1.9, 2.5, t) - sstep(3.3, 3.9, t), y = a * .8 - b * .8;
      S.k('head', -.04 * (a + b), y, 0); S.k('neck', 0, y * .35, 0); S.k('spine', 0, y * .12, 0); S.look(false);
      S.e('relaxed', .2);
    } },
  { name: 'hair-fix', dur: 3.4, fn(t, S) {
      const up = sstep(.2, .8, t) * (1 - sstep(2.7, 3.2, t)), fid = sn(t * 6) * .12 * up;
      S.k('R.upperArm', 0, -.2 * up, -1.2 + up * 2.3); S.k('R.lowerArm', 0, 0, up * (1.9 + fid)); S.k('R.hand', 0, 0, up * sn(t * 6 + 1) * .2); S.f('R', 'Loose');
      S.k('head', 0, -.08 * up, -.2 * up); S.k('neck', 0, 0, -.06 * up); S.e('relaxed', .45 * up); S.look(true);
    } },
  { name: 'small-wave', dur: 2.6, fn(t, S) {
      const up = sstep(.15, .6, t) * (1 - sstep(2.1, 2.5, t));
      S.k('R.upperArm', 0, -.1 * up, -1.2 + up * 2.5); S.k('R.lowerArm', 0, -.2, up * sn(t * 9) * .5); S.k('R.hand', 0, 0, up * sn(t * 9 + 1) * .35); S.f('R', 'Open');
      S.k('head', 0, 0, .12 * up); S.e('happy', .45 * up); S.e('relaxed', .3 * up);
    } },
  { name: 'yawn', dur: 3.2, fn(t, S) {
      const y = sstep(.3, 1.0, t) * (1 - sstep(1.9, 2.5, t)), up = sstep(.15, .9, t) * (1 - sstep(2.3, 3.0, t));
      S.k('R.upperArm', 0, -.75 * up, -1.2 + up * .7); S.k('R.lowerArm', 0, -.15 - up * 2.2, 0); S.f('R', 'Fist');
      S.k('head', -.28 * y + .12 * sstep(2.2, 2.8, t), 0, 0); S.k('spine', -.1 * y, 0, 0); S.k('chest', -.08 * y, 0, 0);
      S.e('aa', y * .85); S.e('blink', .92 * y); S.look(false);
    } },
  { name: 'hum-sway', dur: 4.4, fn(t, S) {
      const s = sn(t * 2.2), up = sstep(0, .6, t) * (1 - sstep(3.8, 4.4, t));
      S.hip(s * .03 * up, 0, 0); S.k('hips', 0, 0, s * .07 * up); S.k('spine', 0, 0, -s * .06 * up); S.k('head', 0, s * .1 * up, -s * .12 * up);
      S.k('B.upperArm', 0, 0, -1.2 + (.15 + s * .06) * up); S.k('B.lowerArm', 0, -.2 - .3 * up, 0);
      S.e('relaxed', .6 * up); S.e('ou', .22 * up * sat(sn(t * 4.4) * 2)); S.e('blink', .7 * up * sat(sn(t * .9 + 1) * 3 - 1.5));
    } },
  { name: 'shift-weight', dur: 2.8, fn(t, S) {
      const a = sstep(.2, 1.0, t) * (1 - sstep(1.9, 2.6, t));
      S.hip(.04 * a, -.01 * a, 0); S.k('hips', 0, 0, .09 * a); S.k('spine', 0, 0, -.07 * a); S.k('head', 0, 0, .05 * a);
      S.k('R.upperLeg', -.12 * a, 0, -.1 * a); S.k('R.lowerLeg', .3 * a, 0, 0);
      S.k('B.shoulder', 0, 0, -.06 * a * sn(t * 3) * 0 + .04 * a); S.e('relaxed', .2 * a);
    } },
  { name: 'peek-camera', dur: 3.0, fn(t, S) {
      const a = sstep(.2, .7, t) * (1 - sstep(2.1, 2.7, t)), s = sn(t * 2.6);
      S.hip(0, -.02 * a, .02 * a);
      S.k('spine', .2 * a, 0, 0); S.k('chest', .08 * a, 0, 0); S.k('neck', .1 * a, 0, 0); S.k('head', .12 * a, 0, (.25 + s * .03) * a);
      S.k('B.upperArm', .5 * a, .55 * a, -1.2 + .3 * a); S.k('B.lowerArm', 0, -.15 - .35 * a, 0); S.f('B', 'Loose');
      S.k('R.upperLeg', -.1 * a, 0, -.06 * a); S.e('relaxed', .5 * a); S.e('surprised', .0);
    } },
];

// ------------------------------------------------------------------ intro / exit scripts
// t in seconds of (already time-scaled) script time. Return false when finished.
export const INTRO_DUR = 3.9;
export function introPose(t, S, ev) {
  const H = S.drop;
  const u = t / .8;                           // pop up with overshoot
  const rise = eob(u);                        // 0 -> 1.1 -> 1
  const y = t < .8 ? -H * (1 - rise) : 0;
  if (t > .02 && !ev.ring) { ev.ring = true; ev.onRing && ev.onRing(); }
  const land = sstep(.8, .95, t) * (1 - sstep(.95, 1.3, t));   // squash on landing
  S.hip(0, y - land * .09, 0);
  // surprise arms-up while rising, then the greeting wave
  const arms = 1 - sstep(.75, 1.25, t);
  S.k('B.upperArm', 0, -.05, -1.2 + arms * 2.0); S.k('B.lowerArm', 0, -.15, 0); S.f('B', 'Open');
  S.k('B.upperLeg', -land * .38, 0, .04); S.k('B.lowerLeg', land * .75, 0, 0);
  S.k('spine', land * .1 - arms * .05, 0, 0); S.k('head', -.2 * arms + land * .08, 0, 0);
  const w = sstep(1.2, 1.6, t) * (1 - sstep(3.0, 3.4, t));
  if (w > 0) {
    S.k('R.upperArm', 0, -.1, -1.2 + w * 2.5); S.k('R.lowerArm', 0, -.2, w * sn(t * 9) * .5); S.k('R.hand', 0, 0, w * sn(t * 9 + 1) * .35); S.f('R', 'Open');
    S.k('head', .04, 0, .12 * w); S.k('spine', 0, 0, -.03 * w);
  }
  const bow = sstep(3.2, 3.5, t) * (1 - sstep(3.55, 3.9, t));
  if (bow > 0) { S.k('spine', .38 * bow, 0, 0); S.k('chest', .2 * bow, 0, 0); S.k('head', .12 * bow, 0, 0); }
  S.e('surprised', arms * .8); S.e('happy', 1 - arms * .9); S.look(w > 0 || arms > .5);
  return t < INTRO_DUR;
}
export const EXIT_ANTIC = .42;
export function exitPose(t, S, ev) {
  const H = S.drop;
  if (t < EXIT_ANTIC) {
    const a = sstep(0, EXIT_ANTIC * .85, t);
    S.hip(0, -.2 * a, 0);
    S.k('B.upperLeg', -.75 * a, 0, .06); S.k('B.lowerLeg', 1.5 * a, 0, 0); S.k('B.foot', .2 * a, 0, 0);
    S.k('spine', .28 * a, 0, 0); S.k('head', -.1 * a, 0, 0);
    S.k('B.upperArm', 0, .5 * a, -1.2 + .35 * a); S.k('B.lowerArm', 0, -.15, 0); S.f('B', 'Fist');
    S.e('happy', .8); S.e('relaxed', .3);
    return true;
  }
  const tau = t - EXIT_ANTIC, v = 4.1, g = 16, y = v * tau - .5 * g * tau * tau;
  if (!ev.jumped) { ev.jumped = true; ev.onJump && ev.onJump(); }
  S.hip(0, y, 0);
  const air = sat(tau / .15);
  S.k('B.upperArm', 0, -.1, -1.2 + air * 2.55 + sn(tau * 20) * .06); S.k('B.lowerArm', 0, -.1, 0); S.f('B', 'Fist');
  S.k('B.upperLeg', -.35 * air, 0, .1); S.k('B.lowerLeg', .9 * air, 0, 0);
  S.k('spine', -.1 * air, 0, 0); S.k('head', -.15 * air, 0, 0);
  S.e('happy', .9); S.e('aa', .35 * air);
  return y > -(H + .15);
}

export const clamp01 = sat;
