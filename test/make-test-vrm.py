#!/usr/bin/env python3
"""Generate small humanoid test avatars as glTF binaries with VRM extensions (pure python, no deps).

  python3 make-test-vrm.py [outdir]    (default: /home/claude/work/fixtures)

Writes
  test_vrm1.vrm         VRMC_vrm 1.0, full humanoid (upperChest, toes, eyes, fingers), MToon materials,
                        morph targets happy/angry/sad/relaxed/surprised/aa/ih/ou/ee/oh/blink/blinkLeft/blinkRight,
                        spring-bone ponytail.  Faces +Z.
  test_vrm0.vrm         VRM 0.x ("VRM" extension, blendShapeMaster Joy/Angry/Sorrow/Fun/A/I/U/E/O/Blink...),
                        geometry authored facing -Z like real VRM0 files (exercises VRMUtils.rotateVRM0).
  test_vrm1_sparse.vrm  VRM 1.0 with only the REQUIRED bones (no upperChest/toes/eyes/fingers) and no
                        surprised/relaxed expressions (exercises the fallbacks).
Left/right are colour coded (left sleeve amber, right sleeve teal) so poses are legible.
"""
import json, math, struct, sys, os

OUT = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/work/fixtures'

# ---------------------------------------------------------------- skeleton
def build_skeleton(full=True):
    """returns ordered list of (name, parent, local_translation) in VRM1 space (faces +Z, left = +X)."""
    S = []
    def add(n, p, t): S.append((n, p, t))
    add('hips', None, (0, .85, 0))
    add('spine', 'hips', (0, .10, 0))
    if full:
        add('chest', 'spine', (0, .15, 0)); add('upperChest', 'chest', (0, .12, 0)); top = 'upperChest'; ty = .12
    else:
        add('chest', 'spine', (0, .27, 0)); top = 'chest'
    add('neck', top, (0, .12, 0))
    add('head', 'neck', (0, .08, 0))
    if full:
        add('leftEye', 'head', (.035, .115, .085)); add('rightEye', 'head', (-.035, .115, .085))
    # ponytail (spring) chain: not humanoid bones
    add('tail1', 'head', (0, .13, -.09)); add('tail2', 'tail1', (0, -.07, -.04)); add('tail3', 'tail2', (0, -.08, -.02))
    for side, sx in (('left', 1), ('right', -1)):
        add(side + 'Shoulder', top, (sx * .04, .08, 0))
        add(side + 'UpperArm', side + 'Shoulder', (sx * .10, 0, 0))
        add(side + 'LowerArm', side + 'UpperArm', (sx * .27, 0, 0))
        add(side + 'Hand', side + 'LowerArm', (sx * .25, 0, 0))
        if full:
            fl = {'Index': (.06, .032), 'Middle': (.07, .011), 'Ring': (.065, -.010), 'Little': (.055, -.030)}
            for f, (dx, dz) in fl.items():
                add(side + f + 'Proximal', side + 'Hand', (sx * dx, 0, dz))
                add(side + f + 'Intermediate', side + f + 'Proximal', (sx * .035, 0, 0))
                add(side + f + 'Distal', side + f + 'Intermediate', (sx * .024, 0, 0))
            add(side + 'ThumbMetacarpal', side + 'Hand', (sx * .02, -.008, .03))
            add(side + 'ThumbProximal', side + 'ThumbMetacarpal', (sx * .026, 0, .016))
            add(side + 'ThumbDistal', side + 'ThumbProximal', (sx * .024, 0, .012))
        add(side + 'UpperLeg', 'hips', (sx * .08, -.05, 0))
        add(side + 'LowerLeg', side + 'UpperLeg', (0, -.40, 0))
        add(side + 'Foot', side + 'LowerLeg', (0, -.36, 0))
        if full:
            add(side + 'Toes', side + 'Foot', (0, -.04, .11))
    return S

def world_positions(S):
    W = {}
    for n, p, t in S:
        W[n] = tuple(t) if p is None else tuple(W[p][i] + t[i] for i in range(3))
    return W

