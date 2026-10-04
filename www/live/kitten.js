// KittenTTS helpers (sherpa-onnx packaging: model.onnx + voices.bin + tokens.txt). Pure functions, no DOM, testable in node.
//
// Model contract (kitten-nano-en-v0_2, checked against the real file):
//   inputs  input_ids int64 [1,n] · style float32 [1,256] · speed float32 [1]
//   outputs waveform float32 [samples] (24 kHz) · duration int64
//   voices.bin = float32 rows of 256 (one per speaker for v0.2; several per speaker for v0.8, picked by text length)
//   tokens.txt = "<symbol> <id>" lines, symbols are espeak IPA characters (same family Piper uses)
//   everything else (sample rate, speaker names, espeak voice, version) lives in the ONNX metadata_props.

/** Reads ONNX `metadata_props` (ModelProto field 14) without loading the model: only the top-level protobuf headers are
 *  visited, so a 25 MB file costs a handful of tiny reads. source: Blob | Uint8Array | ArrayBuffer. */
export async function readOnnxMeta(source) {
  const isBlob = typeof Blob !== 'undefined' && source instanceof Blob;
  const u8 = isBlob ? null : (source instanceof Uint8Array ? source : new Uint8Array(source));
  const size = isBlob ? source.size : u8.length;
  const read = async (off, n) => isBlob ? new Uint8Array(await source.slice(off, Math.min(size, off + n)).arrayBuffer()) : u8.subarray(off, Math.min(size, off + n));
  const varint = (b, p) => { let v = 0, s = 0, i = p; for (; i < b.length && i < p + 10; i++) { v += (b[i] & 0x7f) * Math.pow(2, s); s += 7; if (!(b[i] & 0x80)) return [v, i + 1 - p]; } throw new Error('Not an ONNX file (bad protobuf)'); };
  const td = new TextDecoder(), meta = {};
  let off = 0, guard = 0;
  while (off < size && guard++ < 5000) {
    const head = await read(off, 24);
    const [tag, n1] = varint(head, 0), wt = tag & 7, field = tag >>> 3;
    let p = n1;
    if (wt === 0) { const [, n] = varint(head, p); off += p + n; }
    else if (wt === 1) off += p + 8;
    else if (wt === 5) off += p + 4;
    else if (wt === 2) {
      const [len, n2] = varint(head, p); p += n2;
      if (field === 14) { // StringStringEntryProto { key = 1; value = 2 }
        const e = await read(off + p, len); let q = 0, k = '', v = '';
        while (q < e.length) { const [t, a] = varint(e, q); q += a; const l = varint(e, q); q += l[1]; const s = td.decode(e.subarray(q, q + l[0])); q += l[0]; if (t >>> 3 === 1) k = s; else if (t >>> 3 === 2) v = s; }
        if (k) meta[k] = v;
      }
      off += p + len;
    } else throw new Error('Not an ONNX file (wire type ' + wt + ')');
  }
  return meta;
}

/** tokens.txt -> Map(symbol -> id). The space symbol is stored as " 16" so split on the LAST space. */
export function parseTokens(text) {
  const m = new Map();
  for (const raw of String(text).split('\n')) {
    const l = raw.replace(/\r$/, ''); if (!l.trim()) continue;
    const i = l.lastIndexOf(' '), id = parseInt(l.slice(i + 1), 10); if (!(id >= 0)) continue;
    let sym = l.slice(0, i); if (sym === '') sym = ' ';
    m.set(sym, id);
  }
  return m;
}

/** 'a->0,b->1' -> [{id,name}] */
export function parseSpeakerMap(meta) {
  const names = (meta.speaker_names || '').split(',').map(s => s.trim()).filter(Boolean);
  if (meta.id2speaker) {
    const out = meta.id2speaker.split(',').map(p => p.split('->')).filter(p => p.length === 2).map(([i, n]) => ({ id: +i, name: n.trim() }));
    if (out.length) return out.sort((a, b) => a.id - b.id);
  }
  return names.map((name, id) => ({ id, name }));
}

/** Phoneme list from the espeak wasm -> Kitten token ids: [0, ...ids, 0]. A sentence stop that touches the next word gets a space
 *  (espeak glues them when two sentences share one call). Symbols missing from tokens.txt are skipped, as sherpa-onnx does. */
export function phonemesToIds(phonemes, tokens) {
  const ids = [0];
  for (let i = 0; i < phonemes.length; i++) {
    const p = phonemes[i], id = tokens.get(p);
    if (id !== undefined) ids.push(id);
    if (/^[.!?…]$/.test(p) && phonemes[i + 1] !== undefined && phonemes[i + 1] !== ' ' && tokens.has(' ')) ids.push(tokens.get(' '));
  }
  ids.push(0);
  return ids;
}

/** Style vector for a speaker. v0.2 voices.bin has one 256-row per speaker; v0.8 has many per speaker and upstream picks the row by
 *  text length (rows = voices.length / (speakers * 256)). The multi-row path follows upstream's rule but was not run on a v0.8 model. */
export function styleFor(voices, nSpeakers, speaker, textLen) {
  const dim = 256, rows = Math.max(1, Math.floor(voices.length / (Math.max(1, nSpeakers) * dim)));
  const sid = Math.max(0, Math.min(nSpeakers - 1, speaker | 0)), row = rows > 1 ? Math.min(textLen | 0, rows - 1) : 0;
  const start = (sid * rows + row) * dim;
  return voices.slice(start, start + dim);
}

/** voices.bin bytes -> Float32Array (copies, so unaligned buffers are fine) */
export function parseVoicesBin(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8.length < 1024 || u8.length % 4) throw new Error('voices.bin looks wrong (' + u8.length + ' bytes)');
  return new Float32Array(u8.slice().buffer);
}
