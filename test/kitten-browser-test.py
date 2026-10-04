#!/usr/bin/env python3
"""Runs the REAL www/live/voice.js in headless Chromium with the real Kitten model.
onnxruntime-web is not needed: window.ort is a thin stub whose InferenceSession.run() forwards to Python onnxruntime on this machine.
Everything else is the app's own code: espeak wasm phonemizer, token mapping, style rows, mood prosody, WebAudio chain.
usage: python3 test/kitten-browser-test.py /path/to/kitten-folder"""
import os, sys, json, glob, threading, http.server, socketserver, functools
import numpy as np, onnxruntime as ort
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KD = sys.argv[1] if len(sys.argv) > 1 else glob.glob('/home/claude/kitten/*/')[0]
MODEL = glob.glob(os.path.join(KD, '*.onnx'))[0]
SESS = ort.InferenceSession(MODEL); RUNS = []
STUB = b"""window.ort={version:'stub',env:{wasm:{}},Tensor:class{constructor(t,d,s){this.type=t;this.data=d;this.dims=s}},
InferenceSession:{async create(){const m=await (await fetch('/__ort/meta')).json();return{inputNames:m,release(){},async run(f){
 const body={};for(const k in f)body[k]=Array.from(f[k].data,x=>Number(x));
 const r=await (await fetch('/__ort/run',{method:'POST',body:JSON.stringify(body)})).json();
 return{waveform:{data:Float32Array.from(r.w),dims:[r.w.length]}}}}}}};"""
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, b, ct='application/octet-stream'):
        self.send_response(200); self.send_header('Content-Type', ct); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        p = self.path.split('?')[0]
        if p == '/vendor/ort/ort.min.js': return self._send(STUB, 'text/javascript')
        if p == '/vendor/ort/ort-wasm-simd-threaded.mjs': return self._send(b'/* stub */ export default 1;', 'text/javascript')
        if p == '/vendor/ort/ort-wasm-simd-threaded.wasm': return self._send(b'\0asm\1\0\0\0' + bytes(2000), 'application/wasm')
        if p == '/__ort/meta': return self._send(json.dumps([i.name for i in SESS.get_inputs()]).encode(), 'application/json')
        if p.startswith('/__kit/'): return self._send(open(os.path.join(KD, p[7:]), 'rb').read())
        if p == '/__t.html': return self._send(b'<!doctype html><title>t</title><body>ok</body>', 'text/html')
        return super().do_GET()
    def do_POST(self):
        b = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        ids = np.array([b['input_ids']], dtype=np.int64); st = np.array([b['style']], dtype=np.float32).reshape(1, 256); sp = np.array(b['speed'], dtype=np.float32)
        w = SESS.run(None, {'input_ids': ids, 'style': st, 'speed': sp})[0]
        RUNS.append({'n_ids': ids.shape[1], 'first': ids[0][:3].tolist(), 'last': ids[0][-2:].tolist(), 'speed': float(sp[0]), 'style0': float(st[0][0]), 'samples': len(w)})
        self._send(json.dumps({'w': w.astype(float).tolist()}).encode(), 'application/json')
class S(socketserver.ThreadingTCPServer): daemon_threads = True; allow_reuse_address = True
srv = S(('127.0.0.1', 0), functools.partial(H, directory=ROOT + '/www')); threading.Thread(target=srv.serve_forever, daemon=True).start()
port = srv.server_address[1]
fails = 0
def T(name, ok, info=''):
    global fails; print(('PASS ' if ok else 'FAIL ') + name + ('  ' + str(info) if info else '')); fails += (not ok)