# ---------------------------------------------------------------- geometry builder
class Prim:
    def __init__(self, mat):
        self.mat = mat; self.pos = []; self.nrm = []; self.joint = []; self.tag = []; self.rel = []; self.idx = []
    def v(self, p, n, j, tag, rel):
        self.pos.append(p); self.nrm.append(n); self.joint.append(j); self.tag.append(tag); self.rel.append(rel)
        return len(self.pos) - 1

def norm(v):
    l = math.sqrt(sum(a * a for a in v)) or 1
    return tuple(a / l for a in v)
def cross(a, b): return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def sub(a, b): return tuple(x - y for x, y in zip(a, b))
def add3(a, b): return tuple(x + y for x, y in zip(a, b))
def mul(a, k): return tuple(x * k for x in a)

def add_box(pr, c, s, j, tag='', ):
    hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
    faces = [((1,0,0), (0,1,0), (0,0,1)), ((-1,0,0), (0,1,0), (0,0,-1)), ((0,1,0), (0,0,1), (1,0,0)),
             ((0,-1,0), (0,0,-1), (1,0,0)), ((0,0,1), (0,1,0), (-1,0,0)), ((0,0,-1), (0,1,0), (1,0,0))]
    for n, u, w in faces:
        # corners
        base = []
        for su, sw in ((-1,-1), (1,-1), (1,1), (-1,1)):
            off = tuple(n[i]*[hx,hy,hz][i] + u[i]*su*[hx,hy,hz][i] + w[i]*sw*[hx,hy,hz][i] for i in range(3))
            base.append(off)
        ids = [pr.v(add3(c, o), n, j, tag, o) for o in base]
        # ensure CCW as seen from outside
        a, b, d = (sub(base[1], base[0]), sub(base[2], base[0]), None)
        if sum(x*y for x, y in zip(cross(a, b), n)) > 0:
            pr.idx += [ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]]
        else:
            pr.idx += [ids[0], ids[2], ids[1], ids[0], ids[3], ids[2]]

def add_ellipsoid(pr, c, r, j, seg=14, rings=9, tag=''):
    base = len(pr.pos)
    for i in range(rings + 1):
        th = math.pi * i / rings
        for k in range(seg + 1):
            ph = 2 * math.pi * k / seg
            d = (math.sin(th) * math.cos(ph), math.cos(th), math.sin(th) * math.sin(ph))
            p = (c[0] + d[0]*r[0], c[1] + d[1]*r[1], c[2] + d[2]*r[2])
            n = norm((d[0]/r[0], d[1]/r[1], d[2]/r[2]))
            pr.v(p, n, j, tag, (d[0]*r[0], d[1]*r[1], d[2]*r[2]))
    for i in range(rings):
        for k in range(seg):
            a = base + i*(seg+1) + k; b = a + seg + 1
            pr.idx += [a, a+1, b, a+1, b+1, b]
    # fix winding: check first triangle normal against outward direction
    tri = pr.idx[-6:-3]
    p0, p1, p2 = (pr.pos[t] for t in tri)
    nn = cross(sub(p1, p0), sub(p2, p0)); mid = sub(p0, c)
    if sum(x*y for x, y in zip(nn, mid)) < 0:
        for q in range(len(pr.idx) - rings*seg*6, len(pr.idx), 3):
            pr.idx[q+1], pr.idx[q+2] = pr.idx[q+2], pr.idx[q+1]

