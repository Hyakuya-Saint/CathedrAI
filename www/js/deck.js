/* CathedrAI slide designer: themes, backgrounds, decorations, layouts, text styles, auto-design, editor, export.
   Loaded before the main script; everything hangs off the global DK. */
const DK = (() => {
  const FONTS = {
    sans: "Inter,'Segoe UI',system-ui,-apple-system,sans-serif",
    serif: "Georgia,'Times New Roman',serif",
    display: "'Arial Black','Helvetica Neue',Impact,sans-serif",
    mono: "ui-monospace,'SFMono-Regular',Menlo,Consolas,monospace",
    hand: "'Segoe Print','Bradley Hand','Comic Sans MS',cursive"
  };
  // id: [name, bg1, bg2, angle, text, accent, accent2, font]
  const TH = {
    cathedral: ['Cathedral', '#1B1315', '#0B0809', 135, '#ffffff', '#C9A24B', '#E8283F', 'sans'],
    midnight: ['Midnight', '#0f172a', '#312e81', 135, '#f8fafc', '#22d3ee', '#a78bfa', 'sans'],
    sunset: ['Sunset', '#ff7e5f', '#b8239a', 135, '#ffffff', '#ffe27a', '#ffffff', 'display'],
    forest: ['Forest', '#052e1c', '#0f5132', 150, '#ecfdf5', '#a3e635', '#34d399', 'sans'],
    paper: ['Paper', '#faf5ea', '#efe4cf', 135, '#2b2118', '#c2410c', '#7c2d12', 'serif'],
    neon: ['Neon', '#07040f', '#1a0b2e', 160, '#ffffff', '#ff2fd0', '#1fe0ff', 'mono'],
    ocean: ['Ocean', '#0ea5e9', '#1e3a8a', 160, '#ffffff', '#fde047', '#67e8f9', 'sans'],
    royal: ['Royal', '#2e1065', '#4c1d95', 135, '#faf5ff', '#fbbf24', '#f0abfc', 'serif'],
    mono: ['Mono', '#ffffff', '#ededed', 135, '#111111', '#e11d48', '#111111', 'display'],
    blush: ['Blush', '#ffe4ec', '#fbcfe8', 135, '#4a1d3a', '#db2777', '#7c3aed', 'sans'],
    slate: ['Slate', '#1e293b', '#0f172a', 135, '#e2e8f0', '#f59e0b', '#38bdf8', 'sans'],
    sand: ['Sand', '#f4e4c1', '#e8c68a', 135, '#3b2a14', '#b45309', '#065f46', 'serif']
  };
  const theme = id => { const t = TH[id] || TH.cathedral; return { id, n: t[0], c1: t[1], c2: t[2], a: t[3], tx: t[4], ac: t[5], ac2: t[6], font: t[7] }; };
  const LAYOUTS = ['cover', 'section', 'bullets', 'split', 'cards', 'stats', 'quote', 'timeline', 'closing', 'big'];
  const DECOS = ['blobs', 'circles', 'rings', 'corner', 'diagonal', 'dots', 'waves', 'frame', 'sparkles', 'bars', 'lines'];
  const PATTERNS = ['dots', 'grid', 'stripes', 'rings', 'diamonds', 'waves'];
  const TSTYLES = ['plain', 'gradient', 'outline', 'shadow', 'stamp', 'underline'];
  const GRADS = [['#0f172a', '#312e81', 135], ['#ff7e5f', '#b8239a', 135], ['#134e5e', '#71b280', 150], ['#232526', '#414345', 135], ['#fc466b', '#3f5efb', 135], ['#f7971e', '#ffd200', 120], ['#00c6ff', '#0072ff', 160], ['#8e2de2', '#4a00e0', 135], ['#ee0979', '#ff6a00', 135], ['#0b0809', '#6B0F1A', 150], ['#faf5ea', '#e8c68a', 135], ['#ffffff', '#d7e3fc', 135]];

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rgba = (hex, a) => { const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex || ''); if (!m) return `rgba(255,255,255,${a})`; let h = m[1]; if (h.length === 3) h = h.replace(/./g, '$&$&'); return `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4), 16)},${a})`; };
  const lum = hex => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return 0; const h = m[1]; return (0.299 * parseInt(h.slice(0, 2), 16) + 0.587 * parseInt(h.slice(2, 4), 16) + 0.114 * parseInt(h.slice(4), 16)) / 255; };
  const rnd = (seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)(Date.now() & 0xffff);
  const pick = a => a[Math.floor(rnd() * a.length)];

  /* ---------------- inline text formatting ---------------- */
  const fmt = s => esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)([^*]+?)\*(?!\*)/g, '$1<i>$2</i>')
    .replace(/==(.+?)==/g, '<mark>$1</mark>').replace(/~~(.+?)~~/g, '<s>$1</s>').replace(/__(.+?)__/g, '<u>$1</u>')
    .replace(/\[\[(.+?)\]\]/g, '<span class="big">$1</span>').replace(/`([^`]+)`/g, '<code>$1</code>');

  /* ---------------- parsing ---------------- */
  // Deck source: optional @directives; slides separated by a line of ---
  function splitSlides(src) { return String(src || '').split(/\n[ \t]*-{3,}[ \t]*(?:\n|$)/).map(x => x.trim()).filter(Boolean); }
  function colors(str) { return (str.match(/#[0-9a-fA-F]{3,6}\b/g) || []); }
  function applyDirective(o, k, v) {
    k = k.toLowerCase(); v = v.trim();
    if (k === 'theme') { const id = v.toLowerCase().replace(/[^a-z]/g, ''); if (TH[id]) o.theme = id; }
    else if (k === 'font') { const f = v.toLowerCase(); if (FONTS[f]) o.font = f; }
    else if (k === 'layout') { const l = v.toLowerCase().replace(/[^a-z]/g, ''); if (LAYOUTS.includes(l)) o.layout = l; else if (l === 'title') o.layout = 'cover'; else if (l === 'list' || l === 'content') o.layout = 'bullets'; else if (l === 'end' || l === 'thanks') o.layout = 'closing'; else if (l === 'steps') o.layout = 'timeline'; else if (l === 'numbers') o.layout = 'stats'; else if (l === 'twocolumn' || l === 'columns') o.layout = 'split'; }
    else if (k === 'bg' || k === 'background') {
      const t = v.toLowerCase(), cs = colors(v), ang = +((v.match(/\b(\d{1,3})\s*(?:deg)?\s*$/) || [])[1]);
      if (/^(grad|gradient)/.test(t) && cs.length >= 2) o.bg = { k: 'grad', c: cs.slice(0, 2), a: isNaN(ang) ? 135 : ang };
      else if (/^solid/.test(t) && cs[0]) o.bg = { k: 'solid', c: [cs[0]] };
      else if (/^mesh/.test(t) && cs.length >= 2) o.bg = { k: 'mesh', c: [cs[0], cs[1], cs[2] || cs[0], cs[3] || '#0b0809'] };
      else if (/^pattern/.test(t)) { const p = PATTERNS.find(x => t.includes(x)) || 'dots'; o.bg = { k: 'pattern', p, c: cs.length >= 2 ? cs.slice(0, 2) : null, a: 135 }; }
      else if (cs.length >= 2) o.bg = { k: 'grad', c: cs.slice(0, 2), a: isNaN(ang) ? 135 : ang };
      else if (cs.length === 1) o.bg = { k: 'solid', c: cs };
    }
    else if (k === 'accent' || k === 'color') { const c = colors(v)[0]; if (c) o.ac = c; }
    else if (k === 'deco' || k === 'decor' || k === 'decoration') o.deco = v.toLowerCase().split(/[\s,+]+/).filter(x => DECOS.includes(x));
    else if (k === 'align') { const a = v.toLowerCase(); if (/left|center|right/.test(a)) o.align = a.match(/left|center|right/)[0]; }
    else if (k === 'titlestyle' || k === 'title') { const t = v.toLowerCase(); if (TSTYLES.includes(t)) o.ts = t; }
  }
  function parseBlocks(text) {
    const o = { title: '', sub: '', lis: [], ol: [], quote: '', by: '', stats: [], paras: [] };
    const dir = {};
    let seenTitle = false, bq = [];
    for (let raw of text.split('\n')) {
      const line = raw.trim(); if (!line) continue;
      let m;
      if ((m = line.match(/^@(\w+)\s*(.*)$/))) { applyDirective(dir, m[1], m[2]); continue; }
      if ((m = line.match(/^#{1,3}\s+(.*)$/))) { if (!seenTitle) { o.title = m[1]; seenTitle = true; } else o.paras.push('**' + m[1] + '**'); continue; }
      if ((m = line.match(/^>\s?(.*)$/))) { bq.push(m[1]); continue; }
      if ((m = line.match(/^(?:stat|number)\s*:\s*(.+?)\s*[|—–-]\s*(.+)$/i))) { o.stats.push({ n: m[1], l: m[2] }); continue; }
      if ((m = line.match(/^[-*•]\s+(.*)$/))) { o.lis.push(m[1]); continue; }
      if ((m = line.match(/^\d+[.)]\s+(.*)$/))) { o.ol.push(m[1]); continue; }
      if ((m = line.match(/^[—–-]{1,2}\s*(.+)$/)) && bq.length) { o.by = m[1]; continue; }
      if (!seenTitle) { o.title = line; seenTitle = true; continue; }
      o.paras.push(line);
    }
    if (bq.length) { const last = bq[bq.length - 1], mm = /^[—–-]{1,2}\s*(.+)$/.exec(last); if (mm && bq.length > 1) { o.by = mm[1]; bq.pop(); } o.quote = bq.join(' '); }
    if (!o.stats.length) { // "87% — Retention" style bullets become stats when most of them start with a number
      const cand = o.lis.map(x => x.match(/^(\$?[\d][\d.,]*\s*[%+xkKmMbB]?\+?)\s*[|:—–-]\s*(.+)$/)).filter(Boolean);
      if (o.lis.length >= 2 && cand.length === o.lis.length) o.stats = cand.map(m => ({ n: m[1], l: m[2] }));
    }
    return { b: o, dir };
  }
  function chooseLayout(b, i, n) {
    const words = [b.title, ...b.paras, ...b.lis].join(' ').trim().split(/\s+/).length;
    if (b.quote && !b.lis.length) return 'quote';
    if (b.stats.length >= 2) return 'stats';
    if (i === 0 && b.lis.length + b.ol.length <= 2 && words < 40) return 'cover';
    if (i === n - 1 && n > 2 && b.lis.length + b.ol.length <= 3 && /thank|question|conclu|summary|next|contact|end|bye/i.test(b.title + ' ' + b.paras.join(' '))) return 'closing';
    if (b.ol.length >= 3 && b.ol.length <= 6 && !b.lis.length) return 'timeline';
    if (!b.lis.length && !b.ol.length && b.paras.length <= 1 && words < 18) return i === 0 ? 'cover' : 'section';
    if (b.lis.length >= 3 && b.lis.length <= 6 && b.lis.every(x => x.length < 60) && i % 3 === 1) return 'cards';
    if ((b.paras.length && b.lis.length >= 2) && i % 2 === 0) return 'split';
    return 'bullets';
  }
  const DECO_SETS = [['blobs'], ['circles', 'dots'], ['corner'], ['waves'], ['rings', 'sparkles'], ['diagonal'], ['bars', 'lines'], ['frame', 'sparkles']];
  function autoStyle(layout, i, th) {
    const s = {};
    const dark = lum(th.c1) < 0.5;
    if (layout === 'cover' || layout === 'closing') { s.bg = i % 2 ? { k: 'mesh', c: [th.ac, th.ac2, th.c2, th.c1] } : { k: 'grad', c: [th.c1, th.c2], a: th.a }; s.deco = DECO_SETS[(i + 2) % DECO_SETS.length]; s.ts = i % 2 ? 'gradient' : 'shadow'; }
    else if (layout === 'section') { s.bg = { k: 'grad', c: [th.ac, th.ac2 === th.ac ? th.c2 : th.ac2], a: 135 }; s.ts = 'stamp'; s.deco = ['circles']; s.tx = lum(th.ac) > 0.6 ? '#111111' : '#ffffff'; }
    else if (layout === 'quote') { s.bg = { k: 'pattern', p: 'dots', c: null, a: th.a }; s.deco = ['sparkles']; s.ts = 'plain'; }
    else if (layout === 'stats') { s.bg = { k: 'pattern', p: i % 2 ? 'grid' : 'diamonds', c: null, a: th.a }; s.deco = ['dots']; s.ts = 'underline'; }
    else { s.bg = i % 3 === 0 ? { k: 'pattern', p: pick(PATTERNS), c: null, a: th.a } : null; s.deco = DECO_SETS[i % DECO_SETS.length]; s.ts = pick(['underline', 'plain', 'gradient']); }
    if (!dark && s.bg && s.bg.k === 'mesh') s.bg = { k: 'grad', c: [th.c1, th.c2], a: th.a };
    return s;
  }
  function bodyHtml(layout, b) {
    const T = b.title ? `<h3>${fmt(b.title)}</h3>` : '';
    const paras = b.paras.map(p => `<p>${fmt(p)}</p>`).join('');
    const lis = b.lis.map(x => `<li>${fmt(x)}</li>`).join('');
    const ol = b.ol.map(x => `<li>${fmt(x)}</li>`).join('');
    const lists = (lis ? `<ul>${lis}</ul>` : '') + (ol ? `<ol>${ol}</ol>` : '');
    switch (layout) {
      case 'cover': case 'closing': case 'section': case 'big':
        return T + (b.paras.length ? `<p class="sub">${fmt(b.paras[0])}</p>` : '') + b.paras.slice(1).map(p => `<p>${fmt(p)}</p>`).join('') + (lists ? `<div class="mini">${lists}</div>` : '');
      case 'split': return T + `<div class="cols"><div class="l">${paras || ''}</div><div class="r">${lists}</div></div>`;
      case 'cards': {
        const items = b.lis.length ? b.lis : b.ol.length ? b.ol : b.paras;
        return T + `<div class="cards">${items.map((x, k) => { const m = x.match(/^(.{2,34}?)\s*[:—–-]\s+(.+)$/); return `<div class="cd"><i>${k + 1}</i>${m ? `<h4>${fmt(m[1])}</h4><p>${fmt(m[2])}</p>` : `<p>${fmt(x)}</p>`}</div>`; }).join('')}</div>`;
      }
      case 'stats': {
        const st = b.stats.length ? b.stats : (b.lis.length ? b.lis : b.paras).slice(0, 4).map(x => { const m = x.match(/(\$?\d[\d.,]*\s*[%+xkKmMbB]?)/); return m ? { n: m[1], l: x.replace(m[1], '').replace(/^[\s:|—–-]+/, '') } : { n: '•', l: x }; });
        return T + `<div class="stats">${st.map(s => `<div class="st"><b>${fmt(s.n)}</b><span>${fmt(s.l)}</span></div>`).join('')}</div>`;
      }
      case 'quote': return `<blockquote>${fmt(b.quote || b.paras[0] || b.title)}</blockquote>` + (b.by ? `<p class="by">— ${fmt(b.by)}</p>` : b.title && b.quote ? `<p class="by">— ${fmt(b.title)}</p>` : '');
      case 'timeline': {
        const items = b.ol.length ? b.ol : b.lis;
        return T + `<ol class="tl">${items.map(x => { const m = x.match(/^(.{2,34}?)\s*[:—–-]\s+(.+)$/); return `<li>${m ? `<b>${fmt(m[1])}</b><span>${fmt(m[2])}</span>` : `<b>${fmt(x)}</b>`}</li>`; }).join('')}</ol>`;
      }
      default: return T + paras + lists;
    }
  }

  // markdown/DSL -> deck model. keeps `legacy` html if an old deck stored edited slides.
  function build(src, legacy) {
    const chunks = splitSlides(src);
    const deck = { theme: null, font: null, slides: [] };
    const parsed = chunks.map(ch => parseBlocks(ch));
    // first chunk may be pure deck-level directives
    const globalDir = {};
    if (parsed.length > 1 && !parsed[0].b.title && !parsed[0].b.paras.length && !parsed[0].b.lis.length) { Object.assign(globalDir, parsed[0].dir); parsed.shift(); }
    parsed.forEach(p => { if (p.dir.theme && !globalDir.theme) globalDir.theme = p.dir.theme; if (p.dir.font && !globalDir.font) globalDir.font = p.dir.font; });
    const titleWords = parsed.map(p => p.b.title).join(' ');
    deck.theme = globalDir.theme || autoTheme(titleWords);
    deck.font = globalDir.font || null;
    const th = theme(deck.theme), n = parsed.length;
    parsed.forEach((p, i) => {
      const b = p.b, d = p.dir;
      const layout = d.layout || chooseLayout(b, i, n);
      const auto = autoStyle(layout, i, th);
      const s = { layout, src: chunks[chunks.length - n + i] || '', bg: d.bg || auto.bg, deco: d.deco || auto.deco, ac: d.ac || null, font: d.font || null, align: d.align || null, ts: d.ts || auto.ts, tx: d.tx || auto.tx || null, html: bodyHtml(layout, b), edited: false };
      if (legacy && legacy[i]) { s.html = legacy[i]; s.edited = true; }
      deck.slides.push(s);
    });
    if (!deck.slides.length) deck.slides.push({ layout: 'cover', bg: null, deco: ['blobs'], ts: 'gradient', html: '<h3>Untitled</h3>', src: '', edited: false });
    return deck;
  }
  function autoTheme(words) {
    const w = words.toLowerCase();
    const rules = [[/game|neon|cyber|tech|code|ai\b|robot|digital|data/, 'neon'], [/nature|forest|eco|green|garden|climate/, 'forest'], [/ocean|sea|water|travel|beach/, 'ocean'], [/history|book|story|poem|literature|art\b/, 'paper'], [/love|wedding|baby|cute|kawaii|pink/, 'blush'], [/finance|business|market|sales|report|strategy|plan/, 'slate'], [/royal|luxury|gold|premium|church|cathedral|saint/, 'cathedral'], [/sun|summer|party|fun|festival|energy/, 'sunset'], [/space|night|galaxy|science|physics/, 'midnight']];
    for (const [r, id] of rules) if (r.test(w)) return id;
    return pick(['midnight', 'cathedral', 'sunset', 'ocean', 'royal', 'slate']);
  }
  function ensure(c) { // c = message canvas object {kind:'slides', src, deck?, slides?}
    if (!c.deck) { c.deck = build(c.src, c.slides && c.slides.length ? c.slides : null); delete c.slides; }
    return c.deck;
  }

  /* ---------------- backgrounds & decorations ---------------- */
  function patternCss(p, col) {
    const c = rgba(col, 0.16), c2 = rgba(col, 0.09);
    switch (p) {
      case 'grid': return `linear-gradient(${c2} 1px,transparent 1px),linear-gradient(90deg,${c2} 1px,transparent 1px);background-size:3.2em 3.2em`;
      case 'stripes': return `repeating-linear-gradient(45deg,${c2} 0 1.2em,transparent 1.2em 2.4em)`;
      case 'rings': return `repeating-radial-gradient(circle at 82% 18%,${c2} 0 .15em,transparent .15em 3em)`;
      case 'diamonds': return `linear-gradient(45deg,${c2} 25%,transparent 25%,transparent 75%,${c2} 75%),linear-gradient(45deg,${c2} 25%,transparent 25%,transparent 75%,${c2} 75%);background-size:4em 4em;background-position:0 0,2em 2em`;
      case 'waves': return `radial-gradient(circle at 50% 100%,transparent 1.2em,${c2} 1.25em,${c2} 1.5em,transparent 1.55em);background-size:4em 2em`;
      default: return `radial-gradient(${c} .12em,transparent .14em);background-size:2.2em 2.2em`;
    }
  }
  function bgLayers(s, th) {
    const bg = s.bg;
    if (!bg) return { base: `linear-gradient(${th.a}deg,${th.c1},${th.c2})`, pat: '' };
    if (bg.k === 'solid') return { base: bg.c[0], pat: '' };
    if (bg.k === 'grad') return { base: `linear-gradient(${bg.a ?? 135}deg,${bg.c[0]},${bg.c[1]})`, pat: '' };
    if (bg.k === 'mesh') return { base: `radial-gradient(at 18% 12%,${bg.c[0]} 0,transparent 55%),radial-gradient(at 88% 22%,${bg.c[1]} 0,transparent 52%),radial-gradient(at 55% 100%,${bg.c[2]} 0,transparent 58%),${bg.c[3] || th.c1}`, pat: '' };
    if (bg.k === 'image') return { base: `linear-gradient(rgba(0,0,0,${bg.dim ?? 0.45}),rgba(0,0,0,${bg.dim ?? 0.45})),url(${bg.src}) center/cover`, pat: '' };
    if (bg.k === 'pattern') { const c = bg.c || [th.c1, th.c2]; return { base: `linear-gradient(${bg.a ?? th.a}deg,${c[0]},${c[1]})`, pat: patternCss(bg.p, s.tx || th.tx) }; }
    return { base: th.c1, pat: '' };
  }
  const svg = (inner) => `<svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
  function deco(name, a, b) {
    const f = (c, o) => `fill="${c}" fill-opacity="${o}"`, st = (c, o, w = .5) => `fill="none" stroke="${c}" stroke-opacity="${o}" stroke-width="${w}"`;
    switch (name) {
      case 'blobs': return svg(`<path ${f(a, .28)} d="M-10 -5 C30 -10 50 20 25 38 C5 52 -20 40 -10 -5Z"/><path ${f(b, .22)} d="M120 70 C150 55 175 75 170 100 C140 110 105 95 120 70Z"/><circle cx="140" cy="18" r="9" ${f(a, .14)}/>`);
      case 'circles': return svg(`<circle cx="150" cy="82" r="46" ${f(a, .13)}/><circle cx="150" cy="82" r="30" ${f(b, .16)}/><circle cx="150" cy="82" r="14" ${f(a, .25)}/>`);
      case 'rings': return svg(`<circle cx="12" cy="10" r="30" ${st(a, .5)}/><circle cx="12" cy="10" r="22" ${st(b, .4)}/><circle cx="12" cy="10" r="14" ${st(a, .3)}/>`);
      case 'corner': return svg(`<path d="M0 0H62L0 34Z" ${f(a, .9)}/><path d="M160 90H112L160 58Z" ${f(b, .85)}/>`);
      case 'diagonal': return svg(`<path d="M95 0H128L60 90H27Z" ${f(a, .17)}/><path d="M133 0H141L73 90H65Z" ${f(b, .35)}/>`);
      case 'dots': { let d = ''; for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) d += `<circle cx="${118 + i * 7}" cy="${8 + j * 7}" r="1.1" ${f(a, .55)}/>`; return svg(d); }
      case 'waves': return svg(`<path d="M0 70 C25 58 45 82 80 70 S135 58 160 70V90H0Z" ${f(a, .22)}/><path d="M0 78 C30 68 55 88 90 78 S140 70 160 78V90H0Z" ${f(b, .3)}/>`);
      case 'frame': return svg(`<rect x="5" y="5" width="150" height="80" rx="2" ${st(a, .6, .6)}/><path d="M5 14V5H14M146 5H155V14M155 76V85H146M14 85H5V76" ${st(b, .95, 1.1)}/>`);
      case 'sparkles': { const star = (x, y, s, o) => `<path d="M${x} ${y - s}L${x + s * .28} ${y - s * .28}L${x + s} ${y}L${x + s * .28} ${y + s * .28}L${x} ${y + s}L${x - s * .28} ${y + s * .28}L${x - s} ${y}L${x - s * .28} ${y - s * .28}Z" ${f(a, o)}/>`; return svg(star(140, 16, 7, .85) + star(122, 30, 3.5, .6) + star(24, 70, 5, .7) + star(40, 80, 2.5, .5) + star(150, 62, 3, .5)); }
      case 'bars': { let d = ''; const h = [14, 22, 18, 30, 24, 38, 32]; h.forEach((v, i) => { d += `<rect x="${104 + i * 7.5}" y="${90 - v}" width="5" height="${v}" rx="1" ${f(i % 2 ? b : a, .3)}/>`; }); return svg(d); }
      case 'lines': return svg(`<rect x="0" y="0" width="160" height="2.2" ${f(a, .95)}/><rect x="0" y="87.8" width="160" height="2.2" ${f(b, .95)}/><rect x="10" y="12" width="26" height="1" ${f(a, .6)}/>`);
      default: return '';
    }
  }

  /* ---------------- slide rendering ---------------- */
  function slideHtml(deck, s, i, o = {}) {
    const th = theme(deck.theme), ac = s.ac || th.ac, ac2 = s.ac ? th.ac2 : th.ac2, tx = s.tx || th.tx;
    const font = FONTS[s.font || deck.font || th.font] || FONTS.sans, L = bgLayers(s, th);
    const al = s.align || (['cover', 'closing', 'section', 'quote', 'big'].includes(s.layout) ? 'center' : 'left');
    const dc = (s.deco || []).map(d => `<div class="dc">${deco(d, ac, ac2)}</div>`).join('');
    const sty = `--tx:${tx};--ac:${ac};--ac2:${ac2};--fn:${font};--mu:${rgba(tx, .72)};--card:${rgba(tx, .09)};--cardb:${rgba(tx, .16)};`;
    return `<div class="dk L-${s.layout} ts-${s.ts || 'plain'} al-${al}" style="${sty}"><div class="bgb" style="background:${L.base}"></div>${L.pat ? `<div class="bgp" style="background:${L.pat}"></div>` : ''}${dc}<div class="sb"${o.edit ? ' contenteditable="true" spellcheck="false"' : ''}>${s.html}</div>${o.nonum ? '' : `<div class="pn">${i + 1}</div>`}</div>`;
  }

  const CSS = `
.dk{position:relative;overflow:hidden;width:100%;aspect-ratio:16/9;font-size:var(--u,16px);color:var(--tx);font-family:var(--fn);line-height:1.35;border-radius:inherit}
.dk .bgb,.dk .bgp,.dk .dc{position:absolute;inset:0}.dk .dc svg{width:100%;height:100%;display:block}.dk .dc,.dk .bgp{pointer-events:none}
.dk .sb{position:absolute;inset:0;padding:3.4em 4.4em 3.6em;display:flex;flex-direction:column;justify-content:center;gap:.7em;z-index:2;outline:0;overflow:hidden;user-select:text;-webkit-user-select:text}
.dk .pn{position:absolute;right:1.6em;bottom:1em;font-size:.8em;opacity:.55;z-index:3;font-variant-numeric:tabular-nums}
.dk h3{margin:0;font-size:2.7em;line-height:1.1;font-weight:800;letter-spacing:-.01em;color:var(--tx)}
.dk p{margin:0;font-size:1.3em}.dk .sub{font-size:1.65em;color:var(--mu)}
.dk ul,.dk ol{margin:.2em 0 0;padding-left:1.2em;font-size:1.45em}.dk li{margin:.32em 0;padding-left:.15em}.dk li::marker{color:var(--ac);font-weight:700}
.dk b{color:var(--ac)}.dk i{font-style:italic}.dk mark{background:var(--ac);color:#111;padding:0 .25em;border-radius:.2em}.dk .big{font-size:1.4em;font-weight:800;color:var(--ac)}.dk code{background:var(--card);padding:.05em .35em;border-radius:.25em}
.dk.al-center .sb{text-align:center;align-items:center}.dk.al-right .sb{text-align:right;align-items:flex-end}.dk.al-center ul,.dk.al-center ol{text-align:left}
.dk.ts-gradient h3{background:linear-gradient(90deg,var(--ac),var(--ac2));-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent}
.dk.ts-outline h3{color:transparent;-webkit-text-stroke:.04em var(--tx)}
.dk.ts-shadow h3{text-shadow:.06em .06em 0 var(--ac),.12em .12em 0 var(--ac2)}
.dk.ts-stamp h3{text-transform:uppercase;letter-spacing:.14em;font-size:2.3em;border:.09em solid var(--tx);padding:.2em .5em;display:inline-block;transform:rotate(-2deg)}
.dk.ts-underline h3{padding-bottom:.22em;background:linear-gradient(var(--ac),var(--ac)) left bottom/2.6em .12em no-repeat}.dk.al-center.ts-underline h3{background-position:center bottom}
.dk.L-cover h3,.dk.L-closing h3{font-size:3.3em;overflow-wrap:anywhere}.dk.L-big h3{font-size:4.2em;line-height:1}
.dk.L-section h3{font-size:4em}.dk .mini{font-size:.8em;opacity:.9}
.dk.L-split .cols{display:grid;grid-template-columns:1fr 1.2fr;gap:2.4em;align-items:center;margin-top:.5em}.dk.L-split .l p{font-size:1.4em;color:var(--mu)}
.dk .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(11em,1fr));gap:1em;margin-top:.5em;width:100%}
.dk .cd{background:var(--card);border:1px solid var(--cardb);border-radius:.9em;padding:1em 1.1em;text-align:left;position:relative;backdrop-filter:blur(2px)}
.dk .cd i{position:absolute;right:.7em;top:.4em;font-size:2.2em;font-weight:800;color:var(--ac);opacity:.35;font-style:normal}.dk .cd h4{margin:0 0 .3em;font-size:1.35em;color:var(--ac)}.dk .cd p{font-size:1.1em;color:var(--tx)}
.dk .stats{display:flex;gap:1.2em;flex-wrap:wrap;justify-content:center;margin-top:.6em;width:100%}
.dk .st{flex:1 1 9em;background:var(--card);border:1px solid var(--cardb);border-radius:1em;padding:1em .6em;text-align:center}.dk .st b{display:block;font-size:3.1em;line-height:1;background:linear-gradient(90deg,var(--ac),var(--ac2));-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent}.dk .st span{display:block;margin-top:.4em;font-size:1.1em;color:var(--mu)}
.dk blockquote{margin:0;font-size:2.3em;line-height:1.25;font-style:italic;font-family:Georgia,serif;position:relative;padding:0 .4em}.dk blockquote:before{content:"\\201C";position:absolute;left:-.3em;top:-.55em;font-size:3.4em;color:var(--ac);opacity:.8;font-style:normal}.dk .by{color:var(--ac);font-size:1.2em;letter-spacing:.08em;text-transform:uppercase}
.dk ol.tl{list-style:none;padding:0;margin:.8em 0 0;display:flex;gap:1em;font-size:1em;counter-reset:s;width:100%}.dk ol.tl li{flex:1;counter-increment:s;margin:0;padding:3em .8em .6em;position:relative;background:var(--card);border-radius:.9em;border:1px solid var(--cardb);text-align:left}.dk ol.tl li:before{content:counter(s);position:absolute;left:.7em;top:.6em;width:1.9em;height:1.9em;border-radius:50%;background:var(--ac);color:#111;font-weight:800;display:grid;place-items:center;font-size:1.1em}.dk ol.tl b{display:block;font-size:1.25em}.dk ol.tl span{display:block;font-size:1em;color:var(--mu);margin-top:.2em}
`;
  function injectCss() { if (!document.getElementById('dkcss')) { const s = document.createElement('style'); s.id = 'dkcss'; s.textContent = CSS + EDITOR_CSS; document.head.appendChild(s); } }
  function fit(root) { // scale em-based slides to their width
    (root || document).querySelectorAll('.dk').forEach(el => { const w = el.clientWidth; if (w) el.style.setProperty('--u', (w / 48) + 'px'); });
  }

  /* ---------------- export (self-contained slideshow) ---------------- */
  function exportHtml(deck, title) {
    const sl = deck.slides.map((s, i) => `<section class="s${i ? '' : ' on'}">${slideHtml(deck, s, i)}</section>`).join('');
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>html,body{margin:0;height:100%;background:#000;overflow:hidden;font-family:Inter,system-ui,sans-serif}
.s{position:fixed;inset:0;display:grid;place-items:center;opacity:0;pointer-events:none;transition:opacity .45s,transform .45s;transform:translateX(3%)}.s.on{opacity:1;pointer-events:auto;transform:none}.s.out{transform:translateX(-3%)}
.w{width:min(100vw,calc(100vh*16/9));aspect-ratio:16/9}#bar{position:fixed;left:0;bottom:0;height:3px;background:#C9A24B;transition:width .3s;z-index:9}#ct{position:fixed;right:12px;top:8px;color:#fff8;font:12px sans-serif;z-index:9}
#fs{position:fixed;left:10px;top:6px;color:#fff8;background:none;border:0;font-size:18px;z-index:9;cursor:pointer}
${CSS}
@media print{@page{size:1280px 720px;margin:0}html,body{overflow:visible;height:auto;background:#fff}.s{position:relative;opacity:1!important;transform:none!important;pointer-events:auto;page-break-after:always;display:block;height:100vh}#bar,#ct,#fs{display:none}.w{width:1280px;height:720px;margin:0}}</style></head><body><button id="fs" title="Fullscreen">⛶</button><div id="ct"></div><div id="bar"></div>${sl.replace(/<section class="s( on)?">/g, (m, on) => `<section class="s${on || ''}"><div class="w">`).replace(/<\/section>/g, '</div></section>')}
<script>var s=[].slice.call(document.querySelectorAll('.s')),i=0;function fit(){document.querySelectorAll('.dk').forEach(function(e){e.style.setProperty('--u',(e.clientWidth/48)+'px')})}
function g(d){var n=Math.max(0,Math.min(s.length-1,i+d));if(n==i)return;s[i].classList.remove('on');s[i].classList.toggle('out',d>0);i=n;s[i].classList.remove('out');s[i].classList.add('on');u()}
function u(){document.getElementById('ct').textContent=(i+1)+' / '+s.length;document.getElementById('bar').style.width=((i+1)/s.length*100)+'%';fit()}
document.addEventListener('keydown',function(e){if(e.key=='ArrowRight'||e.key==' '||e.key=='PageDown')g(1);if(e.key=='ArrowLeft'||e.key=='PageUp')g(-1);if(e.key=='f')document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen()});
var x0=null;document.addEventListener('touchstart',function(e){x0=e.touches[0].clientX});document.addEventListener('touchend',function(e){if(x0==null)return;var d=e.changedTouches[0].clientX-x0;x0=null;if(Math.abs(d)>40)g(d<0?1:-1)});
document.addEventListener('click',function(e){if(e.target.id=='fs'){document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen();return}g(e.clientX>innerWidth/2?1:-1)});
addEventListener('resize',fit);u();setTimeout(fit,50)<\/script></body></html>`;
  }

  /* ---------------- editor ---------------- */
  const EDITOR_CSS = `
.dke{flex:1;min-height:0;display:flex;flex-direction:column;background:#050304}
.dkt{display:flex;gap:2px;padding:5px 8px;border-bottom:1px solid var(--ln);overflow-x:auto;flex:none;align-items:center}.dkt button{padding:5px 9px;border:1px solid var(--ln);border-radius:6px;font-size:13px;flex:none;color:#ddd}.dkt button:active{background:var(--pan2)}.dkt input[type=color]{width:30px;height:28px;padding:0;border:1px solid var(--ln);border-radius:6px;background:none;flex:none}
.dks{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:10px;overflow:hidden}.dkw{border-radius:10px;overflow:hidden;box-shadow:0 8px 40px #000a,0 0 0 1px var(--ln)}
.dkn{display:flex;align-items:center;gap:8px;padding:4px 8px;border-top:1px solid var(--ln);flex:none}
.dkth{display:flex;gap:6px;overflow-x:auto;padding:6px 8px;flex:none;border-top:1px solid var(--ln)}.dkth .th{flex:none;width:96px;border-radius:6px;overflow:hidden;border:2px solid transparent;cursor:pointer;position:relative}.dkth .th.on{border-color:var(--red)}.dkth .th .dk{pointer-events:none}.dkth .th em{position:absolute;left:3px;top:1px;font-size:10px;font-style:normal;background:#000a;padding:0 4px;border-radius:3px;z-index:5}
.dkp{flex:none;border-top:1px solid var(--ln);background:var(--pan);max-height:34vh;overflow:auto}.dkp .tabs{margin:6px 8px;overflow-x:auto}.dkp .tabs button{flex:none}
.dkp .bd{padding:4px 10px 12px}.dkp .g{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}.dkp .sw{width:64px;height:38px;border-radius:8px;border:2px solid var(--ln);cursor:pointer;font-size:10px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:2px;text-shadow:0 0 3px #000}.dkp .sw.on{border-color:var(--glow)}
.dkp .ch{padding:5px 11px;border:1px solid var(--ln);border-radius:99px;font-size:12px;color:var(--mut)}.dkp .ch.on{background:var(--red);border-color:var(--red);color:#fff}
.dkp label{margin:8px 0 2px}.dkp .all{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--mut);margin:6px 0;text-transform:none;letter-spacing:0}.dkp .all input{width:auto}`;
  const E = { c: null, i: 0, tab: 'theme', all: false, ro: null, panel: true };

  function sel() { return E.c.deck.slides[E.i]; }
  function stageSize() {
    const st = document.querySelector('.dks'), w = document.getElementById('dkw'); if (!st || !w) return;
    const maxW = st.clientWidth - 20, maxH = st.clientHeight - 20;
    const W = Math.max(120, Math.min(maxW, maxH * 16 / 9)); w.style.width = W + 'px'; fit(w);
  }
  function paintStage() {
    const d = E.c.deck, s = sel(), w = document.getElementById('dkw'); if (!w) return;
    w.innerHTML = slideHtml(d, s, E.i, { edit: true });
    const sb = w.querySelector('.sb');
    sb.oninput = () => { s.html = sb.innerHTML; s.edited = true; thumb(E.i); };
    sb.onblur = () => { s.html = sb.innerHTML; };
    stageSize();
    const n = document.getElementById('dkc'); if (n) n.textContent = (E.i + 1) + ' / ' + d.slides.length;
    document.querySelectorAll('.dkth .th').forEach((t, k) => t.classList.toggle('on', k === E.i));
  }
  function thumb(k) { const t = document.querySelectorAll('.dkth .th')[k]; if (t) { t.querySelector('.in').innerHTML = slideHtml(E.c.deck, E.c.deck.slides[k], k, { nonum: true }); fit(t); } }
  function paintThumbs() {
    const box = document.getElementById('dkth'); if (!box) return; const d = E.c.deck;
    box.innerHTML = d.slides.map((s, k) => `<div class="th ${k === E.i ? 'on' : ''}" onclick="DK.go(${k})"><em>${k + 1}</em><div class="in">${slideHtml(d, s, k, { nonum: true })}</div></div>`).join('');
    fit(box);
  }
  function go(k) { E.i = Math.max(0, Math.min(E.c.deck.slides.length - 1, k)); paintStage(); paintPanel(); const t = document.querySelectorAll('.dkth .th')[E.i]; t && t.scrollIntoView({ inline: 'center', block: 'nearest' }); }
  function touch(fn) { // apply to current slide, or all slides when the toggle is on
    const d = E.c.deck; const list = E.all ? d.slides : [sel()]; list.forEach(fn); paintStage(); paintThumbs(); paintPanel();
  }
  function relayout(s, layout) {
    s.layout = layout;
    if (!s.edited) { const p = parseBlocks(s.src || '').b; s.html = bodyHtml(layout, p); }
    else toast('Layout changed. Your manual text edits on this slide were kept.');
  }
  function redesign(s, i, th) { const a = autoStyle(s.layout, i + (rnd() * 5 | 0), th); s.bg = a.bg; s.deco = a.deco; s.ts = a.ts; s.tx = a.tx || null; }
  function paintPanel() {
    const P = document.getElementById('dkp'); if (!P) return; const d = E.c.deck, s = sel(), th = theme(d.theme);
    const tabs = [['theme', 'Theme'], ['bg', 'Background'], ['layout', 'Layout'], ['deco', 'Decor'], ['text', 'Text'], ['magic', '✨ Magic']];
    let b = '';
    const chip = (label, on, fn) => `<button class="ch ${on ? 'on' : ''}" onclick="${fn}">${label}</button>`;
    if (E.tab === 'theme') b = `<div class="g">${Object.keys(TH).map(id => { const t = theme(id); return `<button class="sw ${d.theme === id ? 'on' : ''}" style="background:linear-gradient(${t.a}deg,${t.c1},${t.c2});color:${t.ac}" onclick="DK.setTheme('${id}')">${t.n}</button>`; }).join('')}</div>`;
    else if (E.tab === 'bg') b = `<label>Gradients</label><div class="g">${GRADS.map((g, k) => `<button class="sw" style="background:linear-gradient(${g[2]}deg,${g[0]},${g[1]})" onclick="DK.setBg({k:'grad',c:['${g[0]}','${g[1]}'],a:${g[2]}})"></button>`).join('')}</div>
      <label>Patterns</label><div class="g">${PATTERNS.map(p => chip(p, s.bg && s.bg.k === 'pattern' && s.bg.p === p, `DK.setBg({k:'pattern',p:'${p}',c:null,a:${th.a}})`)).join('')}</div>
      <label>Colours</label><div class="g"><input type="color" value="${(s.bg && s.bg.c && s.bg.c[0]) || th.c1}" onchange="DK.setBgColor(0,this.value)"><input type="color" value="${(s.bg && s.bg.c && s.bg.c[1]) || th.c2}" onchange="DK.setBgColor(1,this.value)">${chip('Soft mesh', s.bg && s.bg.k === 'mesh', 'DK.meshBg()')}${chip('Image…', s.bg && s.bg.k === 'image', 'DK.pickImg()')}${chip('Theme default', !s.bg, 'DK.setBg(null)')}</div>`;
    else if (E.tab === 'layout') b = `<div class="g">${LAYOUTS.map(l => chip(l, s.layout === l, `DK.setLayout('${l}')`)).join('')}</div><p class="hint">Layouts reshape the slide's text. Slides you edited by hand keep their words.</p>`;
    else if (E.tab === 'deco') b = `<div class="g">${DECOS.map(x => chip(x, (s.deco || []).includes(x), `DK.togDeco('${x}')`)).join('')}${chip('none', !(s.deco || []).length, 'DK.setDeco([])')}</div>`;
    else if (E.tab === 'text') b = `<label>Font</label><div class="g">${Object.keys(FONTS).map(f => chip(f, (s.font || d.font || th.font) === f, `DK.setFont('${f}')`)).join('')}</div><label>Title style</label><div class="g">${TSTYLES.map(t => chip(t, (s.ts || 'plain') === t, `DK.setTs('${t}')`)).join('')}</div><label>Alignment</label><div class="g">${['left', 'center', 'right'].map(a => chip(a, (s.align || (['cover', 'closing', 'section', 'quote', 'big'].includes(s.layout) ? 'center' : 'left')) === a, `DK.setAlign('${a}')`)).join('')}</div><label>Accent colour</label><div class="g"><input type="color" value="${s.ac || th.ac}" onchange="DK.setAc(this.value)">${chip('Theme accent', !s.ac, 'DK.setAc(null)')}</div>`;
    else b = `<div class="g">${chip('🎲 Redesign this slide', false, 'DK.magic(0)')}${chip('🎲 Redesign every slide', false, 'DK.magic(1)')}${chip('New theme for the deck', false, 'DK.magic(2)')}${chip('Reset this slide’s style', false, 'DK.resetStyle()')}</div>`;
    P.innerHTML = `<div class="tabs">${tabs.map(([k, n]) => `<button class="${E.tab === k ? 'on' : ''}" onclick="DK.tab('${k}')">${n}</button>`).join('')}</div><div class="bd">${E.tab !== 'magic' ? `<label class="all"><input type="checkbox" ${E.all ? 'checked' : ''} onchange="DK.setAll(this.checked)"> Apply to all slides</label>` : ''}${b}</div>`;
  }
  const api = {
    css: injectCss, fit, build, ensure, theme, slideHtml, exportHtml, THEMES: TH, FONTS, LAYOUTS, esc, fmt,
    tab(t) { E.tab = t; paintPanel(); }, setAll(v) { E.all = v; }, go,
    setTheme(id) { const d = E.c.deck; d.theme = id; if (E.all) d.slides.forEach(s => { s.bg = null; s.ac = null; s.tx = null; s.font = null; }); else { const s = sel(); s.bg = null; s.ac = null; s.tx = null; } d.font = null; paintStage(); paintThumbs(); paintPanel(); },
    setBg(bg) { touch(s => { s.bg = bg ? J(bg) : null; s.tx = null; }); },
    setBgColor(k, v) { touch(s => { const th = theme(E.c.deck.theme); if (!s.bg || !s.bg.c) s.bg = { k: 'grad', c: [th.c1, th.c2], a: th.a }; if (s.bg.k === 'solid' || s.bg.k === 'image') s.bg = { k: 'grad', c: [th.c1, th.c2], a: 135 }; s.bg.c = s.bg.c.slice(); s.bg.c[k] = v; s.tx = lum(s.bg.c[0]) > 0.62 ? '#111111' : null; }); },
    meshBg() { touch(s => { const th = theme(E.c.deck.theme); s.bg = { k: 'mesh', c: [pick([th.ac, th.ac2, '#7c3aed', '#06b6d4', '#f43f5e']), pick([th.ac2, '#f59e0b', '#22c55e', '#3b82f6']), pick(['#ec4899', '#8b5cf6', th.c2]), th.c1] }; }); },
    pickImg() { const f = document.createElement('input'); f.type = 'file'; f.accept = 'image/*'; f.onchange = async () => { const fl = f.files[0]; if (!fl) return; try { const a = await shrink(fl, 1280, .8); touch(s => { s.bg = { k: 'image', src: a.url, dim: .42 }; s.tx = null; }); } catch (e) { toast('Could not use that image'); } }; f.click(); },
    setLayout(l) { touch(s => relayout(s, l)); },
    togDeco(x) { touch(s => { const a = new Set(s.deco || []); a.has(x) ? a.delete(x) : a.add(x); s.deco = [...a]; }); }, setDeco(a) { touch(s => { s.deco = a; }); },
    setFont(f) { touch(s => { s.font = f; }); }, setTs(t) { touch(s => { s.ts = t; }); }, setAlign(a) { touch(s => { s.align = a; }); }, setAc(c) { touch(s => { s.ac = c; }); },
    resetStyle() { touch(s => { s.bg = null; s.ac = null; s.font = null; s.align = null; s.tx = null; s.ts = 'plain'; s.deco = []; }); },
    magic(m) {
      const d = E.c.deck;
      if (m === 2) { d.theme = pick(Object.keys(TH).filter(x => x !== d.theme)); d.slides.forEach((s, i) => { s.ac = null; s.font = null; s.tx = null; redesign(s, i, theme(d.theme)); }); }
      else if (m === 1) d.slides.forEach((s, i) => redesign(s, i, theme(d.theme)));
      else redesign(sel(), E.i, theme(d.theme));
      paintStage(); paintThumbs(); paintPanel();
    },
    fmtCmd(c, v) { const sb = document.querySelector('#dkw .sb'); if (!sb) return; sb.focus(); document.execCommand(c, false, v || null); sel().html = sb.innerHTML; sel().edited = true; thumb(E.i); },
    mark() { const q = getSelection(); if (!q.rangeCount || q.isCollapsed) return toast('Select some text first'); const r = q.getRangeAt(0), sb = document.querySelector('#dkw .sb'); if (!sb.contains(r.commonAncestorContainer)) return; try { const m = document.createElement('mark'); r.surroundContents(m); } catch (e) { toast('Select text inside one paragraph'); return; } sel().html = sb.innerHTML; sel().edited = true; thumb(E.i); },
    size(k) { const q = getSelection(); if (!q.rangeCount || q.isCollapsed) return toast('Select some text first'); const r = q.getRangeAt(0), sb = document.querySelector('#dkw .sb'); if (!sb.contains(r.commonAncestorContainer)) return; try { const m = document.createElement('span'); m.style.fontSize = k + 'em'; r.surroundContents(m); } catch (e) { toast('Select text inside one paragraph'); return; } sel().html = sb.innerHTML; sel().edited = true; thumb(E.i); },
    add() { const d = E.c.deck, th = theme(d.theme); d.slides.splice(E.i + 1, 0, { layout: 'bullets', src: '# New slide\n- Point', bg: null, deco: DECO_SETS[(E.i + 1) % DECO_SETS.length], ts: 'underline', html: '<h3>New slide</h3><ul><li>Point</li></ul>', edited: false }); E.i++; paintThumbs(); paintStage(); paintPanel(); },
    dup() { const d = E.c.deck; d.slides.splice(E.i + 1, 0, J(sel())); E.i++; paintThumbs(); paintStage(); paintPanel(); },
    del() { const d = E.c.deck; if (d.slides.length < 2) return toast('A deck needs at least one slide'); d.slides.splice(E.i, 1); E.i = Math.min(E.i, d.slides.length - 1); paintThumbs(); paintStage(); paintPanel(); },
    mv(dx) { const d = E.c.deck, j = E.i + dx; if (j < 0 || j >= d.slides.length) return; const t = d.slides[E.i]; d.slides[E.i] = d.slides[j]; d.slides[j] = t; E.i = j; paintThumbs(); paintStage(); },
    togglePanel() { E.panel = !E.panel; const p = document.getElementById('dkp'); if (p) p.style.display = E.panel ? '' : 'none'; setTimeout(stageSize, 30); },
    // mount into #cvb
    mount(c, B) {
      injectCss(); E.c = c; ensure(c); E.i = Math.min(E.i, c.deck.slides.length - 1);
      B.innerHTML = `<div class="dke"><div class="dkt">
<button onclick="DK.fmtCmd('bold')"><b>B</b></button><button onclick="DK.fmtCmd('italic')"><i>I</i></button><button onclick="DK.fmtCmd('underline')"><u>U</u></button><button onclick="DK.mark()" style="background:#fde047;color:#111">Hi</button><input type="color" value="#ffd24d" onchange="DK.fmtCmd('foreColor',this.value)"><button onclick="DK.size(1.3)">A+</button><button onclick="DK.size(.8)">A−</button><button onclick="DK.fmtCmd('insertUnorderedList')">• List</button><button onclick="DK.fmtCmd('removeFormat')">Clear</button><span style="flex:1"></span><button onclick="DK.togglePanel()">🎨 Design</button></div>
<div class="dks"><div class="dkw" id="dkw"></div></div>
<div class="dkn"><button class="ib" onclick="DK.go(DK_i()-1)">${ic('chev', 20).replace('<svg ', '<svg style="transform:rotate(90deg)" ')}</button><span id="dkc" style="font-size:12px;color:var(--mut)"></span><button class="ib" onclick="DK.go(DK_i()+1)">${ic('chev', 20).replace('<svg ', '<svg style="transform:rotate(-90deg)" ')}</button><span style="flex:1"></span><button class="ib" title="Move left" onclick="DK.mv(-1)">◀</button><button class="ib" title="Move right" onclick="DK.mv(1)">▶</button><button class="ib" title="Duplicate" onclick="DK.dup()">${ic('copy', 18)}</button><button class="ib" title="Add slide" onclick="DK.add()">${ic('plus', 18)}</button><button class="ib" title="Delete slide" onclick="DK.del()">${ic('trash', 18)}</button></div>
<div class="dkth" id="dkth"></div><div class="dkp" id="dkp"></div></div>`;
      paintThumbs(); paintStage(); paintPanel();
      if (E.ro) E.ro.disconnect(); E.ro = new ResizeObserver(() => { stageSize(); }); E.ro.observe(B.querySelector('.dks'));
    },
    unmount() { if (E.ro) { E.ro.disconnect(); E.ro = null; } },
    index: () => E.i
  };
  const J = o => JSON.parse(JSON.stringify(o));
  return api;
})();
function DK_i() { return DK.index(); }
