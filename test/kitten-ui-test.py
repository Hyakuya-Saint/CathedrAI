#!/usr/bin/env python3
"""Smoke test of the whole app in headless Chromium with a fake Capacitor/Cathedra plugin."""
import os, sys, json, threading, http.server, socketserver, functools, time, base64
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = '/home/claude/work/fixtures'; SH = FIX + '/shots'; os.makedirs(SH, exist_ok=True)
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
s = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(H, directory=ROOT + '/www')); threading.Thread(target=s.serve_forever, daemon=True).start()
port = s.server_address[1]
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl',
        '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required']
FAKE = r"""
(()=>{const ls={};const P={_calls:[],
 addListener(n,f){(ls[n]=ls[n]||[]).push(f);return Promise.resolve({remove(){}})},
 log(){return Promise.resolve()},
 listModels(){return Promise.resolve({models:[{file:'gemma.gguf',path:'/x/gemma.gguf',size:1e9,meta:{}}]})},
 getStartupNotice(){return Promise.resolve({})},
 loadModel(o){P._calls.push(['load',o]);return Promise.resolve({ok:true,ctx:o.nCtx||4096,audio:true,vision:false})},
 unloadModel(){P._calls.push(['unload']);return Promise.resolve({ok:true})},
 stopGeneration(){P._stop=true;return Promise.resolve()},
 httpGet(o){P._calls.push(['http',o.url]);if(/duckduckgo/.test(o.url))return Promise.resolve({ok:true,body:'<div class="result"><a class="result__a" href="https://example.com/a">Result A</a><div class="result__snippet">Snippet about the weather</div></div><div class="result"><a class="result__a" href="https://example.com/b">Result B</a><div class="result__snippet">More snippet</div></div><div class="result"><a class="result__a" href="https://example.com/c">Result C</a><div class="result__snippet">Third</div></div>'});return Promise.resolve({ok:true,body:'<html><body><article>'+'Long page text about the weather today. '.repeat(30)+'</article></body></html>'})},
 getDiagnostics(){return Promise.resolve({nativeLog:'',info:{}})},
 async generate(o){P._calls.push(['gen',o]);P._stop=false;
  const last=[...o.messages].reverse().find(m=>m.role=='user')||{content:''};const t=String(last.content);
  let out;
  if(o.audios&&o.audios.length)out="<heard>hello saint you are such a nerd</heard>[pout] Hmph. I am not a nerd. Take that back, please.";
  else if(/slides/i.test(t))out="Here is the deck.\n```canvas-slides\n@theme midnight\n@font sans\n---\n@layout cover\n@bg mesh #7c3aed #06b6d4 #f43f5e\n@deco sparkles\n@titlestyle gradient\n# The Future of Tea\nA short ==journey== through leaves\n---\n@layout stats\n# Why it matters\nstat: 2B | cups every day\nstat: 5000 | years\n---\n@layout bullets\n# Points\n- **Fresh** leaves\n- Warm water\n```";
  else out="Hello there. This is a **test** reply. It has several sentences, and some more words. Right?";
  const parts=out.match(/.{1,6}/gs);for(const p of parts){if(P._stop)break;(ls.token||[]).forEach(f=>f({t:p}));await new Promise(r=>setTimeout(r,8))}
  return {ok:true,gen:parts.length,tps:50,reason:P._stop?'user':'stop',reused:0}}
};
window.Capacitor={isNativePlatform:()=>true,Plugins:{Cathedra:P,App:{addListener(){return Promise.resolve({})}}}};
window.__ls=ls;})();
"""
logs = []