def add_prism(pr, p0, p1, r0, r1, j, n=8, flat=1.0, tag=''):
    ax = norm(sub(p1, p0))
    ref = (1, 0, 0) if abs(ax[0]) < .9 else (0, 0, 1)
    u = norm(cross(ax, ref)); w = cross(ax, u)
    base = len(pr.pos)
    for ring, (p, r) in enumerate(((p0, r0), (p1, r1))):
        for k in range(n + 1):
            a = 2 * math.pi * k / n
            d = add3(mul(u, math.cos(a)), mul(w, math.sin(a) * flat))
            pr.v(add3(p, mul(d, r)), norm(d), j, tag, mul(d, r))
    for k in range(n):
        a = base + k; b = a + n + 1
        pr.idx += [a, b, a + 1, a + 1, b, b + 1]
    # winding check
    t = pr.idx[-6:-3]; q0, q1, q2 = (pr.pos[i] for i in t)
    nn = cross(sub(q1, q0), sub(q2, q0)); out = pr.nrm[t[0]]
    if sum(x*y for x, y in zip(nn, out)) < 0:
        for q in range(len(pr.idx) - n*6, len(pr.idx), 3):
            pr.idx[q+1], pr.idx[q+2] = pr.idx[q+2], pr.idx[q+1]
    # caps (fan)
    for p, r, sgn in ((p0, r0, -1), (p1, r1, 1)):
        ci = pr.v(p, mul(ax, sgn), j, tag, (0, 0, 0)); ring0 = len(pr.pos)
        for k in range(n + 1):
            a = 2 * math.pi * k / n
            d = add3(mul(u, math.cos(a)), mul(w, math.sin(a) * flat))
            pr.v(add3(p, mul(d, r)), mul(ax, sgn), j, tag, mul(d, r))
        for k in range(n):
            if sgn > 0: pr.idx += [ci, ring0 + k, ring0 + k + 1]
            else: pr.idx += [ci, ring0 + k + 1, ring0 + k]

# ---------------------------------------------------------------- the character
MATS = {  # name: (rgba, mtoon shade colour)
    'skin':  ((1.0, .80, .68, 1), (.86, .55, .50)),
    'shirt': ((.30, .52, .88, 1), (.14, .26, .55)),
    'sleeveL': ((1.0, .72, .10, 1), (.70, .40, .05)),
    'sleeveR': ((.10, .78, .70, 1), (.05, .45, .45)),
    'pants': ((.18, .24, .55, 1), (.08, .10, .30)),
    'shoes': ((.85, .12, .15, 1), (.40, .05, .10)),
    'hair':  ((.45, .22, .75, 1), (.22, .08, .45)),
    'face':  ((.10, .06, .14, 1), (.05, .03, .08)),
    'mouth': ((.80, .15, .25, 1), (.50, .08, .15)),
}
MORPH_ORDER = ['blink', 'blinkLeft', 'blinkRight', 'happy', 'angry', 'sad', 'relaxed', 'surprised', 'aa', 'ih', 'ou', 'ee', 'oh']

