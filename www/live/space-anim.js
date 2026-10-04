// CathedrAI 3D Live Space - animation set ported from the user's "VRoid Anime Studio" page (index.html).
// The dance / pose / curious-idle DATA below is copied verbatim from that page (same bone keys, same numbers), so it
// plays here exactly as it does there. Only the adapter at the bottom is new: it writes a pose spec through the
// writer API (S) that space.js hands to the pose library.
//   spec keys:  'L.upperArm' / 'R.x' / 'B.x' / 'head'... = [x,y,z] bone eulers   hipsPos = [x,y,z] metres
//               f / fB / fL / fR / _fL / _fR = finger preset name or [index,middle,ring,little,thumb] curl
//               _e = VRM expression weights   _m = raw face morphs (brows, eye-widen)   _eye = [yaw,pitch] saccade in head space
//               _gz = [yaw,pitch] gaze direction in the world   _bi = blink id (a new id triggers one blink)
const FING_PRESETS = { // curl 0..1 for index,middle,ring,little,thumb
  'V-Sign':[0,0,1,1,.7],'Cat Claws':[.45,.45,.45,.45,.3],'Clenched Fists':[1,1,1,1,.8],'Heart Hand':[.55,.55,.8,.8,.35],'Open Wave':[0,0,0,0,0],'Soft Wave':[.1,.16,.24,.32,.2],'Cupped Ear':[.22,.28,.34,.4,.15],'Open Palm':[.12,.16,.22,.3,.1],'Chin Rest':[.12,.72,.85,.9,.45]};
export { FING_PRESETS };

/* ---------------------------------------------------------------- ported verbatim from index.html */
/* ---------- curious idle: a seeded "attention script" (non-repeating for ~7 min), not a loop of poses.
   Each episode follows how people actually investigate something: eyes saccade -> blink -> head follows (~.1-.2s lag) -> neck/torso lag further ->
   fixate (micro-saccades + drift) -> lean in, curious head tilt, brows up, nearer hand drifts to chest -> glance back at the viewer -> settle.
   Moves are minimum-jerk (smooth start/stop, no overshoot) and every gaze shift has its own duration. Saint's lookAt eye range is only ~8-12deg,
   so head/neck/torso carry the motion and the eyes are driven in head-space for the quick saccades. ---------- */
const mj=x=>{x=Math.min(1,Math.max(0,x));return x*x*x*(x*(6*x-15)+10)},hs=k=>{const q=Math.sin(k*127.1+311.7)*43758.5453;return q-Math.floor(q)};
const CH={cm:[{t:-9,v:1,d:.01}]},CI={len:0,bl:[]};
function mv(c,t,v,d){const a=CH[c]??=[{t:-9,v:0,d:.01}],L=a[a.length-1];a.push({t:Math.max(t,L.t+L.d),v,d})}
function chv(c,t){const a=CH[c];let lo=0,hi=a.length-1;while(lo<hi){const m=(lo+hi+1)>>1;a[m].t<=t?lo=m:hi=m-1}const k=a[lo];return lo?a[lo-1].v+(k.v-a[lo-1].v)*mj((t-k.t)/k.d):k.v}
(()=>{let q=0x5A17;const R=()=>{q=q+0x6D2B79F5|0;let x=Math.imul(q^q>>>15,1|q);x=x+Math.imul(x^x>>>7,61|x)^x;return((x^x>>>14)>>>0)/4294967296},u=(a,b)=>a+R()*(b-a);
 let t=1.5,gY=0,gP=0,side=1;
 const gaze=(t0,Y,P)=>{const a=Math.hypot(Y-gY,P-gP),lag=u(.09,.17),dh=.32+.5*a,de=u(.07,.11);
  mv('gy',t0,Y,de);mv('gp',t0,P,de);mv('hy',t0+lag,Y,dh);mv('hp',t0+lag,P,dh*1.1);mv('ty',t0+lag+u(.12,.25),Y,dh*1.7);
  if(a>.45)CI.bl.push(t0+lag+dh*.35);gY=Y;gP=P;return t0+lag+dh};
 while(t<400){side=R()<.7?-side:side;const Y=side*u(.3,.8),P=u(-.3,.45),insp=R()<.6;
  mv('cm',t-.02,0,.01);mv('sd',t,side,.6);
  const tN=gaze(t,Y,P);mv('br',t+.08,u(.4,.85),.3);mv('bh',t,1,.35);mv('bh',t+.5,0,.9);let tE=tN+u(.8,1.7);
  if(insp){mv('ln',tN+.15,u(.5,1),u(.9,1.4));mv('hr',tN+.2,-side*u(.12,.25),u(.6,.9));mv('ar',tN+.4,u(.3,.6),u(.9,1.3));tE+=u(.8,1.4)}
  if(R()<.45)gaze(tN+(tE-tN)*.55,Y+u(-.25,.25),P+u(-.2,.2));
  const tR=gaze(tE,u(-.08,.08),u(0,.12));mv('cm',tR,1,.01);mv('ln',tE+.2,0,u(1,1.5));mv('hr',tE+.2,0,.9);mv('ar',tE+.35,0,1.3);mv('br',tE+.3,0,.9);
  if(R()<.5){mv('sm',tR+.2,u(.4,1),.5);mv('sm',tR+1.6,0,1.2)}
  t=tR+u(1,2.6)}
 for(const c in CH)if(c!=='cm')mv(c,t+.5,0,1.5);CI.len=t+4;CI.bl.sort((a,b)=>a-b)})();
