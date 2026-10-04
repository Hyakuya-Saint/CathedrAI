/* Persona studio (character.ai style): every personality has its own instruction, greeting, story, lore + documents,
   examples, user profile, boundaries, voice/vessel binding and an optional rolling "save state" memory.
   Globals used from the main script: PR, prof, mem, FAC, fac, C, busy, loaded, CA, save, nav, render, toast, dlg, cl, esc, ic, menu, readAtt, ...  */
const PDEF_PROMPT = 'You are a warm, capable assistant. Be clear, kind and concise.';
const PFEAT = [
  ['p', 'Instruction', 'How the personality behaves. This is the system prompt.'],
  ['greet', 'Greeting', 'The first thing it says when you open a new chat.'],
  ['traits', 'Personality', 'Traits, temperament, quirks.'],
  ['style', 'Speaking style', 'Voice, vocabulary, catch-phrases.'],
  ['story', 'Backstory', 'Who it is and where it comes from.'],
  ['scene', 'Scenario', 'Where and when this conversation takes place.'],
  ['lore', 'Lore & documents', 'World knowledge. Attach PDF, Word or text files and it studies them.'],
  ['ex', 'Example dialogue', 'Short sample exchanges to imitate.'],
  ['user', 'About you', 'Who you are to this personality.'],
  ['avoid', 'Boundaries', 'Things it must never do or say.'],
  ['bind', 'Vessel & voice', 'Use a specific 3D body and speaking voice for this personality.']
];
function newPersona(n) {
  const on = {}; PFEAT.forEach(f => on[f[0]] = 1);
  return { n: n || 'New personality', d: '', av: '✨', p: '', greet: '', traits: '', style: '', story: '', scene: '', avoid: '', lore: '', loreMode: 'smart', docs: [], ex: [], user: { n: '', d: '' }, mem: { on: false, every: 8, state: '', slots: [], at: 0 }, vessel: '', voice: '', speaker: 0, speed: 1, on };
}
function defaultPersona() { const P = newPersona('Default'); P.builtin = 1; P.av = '⛪'; P.d = 'The built-in Saint'; P.p = PDEF_PROMPT; P.p0 = PDEF_PROMPT; return P; }
/* old saves stored six ranks; keep what the person had customised as ordinary personalities */
function personaMigrate() {
  const old = ['aco', 'dea', 'pri', 'bis', 'arc', 'car'];
  if (!PR || typeof PR !== 'object') PR = {};
  const hadRanks = old.some(k => PR[k] && PR[k].p0 !== undefined);
  if (hadRanks) {
    const keep = {};
    for (const k of old) { const r = PR[k]; if (r && r.p !== r.p0) { const P = newPersona(r.n); P.d = r.d || ''; P.p = r.p; keep['m_' + k] = P; } }
    const cur = PR[prof] && old.includes(prof) ? 'm_' + prof : null;
    PR = { def: defaultPersona(), ...keep };
    prof = cur && PR[cur] ? cur : 'def';
  }
  if (!PR.def) PR = { def: defaultPersona(), ...PR };
  PR.def.builtin = 1; PR.def.p0 = PDEF_PROMPT;
  for (const k in PR) { const d = newPersona(); const P = PR[k]; for (const f in d) if (P[f] === undefined) P[f] = d[f]; P.on = { ...d.on, ...P.on }; P.mem = { ...d.mem, ...P.mem }; P.user = { ...d.user, ...P.user }; }
  if (!PR[prof]) prof = 'def';
}
const P_ = () => PR[prof] || PR.def;
const tokEst = s => Math.ceil((s || '').length / 3.6);

