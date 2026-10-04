/* CathedrAI v0.5 — Saint vessels (3D), Saint voices (TTS), hearing (dictation + live talk), and the live space controller.
   Classic script, loaded before the main script. Heavy modules (space.js, voice.js, ears.js) are imported on demand. */
'use strict';
let vessels = [], voices = [], actV = null, actVo = null;
let vxo = { hear: 'auto', sens: 0.5, chop: 'mixed', ink: true, halftone: true, edges: false, neon: true, toon: true, fps: 60, framing: 'full', wake: true, na: {} };
const LV = { on: false, busy: false, state: 'idle', mute: false };
window.LV = LV;
const VXLOG = [];
const vlog = m => { VXLOG.push(new Date().toISOString().slice(11, 19) + ' ' + m); if (VXLOG.length > 60) VXLOG.shift(); try { dlog('live', m); } catch (e) { /* ignore */ } };
const vxSnap = () => ({ vessels, voices, actV, actVo, o: vxo });
function vxLoad(d) {
  if (!d) return;
  try { vessels = d.vessels || []; voices = d.voices || []; actV = d.actV || null; actVo = d.actVo || null; vxo = { ...vxo, ...(d.o || {}) }; vxo.na = vxo.na || {}; } catch (e) { /* ignore */ }
}

/* ---------------------------------------------------------------- blob store (IndexedDB) */
const idb = {
  db: null,
  open() { return this.db || (this.db = new Promise((res, rej) => { const r = indexedDB.open('cathedrai-vx', 1); r.onupgradeneeded = () => r.result.createObjectStore('b'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })); },
  async tx(mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('b', mode), s = t.objectStore('b'), r = fn(s); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); },
  put(k, v) { return this.tx('readwrite', s => s.put(v, k)); },
  get(k) { return this.tx('readonly', s => s.get(k)); },
  del(k) { return this.tx('readwrite', s => s.delete(k)); }
};

/* ---------------------------------------------------------------- lazy modules */
let _voice = null, _ears = null, _space = null, _spaceMod = null, voLoaded = null;
const getVoice = async () => { if (!_voice) { _voice = (await import('../live/voice.js')).Voice; _voice.onerror = e => { vlog('voice: ' + ((e && e.message) || e)); }; await _voice.init(); } return _voice; };
const getEars = async () => _ears || (_ears = (await import('../live/ears.js')).Ears);

/* ---------------------------------------------------------------- VRM header (cheap, no three.js) */
function vrmInfo(buf) {
  const dv = new DataView(buf);
  if (buf.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67) throw new Error('This is not a .vrm / .glb file.');
  const len = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== 0x4e4f534a) throw new Error('Broken file: no JSON chunk.');
  const j = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, len)));
  const x = j.extensions || {};
  if (x.VRMC_vrm) { const m = x.VRMC_vrm.meta || {}; return { ver: '1', name: m.name || 'Vessel' }; }
  if (x.VRM) { const m = x.VRM.meta || {}; return { ver: '0', name: m.title || 'Vessel' }; }
  throw new Error('This file has no VRM data. Export it from VRoid Studio as .vrm (VRM 0 or 1).');
}
const uid2 = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

async function vxImportVessel(files) {
  for (const f of files) {
    try {
      const buf = await f.arrayBuffer(), inf = vrmInfo(buf), id = 'v' + uid2();
      await idb.put('v:' + id, new Blob([buf], { type: 'application/octet-stream' }));
      vessels.push({ id, name: (f.name.replace(/\.(vrm|glb)$/i, '') || inf.name).slice(0, 40), title: inf.name, ver: inf.ver, size: f.size });
      if (!actV) actV = id;
      toast('Vessel added: ' + vessels[vessels.length - 1].name + ' (VRM ' + inf.ver + ')');
    } catch (e) { toast('Could not use ' + f.name + ': ' + ((e && e.message) || e)); vlog('vessel import: ' + ((e && e.message) || e)); }
  }
  save(); render();
}
async function vxDelVessel(id) {
  try { await idb.del('v:' + id); } catch (e) { /* ignore */ }
  vessels = vessels.filter(v => v.id !== id); if (actV === id) actV = vessels[0] ? vessels[0].id : null;
  Object.values(PR).forEach(p => { if (p.vessel === id) p.vessel = ''; });
  save(); render();
}
function vxPickVessel(id) { actV = id; save(); render(); }