function blinkId(t){const c=Math.floor(t/CI.len),T=t-c*CI.len;let i=0;while(i<CI.bl.length&&CI.bl[i]<=T)i++;return c*1000+i}
function curiousIdle(t){const T=t%CI.len,V=c=>chv(c,T),nz=(f,p)=>(Math.sin(t*f+p)+.6*Math.sin(t*f*2.37+p*1.7))/1.6,
 hy=V('hy'),hp=V('hp'),ty=V('ty'),ln=V('ln'),hr=V('hr'),ar=V('ar'),br=V('br'),sm=V('sm'),bh=V('bh'),sd=V('sd'),
 k=Math.floor(t*2.3),j=mj(((t*2.3)%1)/.12),jx=(hs(k-1)+(hs(k)-hs(k-1))*j-.5)*.07,jy=(hs(k+49)+(hs(k+50)-hs(k+49))*j-.5)*.05, // micro-saccades
 ey=V('gy')-(.66*hy+.29*ty)+jx,ep=V('gp')-.6*hp+jy,E=Math.PI/2*.97, // eye = where it looks minus where the head already points -> eyes lead, then settle
 dY=.014*nz(.55,1),dP=.01*nz(.43,2),dR=.016*nz(.31,3),b=Math.sin(t*1.5)*(.9+.1*Math.sin(t*.31)),ws=.7*Math.sin(t*.45)+.4*Math.sin(t*.19+1),
 aL=ar*(.7+.3*sd),aR=ar*(.7-.3*sd);
 return{f:'Soft Wave',hipsPos:[ws*.012,-ln*.008,ln*.025],hips:[0,ty*.05,ws*.02],'L.upperLeg':[0,0,-ws*.02],'R.upperLeg':[0,0,ws*.02],
  spine:[ln*.09+b*.01,ty*.08,-hr*.05],chest:[ln*.07+b*.025+bh*.03,ty*.08,0],upperChest:[ln*.05,ty*.08,0],
  neck:[-hp*.2,hy*.18+dY*.4,hr*.2],head:[-hp*.4-ln*.2+dP,hy*.48+dY,hr*.7+dR],
  'B.shoulder':[0,0,bh*.05+ln*.02],'L.upperArm':[0,-.5*aL,-1.2+.35*aL+b*.02],'L.lowerArm':[0,-.15-1.3*aL,0],'R.upperArm':[0,-.5*aR,-1.2+.35*aR+b*.02],'R.lowerArm':[0,-.15-1.3*aR,0],
  _eye:V('cm')>.5?null:[E*Math.tanh(ey/.35),E*Math.tanh(ep/.3)],_m:{Fcl_BRW_Surprised:br*.7,Fcl_EYE_Surprised:br*.15},_e:{relaxed:.08+sm*.3},_bi:blinkId(t)}}
