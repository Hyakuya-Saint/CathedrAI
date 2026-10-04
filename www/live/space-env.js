// CathedrAI 3D Live Space - environment (grey neon horizon), lights, blob shadow, and the ink+halftone post pass.
// Everything is a handful of draw calls: one floor quad (grid in the fragment shader), one dome, one Points object, one shadow quad.

const NEON = { // from the user's 'Neon Cyber' preset
  amb: [0x302060, .4], key: [0xff2fd0, 1.6, [2.5, 2, 2]], rim: [0x1fe0ff, 2, [-2.5, 2, 1.5]],
  pA: [0xff2fd0, 6, [1.5, 1.2, 1.5]], pB: [0x1fe0ff, 6, [-1.5, 1.4, -1]],
};
const PLAIN = {
  amb: [0xffffff, .75], key: [0xffffff, 1.3, [1.5, 3, 2.5]], rim: [0xffffff, 1.0, [-2, 2.5, -3]],
  pA: [0xffffff, 0, [1.5, 1.2, 1.5]], pB: [0xffffff, 0, [-1.5, 1.4, -1]],
};
const GREY = { top: 0x1b1b20, bot: 0x2c2c32, glow: 0x6c6c78, floor: 0x0e0e11, pool: 0x1d1d23, line: 0x70707c, fog: 0x2c2c32 };

export function createEnv(THREE) {
  const scene = new THREE.Scene();
  const C = (h) => new THREE.Color(h);
  scene.background = C(GREY.bot);
  scene.fog = new THREE.Fog(GREY.fog, 7, 26);
  const disposables = [];
  const track = (o) => { disposables.push(o); return o; };

  // ---- dome: grey gradient + faint horizon glow line (follows the camera so it is "infinite")
  const dome = new THREE.Mesh(track(new THREE.SphereGeometry(40, 20, 12)), track(new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: C(GREY.top) }, bot: { value: C(GREY.bot) }, glow: { value: C(GREY.glow) }, uT: { value: 0 } },
    vertexShader: 'varying vec3 vP;void main(){vP=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform vec3 top,bot,glow;uniform float uT;varying vec3 vP;
void main(){float y=vP.y;float k=pow(clamp(y,0.,1.),.55);vec3 c=mix(bot,top,k);
float g=exp(-abs(y)*34.)*(.2+.03*sin(uT*.6));c+=glow*g;
gl_FragColor=vec4(c,1.);
#include <colorspace_fragment>
}` })));
  dome.renderOrder = -10; dome.frustumCulled = false; scene.add(dome);

  // ---- floor: opaque plane, procedural grid that fades into the horizon colour
  const floorMat = track(new THREE.ShaderMaterial({
    fog: false,
    uniforms: { base: { value: C(GREY.floor) }, pool: { value: C(GREY.pool) }, line: { value: C(GREY.line) }, hor: { value: C(GREY.bot) },
      uT: { value: 0 }, uRing: { value: 0 }, uRingR: { value: 0 } },
    vertexShader: 'varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader: `uniform vec3 base,pool,line,hor;uniform float uT,uRing,uRingR;varying vec3 vW;
float grid(vec2 p,float s,float w){vec2 q=p/s;vec2 g=abs(fract(q-.5)-.5)/max(fwidth(q),vec2(1e-4));return 1.-clamp(min(g.x,g.y)/w,0.,1.);}
void main(){vec2 p=vW.xz;float d=length(vW.xz-cameraPosition.xz);float r=length(p);
float fade=1.-smoothstep(4.,24.,d);
float minor=grid(p,.5,1.2),major=grid(p,2.5,1.6);
vec3 c=mix(base,pool,exp(-r*r*.35));
c=mix(c,line,(minor*.28+major*.5)*fade*(.85+.15*sin(uT*.8)));
float ring=exp(-pow((r-uRingR)*9.,2.))*uRing;c+=vec3(.5,.5,.58)*ring;
c=mix(c,hor,smoothstep(9.,34.,d));
gl_FragColor=vec4(c,1.);
#include <colorspace_fragment>
}` }));
  const floor = new THREE.Mesh(track(new THREE.PlaneGeometry(90, 90)), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.frustumCulled = false; scene.add(floor);

  // ---- blob shadow (no shadow maps)
  const shMat = track(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    uniforms: { uO: { value: .6 } },
    vertexShader: 'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform float uO;varying vec2 vU;void main(){float a=(1.-smoothstep(.05,.5,length(vU-.5)))*uO;gl_FragColor=vec4(0.,0.,0.,a);}' }));
  const shadow = new THREE.Mesh(track(new THREE.PlaneGeometry(1, 1)), shMat);
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .004; shadow.renderOrder = 1; shadow.frustumCulled = false; scene.add(shadow);

  // ---- particles (animated entirely in the vertex shader)
  const N = 90, pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = Math.random() * 6.283, r = 1.3 + Math.random() * 4.5;
    pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.random() * 4; pos[i * 3 + 2] = Math.sin(a) * r - 1; seed[i] = Math.random();
  }
  const pg = track(new THREE.BufferGeometry());
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pg.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const pMat = track(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, uniforms: { uT: { value: 0 }, uS: { value: 1 } },
    vertexShader: `attribute float seed;uniform float uT,uS;varying float vA;void main(){vec3 p=position;p.y=mod(p.y+uT*(.05+.07*seed),4.);
p.x+=sin(uT*.25+seed*6.28)*.18;vec4 mv=modelViewMatrix*vec4(p,1.);vA=smoothstep(0.,.6,p.y)*(1.-smoothstep(3.2,4.,p.y))*(.3+.5*seed);
gl_PointSize=clamp((.9+2.*seed)*uS*6./-mv.z,1.,6.);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: 'varying float vA;void main(){float d=length(gl_PointCoord-.5);float a=(1.-smoothstep(.15,.5,d))*vA*.5;gl_FragColor=vec4(vec3(.62,.62,.7)*a,a);}' }));
  const pts = new THREE.Points(pg, pMat); pts.frustumCulled = false; scene.add(pts);

  // ---- lights
  const amb = new THREE.AmbientLight(), key = new THREE.DirectionalLight(), rim = new THREE.DirectionalLight(),
    pA = new THREE.PointLight(), pB = new THREE.PointLight();
  scene.add(amb, key, rim, pA, pB);
  function setNeon(on) {
    const L = on ? NEON : PLAIN;
    amb.color.set(L.amb[0]); amb.intensity = L.amb[1];
    for (const [o, k] of [[key, 'key'], [rim, 'rim']]) { o.color.set(L[k][0]); o.intensity = L[k][1]; o.position.set(...L[k][2]); }
    for (const [o, k] of [[pA, 'pA'], [pB, 'pB']]) { o.color.set(L[k][0]); o.intensity = L[k][1]; o.position.set(...L[k][2]); o.distance = 6; }
  }
  setNeon(true);

  return {
    scene, dome, floor, shadow, pts, lights: { amb, key, rim, pA, pB }, setNeon,
    setParticles(scale) { pMat.uniforms.uS.value = scale; pts.visible = scale > 0; },
    ring(on, r, k) { floorMat.uniforms.uRing.value = on ? k : 0; floorMat.uniforms.uRingR.value = r; },
    setShadow(x, z, size, o) { shadow.position.x = x; shadow.position.z = z; shadow.scale.set(size, size, 1); shMat.uniforms.uO.value = o; shadow.visible = o > .01; },
    update(t, cam) {
      dome.position.copy(cam.position); dome.material.uniforms.uT.value = t; floorMat.uniforms.uT.value = t; pMat.uniforms.uT.value = t;
    },
    dispose() {
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      disposables.forEach((d) => d.dispose && d.dispose());
      scene.clear();
    },
  };
}