import glob
KD = sys.argv[1] if len(sys.argv) > 1 else glob.glob('/home/claude/kitten/*/')[0]
fails = 0
def check(name, ok, extra=''):
    global fails; print(('PASS ' if ok else 'FAIL ') + name + ('  ' + str(extra)[:160] if extra else ''), flush=True); fails += (not ok)
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={'width': 420, 'height': 900})
    pg = ctx.new_page(); pg.add_init_script(FAKE); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    pg.goto(f'http://127.0.0.1:{port}/index.html'); pg.wait_for_timeout(800)
    pg.evaluate("go('hub')"); pg.wait_for_timeout(300)
    # 1) kitten import: only two of three files -> helpful message, nothing added
    pg.set_input_files('#fVoice', [KD + '/model.fp16.onnx', KD + '/tokens.txt']); pg.wait_for_timeout(600)
    check('Kitten with a file missing is refused and explained', len(pg.evaluate('voices')) == 0)
    # 2) all three
    pg.set_input_files('#fVoice', [KD + '/model.fp16.onnx', KD + '/voices.bin', KD + '/tokens.txt']); pg.wait_for_timeout(2500)
    v = pg.evaluate('voices')
    check('Kitten voice imported', len(v) == 1 and v[0]['kind'] == 'kitten', v and {k: v[0][k] for k in ('name', 'kind', 'sr', 'spk')})
    check('8 speakers read from the model', v and len(v[0]['speakers']) == 8 and v[0]['speakers'][5]['name'] == 'expr-voice-4-f')
    check('default speaker is #5 expr-voice-4-f', v and v[0]['spk'] == 5)
    pg.evaluate("go('hub')"); pg.wait_for_timeout(300)
    html = pg.inner_html('#view')
    check('Hub shows the speaker list with 5 selected', 'vxSetSpk' in html and pg.evaluate("[...document.querySelectorAll('select')].some(s=>s.getAttribute('onchange')&&s.getAttribute('onchange').startsWith('vxSetSpk') && s.value=='5')"))
    check('Hub shows emotion controls and mood buttons', all(k in html for k in ['Emotional tone', 'Emotion strength', "vxTestVoice('angry')", "vxTestVoice('sad')"]))
    # 3) pick another speaker in the Hub -> stored and used
    pg.evaluate("document.querySelector('select[onchange^=\"vxSetSpk\"]').value='3'; document.querySelector('select[onchange^=\"vxSetSpk\"]').dispatchEvent(new Event('change'))"); pg.wait_for_timeout(200)
    check('Hub speaker choice stored', pg.evaluate('voices[0].spk') == 3 and pg.evaluate('spkOf(P_())') == 3)
    # 4) persona override
    pg.evaluate("go('persona')") if pg.evaluate("typeof go=='function'") else None; pg.wait_for_timeout(300)
    ph = pg.inner_html('#view')
    check('Persona has "Voice default" speaker option', 'pSpk(this.value)' in ph and 'Voice default (3 · ' not in ph and 'Voice default (' in ph, 'Voice default (' in ph)
    pg.evaluate("pSpk('6')"); check('persona override wins', pg.evaluate('spkOf(P_())') == 6)
    pg.evaluate("pSpk('')"); check('persona back to voice default', pg.evaluate('spkOf(P_())') == 3)
    # 5) emotion switches reach the options
    pg.evaluate("vxOpt('emoK','0.6')"); check('emotion strength stored', pg.evaluate('vxo.emoK') == 0.6)
    # 6) save / reload keeps everything, blobs present
    pg.wait_for_timeout(300); pg.reload(); pg.wait_for_timeout(1200)
    check('voice survives reload', pg.evaluate('voices.length') == 1 and pg.evaluate('voices[0].spk') == 3 and pg.evaluate('vxo.emoK') == 0.6)
    check('the three Kitten files are stored', pg.evaluate("Promise.all([idb.get('o:'+voices[0].id), idb.get('o:'+voices[0].id+':v'), idb.get('o:'+voices[0].id+':t')]).then(a=>a.every(x=>x&&x.size>0))"))
    # 7) delete removes all three
    vid = pg.evaluate('voices[0].id'); pg.evaluate(f"vxDelVoice('{vid}')"); pg.wait_for_timeout(400)
    check('delete clears voice and files', pg.evaluate('voices.length') == 0 and pg.evaluate(f"Promise.all([idb.get('o:{vid}:v'), idb.get('o:{vid}:t')]).then(a=>a.every(x=>!x))"))
    # 8) not-a-kitten onnx is rejected
    open('/home/claude/work/fake.onnx', 'wb').write(bytes(5000))
    pg.set_input_files('#fVoice', ['/home/claude/work/fake.onnx', KD + '/voices.bin', KD + '/tokens.txt']); pg.wait_for_timeout(800)
    check('garbage .onnx with kitten files is rejected', pg.evaluate('voices.length') == 0)
    check('no page errors', not [e for e in errs if 'speechSynthesis' not in e and 'favicon' not in e and 'Failed to load resource' not in e], errs[:3])
    pg.screenshot(path='/home/claude/work/hub_voice.png', full_page=False); b.close()
print('\nALL OK' if not fails else f'\n{fails} FAILED'); sys.exit(1 if fails else 0)