const DANCES=[
 ['Idol Chibi Step',(t,w)=>{const s=Math.sin(w),c=Math.cos(w),a=Math.max(0,s),b=Math.max(0,-s);return{hipsPos:[s*.05,Math.abs(c)*.03,0],hips:[0,0,s*.07],'L.upperLeg':[-a*.5,0,.08+a*.1],'L.lowerLeg':[a*.9,0,0],'R.upperLeg':[-b*.5,0,.08+b*.1],'R.lowerLeg':[b*.9,0,0],'B.upperArm':[0,-.5,-.5+c*.15],'B.lowerArm':[0,-1.6+c*.3,0],head:[0,0,s*.12],spine:[0,0,-s*.05]}}],
 ['Nyan Nyan Cat Paw',(t,w)=>{const p=Math.sin(w*2),q=-p;return{f:'Cat Claws',hipsPos:[0,Math.abs(Math.sin(w))*.03,0],'B.upperArm':[0,-.7,-.9],'L.lowerArm':[0,-1.9+p*.5,0],'R.lowerArm':[0,-1.9+q*.5,0],'B.hand':[0,0,-.5],head:[0,0,Math.sin(w)*.2],spine:[0,Math.sin(w)*.1,0],'B.upperLeg':[0,0,.05]}}],
 ['Hero Victory Jump',(t,w)=>{const j=Math.abs(Math.sin(w*.5)),bd=(1-j)*.5;return{f:'Clenched Fists',hipsPos:[0,j*.28,0],'B.shoulder':[0,-.1,.25],'L.upperArm':[0,-.2,1.1+Math.sin(w)*.12],'R.upperArm':[0,-.2,1.1-Math.sin(w)*.12],'B.lowerArm':[0,-.2,0],'B.upperLeg':[-bd,0,.1],'B.lowerLeg':[bd*1.6,0,0],head:[-.15,0,0],spine:[-.05,0,0]}}],
 ['Anime Catwalk',(t,w)=>{const s=Math.sin(w*.5),l=s,r=-s;return{hipsPos:[s*.04,0,0],hips:[0,s*.25,-s*.06],spine:[0,-s*.2,0],chest:[-.05,0,0],'L.upperLeg':[-l*.4,0,-.1],'R.upperLeg':[-r*.4,0,-.1],'L.lowerLeg':[Math.max(0,l)*.7,0,0],'R.lowerLeg':[Math.max(0,r)*.7,0,0],'L.upperArm':[0,l*.4,-1.15],'R.upperArm':[0,r*.4,-1.15],'B.lowerArm':[0,-.3,0],head:[0,-s*.1,0]}}],
 ['Groove & Bounce',(t,w)=>{const s=Math.sin(w),b=Math.abs(s),bd=(1-b)*.4,h=Math.sin(w*.5);return{hipsPos:[0,-(1-b)*.07,0],'B.upperLeg':[-bd,0,.1],'B.lowerLeg':[bd*1.6,0,0],spine:[0,h*.3,0],chest:[0,h*.15,s*.05],'L.shoulder':[0,0,s*.15],'R.shoulder':[0,0,-s*.15],'B.upperArm':[0,-.2,-.9+b*.1],'B.lowerArm':[0,-1,0],head:[0,-h*.2,0]}}],
 ['Gentle Idle Breath',(t)=>{const br=Math.sin(t*1.6);return{hipsPos:[Math.sin(t*.5)*.01,0,0],hips:[0,0,Math.sin(t*.5)*.02],chest:[br*.03,0,0],spine:[br*.01,0,0],head:[Math.sin(t*.8)*.02,Math.sin(t*.4)*.05,0],'B.upperArm':[0,0,-1.2+br*.02]}}],
 ['Curious Idle',curiousIdle]];