// ---------------------------------------------------------------- post: posterized light, halftone shadows, vignette, optional ink lines, misregistration
export function createPost(THREE, renderer) {
  const gl = renderer.getContext();
  const floatOK = renderer.capabilities.isWebGL2 && (renderer.extensions.has('EXT_color_buffer_half_float') || renderer.extensions.has('EXT_color_buffer_float'));
  const rt = new THREE.WebGLRenderTarget(4, 4, floatOK ? { type: THREE.HalfFloatType, depthBuffer: true } : { type: THREE.UnsignedByteType, depthBuffer: true });
  if (!floatOK) rt.texture.colorSpace = THREE.SRGBColorSpace;
  rt.texture.minFilter = rt.texture.magFilter = THREE.LinearFilter;
  const mat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: { tD: { value: rt.texture }, px: { value: new THREE.Vector2(1, 1) }, edge: { value: 0 }, ht: { value: 1 }, ink: { value: 1 }, sh: { value: 0 }, uP: { value: 1 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: `varying vec2 vUv;uniform sampler2D tD;uniform vec2 px;uniform float edge,ht,ink,sh,uP;
float L(vec3 c){return dot(c,vec3(.299,.587,.114));}
void main(){vec3 c=vec3(texture2D(tD,vUv+px*sh).r,texture2D(tD,vUv).g,texture2D(tD,vUv-px*sh).b);float l=L(c);
float inkLine=0.;
if(edge>0.){float a=L(texture2D(tD,vUv+vec2(px.x,0.)).rgb),b=L(texture2D(tD,vUv-vec2(px.x,0.)).rgb),d=L(texture2D(tD,vUv+vec2(0.,px.y)).rgb),e=L(texture2D(tD,vUv-vec2(0.,px.y)).rgb);
inkLine=smoothstep(.06,.18,abs(a-b)+abs(d-e))*edge;}
float q=floor(l*6.+.5)/6.;c*=mix(1.,(q+.03)/(l+.03),.55*ink);c=mix(vec3(L(c)),c,1.+.3*ink);
float dd=length(fract(mat2(.707,-.707,.707,.707)*gl_FragCoord.xy/(5.*uP))-.5),rad=(1.-l)*.55;
c*=1.-.3*ht*(1.-smoothstep(rad-.06,rad+.06,dd))*smoothstep(.6,.15,l);
c*=1.-.35*ink*pow(length(vUv-.5)*1.3,2.);c=mix(c,vec3(.03,.01,.08),inkLine*.85);
gl_FragColor=vec4(c,1.);
#include <colorspace_fragment>
}` });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
  const quad = new THREE.Mesh(geo, mat); quad.frustumCulled = false;
  const qs = new THREE.Scene(); qs.add(quad);
  const qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const bs = new THREE.Vector2();
  return {
    uniforms: mat.uniforms,
    resize() { renderer.getDrawingBufferSize(bs); rt.setSize(bs.x, bs.y); mat.uniforms.px.value.set(1 / bs.x, 1 / bs.y); mat.uniforms.uP.value = Math.max(.75, renderer.getPixelRatio() / 1.25) ; },
    render(scene, cam) {
      renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(null); renderer.render(qs, qc);
    },
    dispose() { rt.dispose(); mat.dispose(); geo.dispose(); },
  };
}
