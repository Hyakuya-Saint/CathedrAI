// Emotional tone for the Saint voice. Pure data + maths, no DOM, testable in node.
//
// Neither Piper nor KittenTTS has an "emotion" input, so a mood is built from what both engines (and the browser) CAN change:
//   speed  - speaking rate (both engines)
//   pitch  - playback-rate trick: audio is played at rate*pitch and the model is asked to speak 1/pitch slower, so the pitch moves
//            and the duration does not. Small shifts (about +-10 %) sound natural; larger ones go chipmunk/demon.
//   vol    - loudness (applied after the model, which is peak-normalised)
//   bright - high-shelf EQ in dB (+ = sharper/harsher, - = darker/muffled)
//   noise, noiseW - Piper only: how much the model varies pitch/rhythm (more = livelier, less = flatter)
//   gap    - pause after each sentence (x)
//   trem, tremHz - tremolo depth/rate (shaky voice: scared, dizzy)
// The numbers below are reasoned starting points, not the result of listening tests; the Hub has a test button per mood so they can be judged.

export const NEUTRAL = { speed: 1, pitch: 1, vol: 1, bright: 0, noise: 1, noiseW: 1, gap: 1, trem: 0, tremHz: 6 };

export const MOOD_VOICE = {
  happy:     { speed: 1.07, pitch: 1.05, vol: 1.0,  bright: 2,  noise: 1.1,  noiseW: 1.05, gap: 0.9 },
  excited:   { speed: 1.16, pitch: 1.09, vol: 1.05, bright: 3,  noise: 1.2,  noiseW: 1.15, gap: 0.75 },
  angry:     { speed: 1.1,  pitch: 0.94, vol: 1.05, bright: 4,  noise: 1.25, noiseW: 1.1,  gap: 0.8 },
  sad:       { speed: 0.85, pitch: 0.93, vol: 0.7,  bright: -3, noise: 0.7,  noiseW: 0.8,  gap: 1.6 },
  sleepy:    { speed: 0.8,  pitch: 0.95, vol: 0.6,  bright: -4, noise: 0.65, noiseW: 0.7,  gap: 1.8 },
  scared:    { speed: 1.12, pitch: 1.08, vol: 0.85, bright: 2,  noise: 1.1,  noiseW: 1.2,  gap: 0.8, trem: 0.12, tremHz: 9 },
  surprised: { speed: 1.05, pitch: 1.1,  vol: 1.0,  bright: 2,  noise: 1.15, noiseW: 1.1,  gap: 1.0 },
  love:      { speed: 0.92, pitch: 1.02, vol: 0.78, bright: -1, noise: 0.85, noiseW: 0.9,  gap: 1.3 },
  pout:      { speed: 0.95, pitch: 1.04, vol: 0.9,  bright: -1, noise: 1.0,  noiseW: 1.0,  gap: 1.2 },
  confused:  { speed: 0.95, pitch: 1.04, vol: 0.95, bright: 0,  noise: 1.05, noiseW: 1.1,  gap: 1.2 },
  wink:      { speed: 1.03, pitch: 1.03, vol: 0.95, bright: 1,  noise: 1.05, noiseW: 1.0,  gap: 1.0 },
  smug:      { speed: 0.92, pitch: 0.97, vol: 0.95, bright: -1, noise: 0.9,  noiseW: 0.9,  gap: 1.2 },
  dizzy:     { speed: 0.9,  pitch: 1.0,  vol: 0.9,  bright: 0,  noise: 1.1,  noiseW: 1.2,  gap: 1.1, trem: 0.15, tremHz: 4 },
  calm:      { speed: 0.93, pitch: 0.98, vol: 0.85, bright: -1, noise: 0.8,  noiseW: 0.8,  gap: 1.3 },
  think:     { speed: 0.92, pitch: 1.0,  vol: 0.9,  bright: 0,  noise: 0.9,  noiseW: 0.9,  gap: 1.3 }
};
const ALIAS = { mad: 'angry', furious: 'angry', glad: 'happy', joy: 'happy', joyful: 'happy', cheerful: 'happy', tired: 'sleepy', bored: 'sleepy', afraid: 'scared', anxious: 'scared', shy: 'love', playful: 'wink', proud: 'smug', sulk: 'pout', thinking: 'think', serious: 'calm' };
export const MOOD_NAMES = Object.keys(MOOD_VOICE);

/** mood name (any case, alias ok) -> canonical preset name, or null for neutral/unknown */
export function canonMood(m) {
  const k = String(m || '').toLowerCase().replace(/[^a-z]/g, '');
  if (MOOD_VOICE[k]) return k;
  return ALIAS[k] && MOOD_VOICE[ALIAS[k]] ? ALIAS[k] : null;
}

/** Prosody for a mood at a given strength (0 = off/neutral, 1 = the preset, up to 1.5 = exaggerated). Always returns every field, clamped to safe ranges. */
export function prosodyFor(mood, strength = 1) {
  const name = canonMood(mood), s = Math.max(0, Math.min(1.5, +strength || 0)), P = name ? MOOD_VOICE[name] : null, out = { ...NEUTRAL, mood: name };
  if (P && s > 0) for (const k of Object.keys(NEUTRAL)) { const a = NEUTRAL[k], b = P[k] === undefined ? a : P[k]; out[k] = a + (b - a) * s; }
  out.speed = clamp(out.speed, 0.6, 1.5); out.pitch = clamp(out.pitch, 0.85, 1.15); out.vol = clamp(out.vol, 0.3, 1.08);
  out.bright = clamp(out.bright, -6, 6); out.noise = clamp(out.noise, 0.4, 1.5); out.noiseW = clamp(out.noiseW, 0.4, 1.5);
  out.gap = clamp(out.gap, 0.5, 2.2); out.trem = clamp(out.trem, 0, 0.25);
  return out;
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
