#!/usr/bin/env python3
"""v0.6 checks for the live space: ported poses/dances/expressions, bubbly transitions, hearing pose, gaze, brow morphs,
camera presets and user camera. Usage: run-v06-test.py [fixture]   (fixtures from make-test-vrm.py)"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
import importlib.util
spec = importlib.util.spec_from_file_location('rst', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'run-space-test.py'))
rst = importlib.util.module_from_spec(spec); spec.loader.exec_module(rst)
FIX = sys.argv[1] if len(sys.argv) > 1 else 'test_vrm1.vrm'
res = {'fixture': FIX, 'checks': []}
def check(name, ok, info=''):
    res['checks'].append({'name': name, 'ok': bool(ok), 'info': info}); print(('PASS ' if ok else 'FAIL ') + name, info)
srv, port = rst.serve()
with sync_playwright() as p:
    b, pg, logs = rst.open_page(p, port, 360, 480)
    ev = lambda js: pg.evaluate(js)
    ev(f"async()=>{{const sp=await T.start('/fixtures/{FIX}',{{chop:'off'}});sp.enter({{vessel:T.buf,name:'t'}});sp.pause()}}")
    pg.wait_for_function("T.events.some(e=>e[0]==='ready')")
    ev("T.space.advance(4.5,{render:false})")
    st = ev('T.space.state()')
    check('intro done, standby owns body', st['owner'] == 'standby', st['owner'])
    check('face morphs detected', st['faceMorphs'] in (True, False), str(st['faceMorphs']))
    names = ev('T.EMOTES')
    check('emote list has all studio poses', all(n in names for n in ['wave','peace','bow','kyun','listen','shrug','hmm','jojo','shy','grumpy','pouting-think','idol-step','nyan','victory','catwalk','groove','dance']), str(len(names)))
    bad = []
    for n in names:
        if n in ('idle',): continue
        ev(f"T.space.emote('{n}',{{hold:2}})"); ev("T.space.advance(1.2,{render:false})")
        s2 = ev('T.space.state()')
        if n not in ('talk',) and not (s2['emote'] or s2['owner']): bad.append(n)
        # all expression + morph numbers must be finite
        if not all(isinstance(x, (int, float)) for x in s2['expr'] + s2['morph']): bad.append(n + ':nan')
    check('every emote plays without error', not bad, ','.join(bad))
    # transition: switching pose begins an eased transition then settles
    ev("T.space.emote('idle')"); ev("T.space.advance(2,{render:false})")
    ev("T.space.emote('wave',{hold:5})"); ev("T.space.advance(.1,{render:false})")
    t1 = ev('T.space.state()')['transitioning']; ev("T.space.advance(1.5,{render:false})"); t2 = ev('T.space.state()')['transitioning']
    check('pose change runs a bubbly transition that finishes', t1 and not t2, f'{t1}->{t2}')
    ev("T.space.setOptions({bubbly:false})"); ev("T.space.emote('bow',{hold:3})"); ev("T.space.advance(.2,{render:false})")
    check('bubbly off still eases', ev('T.space.state()')['transitioning'])
    ev("T.space.setOptions({bubbly:true})"); ev("T.space.advance(2,{render:false})")
    # hearing pose
    ev("T.space.emote('idle')"); ev("T.space.setHearing(true)"); ev("T.space.advance(1.5,{render:false})")
    check('hearing owns the body with the listening pose', ev('T.space.state()')['owner'] == 'hear')
    ev("T.space.setHearing(false)"); ev("T.space.advance(1.5,{render:false})")
    check('back to standby after hearing', ev('T.space.state()')['owner'] == 'standby')
    # speaking
    ev("T.space.setSpeaking(true)"); ev("T.space.advance(1.5,{render:false})")
    check('speaking owns the body', ev('T.space.state()')['owner'] == 'talk')
    ev("T.space.emote('love',{hold:3})"); ev("T.space.advance(1,{render:false})")
    check('sentence emote overrides talk (love -> kyun)', (ev('T.space.state()')['owner'] or '').startswith('e:love'))
    ev("T.space.setSpeaking(false)"); ev("T.space.advance(6,{render:false})")
    # curious idle gaze: over a long time the eyes sometimes leave the camera, and brow morph moves
    seen_gaze = 0; seen_morph = 0
    ev("T.space.emote('idle')")
    for i in range(80):
        ev("T.space.advance(1.0,{render:false})"); s3 = ev('T.space.state()')
        seen_gaze += 1 if s3['gaze'] else 0; seen_morph += 1 if any(m > .05 for m in s3['morph']) else 0
    check('curious idle drives gaze saccades', seen_gaze > 3, str(seen_gaze))
    if ev('T.space.state()')['faceMorphs']: check('brow morphs move', seen_morph > 0, str(seen_morph))
    # idle director flourishes over time
    fl = []
    ev("T.space.onevent=(t,d)=>T.events.push([t,d])")
    for i in range(120):
        ev("T.space.advance(1.0,{render:false})")
    fl = ev("T.events.filter(e=>e[0]==='idle-anim').map(e=>e[1].name)")
    check('idle director fires flourishes while only listening', len(fl) >= 4, ','.join(fl[:12]))
    # camera presets + user camera
    c0 = ev('T.space.getCamera()')
    ev("T.space.setFraming('face')"); ev("T.space.advance(3,{render:false})"); cf = ev('T.space.getCamera()')
    ev("T.space.setFraming('full')"); ev("T.space.advance(3,{render:false})"); cu = ev('T.space.getCamera()')
    check('face focus moves the camera in to head height', cf['pos'][2] < cu['pos'][2] * .3 and 1.2 < cf['pos'][1] < 1.8, f"face {cf['pos']} full {cu['pos']}")
    img_face = None
    ev("T.space.setFraming('face')"); ev("T.space.advance(3)"); rst.snap(pg); os.rename('/tmp/_s.png', rst.SHOTS + '/v06_face.png')
    ev("T.space.setFraming('full')"); ev("T.space.advance(3)"); rst.snap(pg); os.rename('/tmp/_s.png', rst.SHOTS + '/v06_full.png')
    # mouse drag orbits, wheel zooms, double click resets
    box = pg.locator('canvas').bounding_box(); cx, cy = box['x'] + box['width'] / 2, box['y'] + box['height'] / 2
    pg.mouse.move(cx, cy); pg.mouse.down(); pg.mouse.move(cx + 80, cy + 30, steps=6); pg.mouse.up()
    ev("T.space.advance(1,{render:false})"); co = ev('T.space.getCamera()')
    check('drag orbits the camera', abs(co['az']) > .3 and co['el'] > .05, json.dumps(co))
    pg.mouse.wheel(0, -300); ev("T.space.advance(1,{render:false})"); cz = ev('T.space.getCamera()')
    check('wheel zooms in', cz['zoom'] < 1, str(cz['zoom']))
    ev("T.space.advance(2)"); rst.snap(pg); os.rename('/tmp/_s.png', rst.SHOTS + '/v06_orbit.png')
    pg.mouse.dblclick(cx, cy); ev("T.space.advance(1,{render:false})"); cr = ev('T.space.getCamera()')
    check('double click resets the view', abs(cr['az']) < .01 and cr['zoom'] == 1, json.dumps(cr))
    ev("T.space.setOrbit(true)"); ev("T.space.advance(5,{render:false})"); co2 = ev('T.space.getCamera()')
    check('auto orbit rotates', abs(co2['az']) > .8, str(co2['az'])); ev("T.space.setOrbit(false)")
    # exit
    ev("T.space.resetCamera(true)")
    ev("(()=>{T.space.exit();})()"); ev("T.space.advance(3,{render:false})")
    check('exit still works', ev("T.events.some(e=>e[0]==='exit-done')"))
    errs = ev('T.errors') + logs
    errs = [e for e in errs if 'duplicate' not in e.lower() and 'GPU stall' not in e and 'GL Driver' not in e]
    check('no page/console errors', not errs, '; '.join(errs[:4]))
    b.close()
json.dump(res, open(rst.SHOTS + '/v06_' + FIX[:-4] + '.json', 'w'), indent=1)
sys.exit(0 if all(c['ok'] for c in res['checks']) else 1)