/* ---------------- lore retrieval (keyword scoring; no embeddings so it is cheap on a phone) ---------------- */
const STOP = new Set('the a an and or but if then of to in on at for with without from by is are was were be been being it its this that these those as are you your i me my we our they them their he she his her do does did not no yes can could would should will just so than too very about into over out up down off how what when where who which why'.split(' '));
const words = s => (String(s || '').toLowerCase().match(/[a-z0-9À-ɏ぀-ヿ一-鿿]{2,}/g) || []).filter(w => !STOP.has(w));
function chunkText(t, max = 650) {
  const out = []; let cur = '';
  for (const para of String(t || '').split(/\n{2,}|(?<=[.!?])\s{2,}/)) {
    const p = para.trim(); if (!p) continue;
    if ((cur + '\n' + p).length > max && cur) { out.push(cur); cur = ''; }
    if (p.length > max) { for (let i = 0; i < p.length; i += max) out.push(p.slice(i, i + max)); } else cur = cur ? cur + '\n' + p : p;
  }
  if (cur) out.push(cur);
  return out;
}
function loreSelect(P, query, budget) {
  const src = [];
  if (P.on.lore && P.lore.trim()) chunkText(P.lore).forEach((c, i) => src.push({ n: 'Lore', c, i, first: i === 0 }));
  if (P.on.docs !== 0 && P.on.lore) P.docs.forEach(d => { if (d.off) return; (d.chunks || []).forEach((c, i) => src.push({ n: d.name, c, i, first: i === 0 })); });
  if (!src.length || budget < 200) return '';
  let chosen;
  if (P.loreMode === 'all' || src.reduce((a, s) => a + s.c.length, 0) <= budget) chosen = src.slice();
  else {
    const q = words(query), qs = new Map(); q.forEach((w, k) => qs.set(w, (qs.get(w) || 0) + 1 + (k > q.length - 12 ? 0.5 : 0)));
    const df = new Map(); const toks = src.map(s => { const ws = words(s.c), tf = new Map(); ws.forEach(w => tf.set(w, (tf.get(w) || 0) + 1)); tf.forEach((_, w) => df.set(w, (df.get(w) || 0) + 1)); return tf; });
    const N = src.length;
    const sc = src.map((s, k) => { let v = 0; qs.forEach((qw, w) => { const f = toks[k].get(w); if (f) v += qw * Math.log(1 + (N - (df.get(w) || 0) + .5) / ((df.get(w) || 0) + .5)) * (f / (f + 1.2)); }); return { s, v: v + (s.first ? 0.15 : 0) }; });
    sc.sort((a, b) => b.v - a.v);
    chosen = []; let used = 0;
    for (const x of sc) { if (x.v <= 0 && chosen.length >= 1) break; if (used + x.s.c.length > budget) continue; chosen.push(x.s); used += x.s.c.length; }
    chosen.sort((a, b) => src.indexOf(a) - src.indexOf(b));
  }
  let out = '', used = 0, last = '';
  for (const s of chosen) { if (used + s.c.length > budget) break; if (s.n !== last) { out += `\n[${s.n}]\n`; last = s.n; } out += s.c + '\n'; used += s.c.length; }
  return out.trim();
}

/* ---------------- prompt assembly ---------------- */
function personaPrompt(P, F, query) {
  const on = k => P.on[k], cap = (s, n) => (s || '').trim().slice(0, n);
  const budget = Math.floor(F.ctx * 3.6 * 0.42);
  let t = on('p') && P.p.trim() ? cap(P.p, 3000) : PDEF_PROMPT;
  const name = P.builtin ? '' : P.n;
  if (name) t = `Your name is ${name}.${P.d ? ' ' + P.d.trim() + '.' : ''} ` + t;
  const add = (label, v) => { if (v && v.trim()) t += `\n\n${label}\n${v.trim()}`; };
  if (on('traits')) add('Personality:', cap(P.traits, 500));
  if (on('style')) add('Speaking style:', cap(P.style, 600));
  if (on('story')) add('Backstory:', cap(P.story, 1800));
  if (on('scene')) add('Current scenario:', cap(P.scene, 900));
  if (on('user') && (P.user.n || P.user.d)) add('The person you are talking to:', `${P.user.n ? 'Name: ' + P.user.n.trim() + '. ' : ''}${cap(P.user.d, 600)}`);
  if (on('avoid')) add('Never do the following:', cap(P.avoid, 700));
  if (on('ex') && P.ex.length) add('Example conversation (imitate this voice, do not repeat it):', P.ex.slice(0, 3).map(e => `User: ${cap(e.u, 300)}\n${name || 'You'}: ${cap(e.a, 400)}`).join('\n\n'));
  if (on('greet') && P.greet.trim()) add('You opened this chat by saying:', '"' + cap(P.greet, 400) + '"');
  if (P.mem.on && P.mem.state.trim()) add('Your memory of earlier conversations with this person (treat as true, bring it up naturally):', cap(P.mem.state, 1500));
  const lore = loreSelect(P, query, Math.max(0, budget - t.length));
  if (lore) t += `\n\nLore and reference material. Stay consistent with it and use it when relevant:\n${lore}`;
  return t;
}
const personaCost = P => tokEst(personaPrompt(P, FAC[fac], ''));