const POSES=[
 ['Grumpy Sulking',{'B.upperArm':[.3,-.5,-.5],'B.lowerArm':[0,-2.3,0],spine:[.08,0,0],head:[.1,-.4,.05],f:'Clenched Fists'},{angry:.5}],
 ['Peace Sign Idol',{'R.upperArm':[0,-.7,-.4],'R.lowerArm':[0,-2.2,0],'R.hand':[0,0,.2],'L.upperLeg':[-.4,0,.1],'L.lowerLeg':[.9,0,0],head:[0,0,.15],spine:[0,0,-.05],fR:'V-Sign'},{happy:.6,blinkRight:1}],
 ['Pouting Thinking',{'R.upperArm':[0,-.9,-.4],'R.lowerArm':[0,-2.4,0],'L.upperArm':[0,-.4,-.9],'L.lowerArm':[0,-1.8,0],head:[.1,0,.2],fR:'Cat Claws'},{angry:.2}],
 ['Shy Pigeon-Toed',{'B.upperLeg':[0,.3,-.1],'B.lowerLeg':[.1,0,0],'B.upperArm':[0,.5,-1],'B.lowerArm':[0,-.5,0],head:[.35,.2,0],spine:[.1,0,0]},{sad:.4}],
 ['Dramatic JoJo Pose',{spine:[.2,.5,-.4],chest:[0,.3,-.2],'R.upperArm':[0,-.3,.8],'R.lowerArm':[0,-.2,0],'L.upperArm':[0,-.8,-.4],'L.lowerArm':[0,-1.9,0],'L.upperLeg':[-.3,0,.3],'R.upperLeg':[.2,0,-.1],head:[-.1,-.4,.3],f:'Open Wave'},{}],
 ['Ojigi Bow',{spine:[.5,0,0],chest:[.3,0,0],head:[.1,0,0],'B.upperArm':[0,-.1,-1.25],f:'Open Wave'},{}],
 ['Heart Hands (Kyun)',{'B.upperArm':[.2,-.7,-.6],'B.lowerArm':[0,-1.9,0],head:[0,0,.18],fB:'Heart Hand'},{happy:.7}],
 ['Energetic Wave',{'R.shoulder':[0,0,.1],'R.upperArm':[-1.5,-.49,.01],'R.lowerArm':[.32,-1.04,0],'R.hand':[-.01,0,.25],'L.upperArm':[0,0,-1.18],head:[0,0,.1],_fR:[.1,.16,.24,.32,.2],
  /* elbow held out from the head, forearm up, palm toward the viewer; the wave comes from elbow flex + forearm roll + wrist deviation (phase-lagged, so every joint bends), the body sways */
  tick:(t)=>{const w=t*7.5,s=Math.sin(w),a=Math.sin(w-.9),b=Math.sin(w-1.8),sw=Math.sin(t*1.9),r=sw*.06,c=n=>Math.max(0,n);
   return{hipsPos:[sw*.03,0,0],hips:[0,sw*.08,r],'L.upperLeg':[0,0,-r],'R.upperLeg':[0,0,r],spine:[0,-sw*.05,-r*.6],chest:[0,Math.sin(t*1.9-.6)*.06,-r*.4],
   head:[-.02,Math.sin(t*1.9+.8)*.1,.1-r*.5],'L.upperArm':[0,0,-1.18+sw*.03],
   'R.shoulder':[0,0,.1+.04*Math.sin(w-.3)],'R.upperArm':[-1.5+.08*b,-.49+.05*sw,.01+.06*sw],'R.lowerArm':[.32+.18*a,-1.04+.34*s,0],'R.hand':[-.01+.22*b,0,.25+.32*a],
   _fR:[c(.1+.07*b),c(.16+.08*Math.sin(w-2.2)),c(.24+.08*Math.sin(w-2.7)),c(.32+.08*Math.sin(w-3.2)),c(.2+.06*a)]}}},{happy:.8}],
 ['Listening Ear',{'R.shoulder':[0,0,.06],'R.upperArm':[-.89,-.85,-.81],'R.lowerArm':[.7,-2.48,0],'L.upperArm':[0,-.1,-1.15],'L.lowerArm':[0,-.3,0],
  hipsPos:[0,-.015,-.045],spine:[.2,-.05,.02],chest:[.16,-.08,0],neck:[.05,0,0],head:[-.25,-.2,.16],'B.upperLeg':[-.08,0,.03],'B.lowerLeg':[.12,0,0],_fR:[.22,.28,.34,.4,.15],_fL:[.12,.15,.2,.25,.1],
  /* torso leans toward the sound, head stays up so the face keeps pointing at you; the lean pulses in/out as if straining to hear */
  tick:(t)=>{const s=Math.sin(t*1.3),q=Math.sin(t*3.1),l=Math.sin(t*.9);return{spine:[.2+.035*l,-.05+s*.03,.02],chest:[.16+.03*l,-.08,0],head:[-.25+q*.015,-.2+s*.05,.16+Math.sin(t*.9)*.04],hips:[0,0,Math.sin(t*.7)*.015],'R.lowerArm':[.7+.05*s,-2.48+.05*q,0],'R.hand':[0,0,.04*q]}}},{surprised:.28}],
 ['Confused Shrug (Idk?)',{'B.shoulder':[0,0,.2],'L.upperArm':[-.65,-.33,-.81],'L.lowerArm':[-1.7,-.8,0],'L.hand':[-.1,0,0],'R.upperArm':[-.65,-.33,-.81],'R.lowerArm':[-1.7,-.8,0],'R.hand':[-.1,0,0],head:[-.03,0,.2],_fL:[.12,.16,.22,.3,.1],_fR:[.12,.16,.22,.3,.1],
  /* shoulders lift (arm z reduced by the same amount so the hands stay put), forearms roll palms-up, head tilts side to side */
  tick:(t)=>{const m=t*2.4,p=.5+.5*Math.sin(m),p2=.5+.5*Math.sin(m-.35),sh=.06+.18*p,sh2=.06+.18*p2,hd=Math.sin(t*1.2);
   return{'L.shoulder':[0,0,sh],'R.shoulder':[0,0,sh2],'L.upperArm':[-.65,-.33,-.81-sh*.7+.08*p],'R.upperArm':[-.65,-.33,-.81-sh2*.7+.08*p2],
   'L.lowerArm':[-1.7-.18*p,-.8-.1*p,0],'R.lowerArm':[-1.7-.18*p2,-.8-.1*p2,0],'L.hand':[-.1+.08*Math.sin(m),0,.05*Math.sin(m)],'R.hand':[-.1+.08*Math.sin(m-.4),0,-.05*Math.sin(m)],
   head:[-.02-.04*p,hd*.12,.2*Math.sin(t*1.2+.5)],spine:[-.02*p,hd*.05,0],hips:[0,0,hd*.02]}}},{sad:.35,surprised:.15}],
 ['Thinking (Hmm…)',{'R.upperArm':[.27,-.82,-1.38],'R.lowerArm':[-.3,-2.4,0],'R.hand':[0,0,.22],'L.upperArm':[1.3,-.43,-1.62],'L.lowerArm':[-1.79,-1.42,0],'L.hand':[-.18,0,.02],spine:[.03,.06,0],hips:[0,.03,.04],'L.upperLeg':[0,0,-.04],'R.upperLeg':[0,0,.04],_fR:[.12,.72,.85,.9,.45],_fL:[.1,.14,.2,.28,.1],
  /* gaze wanders through up/side/down directions; eyes follow via lookAt, head and neck follow part of the way */
  tick:(t)=>{const[g,p]=gz(t),tap=Math.max(0,Math.sin(t*6))*(Math.sin(t*.8)>0?1:0);
   return{head:[.02-p*.35,g*.38,.08-g*.12],neck:[-p*.2,g*.25,0],spine:[.03,.06+g*.04,0],chest:[Math.sin(t*1.5)*.02,0,0],_gz:[g,p],_fR:[.12+.18*tap,.72,.85,.9,.45]}}},{sad:.15,angry:.08}]];

