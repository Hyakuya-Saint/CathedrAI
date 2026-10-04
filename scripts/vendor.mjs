// Copies onnxruntime-web runtime files into www/vendor/ort (used by the Saint voice). Never fails the build.
import fs from 'fs'; import path from 'path';
try {
  const src = 'node_modules/onnxruntime-web/dist', dst = 'www/vendor/ort';
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) if (/^ort(\.min\.js|-wasm.*\.(wasm|mjs))$/.test(f) && !/jsep|webgpu|threaded|training/.test(f) || f === 'ort.min.js') fs.copyFileSync(path.join(src, f), path.join(dst, f));
  console.log('ort vendored:', fs.readdirSync(dst).join(', '));
} catch (e) { console.log('ort vendor skipped:', e.message); }