async function vxImportVoice(files) {
  const onnx = files.find(f => /\.onnx$/i.test(f.name)), json = files.find(f => /\.json$/i.test(f.name));
  if (!onnx) { toast('Choose the .onnx voice file (and its .onnx.json together with it).'); return; }
  try {
    let cfg = null;
    if (json) { try { cfg = JSON.parse(await json.text()); } catch (e) { toast('The .json file could not be read; using default settings.'); } }
    if (cfg) { cfg = { audio: cfg.audio, inference: cfg.inference, espeak: cfg.espeak, num_speakers: cfg.num_speakers, speaker_id_map: cfg.speaker_id_map, language: cfg.language }; }
    const id = 'o' + uid2();
    await idb.put('o:' + id, onnx);
    const spk = cfg && cfg.speaker_id_map ? Object.entries(cfg.speaker_id_map).map(([n, i]) => ({ id: i, name: n })).sort((a, b) => a.id - b.id) : [];
    voices.push({ id, name: onnx.name.replace(/\.onnx$/i, '').slice(0, 40), size: onnx.size, cfg, speakers: spk, sr: (cfg && cfg.audio && cfg.audio.sample_rate) || 22050 });
    if (!actVo) actVo = id;
    toast('Voice added: ' + voices[voices.length - 1].name + (json ? '' : ' (no .json: default settings)'));
  } catch (e) { toast('Could not import the voice: ' + ((e && e.message) || e)); vlog('voice import: ' + ((e && e.message) || e)); }
  save(); render();
}
async function vxDelVoice(id) {
  try { await idb.del('o:' + id); } catch (e) { /* ignore */ }
  voices = voices.filter(v => v.id !== id); if (actVo === id) actVo = voices[0] ? voices[0].id : null; if (voLoaded === id) { voLoaded = null; try { (await getVoice()).unloadSaintVoice(); } catch (e) { /* ignore */ } }
  Object.values(PR).forEach(p => { if (p.voice === id) p.voice = ''; });
  save(); render();
}
function vxPickVoice(id) { actVo = id; save(); render(); }

/* load the voice chosen for the current persona (or the appointed one) into the TTS engine */
async function useVoiceFor(P) {
  const V = await getVoice(), id = (P && P.voice && voices.find(v => v.id === P.voice) ? P.voice : actVo), v = voices.find(x => x.id === id);
  if (!v) { if (voLoaded) { V.unloadSaintVoice(); voLoaded = null; } return { V, v: null }; }
  if (voLoaded !== v.id) {
    const blob = await idb.get('o:' + v.id);
    if (!blob) throw new Error('The voice file "' + v.name + '" is missing. Import it again.');
    await V.loadSaintVoice({ onnx: blob, config: v.cfg, name: v.name }); voLoaded = v.id; vlog('voice loaded: ' + v.name + ' (' + V.engine() + ')');
  }
  return { V, v };
}
async function vxTestVoice() {
  toast('Preparing the voice…');
  try { const { V } = await useVoiceFor(P_()); const P = P_(); V.stopSpeaking(); const t0 = performance.now(); await V.speak('Greetings, my child. This is how your Saint sounds.', { speaker: P.speaker || 0, speed: P.speed || 1, onStart: () => toast('Speaking (' + V.engine() + ')…') }); vlog('test voice ok in ' + Math.round(performance.now() - t0) + ' ms'); }
  catch (e) { toast('Voice error: ' + ((e && e.message) || e)); vlog('test voice: ' + ((e && e.message) || e)); }
}

/* ---------------------------------------------------------------- hearing settings */
const wsum = () => { try { return JSON.parse(localStorage.getItem('cathedrai.whisper') || 'null'); } catch (e) { return null; } };
const nativeHear = () => (loaded && loaded.info) ? !!loaded.info.audio : (vxo.na ? vxo.na[act] : undefined);
const LVx = {
  hearMode: () => vxo.hear,
  noteAudio: (id, b) => { if (vxo.na[id] !== b) { vxo.na[id] = b; save(); } },
  async transcribe(pcm) {
    const E = await getEars(), st = E.whisper.status();
    if (!st.installed) throw new Error('The hearing module is not installed.');
    return E.whisper.transcribe(pcm);
  }
};
window.LVx = LVx;

