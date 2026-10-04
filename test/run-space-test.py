#!/usr/bin/env python3
"""Playwright driver for test/space-test.html. Usage: run-space-test.py <scenario> [fixture]
Serves the project root on a free port; fixtures are fulfilled from /home/claude/work/fixtures via route interception."""
import sys, os, json, threading, http.server, socketserver, functools, time
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIX = '/home/claude/work/fixtures'
SHOTS = FIX + '/shots'
ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl']

class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
def serve():
    h = functools.partial(H, directory=ROOT)
    s = socketserver.TCPServer(('127.0.0.1', 0), h); threading.Thread(target=s.serve_forever, daemon=True).start()
    return s, s.server_address[1]

def open_page(p, port, w=480, h=640, fixture='test_vrm1.vrm', opts=None):
    b = p.chromium.launch(args=ARGS)
    pg = b.new_page(viewport={'width': w, 'height': h})
    pg.route('**/fixtures/*', lambda r: r.fulfill(path=FIX + '/' + r.request.url.split('/fixtures/')[1], headers={'access-control-allow-origin': '*'}))
    logs = []
    pg.on('console', lambda m: logs.append(m.type + ': ' + m.text) if m.type in ('error', 'warning') else None)
    pg.on('pageerror', lambda e: logs.append('PAGEERROR: ' + str(e)))
    pg.goto(f'http://127.0.0.1:{port}/test/space-test.html?w={w}&h={h}')
    pg.wait_for_function('window.__ready')
    return b, pg, logs