def build_body(S, W, full, J):
    prims = {}
    def P(m):
        if m not in prims: prims[m] = Prim(m)
        return prims[m]
    jx = lambda n: J[n]
    def seg(a, b, ra, rb, m, joint=None, n=8, flat=1.0):
        add_prism(P(m), W[a], W[b], ra, rb, jx(joint or a), n, flat)
    def ball(a, r, m, joint=None):
        add_ellipsoid(P(m), W[a], (r, r, r), jx(joint or a), 10, 7)
    # torso
    add_box(P('pants'), (0, .88, 0), (.30, .17, .18), jx('hips'))
    add_box(P('shirt'), (0, 1.00, 0), (.26, .16, .15), jx('spine'))
    if full:
        add_box(P('shirt'), (0, 1.14, 0), (.32, .16, .18), jx('chest'))
        add_box(P('shirt'), (0, 1.26, 0), (.35, .12, .17), jx('upperChest'))
    else:
        add_box(P('shirt'), (0, 1.17, 0), (.33, .24, .18), jx('chest'))
    seg('neck', 'head', .042, .042, 'skin')
    # head
    hc = (0, W['head'][1] + .11, 0)
    add_ellipsoid(P('skin'), hc, (.105, .125, .11), jx('head'), 18, 12)
    # hair cap (back and top), bangs, side locks
    add_ellipsoid(P('hair'), (0, hc[1] + .02, -.025), (.118, .125, .118), jx('head'), 18, 12)
    add_box(P('hair'), (0, hc[1] + .105, .075), (.20, .035, .06), jx('head'))
    add_box(P('hair'), (-.095, hc[1] - .01, .02), (.03, .13, .12), jx('head'))
    add_box(P('hair'), (.095, hc[1] - .01, .02), (.03, .13, .12), jx('head'))
    seg('tail1', 'tail2', .035, .03, 'hair'); seg('tail2', 'tail3', .03, .022, 'hair')
    ball('tail3', .025, 'hair')
    for s, sl in (('left', 'sleeveL'), ('right', 'sleeveR')):
        sg = 1 if s == 'left' else -1
        seg(s + 'UpperArm', s + 'LowerArm', .046, .038, sl)
        ball(s + 'UpperArm', .05, sl); ball(s + 'LowerArm', .04, 'skin')
        seg(s + 'LowerArm', s + 'Hand', .036, .028, 'skin')
        ball(s + 'Hand', .03, 'skin')
        hp = W[s + 'Hand']
        add_box(P('skin'), (hp[0] + sg * .035, hp[1], hp[2]), (.07, .018, .075), jx(s + 'Hand'))
        if full:
            for f in ('Index', 'Middle', 'Ring', 'Little'):
                seg(s + f + 'Proximal', s + f + 'Intermediate', .0085, .0078, 'skin', n=6)
                seg(s + f + 'Intermediate', s + f + 'Distal', .0078, .0072, 'skin', n=6)
                # distal tip: tiny segment to a virtual tip along parent direction
                a = W[s + f + 'Distal']; b = W[s + f + 'Intermediate']
                tip = add3(a, mul(sub(a, b), .8))
                add_prism(P('skin'), a, tip, .0072, .005, jx(s + f + 'Distal'), 6)
            seg(s + 'ThumbMetacarpal', s + 'ThumbProximal', .011, .010, 'skin', n=6)
            seg(s + 'ThumbProximal', s + 'ThumbDistal', .010, .009, 'skin', n=6)
            a = W[s + 'ThumbDistal']; b = W[s + 'ThumbProximal']
            add_prism(P('skin'), a, add3(a, mul(sub(a, b), .8)), .009, .006, jx(s + 'ThumbDistal'), 6)
        # legs
        seg(s + 'UpperLeg', s + 'LowerLeg', .065, .048, 'pants')
        ball(s + 'UpperLeg', .062, 'pants'); ball(s + 'LowerLeg', .047, 'pants')
        seg(s + 'LowerLeg', s + 'Foot', .047, .036, 'pants')
        ball(s + 'Foot', .037, 'shoes')
        fp = W[s + 'Foot']
        add_box(P('shoes'), (fp[0], .035, fp[2] + .05), (.09, .07, .22), jx(s + 'Foot'))
    return list(prims.values())