const GZW=[[.55,.45],[-.5,.5],[.75,.05],[-.6,-.3],[0,.65],[-.8,.1],[.5,-.35],[0,-.45]]; // [yaw (+ = character's left), pitch (+ = up)]
function gz(t){const T=1.25,i=Math.floor(t/T),f=(t/T)%1,a=GZW[i%GZW.length],b=GZW[(i+1)%GZW.length],k=Math.min(1,f/.35),e=k*k*(3-2*k);return[a[0]+(b[0]-a[0])*e,a[1]+(b[1]-a[1])*e]}


/* ---------------------------------------------------------------- registry + adapter (new) */
const DANCE_SLUG = ['idol-step', 'nyan', 'victory', 'catwalk', 'groove', 'breath', 'curious'];
const POSE_SLUG = ['grumpy', 'peace', 'pouting-think', 'shy', 'jojo', 'bow', 'kyun', 'wave', 'listen', 'shrug', 'hmm'];
// bounce energy per animation (index.html ED / EP tables)
const ED = [.3, .3, .2, .25, .2, .35, .3], EPV = [.15, .5, .2, .3, .3, .1, .6, .8, .2, .45, .2];
// which bubbly "react" flavour a transition into this animation uses
const REACT = { 'idol-step': 'Joy', nyan: 'Fun', victory: 'Surprise', catwalk: 'Neutral', groove: 'Fun', breath: 'Neutral', curious: 'tiny',
  grumpy: 'Angry', peace: 'Joy', 'pouting-think': 'Angry', shy: 'Sorrow', jojo: 'Surprise', bow: 'Neutral', kyun: 'Joy', wave: 'Joy', listen: 'tiny', shrug: 'Fun', hmm: 'tiny' };