/* ---------------- greeting handling ---------------- */
function greetOf() { const P = P_(); return P.on.greet && P.greet.trim() ? P.greet.trim() : ''; }
function ensureGreeting(c) {
  const g = greetOf();
  if (!c.m.length) { if (g) c.m = [{ r: 'a', t: g, greet: true }]; }
  else if (c.m.length === 1 && c.m[0].greet) { if (g) c.m[0].t = g; else c.m = []; }
}

/* ---------------- editor ---------------- */
const tgl2 = (k, on) => `<label class="sw2" title="${on ? 'On' : 'Off'}"><input type="checkbox" ${on ? 'checked' : ''} onchange="pTog('${k}',this.checked)"><i></i></label>`;
const pcard = (P, k, inner, extra = '') => {
  const f = PFEAT.find(x => x[0] === k); const on = !!P.on[k];
  return `<div class="card pc ${on ? '' : 'off'}" id="pc_${k}"><h4>${f[1]}${extra}<small style="margin-left:auto">${tgl2(k, on)}</small></h4><p class="hint" style="margin:2px 0 6px">${f[2]}</p><div class="pbody" ${on ? '' : 'style="display:none"'}>${inner}</div></div>`;
};
const ta = (k, rows, ph, v) => `<textarea style="width:100%" rows="${rows}" placeholder="${esc(ph)}" oninput="pIn('${k}',this.value)">${esc(v || '')}</textarea>`;
function personaView() {
  const P = P_(), F = FAC[fac];
  const vs = typeof vessels !== 'undefined' ? vessels : [], vo = typeof voices !== 'undefined' ? voices : [];
  const sel = (id, list, cur, fn, none) => `<select onchange="${fn}" style="width:100%"><option value="">${none}</option>${list.map(x => `<option value="${x.id}" ${x.id == cur ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`;
  const vo0 = vo.find(v => v.id == P.voice) || vo.find(v => v.id == actVo);
  return `<div class="wrap"><h1 class="t">Persona</h1>
<p>Shape who your Saint is. Every personality keeps its own settings, and every section below has its own switch.</p>
<label>Personality</label><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="sb" onclick="personaMenu(this)"><span style="font-size:16px">${esc(P.av || '✨')}</span><span>${esc(P.n)}</span>${ic('chev', 14)}</button><button class="btn g" style="margin:0" onclick="pNew()">${ic('plus', 16)}New</button><button class="btn g" style="margin:0" onclick="pDup()">${ic('copy', 16)}Duplicate</button><button class="btn g" style="margin:0" onclick="pExport()">${ic('down', 16)}Export</button><button class="btn g" style="margin:0" onclick="pImport()">${ic('file', 16)}Import</button>${P.builtin ? '' : `<button class="btn g" style="margin:0" onclick="pDel()">${ic('trash', 16)}Delete</button>`}</div>
<div class="card"><h4>${ic('saint')}Identity</h4>
<div style="display:flex;gap:8px;margin-top:8px"><input style="width:58px;text-align:center;font-size:20px" maxlength="4" value="${esc(P.av || '')}" oninput="pIn('av',this.value)" ${P.builtin ? 'disabled' : ''}><input style="flex:1" placeholder="Name" value="${esc(P.n)}" oninput="pIn('n',this.value)" ${P.builtin ? 'disabled' : ''}></div>
<input style="width:100%;margin-top:8px" placeholder="One-line description" value="${esc(P.d)}" oninput="pIn('d',this.value)" ${P.builtin ? 'disabled' : ''}></div>
${pcard(P, 'p', ta('p', 5, 'You are…', P.p) + (P.builtin ? `<button class="btn g" onclick="PR.def.p=PR.def.p0;render();save()" ${P.p == P.p0 ? 'disabled' : ''}>${ic('undo', 16)}Revert to default</button>` : ''))}
${pcard(P, 'greet', ta('greet', 3, 'Hello! I was hoping you would come by…', P.greet))}
${pcard(P, 'traits', ta('traits', 2, 'curious, dry humour, secretly sentimental', P.traits))}
${pcard(P, 'style', ta('style', 2, 'Short sentences. Calls the user “traveller”. Never uses emojis.', P.style))}
${pcard(P, 'story', ta('story', 5, 'Born in a lighthouse town, she spent her childhood mapping the stars…', P.story))}
${pcard(P, 'scene', ta('scene', 3, 'A quiet library after closing time. Rain on the windows.', P.scene))}
${pcard(P, 'lore', `${ta('lore', 5, 'Facts about the world, rules, names, places…', P.lore)}
<label>Documents</label><div id="pdocs">${pDocsHtml(P)}</div>
<button class="btn g" onclick="pAddDoc()">${ic('clip', 16)}Attach documents</button>
<label>How it uses them</label><select onchange="pIn('loreMode',this.value);pMeter()" style="width:100%"><option value="smart" ${P.loreMode != 'all' ? 'selected' : ''}>Smart: bring in the parts relevant to each message (saves memory)</option><option value="all" ${P.loreMode == 'all' ? 'selected' : ''}>Everything that fits (uses the most context)</option></select>`)}
${pcard(P, 'ex', `<div id="pex">${pExHtml(P)}</div><button class="btn g" onclick="pAddEx()">${ic('plus', 16)}Add example</button>`)}
${pcard(P, 'user', `<input style="width:100%" placeholder="Your name" value="${esc(P.user.n)}" oninput="P_().user.n=this.value;save();pMeter()"><textarea style="width:100%;margin-top:8px" rows="3" placeholder="Who you are, what you like, how it should treat you" oninput="P_().user.d=this.value;save();pMeter()">${esc(P.user.d)}</textarea>`)}
${pcard(P, 'avoid', ta('avoid', 3, 'Never break character. Never discuss real-world politics.', P.avoid))}
${pcard(P, 'bind', `<label>3D vessel</label>${sel('v', vs, P.vessel, "pIn('vessel',this.value)", 'Use the appointed vessel')}<label>Voice</label>${sel('o', vo, P.voice, "pIn('voice',this.value);render()", 'Use the appointed voice')}${vo0 && vo0.speakers && vo0.speakers.length > 1 ? `<label>Speaker</label><select style="width:100%" onchange="pIn('speaker',+this.value)">${vo0.speakers.map(s => `<option value="${s.id}" ${P.speaker == s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>` : ''}<label>Speaking speed: <b id="v_spd">${(P.speed || 1).toFixed(2)}×</b></label><input type="range" min=".6" max="1.6" step=".05" value="${P.speed || 1}" oninput="pIn('speed',+this.value);document.getElementById('v_spd').textContent=(+this.value).toFixed(2)+'×'">`)}
<div class="card pc ${P.mem.on ? '' : 'off'}" id="pc_mem"><h4>Save state<small style="margin-left:auto"><label class="sw2"><input type="checkbox" ${P.mem.on ? 'checked' : ''} onchange="pMemTog(this.checked)"><i></i></label></small></h4>
<p class="hint" style="margin:2px 0 6px">Lets this personality remember you between chats. Every few messages the Saint quietly rewrites a short memory note. It costs a little battery and time (about 200 tokens per save, only while idle, never during live talk), so it is off by default.</p>
<div class="pbody" ${P.mem.on ? '' : 'style="display:none"'}>
<label>Save after every <b id="v_ev">${P.mem.every}</b> messages</label><input type="range" min="4" max="30" step="2" value="${P.mem.every}" oninput="P_().mem.every=+this.value;document.getElementById('v_ev').textContent=this.value;save()">
<label>What it remembers (editable)</label><textarea id="pmem" style="width:100%" rows="6" placeholder="Nothing saved yet." oninput="P_().mem.state=this.value;save();pMeter()">${esc(P.mem.state)}</textarea>
<div><button class="btn" onclick="svNow(true)">Save now</button><button class="btn g" onclick="pSnap()">Snapshot</button><button class="btn g" onclick="pMemClear()">Forget everything</button></div>
<div id="pslots">${pSlotsHtml(P)}</div></div></div>
<div class="card"><h4>${ic('save')}Shared memory<small style="margin-left:auto">all personalities</small></h4><textarea style="width:100%;margin-top:8px" rows="3" placeholder="Facts every personality should always remember…" oninput="mem=this.value;save()">${esc(mem)}</textarea></div>
<div class="card" style="position:sticky;bottom:0"><small id="pmeter"></small><div class="pr"><div id="pmbar" style="width:0%"></div></div></div></div>`;
}
const pDocsHtml = P => P.docs.length ? P.docs.map((d, i) => `<div class="kv" style="align-items:center"><label class="sw2" style="margin:0"><input type="checkbox" ${d.off ? '' : 'checked'} onchange="pDocTog(${i},this.checked)"><i></i></label><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.name)}</span><small>${(d.chars / 1000).toFixed(1)}k chars · ${d.chunks.length} parts</small><button class="ib" onclick="pDocDel(${i})">${ic('x', 14)}</button></div>`).join('') : '<small>No documents attached.</small>';
const pExHtml = P => P.ex.map((e, i) => `<div class="card" style="margin:6px 0"><input style="width:100%" placeholder="User says…" value="${esc(e.u)}" oninput="P_().ex[${i}].u=this.value;save();pMeter()"><textarea style="width:100%;margin-top:6px" rows="2" placeholder="Personality answers…" oninput="P_().ex[${i}].a=this.value;save();pMeter()">${esc(e.a)}</textarea><button class="btn g" style="margin:6px 0 0" onclick="pDelEx(${i})">Remove</button></div>`).join('');
const pSlotsHtml = P => P.mem.slots.length ? `<label>Snapshots</label>` + P.mem.slots.map((s, i) => `<div class="kv" style="align-items:center"><span style="flex:1">${esc(s.label)}<br><small>${new Date(s.t).toLocaleString()}</small></span><button class="btn g" style="margin:0" onclick="pSlotLoad(${i})">Restore</button><button class="ib" onclick="pSlotDel(${i})">${ic('x', 14)}</button></div>`).join('') : '';
function pMeter() {
  const P = P_(), F = FAC[fac], t = personaCost(P), pct = Math.min(100, t / F.ctx * 100), m = $('#pmeter'), b = $('#pmbar');
  if (m) m.textContent = `This personality adds about ${t} tokens to every message (${Math.round(pct)}% of the ${F.ctx}-token Context size).` + (pct > 45 ? ' That is a lot: raise Context size or trim sections.' : '');
  if (b) { b.style.width = pct + '%'; b.style.background = pct > 45 ? 'var(--glow)' : ''; }
}
function pIn(k, v) { P_()[k] = v; if (k === 'greet' || k === 'on') { /* applies to the next empty chat */ } save(); pMeter(); if (k === 'n' || k === 'av') nav(); }
function pTog(k, on) { const P = P_(); P.on[k] = on ? 1 : 0; const c = $('#pc_' + k); if (c) { c.classList.toggle('off', !on); c.querySelector('.pbody').style.display = on ? '' : 'none'; } if (k === 'greet') ensureGreeting(C); save(); pMeter(); }
function pMemTog(on) { const P = P_(); P.mem.on = !!on; const c = $('#pc_mem'); c.classList.toggle('off', !on); c.querySelector('.pbody').style.display = on ? '' : 'none'; save(); pMeter(); }
function personaMenu(el) {
  const items = Object.keys(PR).map(k => ({ l: (PR[k].av || '') + ' ' + PR[k].n, s: PR[k].d || '', on: k == prof, ic: 'saint', fn: () => { prof = k; ensureGreeting(C); render(); save(); nav(); } }));
  menu(el, items);
}
function pNew() { dlg(`<h4>New personality</h4><input id="pnn" placeholder="Name" style="width:100%">` + acts('Create', 'pDoNew()')); }
function pDoNew() { const n = ($('#pnn').value || '').trim(); if (!n) return; const id = 'p' + (uid++); PR[id] = newPersona(n); prof = id; cl(); ensureGreeting(C); render(); save(); nav(); }
function pDup() { const id = 'p' + (uid++), P = JSON.parse(JSON.stringify(P_())); P.n += ' copy'; delete P.builtin; delete P.p0; PR[id] = P; prof = id; render(); save(); nav(); toast('Duplicated'); }
function pDel() { const P = P_(); if (P.builtin) return; dlg(`<h4>Delete “${esc(P.n)}”?</h4><p>Its instruction, lore, documents and saved memory are removed.</p>` + acts('Delete', 'pDoDel()')); }
function pDoDel() { delete PR[prof]; prof = 'def'; cl(); ensureGreeting(C); render(); save(); nav(); }
function pExport() { const P = JSON.parse(JSON.stringify(P_())); delete P.builtin; saveOut((P.n || 'persona').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() + '.persona.json', 'application/json', JSON.stringify({ cathedrai: 'persona', v: 1, persona: P }, null, 1)); }
function pImport() {
  const f = document.createElement('input'); f.type = 'file'; f.accept = '.json,application/json';
  f.onchange = async () => { try { const j = JSON.parse(await f.files[0].text()); const src = j.persona || j; if (!src || typeof src !== 'object' || !src.n) throw 0; const P = { ...newPersona(src.n), ...src }; delete P.builtin; const id = 'p' + (uid++); PR[id] = P; personaMigrate(); prof = id; render(); save(); nav(); toast('Imported ' + P.n); } catch (e) { toast('That is not a persona file'); } };
  f.click();
}
async function pAddDoc() {
  const f = document.createElement('input'); f.type = 'file'; f.multiple = true; f.accept = '.pdf,.docx,.pptx,.xlsx,.txt,.md,.markdown,.html,.htm,.rtf,.odt,.epub,.csv,.json,text/*';
  f.onchange = async () => {
    const P = P_(); let ok = 0;
    for (const fl of f.files) {
      toast('Reading ' + fl.name + '…');
      const a = await readAtt(fl);
      if (a.text == null || !a.text.trim()) { toast(fl.name + ': ' + (a.note || 'nothing readable')); continue; }
      const text = a.text.slice(0, 150000);
      if (P.docs.reduce((s, d) => s + d.chars, 0) + text.length > 450000) { toast('Documents are full (about 450k characters in total). Remove one first.'); break; }
      P.docs.push({ id: 'd' + (uid++), name: fl.name, chars: text.length, chunks: chunkText(text) }); ok++;
    }
    if (ok) { $('#pdocs').innerHTML = pDocsHtml(P); save(); pMeter(); toast(ok + ' document' + (ok > 1 ? 's' : '') + ' added'); }
  };
  f.click();
}
function pDocDel(i) { P_().docs.splice(i, 1); $('#pdocs').innerHTML = pDocsHtml(P_()); save(); pMeter(); }
function pDocTog(i, on) { P_().docs[i].off = !on; save(); pMeter(); }
function pAddEx() { P_().ex.push({ u: '', a: '' }); $('#pex').innerHTML = pExHtml(P_()); save(); }
function pDelEx(i) { P_().ex.splice(i, 1); $('#pex').innerHTML = pExHtml(P_()); save(); pMeter(); }
function pSnap() { const P = P_(); if (!P.mem.state.trim()) return toast('Nothing to snapshot yet'); P.mem.slots.unshift({ t: Date.now(), label: 'Snapshot ' + (P.mem.slots.length + 1), state: P.mem.state }); P.mem.slots = P.mem.slots.slice(0, 6); $('#pslots').innerHTML = pSlotsHtml(P); save(); toast('Snapshot saved'); }
function pSlotLoad(i) { const P = P_(); P.mem.state = P.mem.slots[i].state; const t = $('#pmem'); if (t) t.value = P.mem.state; save(); pMeter(); toast('Memory restored'); }
function pSlotDel(i) { const P = P_(); P.mem.slots.splice(i, 1); $('#pslots').innerHTML = pSlotsHtml(P); save(); }
function pMemClear() { const P = P_(); P.mem.state = ''; C.svAt = C.m.length; chats.forEach(c => { c.svAt = c.m.length; }); const t = $('#pmem'); if (t) t.value = ''; save(); pMeter(); toast('Forgotten'); }

/* ---------------- save state: background note-taking ---------------- */
let bgBusy = false;
async function bgWait() { if (!bgBusy) return; try { CA() && CA().stopGeneration(); } catch (e) { /* ignore */ } for (let i = 0; i < 40 && bgBusy; i++) await sleep(100); }
function svDue(c) { const P = P_(); return P.mem.on && !bgBusy && !busy && awake && loaded && (c.m.length - (c.svAt || 0)) >= P.mem.every; }
async function svNow(manual) {
  const P = P_(), c = C;
  if (!CA()) return manual && toast('Needs the Android app');
  if (busy || bgBusy) return manual && toast('Busy: try again in a moment');
  if (!awake) return manual && toast('Your Saint is switched off');
  const am = models.find(x => x.id == act && x.st == 'ready'); if (!am) return manual && toast('No Saint appointed');
  const from = c.svAt || 0, slice = c.m.slice(from).filter(m => !m.greet && !m.err && m.t && m.t != 'Stopped.');
  if (!slice.length) return manual && toast('Nothing new to remember');
  const nm = P.builtin ? 'Assistant' : P.n, un = (P.user && P.user.n) || 'User';
  let tr = slice.map(m => (m.r == 'u' ? un : nm) + ': ' + m.t.replace(/\s+/g, ' ').slice(0, 500)).join('\n');
  if (tr.length > 3200) tr = tr.slice(-3200);
  bgBusy = true; if (manual) toast('Saving memory…');
  let acc = '';
  try {
    await ensureLoaded(am);
    curGen = { on: t => { acc += t; } };
    const r = await CA().generate({ messages: [{ role: 'system', content: 'You maintain the long-term memory of a character in a chat. Rewrite the memory note using the new conversation. Keep it under 900 characters, plain text, with exactly these headings: Summary:, About the user:, Relationship:, Open threads:. Keep stable facts, drop small talk.' }, { role: 'user', content: `Current memory:\n${P.mem.state.trim() || '(empty)'}\n\nNew conversation:\n${tr}\n\nWrite the updated memory note.` }], temp: .3, topP: .9, topK: 40, repeat: 1.05, maxTokens: 280, seed: -1 });
    if (r && r.ok) { const s = acc.replace(/^\s*\[[a-z]{3,12}\]\s*/i, '').trim().slice(0, 1400); if (s.length > 25) { P.mem.state = s; P.mem.at = Date.now(); c.svAt = c.m.length; const t = $('#pmem'); if (t) t.value = s; save(); if (manual) toast('Memory saved'); dlog('save-state', 'saved ' + s.length + ' chars'); } }
  } catch (e) { dlog('save-state', 'failed: ' + ((e && e.message) || e)); if (manual) toast('Could not save: ' + ((e && e.message) || e)); }
  curGen = null; bgBusy = false;
}