JS = """
async () => {
  const { Voice } = await import('/live/voice.js');
  const out = {}; const bufs = [];
  const oc = AudioContext.prototype.createBuffer; AudioContext.prototype.createBuffer = function (c, n, r) { bufs.push({ n, r }); return oc.call(this, c, n, r); };
  const get = async u => (await fetch(u)).arrayBuffer();
  const onnx = new Blob([await get('/__kit/model.fp16.onnx')]), vb = await get('/__kit/voices.bin'), tk = await (await fetch('/__kit/tokens.txt')).text();
  out.info = await Voice.inspectKitten(onnx);
  await Voice.loadSaintVoice({ onnx, kind: 'kitten', voices: vb, tokens: tk, config: {}, name: 'Kitten test' });
  out.engine = Voice.engine(); out.speakers = Voice.speakers;
  const t0 = performance.now();
  Voice.setEmotion(true, 1);
  await Voice.speak('Hello there, my child.', { speaker: 5, speed: 1 });
  out.neutral = bufs.splice(0);
  await Voice.speak('Hello there, my child.', { speaker: 5, speed: 1, mood: 'sad' });
  out.sad = bufs.splice(0);
  await Voice.speak('Hello there, my child.', { speaker: 5, speed: 1, mood: 'angry' });
  out.angry = bufs.splice(0);
  Voice.setEmotion(false, 1);
  await Voice.speak('Hello there, my child.', { speaker: 5, speed: 1, mood: 'sad' });
  out.sadOff = bufs.splice(0);
  Voice.setEmotion(true, 1);
  await Voice.speak('Hello there, my child. I have been waiting for you.', { speaker: 2, speed: 1.2 });
  out.two = bufs.splice(0);
  out.test = []; await Voice.selfTest((n, ok, d) => out.test.push([n, ok, d]));
  out.ms = Math.round(performance.now() - t0);
  return out;
}
"""
with sync_playwright() as p:
    br = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
    pg = br.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto(f'http://127.0.0.1:{port}/__t.html')
    r = pg.evaluate(JS); br.close()
T('inspectKitten reads metadata in the browser', r['info'] and r['info']['sample_rate'] == 24000 and len(r['info']['speakers']) == 8, r['info'] and r['info']['comment'])
T('engine reports kitten, 8 speakers, #5 = expr-voice-4-f', r['engine'] == 'kitten' and len(r['speakers']) == 8 and r['speakers'][5]['name'] == 'expr-voice-4-f')
T('first inference framed [0 ... 0] with the speaker-5 style row', RUNS[0]['first'][0] == 0 and RUNS[0]['last'][-1] == 0, RUNS[0])
v = np.fromfile(os.path.join(KD, 'voices.bin'), dtype=np.float32).reshape(8, 256)
T('style row sent = voices.bin row 5 (not row 0)', abs(RUNS[0]['style0'] - float(v[5][0])) < 1e-6 and abs(RUNS[0]['style0'] - float(v[0][0])) > 1e-4, f"{RUNS[0]['style0']:.5f}")
T('neutral: speed 1, played at 24000 Hz', abs(RUNS[0]['speed'] - 1) < 1e-6 and r['neutral'][0]['r'] == 24000, r['neutral'])
T('sad: slower model speed compensated for pitch (0.85/0.93)', abs(RUNS[1]['speed'] - 0.85 / 0.93) < 1e-4, RUNS[1]['speed'])
T('sad: played back at 0.93 x rate = lower pitch', r['sad'][0]['r'] == round(24000 * 0.93), r['sad'][0]['r'])
T('angry: faster and lower pitch (1.1/0.94, rate x0.94)', abs(RUNS[2]['speed'] - 1.1 / 0.94) < 1e-4 and r['angry'][0]['r'] == round(24000 * 0.94))
T('emotion off: mood ignored', abs(RUNS[3]['speed'] - 1) < 1e-6 and r['sadOff'][0]['r'] == 24000)
T('speaker 2 uses its own style row and speed 1.2 passes through', abs(RUNS[4]['style0'] - float(v[2][0])) < 1e-6 and abs(RUNS[4]['speed'] - 1.2) < 1e-6, RUNS[4])
T('two sentences -> two buffers', len(r['two']) == 2, [b['n'] for b in r['two']])
T('self-test steps all ok', all(x[1] for x in r['test'] if not x[0].startswith('System voice')), [x for x in r['test'] if not x[1]])
T('no page errors', not [e for e in errs if 'speechSynthesis' not in e], errs[:3])
print(f"  ({len(RUNS)} real inferences, {r['ms']} ms total in headless Chromium)")
print('\nall passed' if not fails else f'\n{fails} FAILED'); sys.exit(1 if fails else 0)