# ------------------------------------------------------------------------------------------------ scenarios
from PIL import Image
def sheet(imgs, out, cols=4, scale=0.75):
    w, h = imgs[0].size; w2, h2 = int(w * scale), int(h * scale); rows = (len(imgs) + cols - 1) // cols
    sh = Image.new('RGB', (cols * w2, rows * h2))
    for i, im in enumerate(imgs): sh.paste(im.resize((w2, h2)), ((i % cols) * w2, (i // cols) * h2))
    sh.save(out); return out
def snap(pg, tag=''):
    pg.screenshot(path='/tmp/_s.png'); return Image.open('/tmp/_s.png').convert('RGB')
def ev(pg, js):
    if os.environ.get('SPACE_TRACE'): print('>>', js[:70].replace('\n', ' '), file=sys.stderr, flush=True)
    return pg.evaluate(js)

def run_fixture(p, port, fx, full):
    res = {'fixture': fx}; name = fx[:-4]
    b, pg, logs = open_page(p, port, 360, 480)
    ev(pg, f"async()=>{{const sp=await T.start('/fixtures/{fx}',{{chop:'off'}});sp.enter({{vessel:T.buf,name:'t'}});sp.pause()}}")
    pg.wait_for_function("T.events.some(e=>e[0]==='ready')")
    res['info'] = ev(pg, 'T.space.info'); st = ev(pg, 'T.space.state()'); res['flip'] = st['flip']; res['exprNames'] = st['exprNames']
    # intro
    t = 0; imgs = []
    for tt in [0.15, 0.4, 0.7, 1.0, 1.8, 2.8, 3.5, 4.2]:
        ev(pg, f'T.space.advance({tt - t})'); t = tt; imgs.append(snap(pg))
    sheet(imgs, f'{SHOTS}/intro_{name}.png')
    res['intro_events'] = ev(pg, 'T.events.map(e=>e[0])')
    # all 16 emotes
    imgs = []
    for n in ev(pg, 'T.EMOTES'):
        ev(pg, f"T.space.emote('idle');T.space.advance(1.0,{{render:false}});T.space.poseNow('{n}',1.6)"); imgs.append(snap(pg))
    sheet(imgs, f'{SHOTS}/emotes_{name}.png')
    ev(pg, "T.space.emote('idle');T.space.advance(1.5,{render:false})")
    # talking with a fake mouth signal + beats
    ev(pg, "T.space.setSpeaking(true)"); imgs = []; mx = 0
    for i in range(90):
        ev(pg, f"""(()=>{{const t={i}/30;const o=Math.max(0,.5+.45*Math.sin(t*14))*(Math.sin(t*2.3)>-.7?1:.1);
          T.space.setMouth({{open:o,low:.5+.5*Math.sin(t*5),mid:.5+.5*Math.sin(t*7+1),high:.5+.5*Math.sin(t*9+2)}});T.space.advance(1/30,{{render:false}})}})()""")
        if i in (10, 30, 50, 70):
            ev(pg, 'T.space.advance(0)'); imgs.append(snap(pg))
            e = ev(pg, 'T.space.state().expr'); mx = max(mx, sum(e[5:10]))
    sheet(imgs, f'{SHOTS}/talk_{name}.png', cols=4); res['talk_mouth_sum_max'] = round(mx, 2)
    ev(pg, "T.space.setSpeaking(false)")
    # synthetic mouth when no signal
    ev(pg, "T.space.setSpeaking(true)"); ev(pg, "new Promise(r=>setTimeout(r,400))"); ev(pg, "T.space.advance(.5,{render:false})")
    res['talk_synth_mouth'] = round(sum(ev(pg, 'T.space.state().expr')[5:10]), 2); ev(pg, "T.space.setSpeaking(false)")
    # listening
    ev(pg, "T.space.setListening(true);T.space.advance(2.0)"); L = snap(pg); ev(pg, "T.space.setListening(false);T.space.advance(1)")
    # idle animations
    imgs = []; names = ['stretch', 'look-around', 'hair-fix', 'small-wave', 'yawn', 'hum-sway', 'shift-weight', 'peek-camera']
    for n in names:
        ev(pg, f"T.space.advance(.5,{{render:false}});T.space.triggerIdle('{n}');T.space.advance(1.3)"); imgs.append(snap(pg))
        ev(pg, "T.space.advance(4,{render:false})")
    sheet(imgs, f'{SHOTS}/idle_{name}.png')
    res['idle_events_manual'] = [e[1]['name'] for e in ev(pg, "T.events.filter(e=>e[0]==='idle-anim')")]
    # auto idle director
    n0 = len(res['idle_events_manual'])
    ev(pg, "T.space.setOptions({idleMin:1,idleMax:2});T.space.advance(.3,{render:false});T.space.advance(25,{render:false})")
    res['idle_events_auto'] = len(ev(pg, "T.events.filter(e=>e[0]==='idle-anim')")) - n0
    ev(pg, "T.space.setOptions({idleMin:6,idleMax:14})")
    # chop
    ev(pg, "T.space.emote('dizzy',{hold:99})")
    c = {}
    for mode in ('off', 'mixed', '2', '3'):
        ev(pg, f"T.space.setOptions({{chop:'{mode}'}})"); a = ev(pg, 'T.space.state().poseCount'); ev(pg, 'T.space.advance(3,{render:false})')
        c[mode] = ev(pg, 'T.space.state().poseCount') - a
    res['pose_updates_per_90_steps'] = c
    ev(pg, "T.space.setOptions({chop:'mixed'});T.space.advance(1.0)"); chopimg = snap(pg)
    ev(pg, "T.space.setOptions({chop:'off',edges:true});T.space.advance(.3)"); edgeimg = snap(pg)
    ev(pg, "T.space.setOptions({edges:false,ink:false,halftone:false,neon:false,toonModel:false});T.space.advance(.3)"); plainimg = snap(pg)
    ev(pg, "T.space.setOptions({ink:true,halftone:true,neon:true,toonModel:true,chop:'mixed'});T.space.emote('idle');T.space.advance(2)")
    sheet([L, chopimg, edgeimg, plainimg], f'{SHOTS}/listen_chop_edges_plain_{name}.png')
    # memory / hot path allocation check (no rendering)
    if full:
        ev(pg, "T.space.setSpeaking(true);T.space.advance(2,{render:false})")
        m0 = ev(pg, "performance.memory.usedJSHeapSize"); ev(pg, "for(let i=0;i<6;i++){T.space.advance(10,{render:false})}")
        m1 = ev(pg, "performance.memory.usedJSHeapSize"); res['heap_delta_KB_over_60s_sim'] = round((m1 - m0) / 1024)
        ev(pg, "T.space.setSpeaking(false)")
        ev(pg, "T.space.setOptions({pixelRatio:1,chop:'mixed',fps:60});T.events.length=0;T.space.resume()"); pg.wait_for_timeout(6000)
        fe = ev(pg, "T.events.filter(e=>e[0]==='fps').map(e=>e[1])"); ev(pg, "T.space.pause()")
        res['realtime_swiftshader_pr1_fps_events'] = fe
        res['step_only_ms'] = ev(pg, """(()=>{const n=300;const t0=performance.now();T.space.advance(n/30,{render:false});return +((performance.now()-t0)/n).toFixed(3)})()""")
    # exit
    imgs = []; t = 0
    ev(pg, "T.space.exit().then(()=>{window.__exited=true});0")
    for tt in [0.2, 0.45, 0.6, 0.8, 1.0, 1.3, 1.6]:
        ev(pg, f'T.space.advance({tt - t})'); t = tt; imgs.append(snap(pg))
    ev(pg, 'T.space.advance(.5)')
    sheet(imgs, f'{SHOTS}/exit_{name}.png')
    res['exit_events'] = ev(pg, "T.events.filter(e=>e[0]==='exit-done').length"); res['exited_promise'] = ev(pg, 'window.__exited===true')
    res['hidden_after_exit'] = ev(pg, 'T.space.state().hidden')
    # re-enter (reuse model) then dispose + call-after-dispose safety
    ev(pg, "T.space.enter({}).then(()=>{window.__re=true});0");  ev(pg, 'T.space.advance(4.5)'); res['reenter_ok'] = ev(pg, 'window.__re===true')
    ev(pg, "T.space.dispose()"); res['canvas_removed'] = ev(pg, "document.querySelectorAll('#host canvas').length===0")
    res['after_dispose_ok'] = ev(pg, """(()=>{try{const s=T.space;s.emote('happy');s.setSpeaking(true);s.setMouth({open:1});s.setListening(true);s.beat();s.setOptions({chop:'off'});s.resize();s.pause();s.resume();s.advance(1);s.getOptions();return true}catch(e){return String(e)}})()""")
    res['errors'] = ev(pg, 'T.errors'); res['console'] = [l for l in logs if 'Multiple bone entries' not in l]
    b.close(); return res

def run_misc(p, port):
    res = {}
    # before enter / without vessel
    b, pg, logs = open_page(p, port, 360, 480)
    res['pre_enter_calls'] = ev(pg, """async()=>{const sp=await T.start('/fixtures/test_vrm1.vrm',{});try{sp.emote('happy');sp.setSpeaking(true);sp.setMouth({open:.5});sp.setListening(true);sp.beat();sp.setOptions({framing:'upper'});sp.resize();sp.pause();sp.resume();sp.advance(1);
      let bad=false;try{await sp.enter({})}catch(e){bad=String(e.message)}return {ok:true,enterNoVessel:bad}}catch(e){return String(e)}}""")
    res['probe'] = {}
    for fx in ('test_vrm1.vrm', 'test_vrm0.vrm', 'test_vrm1_sparse.vrm'):
        res['probe'][fx] = ev(pg, f"async()=>{{const b=await (await fetch('/fixtures/{fx}')).arrayBuffer();return await T.probeVessel(b)}}")
    res['probe']['garbage'] = ev(pg, "T.probeVessel(new Uint8Array(100).buffer)")
    # bad vessel -> enter rejects + error event
    res['bad_vessel'] = ev(pg, """async()=>{try{await T.space.enter({vessel:new Uint8Array(64).buffer});return 'resolved?!'}catch(e){return {rejected:String(e.message).slice(0,80),errEvent:T.events.some(x=>x[0]==='error')}}}""")
    res['errors_misc'] = [e for e in ev(pg, 'T.errors') if 'GLTFLoader' not in e]
    b.close()
    # framing portrait / landscape
    imgs = []
    for (w, h, fr) in ((360, 640, 'full'), (360, 640, 'upper'), (800, 360, 'full'), (800, 360, 'upper')):
        b, pg, logs = open_page(p, port, w, h)
        ev(pg, f"async()=>{{const sp=await T.start('/fixtures/test_vrm1.vrm',{{chop:'off',framing:'{fr}'}});sp.enter({{vessel:T.buf}});sp.pause()}}")
        pg.wait_for_function("T.events.some(e=>e[0]==='ready')"); ev(pg, "T.space.advance(4.5);T.space.poseNow('excited',1.0)"); 
        imgs.append(snap(pg).resize((w // 2 * 1, h // 2 * 1) if w < 500 else (w // 2, h // 2))); b.close()
    W = sum(i.size[0] for i in imgs); H = max(i.size[1] for i in imgs); sh = Image.new('RGB', (W, H)); x = 0
    for i in imgs: sh.paste(i, (x, 0)); x += i.size[0]
    sh.save(f'{SHOTS}/framing.png')
    return res

if __name__ == '__main__':
    srv, port = serve(); out = {}
    with sync_playwright() as p:
        for fx, full in (('test_vrm1.vrm', True), ('test_vrm0.vrm', False), ('test_vrm1_sparse.vrm', False)):
            out[fx] = run_fixture(p, port, fx, full)
        out['misc'] = run_misc(p, port)
    print(json.dumps(out, indent=1))
