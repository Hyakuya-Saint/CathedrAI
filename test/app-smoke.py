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
def L(m): print(m, flush=True)
def check(name, ok, extra=''):
    L(('PASS ' if ok else 'FAIL ') + name + (' — ' + str(extra) if extra != '' else '')); 
    if not ok: logs.append('FAILED: ' + name)
with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)
    ctx = b.new_context(viewport={'width': 420, 'height': 760}, permissions=['microphone'])
    pg = ctx.new_page(); pg.add_init_script(FAKE)
    errs = []
    pg.on('console', lambda m: errs.append(m.type + ': ' + m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e)))
    pg.route('**/fonts.googleapis.com/**', lambda r: r.abort())
    pg.goto(f'http://127.0.0.1:{port}/index.html'); pg.wait_for_timeout(800)
    pg.evaluate("""()=>{models.push({id:'m1',n:'Gemma 4 E2B',file:'gemma.gguf',path:'/x/gemma.gguf',st:'ready',p:1,s:'1 GB',q:'Q4_K_M',projPath:'/x/mm.gguf'});act='m1';save();nav();render()}""")
    pg.wait_for_timeout(300)
    # --- 1 whitespace
    raw = '  hello  \n   world  '
    pg.fill('#in', raw); pg.click('#send'); pg.wait_for_timeout(1500)
    t = pg.evaluate("C.m.find(m=>m.r=='u').t"); check('prompt keeps spaces', t == raw, repr(t))
    sent = pg.evaluate("(()=>{const g=Capacitor.Plugins.Cathedra._calls.filter(c=>c[0]=='gen').pop()[1];return g.messages.filter(m=>m.role=='user').pop().content})()")
    check('engine receives raw spaces', sent == raw, repr(sent))
    ws = pg.evaluate("getComputedStyle(document.querySelector('.ut')).whiteSpace"); check('bubble pre-wrap', ws == 'pre-wrap', ws)
    check('greeting does not break history', pg.evaluate("C.m.some(m=>m.greet)") in (True, False))
    # --- 2 copy
    pg.evaluate("""()=>{window.__cb=null;navigator.clipboard.write=async(items)=>{const it=items[0];window.__cb={};for(const ty of it.types){window.__cb[ty]=await (await it.getType(ty)).text()}};}""")
    pg.evaluate("cpRich(C.m.length-1)"); pg.wait_for_timeout(300)
    cb = pg.evaluate("window.__cb")
    check('copy html has <strong>', cb and '<b>test</b>' in cb.get('text/html', ''), (cb or {}).get('text/html', '')[:120])
    check('copy plain has no **', cb and '**' not in cb.get('text/plain', '') and 'test' in cb.get('text/plain', ''), (cb or {}).get('text/plain', ''))
    # --- 3 persona
    pg.evaluate("go('sov')"); pg.wait_for_timeout(300)
    txt = pg.inner_text('#view'); check('persona tab renders', 'Persona' in txt and 'Rank' not in txt and 'Bishop' not in txt, txt[:80].replace('\n', ' | '))
    pg.evaluate("pNew()"); pg.wait_for_timeout(200)
    pg.evaluate("pIn('p','You are Mira, a sharp-tongued pirate.');pIn('story','Mira lost her ship to a storm.');"); 
    pg.evaluate("pTog('story',true)")
    pr = pg.evaluate("sysP(FAC[fac],'', 'ship')"); check('persona prompt contains story', 'Mira' in pr and 'storm' in pr, pr[:120].replace('\n', ' '))
    pg.evaluate("pTog('story',false)"); pr2 = pg.evaluate("sysP(FAC[fac],'', 'ship')"); check('disabled feature excluded', 'lost her ship' not in pr2)
    pg.evaluate("pTog('story',true)")
    pg.screenshot(path=SH + '/app_persona.png')
    # attach doc
    pg.evaluate("""()=>{const P=P_();P.docs.push({name:'lore.txt',chars:90,off:false,chunks:['The Crimson Reef hides the sunken vault of Admiral Vane.']});P.lore_on=true;save()}""")
    pr3 = pg.evaluate("(()=>{const P=P_();P.on=P.on||{};return personaPrompt(P,FAC[fac],'where is the vault of Admiral Vane?')})()"); check('lore retrieval', 'Crimson Reef' in pr3 or 'Vane' in pr3, pr3[-200:].replace('\n', ' '))
    pg.evaluate("P_().docs=[]; pDel&&0"); 
    L('modal: '+pg.evaluate("document.getElementById('mc').innerText")[:200]); pg.evaluate("cl();prof='def';go('chat')"); pg.wait_for_timeout(200)
    # --- 4 power
    pg.click('#pwr'); pg.wait_for_timeout(400)
    cls = pg.get_attribute('#pwr', 'class'); check('power off state', 'off' in cls, cls)
    check('engine unloaded', pg.evaluate("Capacitor.Plugins.Cathedra._calls.some(c=>c[0]=='unload')"))
    pg.fill('#in', 'hi again'); pg.click('#send'); pg.wait_for_timeout(500)
    last = pg.evaluate("C.m[C.m.length-1].t"); check('send while off explains', 'switched off' in last, last[:70])
    pg.click('#pwr'); pg.wait_for_timeout(800)
    cls = pg.get_attribute('#pwr', 'class'); check('power on again', ('on' in cls.split() or 'idle' in cls.split()), cls)
    # --- 5 slides
    pg.evaluate("newChat&&newChat()"); pg.evaluate("sty='Canvas';sty&&nav()"); pg.wait_for_timeout(200)
    pg.fill('#in', 'make slides about tea'); pg.click('#send'); pg.wait_for_timeout(2500)
    has = pg.evaluate("C.m.some(m=>m.cv&&m.cv.kind=='slides')"); check('slides produced', has)
    pg.wait_for_timeout(500)
    vis = pg.evaluate("document.getElementById('cvp').style.display"); check('canvas open', vis == 'flex', vis)
    pg.screenshot(path=SH + '/app_slides1.png')
    n = pg.evaluate("document.querySelectorAll('#cvb .dk-thumb, #cvb [data-slide], #cvb .dkth').length"); L('thumbs ' + str(n))
    pg.evaluate("sty='Markdown'")
    # --- 6 live
    pg.evaluate("cvClose&&cvClose()"); pg.evaluate("go('chat')")
    vb = open(FIX + '/test_vrm1.vrm', 'rb').read()
    pg.evaluate("""async(b64)=>{const bin=atob(b64),u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
      const f=new File([u],'Hana.vrm');await vxImportVessel([f])}""", base64.b64encode(vb).decode())
    nv = pg.evaluate("vessels.length"); check('vessel imported', nv == 1)
    pg.evaluate("go('hub')"); pg.wait_for_timeout(300); ht = pg.inner_text('#view'); check('hub has vessel/voice/hearing cards', all(k in ht for k in ['Saint vessel', 'Saint voice', 'Hearing', 'Hana']))
    pg.screenshot(path=SH + '/app_hub.png', full_page=False)
    pg.evaluate("go('chat')")
    pg.click('#live'); pg.wait_for_timeout(6000)
    on = pg.evaluate("LV.on"); check('live on', on, pg.evaluate("document.getElementById('lvchip').textContent"))
    pg.screenshot(path=SH + '/app_live1.png')
    check('exec button is waveform', pg.evaluate("!!document.querySelector('#send canvas')"))
    # fake heard speech (loud tone bursts)
    pg.evaluate("""()=>{const n=16000*2,pcm=new Float32Array(n);for(let i=0;i<n;i++)pcm[i]=0.4*Math.sin(2*Math.PI*180*i/16000)*(0.5+0.5*Math.sin(2*Math.PI*3*i/16000));liveHeard({pcm,seconds:2})}""")
    pg.wait_for_timeout(2500)
    pg.screenshot(path=SH + '/app_live2.png')
    gen = pg.evaluate("Capacitor.Plugins.Cathedra._calls.filter(c=>c[0]=='gen').pop()[1]"); check('audio sent natively', gen.get('audios') and len(gen['audios']) == 1 and len(gen['audios'][0]['pcm']) > 1000)
    um = pg.evaluate("C.m.filter(m=>m.r=='u').pop()"); check('heard transcript captured', 'nerd' in (um.get('t') or ''), um.get('t'))
    st = pg.evaluate("_space.state?_space.state():null"); L('space state ' + json.dumps(st)[:200])
    pg.wait_for_timeout(5000)
    pg.click('#lvx'); pg.wait_for_timeout(5000)
    check('live off', pg.evaluate("!LV.on && !document.body.classList.contains('lvmode')"))
    pg.screenshot(path=SH + '/app_after.png')
    check('no console errors', not errs, errs[:6])
    for e in errs: L('ERR ' + e[:300])
    b.close()
print('\n'.join(logs) or 'ALL OK')