def build_face(S, W, J, variants):
    """returns (prims, targets) where prims share morph target indexing."""
    hc_y = W['head'][1] + .11
    jh = J['head']
    def zf(x, y):  # z on head ellipsoid surface
        v = 1 - (x / .105) ** 2 - (y / .125) ** 2
        return .11 * math.sqrt(max(v, .05)) + .004
    feat = Prim('face'); mouth = Prim('mouth')
    # eyes
    for nm, sx in (('eyeL', 1), ('eyeR', -1)):
        x, y = .04 * sx, .02
        add_box(feat, (x, hc_y + y, zf(x, y)), (.03, .042, .006), jh, nm)
    # brows
    for nm, sx in (('browL', 1), ('browR', -1)):
        x, y = .042 * sx, .062
        add_box(feat, (x, hc_y + y, zf(x, y) + .001), (.04, .008, .006), jh, nm)
    add_box(feat, (0, hc_y - .018, zf(0, -.018) + .012), (.014, .02, .02), jh, 'nose')
    my = -.058
    add_box(mouth, (0, hc_y + my, zf(0, my)), (.05, .010, .006), jh, 'mouth')
    centers = {}
    for pr in (feat, mouth):
        pass
    # morph deltas
    def eye_scale(sy, sx_=1.0, up=0.0):
        def f(tag, rel, pos):
            if tag.startswith('eye'): return (rel[0] * (sx_ - 1), rel[1] * (sy - 1) + up, 0)
        return f
    def combine(*fs):
        def f(tag, rel, pos):
            r = [0.0, 0.0, 0.0]
            for g in fs:
                d = g(tag, rel, pos)
                if d: r = [r[i] + d[i] for i in range(3)]
            return tuple(r)
        return f
    def mouth_f(sx, sy, dy=0.0):
        def f(tag, rel, pos):
            if tag == 'mouth': return (rel[0] * (sx - 1), rel[1] * (sy - 1) + dy, 0)
        return f
    def brow_f(inner, outer, up=0.0):
        def f(tag, rel, pos):
            if tag.startswith('brow'):
                sx = 1 if tag == 'browL' else -1
                # rel x>0 on L means outer side (further from the nose) when rel.x*sx > 0
                outerside = rel[0] * sx > 0
                return (0, (outer if outerside else inner) + up, 0)
        return f
    T = {}
    T['blink'] = eye_scale(.08)
    def one_eye(tagname, sy):
        def f(tag, rel, pos):
            if tag == tagname: return (0, rel[1] * (sy - 1), 0)
        return f
    T['blinkLeft'] = one_eye('eyeL', .08)
    T['blinkRight'] = one_eye('eyeR', .08)
    T['happy'] = combine(eye_scale(.35, 1.1, .004), mouth_f(1.5, 2.2, .003), brow_f(.004, .004, .004))
    T['angry'] = combine(eye_scale(.65), brow_f(-.016, .010, -.004), mouth_f(.7, .8, -.002))
    T['sad'] = combine(eye_scale(.8), brow_f(.014, -.010, .0), mouth_f(.65, .9, -.004))
    T['relaxed'] = combine(eye_scale(.45, 1.0, -.003), mouth_f(1.2, 1.5, 0))
    T['surprised'] = combine(eye_scale(1.35, 1.2), brow_f(.02, .02, .01), mouth_f(.6, 4.5, -.004))
    T['aa'] = mouth_f(.9, 5.0, -.004)
    T['ih'] = mouth_f(1.3, 1.6, 0)
    T['ou'] = mouth_f(.55, 3.0, 0)
    T['ee'] = mouth_f(1.45, 1.2, 0)
    T['oh'] = mouth_f(.75, 4.0, -.003)
    names = [n for n in MORPH_ORDER if n in variants]
    out = []
    for pr in (feat, mouth):
        tgs = []
        for n in names:
            tgs.append([tuple(T[n](pr.tag[i], pr.rel[i], pr.pos[i]) or (0, 0, 0)) for i in range(len(pr.pos))])
        out.append((pr, tgs))
    return out, names

# ---------------------------------------------------------------- glTF assembly
class Buf:
    def __init__(self): self.data = bytearray(); self.views = []; self.acc = []
    def view(self, raw, target=None):
        while len(self.data) % 4: self.data.append(0)
        off = len(self.data); self.data += raw
        v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(raw)}
        if target: v['target'] = target
        self.views.append(v); return len(self.views) - 1
    def accessor(self, raw, ctype, count, atype, target=None, minmax=None, norm_=False):
        bv = self.view(raw, target)
        a = {'bufferView': bv, 'componentType': ctype, 'count': count, 'type': atype}
        if minmax: a['min'], a['max'] = minmax
        if norm_: a['normalized'] = True
        self.acc.append(a); return len(self.acc) - 1

def flat(vs): return [c for v in vs for c in v]

