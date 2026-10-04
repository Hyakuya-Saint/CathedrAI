#!/usr/bin/env python3
"""v0.6.2 checks: Energetic Wave in the intro / idle, no stutter while speaking (continuity, smooth timing, soft transitions),
expression cross-fade between moods, adaptive quality. Usage: run-smooth-test.py [fixture]"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
import importlib.util
spec = importlib.util.spec_from_file_location('rst', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'run-space-test.py'))
rst = importlib.util.module_from_spec(spec); spec.loader.exec_module(rst)
FIX = sys.argv[1] if len(sys.argv) > 1 else 'test_vrm1.vrm'
fails = 0
def check(name, ok, info=''):
    global fails; fails += (not ok); print(('PASS ' if ok else 'FAIL ') + name, info)
def ang(a, b):  # angle between two quaternions
    d = abs(sum(x * y for x, y in zip(a, b))); return 2 * math.acos(min(1, d))
srv, port = rst.serve()
with sync_playwright() as p:
    b, pg, logs = rst.open_page(p, port, 360, 480)
    ev = lambda js: pg.evaluate(js)
    def start(opts="{chop:'off'}", pause=True):
        ev(f"async()=>{{const sp=await T.start('/fixtures/{FIX}',{opts});sp.enter({{vessel:T.buf,name:'t'}});{'sp.pause()' if pause else ''}}}")
        pg.wait_for_function("T.events.some(e=>e[0]==='ready')")
    # ---- 1. intro greeting wave == studio Energetic Wave
    start()
    ev("T.space.advance(2.4,{render:false})")
    intro = {n: ev(f"T.space.boneQuat('{n}')") for n in ['rightUpperArm', 'rightLowerArm', 'rightHand']}
    st = ev('T.space.state()'); check('greeting runs inside the intro', st['seq'] == 'intro', str(st['seq']))
    ev("T.space.advance(3,{render:false})")   # finish intro
    ev("T.space.emote('idle')"); ev("T.space.advance(1,{render:false})")
    ev("T.space.emote('wave',{hold:10})"); ev("T.space.advance(1.2,{render:false})")
    wave = {n: ev(f"T.space.boneQuat('{n}')") for n in intro}
    d = {n: round(ang(intro[n], wave[n]), 3) for n in intro}
    check('intro wave = studio Energetic Wave (same bone angles)', all(v < .25 for v in d.values()), str(d))
    # the old greeting held the arm straight out to the side (upperArm z +1.3); the studio wave has the elbow forward/up (x -1.5)
    # ---- 2. idle small-wave also plays the studio wave
    ev("T.space.emote('idle')"); ev("T.space.advance(2,{render:false})")
    rest = ev("T.space.boneQuat('rightLowerArm')")
    ev("T.space.triggerIdle('small-wave')"); ev("T.space.advance(1.6,{render:false})")
    mid = ev("T.space.boneQuat('rightLowerArm')")
    ev("T.space.advance(.2,{render:false})"); mid2 = ev("T.space.boneQuat('rightLowerArm')")
    check('idle small-wave raises and waves the arm', ang(rest, mid) > .3 and ang(mid, mid2) > .02, f'{ang(rest, mid):.2f} / {ang(mid, mid2):.3f}')
    ev("T.space.advance(5,{render:false})"); st = ev('T.space.state()'); check('idle wave ends cleanly', st['idle'] is None)
    # ---- 3. smooth timing while speaking even with chop on
    ev("T.space.setOptions({chop:'mixed',smoothAction:true})"); ev("T.space.emote('idle')"); ev("T.space.advance(2,{render:false})")
    c0 = ev('T.space.state()')['poseCount']; ev("T.space.advance(2,{render:false})"); idle_n = ev('T.space.state()')['poseCount'] - c0
    ev("T.space.setSpeaking(true)"); ev("T.space.emote('happy',{hold:2})"); ev("T.space.advance(1,{render:false})")
    c0 = ev('T.space.state()')['poseCount']; ev("T.space.advance(2,{render:false})"); talk_n = ev('T.space.state()')['poseCount'] - c0
    check('ambient idle stays chopped, speaking/acting is smooth (a pose every frame)', idle_n < 45 and talk_n == 60, f'idle {idle_n}/60, talking {talk_n}/60')
    ev("T.space.setOptions({smoothAction:false})"); c0 = ev('T.space.state()')['poseCount']; ev("T.space.advance(2,{render:false})"); off_n = ev('T.space.state()')['poseCount'] - c0
    check('smoothAction off restores chop while speaking', off_n < 55, f'{off_n}/60'); ev("T.space.setOptions({smoothAction:true})")
    # ---- 4. same mood on the next sentence: continues, no restart, no transition
    ev("T.space.setSpeaking(true)"); ev("T.space.emote('happy',{hold:2})"); ev("T.space.advance(1.7,{render:false})")
    owner = ev('T.space.state()')['owner']; ev("T.space.emote('happy',{hold:2.4})"); ev("T.space.advance(.2,{render:false})")
    st = ev('T.space.state()'); check('same mood again keeps running (no restart / transition)', st['owner'] == owner and not st['transitioning'], f"{owner} -> {st['owner']}")
    # ---- 5. mood survives the gap between sentences while speaking, then lets go
    ev("T.space.emote('sad',{hold:1})"); ev("T.space.advance(2.4,{render:false})"); a = ev('T.space.state()')['emote']
    ev("T.space.advance(2,{render:false})"); bb = ev('T.space.state()')['emote']
    check('sentence mood bridges the gap, then expires', a == 'sad' and bb is None, f'{a} / {bb}')
    # ---- 6. transitions while speaking are soft (no freeze / overshoot / squash)
    ev("T.space.emote('happy',{hold:3})"); ev("T.space.advance(.2,{render:false})"); ev("T.space.emote('angry',{hold:3})"); ev("T.space.advance(.1,{render:false})")
    st = ev('T.space.state()'); check('transition while speaking is soft', st['transitioning'] and st['soft'], f"{st['transitioning']} {st['soft']}")
    ev("T.space.advance(1,{render:false})"); sc = pg.evaluate("1")  # settle
    # ---- 7. expression cross-fade sad -> happy
    ev("T.space.setSpeaking(false)"); ev("T.space.emote('idle')"); ev("T.space.advance(3,{render:false})")
    ev("T.space.emote('sad',{hold:30})"); ev("T.space.advance(3,{render:false})"); s1 = ev('T.space.state()'); names = s1['exprNames']
    iH, iS = 0, 2
    sad_full = s1['expr'][iS]
    ev("T.space.emote('happy',{hold:30})"); ev("T.space.advance(.3,{render:false})"); s2 = ev('T.space.state()')
    ev("T.space.advance(.5,{render:false})"); s3 = ev('T.space.state()'); ev("T.space.advance(3,{render:false})"); s4 = ev('T.space.state()')
    print('   sad:', [s1['expr'][iS], s2['expr'][iS], s3['expr'][iS], s4['expr'][iS]], ' happy:', [s1['expr'][iH], s2['expr'][iH], s3['expr'][iH], s4['expr'][iH]])
    hf = s4['expr'][iH]
    check('sad is showing before the switch', sad_full > .5 and 'sad' in names, f'{sad_full}')
    check('0.3 s after sad->happy: happy only part-way, sad still fading (not an instant jump)', s2['expr'][iH] < .5 * hf and s2['expr'][iS] > .5 * sad_full, f"happy {s2['expr'][iH]}/{hf}, sad {s2['expr'][iS]}")
    check('settles to happy, sad gone', hf > .6 and s4['expr'][iS] < .08, f"happy {hf}, sad {s4['expr'][iS]}")
    check('no overshoot above 1 during the blend', max(s[x] for s in (s2, s3, s4) for x in ['expr'] for _ in [0]) is not None and all(v <= 1.0001 for s in (s1, s2, s3, s4) for v in s['expr']))
    check('no page errors', not [l for l in logs if 'PAGEERROR' in l or l.startswith('error')], str(logs[:3]))
    b.close()
    # ---- 8. adaptive quality (software GL is slow enough to trigger it) and opt-out
    b, pg, logs = rst.open_page(p, port, 360, 480); ev = lambda js: pg.evaluate(js)
    start("{chop:'off',fps:60,adaptive:true}", pause=False)
    pg.wait_for_timeout(14000)
    qs = ev("T.events.filter(e=>e[0]==='quality').map(e=>e[1])"); st = ev('T.space.state()')
    check('slow device: render scale / fps cap steps down on its own', len(qs) > 0 and (st['pr'] < 1 or st['fpsCap'] == 30), f"events {qs[:3]} pr {st['pr']} cap {st['fpsCap']}")
    check('never below the floor', st['pr'] >= .5, str(st['pr']))
    b.close()
    b, pg, logs = rst.open_page(p, port, 360, 480); ev = lambda js: pg.evaluate(js)
    start("{chop:'off',fps:60,adaptive:false}", pause=False); pg.wait_for_timeout(9000)
    check('adaptive:false never changes quality', not ev("T.events.some(e=>e[0]==='quality')"))
    b.close()
print('FAILED' if fails else 'ALL PASSED'); sys.exit(1 if fails else 0)
