// Copies the onnxruntime-web runtime files into www/vendor/ort (used by the Saint voice).
// The voice REQUIRES ort.min.js + ort-wasm-simd-threaded.mjs + ort-wasm-simd-threaded.wasm
// (onnxruntime-web 1.20.x uses the "threaded" build even when running on one thread).
// Only the JSEP / WebGPU / training variants are skipped: the app uses the plain wasm provider.
import fs from 'fs'; import path from 'path';

const src = 'node_modules/onnxruntime-web/dist', dst = 'www/vendor/ort';
const REQUIRED = ['ort.min.js', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'];
const SKIP = /jsep|webgpu|training/;
const WANT = /^ort(\.min\.js|-wasm.*\.(wasm|mjs))$/;

try {
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    if (WANT.test(f) && !SKIP.test(f)) fs.copyFileSync(path.join(src, f), path.join(dst, f));
  }
  const have = fs.readdirSync(dst);
  console.log('ort vendored:', have.map(f => f + ' (' + (fs.statSync(path.join(dst, f)).size / 1048576).toFixed(1) + ' MB)').join(', '));
  const missing = REQUIRED.filter(f => !have.includes(f));
  if (missing.length) {
    console.error('ort vendor ERROR: missing required file(s): ' + missing.join(', '));
    process.exit(1); // fail the build loudly instead of shipping an app whose voice engine 404s
  }
} catch (e) {
  console.error('ort vendor ERROR:', e.message);
  process.exit(1);
}