function hubExtras() {
  const cur = vessels.find(v => v.id === actV), nat = nativeHear(), ws = wsum();
  const rows = (list, act0, pick, del, meta) => list.length ? list.map(x => `<div class="hubrow ${x.id === act0 ? 'on' : ''}"><button class="ib" onclick="${pick}('${x.id}')" title="Use this">${ic(x.id === act0 ? 'check' : 'saint', 18)}</button><span>${esc(x.name)} <small>${meta(x)}</small></span><button class="ib" onclick="${del}('${x.id}')">${ic('trash', 16)}</button></div>`).join('') : '<small>Nothing imported yet.</small>';
  const sel = (k, opts) => `<select onchange="vxOpt('${k}',this.value)">${opts.map(([v, l]) => `<option value="${v}" ${String(vxo[k]) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const chk = (k, l) => `<div class="hubrow"><label class="sw2"><input type="checkbox" ${vxo[k] ? 'checked' : ''} onchange="vxOpt('${k}',this.checked)"><i></i></label><span>${l}</span></div>`;
  return `<div class="card"><h4>${ic('box')}Saint vessel (3D body)<small>${cur ? 'VRM ' + cur.ver : ''}</small></h4>
<small>Import a <b>.vrm</b> file (VRoid Studio, VRM 0 or VRM 1). It is stored inside the app and appears in the live space.</small>
${rows(vessels, actV, 'vxPickVessel', 'vxDelVessel', v => 'VRM ' + v.ver + ' · ' + (v.size / 1048576).toFixed(1) + ' MB')}
<button class="btn" onclick="document.getElementById('fVrm').click()">${ic('plus', 16)}Import vessel</button></div>
<div class="card"><h4>${ic('vol')}Saint voice<small>${voices.length ? (_voice ? _voice.engine() : 'ready') : 'system voice'}</small></h4>
<small>Import a Piper voice: pick the <b>.onnx</b> and its <b>.onnx.json</b> together (for example en_GB-semaine-medium).</small>
${rows(voices, actVo, 'vxPickVoice', 'vxDelVoice', v => (v.sr / 1000).toFixed(2) + ' kHz · ' + (v.size / 1048576).toFixed(0) + ' MB' + (v.speakers.length > 1 ? ' · ' + v.speakers.length + ' speakers' : ''))}
<button class="btn" onclick="document.getElementById('fVoice').click()">${ic('plus', 16)}Import voice</button><button class="btn g" onclick="vxTestVoice()">${ic('vol', 16)}Test voice</button></div>
<div class="card"><h4>${ic('ear')}Hearing<small>${nat === true ? 'Saint hears natively' : nat === false ? 'no native hearing' : 'checked when the Saint loads'}</small></h4>
<small>Gemma 4 E2B/E4B can listen to audio directly when its projector (mmproj) file is loaded. Otherwise a small Whisper hearing module turns your speech into text.</small>
<label>How to hear you</label>${sel('hear', [['auto', 'Automatic (native if possible, else module)'], ['native', 'Always native (Saint\'s own ears)'], ['module', 'Always the hearing module']])}
<label>Voice detection sensitivity: <b id="v_sens">${Math.round(vxo.sens * 100)}%</b></label><input type="range" min="0" max="1" step=".05" value="${vxo.sens}" oninput="vxo.sens=+this.value;document.getElementById('v_sens').textContent=Math.round(this.value*100)+'%';vxSens()" onchange="save()">
<div class="kv"><b>Hearing module</b><span id="wst">${ws && ws.model ? 'installed: ' + esc(ws.model) : 'not installed'}</span></div>
<div class="pr" id="wprw" style="display:none"><div id="wpr" style="width:0%"></div></div><div class="hint" id="wmsg"></div>
<button class="btn" onclick="vxWhisper('tiny.en')">${ic('down', 16)}Install (tiny, 40 MB)</button><button class="btn g" onclick="vxWhisper('base.en')">Better (base, 75 MB)</button>${ws && ws.model ? `<button class="btn g" onclick="vxWhisperRm()">${ic('trash', 16)}Remove</button>` : ''}<button class="btn g" onclick="vxMicTest()">${ic('mic', 16)}Test microphone</button>
<div class="hint" id="mtest"></div></div>
<div class="card"><h4>${ic('saint')}Live space look</h4>
<label>Spider-Verse chop timing</label>${sel('chop', [['mixed', 'Mixed (ones, twos, threes)'], ['2', 'Twos (12 fps poses)'], ['3', 'Threes (8 fps poses)'], ['off', 'Smooth']])}
${chk('ink', 'Ink shading')}${chk('halftone', 'Halftone dots')}${chk('edges', 'Ink outline lines (post-process)')}${chk('neon', 'Neon cyber lights')}${chk('toon', 'Toon model shading')}
<label>Frame rate</label>${sel('fps', [[60, '60 fps'], [30, '30 fps (saves battery)']])}
<label>Camera</label>${sel('framing', [['full', 'Full body'], ['upper', 'Upper body']])}
<div class="hint">The space is dark grey with a neon horizon and no scenery. Keep the screen awake: ${''}</div>${chk('wake', 'Keep the screen on during live talk')}
<label>Saint sleeps after idle</label><select onchange="cfg.sleepMin=+this.value;save();armSleep()">${[[0, 'Never'], [1, '1 minute'], [2, '2 minutes'], [5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [30, '30 minutes']].map(([v, l]) => `<option value="${v}" ${cfg.sleepMin == v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
}
function vxOpt(k, v) {
  if (k === 'fps') v = +v; vxo[k] = v; save();
  if (_space) { const o = { chop: vxo.chop, ink: vxo.ink, halftone: vxo.halftone, edges: vxo.edges, neon: vxo.neon, toonModel: vxo.toon, fps: vxo.fps, framing: vxo.framing }; try { _space.setOptions(o); } catch (e) { /* ignore */ } }
}
async function vxSens() { if (_ears) { try { _ears.setSensitivity(vxo.sens); } catch (e) { /* ignore */ } } }
async function vxWhisper(model) {
  const pw = document.getElementById('wprw'), pb = document.getElementById('wpr'), mg = document.getElementById('wmsg');
  if (pw) pw.style.display = 'block'; if (mg) mg.textContent = 'Starting…';
  try {
    const E = await getEars();
    await E.whisper.install(model, (f, t) => { const a = document.getElementById('wpr'), b = document.getElementById('wmsg'); if (a) a.style.width = Math.round(f * 100) + '%'; if (b) b.textContent = t || ''; });
    toast('Hearing module ready'); vlog('whisper installed ' + model);
  } catch (e) { if (mg) mg.textContent = 'Failed: ' + ((e && e.message) || e); vlog('whisper install: ' + ((e && e.message) || e)); toast('Install failed (internet needed once)'); return; }
  render();
}
async function vxWhisperRm() { try { await (await getEars()).whisper.remove(); } catch (e) { /* ignore */ } render(); }
async function vxMicTest() {
  const out = document.getElementById('mtest'); if (out) out.textContent = 'Opening microphone… speak now.';
  try {
    const E = await getEars(); let mx = 0;
    const r = await E.recordOnce({ maxSeconds: 8, silenceSeconds: 1, onLevel: l => { mx = Math.max(mx, l.rms || 0); if (out) out.textContent = 'Listening… level ' + '█'.repeat(Math.min(20, Math.round((l.rms || 0) * 60))); } });
    if (!r) { if (out) out.textContent = 'No voice heard. Check the microphone permission.'; return; }
    if (out) out.textContent = 'Heard ' + r.seconds.toFixed(1) + ' s of speech.' + (E.whisper.status().installed ? ' Transcribing…' : '');
    if (E.whisper.status().installed) { const t = await E.whisper.transcribe(r.pcm); if (out) out.textContent = 'Heard: “' + (t || '(nothing clear)') + '”'; }
  } catch (e) { if (out) out.textContent = 'Microphone problem: ' + ((e && e.message) || e); }
}

/* ---------------------------------------------------------------- diagnostics */
function diagExtras() {
  return `<details open><summary>Voice, hearing and 3D space</summary><button class="btn" onclick="vxSelfTest()">Run voice self-test</button><div class="lg" id="vxlog">${esc(vxReport().join('\n'))}</div></details>`;
}
function vxReport() {
  const ws = wsum(), L = [];
  L.push('vessels: ' + vessels.length + (actV ? ' (active ' + ((vessels.find(v => v.id === actV) || {}).name) + ')' : ''));
  L.push('voices: ' + voices.length + (actVo ? ' (active ' + ((voices.find(v => v.id === actVo) || {}).name) + ')' : '') + ' · engine ' + (_voice ? _voice.engine() : 'not started'));
  L.push('hearing: mode ' + vxo.hear + ' · native ' + String(nativeHear()) + ' · whisper ' + (ws && ws.model ? ws.model : 'none'));
  L.push('mic api: ' + (navigator.mediaDevices && navigator.mediaDevices.getUserMedia ? 'yes' : 'NO') + ' · secure ' + window.isSecureContext + ' · worklet ' + (typeof AudioWorkletNode !== 'undefined'));
  L.push('webgl: ' + (() => { try { const c = document.createElement('canvas'); return (c.getContext('webgl2') ? 'webgl2' : c.getContext('webgl') ? 'webgl1' : 'NONE'); } catch (e) { return 'error'; } })());
  return L.concat(VXLOG.slice(-25));
}
async function vxSelfTest() {
  const el = document.getElementById('vxlog'), lines = vxReport();
  const say = () => { if (el) el.textContent = lines.join('\n'); };
  lines.push('— voice self-test —'); say();
  try { const { V } = await useVoiceFor(P_()); await V.selfTest((n, ok, d) => { lines.push((ok ? '✔ ' : '✘ ') + n + (d ? ' — ' + d : '')); say(); }); }
  catch (e) { lines.push('✘ ' + ((e && e.message) || e)); say(); }
}

/* ---------------------------------------------------------------- dictation (mic button) */
let dict = null;
async function micClick() {
  if (LV.on) { LV.mute = !LV.mute; try { LV.mute ? _ears && _ears.pause() : _ears && _ears.resume(); } catch (e) { /* ignore */ } micPaint(); setChip(LV.mute ? 'Muted: tap the mic to talk' : 'Listening', LV.mute ? '' : 'l'); return; }
  if (dict) { dict.stop = true; try { (await getEars()).stop(); } catch (e) { /* ignore */ } return; }
  const na = nativeHear(), ws = wsum(), mode = vxo.hear;
  const useNative = mode === 'native' || (mode === 'auto' && na === true) || (mode === 'auto' && na === undefined && !(ws && ws.model));
  if (mode === 'module' && !(ws && ws.model)) return dlg('<h4>Hearing module needed</h4><p>Install it once in <b>Appoint Your Saint → Hearing</b> (about 40 MB, needs internet).</p><div class="ac"><button class="btn g" onclick="cl()">Close</button><button class="btn" onclick="cl();view=\'hub\';nav();render()">Open</button></div>');
  dict = { stop: false }; $('#mic').style.color = 'var(--glow)'; const ph = $('#in').placeholder; $('#in').placeholder = 'Listening… speak now (tap the mic to cancel)';
  try {
    const E = await getEars();
    const r = await E.recordOnce({ maxSeconds: 30, silenceSeconds: 1.4, startTimeout: 14 });
    if (dict.stop || !r) { if (!dict.stop) toast('I did not hear anything'); return; }
    if (useNative) {
      const a = { name: 'Voice message', kind: 'audio', size: r.pcm.length * 4, note: r.seconds.toFixed(1) + ' s' }; AUD.set(a, r.pcm); att.push(a); bn(); toast('Voice recorded: press Execute to send');
    } else {
      $('#in').placeholder = 'Transcribing…'; const t = await LVx.transcribe(r.pcm);
      if (!t) toast('I could not make out any words'); else { const v = $('#in'); v.value = (v.value && !/\s$/.test(v.value) ? v.value + ' ' : v.value) + t; v.dispatchEvent(new Event('input')); v.focus(); }
    }
  } catch (e) { toast(((e && e.message) || e) + ''); vlog('dictation: ' + ((e && e.message) || e)); }
  finally { try { (await getEars()).stop(); } catch (e) { /* ignore */ } dict = null; $('#mic').style.color = ''; $('#in').placeholder = ph; }
}
function micPaint() { const b = $('#mic'); if (b) b.style.color = LV.on ? (LV.mute ? '#5c4c50' : 'var(--glow)') : ''; }

/* ---------------------------------------------------------------- live space */
const $$ = s => document.querySelector(s);
function setChip(t, k) { const c = $$('#lvchip'); if (c) { c.textContent = t; c.className = k || ''; } }
const plain = t => (t || '').replace(/[*_`#>~]/g, '').replace(/\s+/g, ' ').trim();
function setCap(u, s) { const a = $$('#lvu'), b = $$('#lvs'); if (a && u != null) a.textContent = u; if (b && s != null) b.textContent = s; }
let wvRaf = 0, wvT = 0;
function liveInit() {
  const mk = (id, acc, multi, fn) => { const i = document.createElement('input'); i.type = 'file'; i.id = id; i.hidden = true; if (acc) i.accept = acc; if (multi) i.multiple = true; i.onchange = e => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) fn(fs); }; document.body.appendChild(i); };
  mk('fVrm', '.vrm,.glb', true, vxImportVessel);
  mk('fVoice', '', true, vxImportVoice);
  const icons = () => { const x = $$('#lvx'); if (x) x.innerHTML = ic('x', 14) + 'Exit'; };
  icons();
  document.addEventListener('visibilitychange', () => {
    if (!LV.on) return;
    if (document.hidden) { try { _space && _space.pause(); _ears && _ears.pause(); } catch (e) { /* ignore */ } }
    else { try { _space && _space.resume(); (!LV.mute) && _ears && _ears.resume(); } catch (e) { /* ignore */ } }
  });
  window.addEventListener('resize', () => { if (LV.on) { setBarVar(); try { _space && _space.resize(); } catch (e) { /* ignore */ } } });
}
const setBarVar = () => { const b = $$('#bar'); if (b) document.documentElement.style.setProperty('--barh', (b.offsetHeight) + 'px'); };
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

async function liveEnter() {
  if (LV.on || LV.busy) return; LV.busy = true;
  try {
    const P = P_(), vs = vessels.find(v => v.id === P.vessel) || vessels.find(v => v.id === actV);
    if (!vs) { LV.busy = false; return dlg('<h4>No Saint vessel yet</h4><p>The live space needs a 3D body. Import a <b>.vrm</b> file (VRoid Studio) in <b>Appoint Your Saint → Saint vessel</b>.</p><div class="ac"><button class="btn g" onclick="cl()">Close</button><button class="btn" onclick="cl();view=\'hub\';nav();render()">Open</button></div>'); }
    if (!NAT) toast('Preview mode: the 3D space works here, but the Saint cannot answer without the Android app');
    if (!awake && sleepWhy === 'manual') { toast('Your Saint is switched off. Tap the power button first.'); LV.busy = false; return; }
    if (busy) { toast('Wait for the current reply to finish'); LV.busy = false; return; }
    if (!$('#in').value.length) $('#in').blur();
    const blob = await idb.get('v:' + vs.id);
    if (!blob) throw new Error('The vessel file is missing. Import it again.');
    closeMenu && closeMenu();
    LV.on = true; LV.mute = false; LV.state = 'loading'; LV.vessel = vs; LV.turn = 0;
    document.body.classList.add('lvmode'); setBarVar(); sendPaint(); dock(); micPaint();
    const st = $$('#stage'); st.classList.add('on'); await nextFrame(); st.classList.add('show');
    setChip('Summoning your Saint…', 'h'); setCap('', '');
    if (vxo.wake && navigator.wakeLock) { try { LV.wl = await navigator.wakeLock.request('screen'); } catch (e) { /* ignore */ } }
    /* space */
    if (!_space) {
      _spaceMod = await import('../live/space.js');
      _space = await _spaceMod.createSpace($$('#stagehost'), { chop: vxo.chop, ink: vxo.ink, halftone: vxo.halftone, edges: vxo.edges, neon: vxo.neon, toonModel: vxo.toon, fps: vxo.fps, framing: vxo.framing });
      _space.onevent = (t, d) => { if (t === 'error') { vlog('space error: ' + ((d && d.message) || JSON.stringify(d))); } if (t === 'idle-anim') vlog('idle: ' + (d && d.name)); };
    } else { _space.setOptions({ chop: vxo.chop, ink: vxo.ink, halftone: vxo.halftone, edges: vxo.edges, neon: vxo.neon, toonModel: vxo.toon, fps: vxo.fps, framing: vxo.framing }); _space.resume(); }
    _space.resize();
    /* voice + ears start in parallel with the intro */
    const voiceP = useVoiceFor(P).catch(e => { vlog('voice: ' + ((e && e.message) || e)); toast('Saint voice not loaded: using the system voice'); });
    const enterP = _space.enter({ vessel: blob, name: vs.name });
    await voiceP; await startEars();
    await enterP;
    LV.state = 'listening';
    if (LV.on) { setChip(LV.ok ? 'Listening' : 'Type to talk (microphone unavailable)', LV.ok ? 'l' : 'e'); _space.setListening(true); }
    if (P.greet && P.greetOn !== false && false) { /* reserved */ }
    wvLoop();
  } catch (e) {
    vlog('enter failed: ' + ((e && e.message) || e)); toast('Live space failed: ' + ((e && e.message) || e));
    LV.busy = false; await liveExit(true); return;
  }
  LV.busy = false;
}

async function startEars() {
  LV.ok = false;
  try {
    const E = await getEars();
    await E.start({
      sensitivity: vxo.sens,
      onLevel: () => { },
      onSpeechStart: () => { if (!LV.on || LV.mute) return; if (LV.state === 'speaking' || LV.state === 'thinking') { bargeIn(); } else LV.state = 'hearing'; setChip('Hearing you…', 'h'); try { _space.setListening(true); } catch (e) { /* ignore */ } },
      onSpeechEnd: r => liveHeard(r),
      onError: m => { setChip(String(m), 'e'); vlog('ears: ' + m); }
    });
    LV.ok = true;
  } catch (e) { vlog('ears: ' + ((e && e.message) || e)); toast(((e && e.message) || e) + ''); setCap('', plain((e && e.message) || e)); }
}

function bargeIn() {
  vlog('barge-in');
  try { _voice && _voice.stopSpeaking(); } catch (e) { /* ignore */ }
  if (busy) { stop = true; try { CA() && CA().stopGeneration(); } catch (e) { /* ignore */ } }
  LV.q = ''; LV.turn++; LV.state = 'hearing'; LV.spk = 0;
  try { _space.setSpeaking(false); _space.setListening(true); } catch (e) { /* ignore */ }
}

async function liveHeard(r) {
  if (!LV.on || LV.mute || !r || !r.pcm) return;
  for (let i = 0; i < 40 && busy; i++) await sleep(100);
  if (busy || !LV.on) return;
  LV.state = 'thinking'; setChip('Thinking…', 't'); setCap('…', '');
  try { _space.setListening(false); _space.emote('think', { hold: 25 }); } catch (e) { /* ignore */ }
  const E = _ears; if (E) E.setEchoGuard(false);
  view = 'chat';
  ask('', null, null, { live: true, pcm: r.pcm });
}

/* ask() hooks */
Object.assign(LVx, {
  emo(e) {
    if (!LV.on || !_space || LV.state === 'loading') return;
    if (e === 'idle' || e === 'talk') return;
    if (LV.replying && e !== 'think') return;
    try { _space.emote(e, { hold: e === 'think' ? 25 : 2.8 }); } catch (x) { /* ignore */ }
  },
  replyStart() { if (!LV.on) return; LV.replying = true; LV.q = ''; LV.qm = null; LV.mood = null; LV.spk = 0; LV.turn++; LV.cap = ''; LV.t0 = performance.now(); },
  heard(t) { if (LV.on) setCap('You: ' + plain(t), ''); },
  mood(m) { if (!LV.on) return; if (LV.q.trim()) flushSentence(true); LV.mood = m; },
  text(t) {
    if (!LV.on) return;
    if (!LV.q) LV.qm = LV.mood;
    LV.q += t;
    for (;;) {
      const m = /^([\s\S]*?[.!?…]+["'”’)\]]*)(\s+|$)/.exec(LV.q), nl = LV.q.indexOf('\n');
      let cut = -1;
      if (m && (m[2] || '').length && m[1].length >= 12) cut = m[0].length;
      else if (nl > 12) cut = nl + 1;
      else if (!m && LV.q.length > 220) { const c = LV.q.lastIndexOf(',', 200); cut = c > 60 ? c + 1 : 200; }
      if (cut < 0) break;
      const s = LV.q.slice(0, cut); LV.q = LV.q.slice(cut); flushSentence(false, s);
      if (LV.q) LV.qm = LV.mood;
    }
  },
  end(m) {
    if (!LV.on) return;
    LV.replying = false;
    if (LV.q.trim()) flushSentence(true);
    LV.q = '';
    const turn = LV.turn;
    const fin = () => { if (turn !== LV.turn || !LV.on) return; LV.state = 'listening'; setChip(LV.mute ? 'Muted' : 'Listening', LV.mute ? '' : 'l'); try { _space.setSpeaking(false); _space.setListening(true); } catch (e) { /* ignore */ } if (_ears) _ears.setEchoGuard(false); setTimeout(() => { if (turn === LV.turn) { setCap(null, ''); } }, 3500); };
    const poll = () => { if (turn !== LV.turn || !LV.on) return; if (_voice && _voice.isSpeaking()) setTimeout(poll, 120); else fin(); };
    poll();
  },
  error(msg, user) {
    if (!LV.on) return;
    LV.replying = false; LV.state = 'listening'; setChip(LV.mute ? 'Muted' : 'Listening', LV.mute ? '' : 'l');
    setCap(null, plain(msg).slice(0, 220)); try { _space.setSpeaking(false); _space.setListening(true); if (!user) _space.emote('sad', { hold: 3 }); } catch (e) { /* ignore */ }
    setTimeout(() => setCap(null, ''), 7000);
  }
});

function flushSentence(force, s) {
  s = (s != null ? s : LV.q); if (s === LV.q) LV.q = '';
  const txt = plain(s); if (!txt || !/[a-z0-9]/i.test(txt)) return;
  const mood = LV.qm || LV.mood, turn = LV.turn, P = P_();
  LV.spk = (LV.spk || 0) + 1;
  const V = _voice; if (!V) { setCap(null, txt); return; }
  if (_ears) _ears.setEchoGuard(true);
  V.speak(txt, {
    speaker: P.speaker || 0, speed: P.speed || 1,
    onStart: () => {
      if (turn !== LV.turn || !LV.on) return;
      LV.state = 'speaking'; setChip('Speaking', 's'); setCap(null, txt);
      try { _space.setSpeaking(true); if (mood && mood !== 'idle' && mood !== 'talk') _space.emote(mood, { hold: 3 }); else _space.beat(0.8); } catch (e) { /* ignore */ }
    }
  }).catch(e => vlog('speak: ' + ((e && e.message) || e)));
}

/* waveform on the EXECUTE button + mouth driver */
function wvLoop() {
  cancelAnimationFrame(wvRaf);
  const bands = new Float32Array(16);
  const step = t => {
    if (!LV.on) return;
    wvRaf = requestAnimationFrame(step);
    try { if (_voice && _voice.isSpeaking() && _space) { _space.setMouth(_voice.getOutLevel()); } } catch (e) { /* ignore */ }
    if (t - wvT < 45) return; wvT = t;
    const cv = document.getElementById('wv'); if (!cv) return;
    const g = cv.getContext('2d'), W = cv.width, H = cv.height; g.clearRect(0, 0, W, H);
    let lv = 0, spk = false;
    try {
      if (_voice && _voice.isSpeaking()) { const o = _voice.getOutLevel(); lv = o.rms; spk = true; bands.fill(0); for (let i = 0; i < 16; i++) bands[i] = o.rms * (0.45 + 0.55 * Math.abs(Math.sin(t / 130 + i * 1.7))) * (i < 6 ? o.low * 2 + .3 : i < 11 ? o.mid * 2 + .3 : o.high * 2 + .3); }
      else if (_ears && _ears.isActive() && !LV.mute) { const l = _ears.getInLevel(); lv = l.rms; for (let i = 0; i < 16; i++) bands[i] = (l.bands && l.bands[i]) || 0; }
      else bands.fill(0);
    } catch (e) { bands.fill(0); }
    const col = LV.mute ? '#5c4c50' : spk ? '#6fd08c' : LV.state === 'thinking' ? '#c9a0ff' : '#ffd1d6';
    g.fillStyle = col; const bw = W / 16;
    const pulse = LV.state === 'thinking' ? 0.5 + 0.5 * Math.sin(t / 160) : 0;
    for (let i = 0; i < 16; i++) {
      const v = Math.min(1, Math.max(bands[i] * 3.2, 0.06 + pulse * 0.25 * Math.abs(Math.sin(i + t / 220))));
      const h = Math.max(2, v * (H - 2)); g.fillRect(i * bw + 1, (H - h) / 2, bw - 3, h);
    }
  };
  wvRaf = requestAnimationFrame(step);
}
function liveWave() { micClick(); }

async function liveExit(quick) {
  if (!LV.on && !quick) return;
  if (LV.busy && !quick) { return; }
  LV.busy = true;
  const wasOn = LV.on;
  LV.on = false;
  cancelAnimationFrame(wvRaf);
  try { _ears && _ears.stop(); } catch (e) { /* ignore */ }
  try { _voice && _voice.stopSpeaking(); } catch (e) { /* ignore */ }
  if (busy) { stop = true; try { CA() && CA().stopGeneration(); } catch (e) { /* ignore */ } for (let i = 0; i < 30 && busy; i++) await sleep(100); }
  setChip('Farewell…', 'h'); setCap('', '');
  if (_space && wasOn) { try { _space.setSpeaking(false); _space.setListening(false); _space.emote('happy', { hold: 1 }); await Promise.race([_space.exit(), sleep(4000)]); } catch (e) { vlog('exit: ' + ((e && e.message) || e)); } }
  const st = $$('#stage'); st.classList.remove('show');
  document.body.classList.remove('lvmode'); sendPaint(); micPaint(); dock();
  try { LV.wl && LV.wl.release(); } catch (e) { /* ignore */ } LV.wl = null;
  setTimeout(() => { if (!LV.on) { st.classList.remove('on'); try { _space && _space.pause(); } catch (e) { /* ignore */ } } }, 800);
  LV.state = 'idle'; LV.replying = false; LV.busy = false;
  render(); armSleep(); save();
  if (typeof svDue === 'function' && svDue(C)) setTimeout(() => { if (!busy && !LV.on) svNow(false); }, 1200);
}