def build(variant, path):
    full = variant != 'sparse'
    vrm0 = variant == 'vrm0'
    S = build_skeleton(full)
    W = world_positions(S)
    names = [n for n, _, _ in S]
    J = {n: i for i, n in enumerate(names)}   # joint index in skin == order in S (hips first)
    body = build_body(S, W, full, J)
    expr_names = [n for n in MORPH_ORDER if not (variant == 'sparse' and n in ('surprised', 'relaxed'))]
    face, mnames = build_face(S, W, J, expr_names)

    # to VRM0 space: rotate 180deg about Y
    def tr(p): return (-p[0], p[1], -p[2]) if vrm0 else p
    B = Buf()
    mesh_prims = []
    mats = []
    mat_index = {}
    def matid(name):
        if name not in mat_index:
            rgba, shade = MATS[name]
            m = {'name': name, 'pbrMetallicRoughness': {'baseColorFactor': list(rgba), 'metallicFactor': 0.0, 'roughnessFactor': .9}}
            if not vrm0:
                m['extensions'] = {'VRMC_materials_mtoon': {'specVersion': '1.0', 'shadeColorFactor': list(shade),
                                   'shadingShiftFactor': -.1, 'shadingToonyFactor': .9, 'giEqualizationFactor': .9,
                                   'rimLightingMixFactor': .2, 'parametricRimFresnelPowerFactor': 5.0,
                                   'parametricRimLiftFactor': 0.0, 'parametricRimColorFactor': [1, 1, 1],
                                   'outlineWidthMode': 'none'}}
            mats.append(m); mat_index[name] = len(mats) - 1
        return mat_index[name]
    def emit(pr, targets=None):
        n = len(pr.pos)
        pos = [tr(p) for p in pr.pos]
        mn = [min(p[i] for p in pos) for i in range(3)]; mx = [max(p[i] for p in pos) for i in range(3)]
        a_pos = B.accessor(struct.pack('<%df' % (n*3), *flat(pos)), 5126, n, 'VEC3', 34962, (mn, mx))
        a_nrm = B.accessor(struct.pack('<%df' % (n*3), *flat([tr(x) for x in pr.nrm])), 5126, n, 'VEC3', 34962)
        a_j = B.accessor(struct.pack('<%dH' % (n*4), *flat([(j, 0, 0, 0) for j in pr.joint])), 5123, n, 'VEC4', 34962)
        a_w = B.accessor(struct.pack('<%df' % (n*4), *([1.0, 0, 0, 0] * n)), 5126, n, 'VEC4', 34962)
        a_i = B.accessor(struct.pack('<%dI' % len(pr.idx), *pr.idx), 5125, len(pr.idx), 'SCALAR', 34963)
        prim = {'attributes': {'POSITION': a_pos, 'NORMAL': a_nrm, 'JOINTS_0': a_j, 'WEIGHTS_0': a_w}, 'indices': a_i,
                'material': matid(pr.mat), 'mode': 4}
        if targets:
            tl = []
            for t in targets:
                d = [tr(x) for x in t]
                mn_ = [min(p[i] for p in d) for i in range(3)]; mx_ = [max(p[i] for p in d) for i in range(3)]
                tl.append({'POSITION': B.accessor(struct.pack('<%df' % (n*3), *flat(d)), 5126, n, 'VEC3', 34962, (mn_, mx_))})
            prim['targets'] = tl
        return prim
    # fix left/right sleeve material usage already handled in build_body
    body_prims = [emit(p) for p in body]
    face_prims = [emit(p, t) for p, t in face]
    meshes = [{'name': 'Body', 'primitives': body_prims},
              {'name': 'Face', 'primitives': face_prims, 'extras': {'targetNames': mnames}}]
    meshes[1]['weights'] = [0.0] * len(mnames)

    # nodes
    nodes = []
    for n, p, t in S:
        nodes.append({'name': n, 'translation': list(tr(t)), 'children': []})
    for i, (n, p, t) in enumerate(S):
        if p is not None: nodes[J[p]]['children'].append(i)
    for nd in nodes:
        if not nd['children']: del nd['children']
    # inverse bind matrices: translation by -world position (column-major)
    ibm = []
    for n in names:
        wp = tr(W[n])
        ibm += [1,0,0,0, 0,1,0,0, 0,0,1,0, -wp[0], -wp[1], -wp[2], 1]
    a_ibm = B.accessor(struct.pack('<%df' % len(ibm), *ibm), 5126, len(names), 'MAT4')
    skin = {'joints': list(range(len(names))), 'inverseBindMatrices': a_ibm, 'skeleton': 0}
    nBody = len(nodes); nodes.append({'name': 'Body', 'mesh': 0, 'skin': 0})
    nFace = len(nodes); nodes.append({'name': 'Face', 'mesh': 1, 'skin': 0})
    root = len(nodes); nodes.append({'name': 'Root', 'children': [0, nBody, nFace]})

    hb_names = ['hips','spine','chest','neck','head','leftUpperArm','leftLowerArm','leftHand','rightUpperArm','rightLowerArm','rightHand',
                'leftUpperLeg','leftLowerLeg','leftFoot','rightUpperLeg','rightLowerLeg','rightFoot','leftShoulder','rightShoulder']
    if full:
        hb_names += ['upperChest', 'leftEye', 'rightEye', 'leftToes', 'rightToes']
        for s in ('left', 'right'):
            for f in ('Index', 'Middle', 'Ring', 'Little'):
                hb_names += [s + f + x for x in ('Proximal', 'Intermediate', 'Distal')]
            hb_names += [s + 'ThumbMetacarpal', s + 'ThumbProximal', s + 'ThumbDistal']

    gl = {'asset': {'version': '2.0', 'generator': 'CathedrAI make-test-vrm.py'},
          'scene': 0, 'scenes': [{'nodes': [root]}], 'nodes': nodes, 'meshes': meshes, 'skins': [skin],
          'materials': mats, 'accessors': B.acc, 'bufferViews': B.views, 'buffers': [{'byteLength': len(B.data)}]}

    if not vrm0:
        preset = {}
        for n in expr_names:
            preset[n] = {'morphTargetBinds': [{'node': nFace, 'index': mnames.index(n), 'weight': 1.0}]}
        if 'blink' in preset: preset['blink']['isBinary'] = False
        vrm = {'specVersion': '1.0',
               'meta': {'name': 'CathedrAI Test ' + variant, 'version': '1', 'authors': ['CathedrAI'],
                        'licenseUrl': 'https://vrm.dev/licenses/1.0/', 'avatarPermission': 'onlyAuthor',
                        'commercialUsage': 'personalNonProfit', 'creditNotation': 'unnecessary',
                        'allowRedistribution': 'prohibited', 'modification': 'prohibited'},
               'humanoid': {'humanBones': {b: {'node': J[b]} for b in hb_names}},
               'expressions': {'preset': preset}}
        if full:
            vrm['lookAt'] = {'type': 'bone', 'offsetFromHeadBone': [0, .11, .08],
                             'rangeMapHorizontalInner': {'inputMaxValue': 40, 'outputScale': 10},
                             'rangeMapHorizontalOuter': {'inputMaxValue': 40, 'outputScale': 10},
                             'rangeMapVerticalDown': {'inputMaxValue': 30, 'outputScale': 10},
                             'rangeMapVerticalUp': {'inputMaxValue': 30, 'outputScale': 10}}
        gl['extensions'] = {'VRMC_vrm': vrm,
            'VRMC_springBone': {'specVersion': '1.0', 'springs': [{'name': 'ponytail',
                'joints': [{'node': J[t], 'hitRadius': .02, 'stiffness': 1.2, 'gravityPower': .3, 'dragForce': .4, 'gravityDir': [0, -1, 0]}
                           for t in ('tail1', 'tail2', 'tail3')]}]}}
        # extensions on glTF root are per-spec under 'extensions'
        gl['extensionsUsed'] = ['VRMC_vrm', 'VRMC_springBone', 'VRMC_materials_mtoon']
    else:
        hum = [{'bone': b, 'node': J[b], 'useDefaultValues': True} for b in hb_names]
        pmap = {'happy': 'joy', 'angry': 'angry', 'sad': 'sorrow', 'relaxed': 'fun', 'aa': 'a', 'ih': 'i', 'ou': 'u', 'ee': 'e', 'oh': 'o',
                'blink': 'blink', 'blinkLeft': 'blink_l', 'blinkRight': 'blink_r'}
        gname = {'joy': 'Joy', 'angry': 'Angry', 'sorrow': 'Sorrow', 'fun': 'Fun', 'a': 'A', 'i': 'I', 'u': 'U', 'e': 'E', 'o': 'O',
                 'blink': 'Blink', 'blink_l': 'Blink_L', 'blink_r': 'Blink_R'}
        groups = []
        for n in expr_names:
            if n in pmap:
                pn = pmap[n]
                groups.append({'name': gname[pn], 'presetName': pn, 'isBinary': False,
                               'binds': [{'mesh': 1, 'index': mnames.index(n), 'weight': 100}], 'materialValues': []})
        # VRM0 has no 'surprised': we deliberately use the Joy-less 'neutral' only.
        groups.append({'name': 'Neutral', 'presetName': 'neutral', 'isBinary': False, 'binds': [], 'materialValues': []})
        gl['extensions'] = {'VRM': {
            'exporterVersion': 'CathedrAI-test', 'specVersion': '0.0',
            'meta': {'title': 'CathedrAI Test VRM0', 'version': '1', 'author': 'CathedrAI', 'allowedUserName': 'OnlyAuthor',
                     'violentUssageName': 'Disallow', 'sexualUssageName': 'Disallow', 'commercialUssageName': 'Disallow',
                     'licenseName': 'Redistribution_Prohibited'},
            'humanoid': {'humanBones': hum, 'armStretch': .05, 'legStretch': .05, 'upperArmTwist': .5, 'lowerArmTwist': .5,
                         'upperLegTwist': .5, 'lowerLegTwist': .5, 'feetSpacing': 0, 'hasTranslationDoF': False},
            'firstPerson': {'firstPersonBone': J['head'], 'firstPersonBoneOffset': {'x': 0, 'y': .06, 'z': 0}, 'meshAnnotations': [],
                            'lookAtTypeName': 'Bone',
                            'lookAtHorizontalInner': {'curve': [0,0,0,1,1,1,1,0], 'xRange': 90, 'yRange': 10},
                            'lookAtHorizontalOuter': {'curve': [0,0,0,1,1,1,1,0], 'xRange': 90, 'yRange': 10},
                            'lookAtVerticalDown': {'curve': [0,0,0,1,1,1,1,0], 'xRange': 90, 'yRange': 10},
                            'lookAtVerticalUp': {'curve': [0,0,0,1,1,1,1,0], 'xRange': 90, 'yRange': 10}},
            'blendShapeMaster': {'blendShapeGroups': groups},
            'secondaryAnimation': {'colliderGroups': [], 'boneGroups': [{'comment': 'ponytail', 'stiffiness': 1.2, 'gravityPower': .3,
                'gravityDir': {'x': 0, 'y': -1, 'z': 0}, 'dragForce': .4, 'center': -1, 'hitRadius': .02,
                'bones': [J['tail1']], 'colliderGroups': []}]},
            'materialProperties': [{'name': m['name'], 'shader': 'VRM_USE_GLTFSHADER', 'renderQueue': 2000, 'floatProperties': {},
                                    'vectorProperties': {}, 'textureProperties': {}, 'keywordMap': {}, 'tagMap': {}} for m in mats]}}
        gl['extensionsUsed'] = ['VRM']
    if not vrm0:
        gl['extensionsUsed'] = sorted(set(gl['extensionsUsed']))

    js = json.dumps(gl, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    bn = bytes(B.data)
    while len(bn) % 4: bn += b'\0'
    total = 12 + 8 + len(js) + 8 + len(bn)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(bn), 0x004E4942)); f.write(bn)
    print('wrote', path, total, 'bytes;', len(names), 'joints;', len(mnames), 'morphs')

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    build('vrm1', os.path.join(OUT, 'test_vrm1.vrm'))
    build('vrm0', os.path.join(OUT, 'test_vrm0.vrm'))
    build('sparse', os.path.join(OUT, 'test_vrm1_sparse.vrm'))