const FNAME = (v) => (Array.isArray(v) ? v : FING_PRESETS[v] || FING_PRESETS['Open Wave']);

// write one spec through S. `defF` = default finger preset for both hands (index.html falls back to 'Open Wave').
function writeSpec(S, spec) {
  for (const k in spec) {
    const v = spec[k];
    if (!Array.isArray(v) || k[0] === '_') continue;
    if (k === 'hipsPos') { S.hip(v[0], v[1], v[2]); continue; }
    S.k(k, v[0], v[1], v[2]);
  }
}
function writeExtras(S, spec, pe) {
  const e = Object.assign({}, pe || {}, spec._e || {});
  for (const n in e) S.e(n, e[n]);
  if (spec._m) for (const n in spec._m) S.m(n, spec._m[n]);
  if (spec._bi !== undefined) S.blinkId(spec._bi);
  if (spec._gz) S.gaze(spec._gz[0], spec._gz[1]);
  else if (spec._eye) S.eyeHead(spec._eye[0], spec._eye[1]);
}

export const ANIM = Object.create(null);
DANCES.forEach((d, i) => {
  ANIM[DANCE_SLUG[i]] = { name: d[0], kind: 'dance', energy: ED[i], react: REACT[DANCE_SLUG[i]],
    fn(t, S) {
      const s = d[1](t, t * Math.PI * 3.6);
      writeSpec(S, s);
      S.f('L', FNAME(s.f || 'Open Wave')); S.f('R', FNAME(s.f || 'Open Wave'));
      writeExtras(S, s, null);
    } };
});
POSES.forEach((p, i) => {
  const slug = POSE_SLUG[i], [, sp, pe] = p;
  ANIM[slug] = { name: p[0], kind: 'pose', energy: EPV[i], react: REACT[slug],
    fn(t, S) {
      writeSpec(S, sp);
      const tk = sp.tick ? sp.tick(t) : null;
      if (tk) writeSpec(S, tk);
      const L = (tk && tk._fL) || sp._fL || sp.fL || sp.fB || sp.f || 'Open Wave', R = (tk && tk._fR) || sp._fR || sp.fR || sp.fB || sp.f || 'Open Wave';
      S.f('L', FNAME(L)); S.f('R', FNAME(R));
      writeExtras(S, tk && tk._gz ? { _gz: tk._gz } : {}, pe);
    } };
});
export const ANIM_NAMES = Object.keys(ANIM);
export const DANCE_NAMES = DANCE_SLUG.filter((n) => n !== 'breath' && n !== 'curious');
export const POSE_NAMES = POSE_SLUG;
export const CURIOUS_LEN = () => CI.len;
export { curiousIdle, gz };
