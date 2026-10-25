// midi.js — lectura de archivos MIDI estándar (SMF 0/1) y entrada en vivo.
// Escrito aquí, sin librerías: es lo que hace que la biblioteca sea ilimitada.

import { buildSong } from './score.js';

class Reader {
  constructor(bytes) {
    this.b = bytes;
    this.p = 0;
  }
  byte() { return this.b[this.p++]; }
  u16() { const v = (this.b[this.p] << 8) | this.b[this.p + 1]; this.p += 2; return v; }
  u32() {
    const v = ((this.b[this.p] << 24) | (this.b[this.p + 1] << 16) | (this.b[this.p + 2] << 8) | this.b[this.p + 3]) >>> 0;
    this.p += 4;
    return v;
  }
  str(n) {
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.b[this.p + i]);
    this.p += n;
    return s;
  }
  /** Cantidad de longitud variable: el formato propio del MIDI. */
  vlq() {
    let v = 0;
    for (let i = 0; i < 4; i++) {
      const b = this.b[this.p++];
      v = (v << 7) | (b & 0x7f);
      if (!(b & 0x80)) break;
    }
    return v;
  }
  skip(n) { this.p += n; }
  get done() { return this.p >= this.b.length; }
}

/**
 * Los nombres dentro de un MIDI no declaran su codificación.
 *
 * Decodificar siempre como UTF-8 "a lo que salga" convierte cualquier archivo
 * hecho en Japón o en Windows en un churro de rombos. Se prueban en orden las
 * codificaciones reales del formato y se descarta el resultado si sale basura,
 * para quedarnos entonces con el nombre del archivo.
 */
function decodeText(bytes) {
  if (!bytes || !bytes.length) return '';
  const attempt = (label, fatal) => {
    try {
      return new TextDecoder(label, { fatal }).decode(bytes);
    } catch (e) {
      return null;
    }
  };
  let text = attempt('utf-8', true);
  if (text == null) text = attempt('shift_jis', true);   // muchos MIDI vienen de Japón
  if (text == null) text = attempt('windows-1252', true); // y muchos otros, de Windows
  if (text == null) text = attempt('utf-8', false) || '';
  return cleanText(text);
}

/** Quita controles, rellenos y espacios; devuelve '' si no queda nada legible. */
function cleanText(text) {
  const clean = String(text)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\ufffd/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';
  // Si más de un tercio es ilegible, no es un título: es una decodificación mala.
  const readable = clean.replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, '').length;
  if (readable < clean.length * 0.67) return '';
  return clean;
}

/** Nombres que no dicen nada: mejor usar el del archivo. */
const GENERIC_NAMES = /^(untitled|sin t[ií]tulo|track\s*\d*|midi(\s*file)?|song|new\s*song|piano|instrument\s*\d*|unnamed)$/i;

export function usefulTitle(embedded, fallback) {
  const clean = cleanText(embedded || '');
  if (!clean || GENERIC_NAMES.test(clean)) return cleanText(fallback) || 'Canción importada';
  return clean;
}

/**
 * Lee un ArrayBuffer MIDI y devuelve { tracks, division, bpm, meter, title }.
 * Los tiempos salen en ticks absolutos.
 */
export function parseMidiFile(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const r = new Reader(bytes);
  if (r.str(4) !== 'MThd') throw new Error('No parece un archivo MIDI (falta la cabecera MThd).');
  const headerLength = r.u32();
  const format = r.u16();
  const trackCount = r.u16();
  const division = r.u16();
  r.skip(headerLength - 6);
  if (division & 0x8000) throw new Error('Este MIDI usa tiempo SMPTE; no está soportado.');

  const tracks = [];
  let bpm = 120;
  let meter = [4, 4];
  let title = '';
  const tempoChanges = [];

  for (let t = 0; t < trackCount && !r.done; t++) {
    const id = r.str(4);
    const length = r.u32();
    if (id !== 'MTrk') { r.skip(length); continue; }
    const end = r.p + length;
    const events = [];
    let tick = 0;
    let running = 0;
    let trackName = '';

    while (r.p < end) {
      tick += r.vlq();
      let status = r.b[r.p];
      if (status & 0x80) { r.p++; running = status; } else { status = running; }
      const type = status & 0xf0;
      const channel = status & 0x0f;

      if (status === 0xff) {
        const metaType = r.byte();
        const len = r.vlq();
        const data = bytes.subarray(r.p, r.p + len);
        r.skip(len);
        if (metaType === 0x51 && len === 3) {
          const usPerQuarter = (data[0] << 16) | (data[1] << 8) | data[2];
          tempoChanges.push({ tick, bpm: 60000000 / usPerQuarter });
        } else if (metaType === 0x58 && len >= 2) {
          meter = [data[0], Math.pow(2, data[1])];
        } else if (metaType === 0x03) {
          trackName = decodeText(data);
          if (!title) title = trackName;
        } else if (metaType === 0x01 && !title) {
          // algunos exportadores ponen el título en un texto genérico
        }
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        const len = r.vlq();
        r.skip(len);
        continue;
      }
      if (type === 0x90 || type === 0x80) {
        const note = r.byte();
        const vel = r.byte();
        events.push({ tick, on: type === 0x90 && vel > 0, note, vel, channel });
      } else if (type === 0xa0 || type === 0xb0 || type === 0xe0) {
        r.skip(2);
      } else if (type === 0xc0 || type === 0xd0) {
        r.skip(1);
      } else {
        r.p = end; // flujo corrupto: cortamos esta pista y seguimos
      }
    }
    r.p = end;
    if (events.length) tracks.push({ name: trackName, events });
  }

  if (tempoChanges.length) bpm = tempoChanges[0].bpm;
  return { format, division, bpm: Math.round(bpm * 100) / 100, meter, title, tracks, tempoChanges };
}

/** Empareja note-on con note-off y pasa los ticks a beats. */
function tracksToNotes(parsed) {
  const out = [];
  parsed.tracks.forEach((track, trackIndex) => {
    const open = new Map();
    for (const ev of track.events) {
      const key = `${ev.channel}:${ev.note}`;
      if (ev.on) {
        if (!open.has(key)) open.set(key, []);
        open.get(key).push(ev);
      } else {
        const stack = open.get(key);
        if (stack && stack.length) {
          const start = stack.shift();
          const beats = (ev.tick - start.tick) / parsed.division;
          out.push({
            t: start.tick / parsed.division,
            d: Math.max(0.0625, beats),
            midi: ev.note,
            vel: Math.max(0.15, Math.min(1, start.vel / 127)),
            trackIndex,
            channel: ev.channel,
          });
        }
      }
    }
    // Notas sin note-off: se les da un beat.
    for (const stack of open.values()) {
      for (const start of stack) {
        out.push({
          t: start.tick / parsed.division,
          d: 1,
          midi: start.note,
          vel: Math.max(0.15, Math.min(1, start.vel / 127)),
          trackIndex,
          channel: start.channel,
        });
      }
    }
  });
  return out.sort((a, b) => a.t - b.t || a.midi - b.midi);
}

/**
 * Reparte las notas entre las dos manos. Si el archivo trae dos pistas con
 * notas, se respeta esa separación (es lo que hizo quien lo escribió). Si no,
 * se corta por altura, usando la mediana cuando el punto fijo deja todo de un
 * lado.
 */
function assignHands(notes) {
  const byTrack = new Map();
  for (const n of notes) {
    if (!byTrack.has(n.trackIndex)) byTrack.set(n.trackIndex, []);
    byTrack.get(n.trackIndex).push(n);
  }
  if (byTrack.size === 2) {
    const entries = [...byTrack.entries()].map(([k, list]) => ({
      k,
      list,
      mean: list.reduce((s, n) => s + n.midi, 0) / list.length,
    }));
    entries.sort((a, b) => a.mean - b.mean);
    if (entries[1].mean - entries[0].mean >= 3) {
      for (const n of entries[0].list) n.hand = 'L';
      for (const n of entries[1].list) n.hand = 'R';
      return notes;
    }
  }
  let split = 60;
  const below = notes.filter((n) => n.midi < split).length;
  if (below < notes.length * 0.15 || below > notes.length * 0.85) {
    const sorted = notes.map((n) => n.midi).sort((a, b) => a - b);
    split = sorted[Math.floor(sorted.length / 2)];
  }
  for (const n of notes) n.hand = n.midi < split ? 'L' : 'R';
  return notes;
}

/** Quita ruido: notas larguísimas de pedal, duplicados exactos, silencio inicial. */
function clean(notes) {
  const seen = new Set();
  const kept = [];
  for (const n of notes) {
    const key = `${n.t.toFixed(4)}:${n.midi}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (n.midi < 21 || n.midi > 108) continue;
    kept.push(n);
  }
  if (!kept.length) return kept;
  const offset = Math.floor(kept[0].t);
  if (offset > 0) for (const n of kept) n.t -= offset;
  return kept;
}

/** ArrayBuffer MIDI -> canción de Cascada. */
export function songFromMidi(arrayBuffer, fallbackTitle = 'Canción importada') {
  const parsed = parseMidiFile(arrayBuffer);
  let notes = clean(assignHands(tracksToNotes(parsed)));
  if (!notes.length) throw new Error('El archivo no tiene notas que se puedan tocar.');
  const title = usefulTitle(parsed.title, fallbackTitle).slice(0, 80);
  const song = buildSong({
    title,
    composer: '',
    source: 'midi',
    bpm: Math.max(20, Math.min(240, Math.round(parsed.bpm))),
    meter: parsed.meter,
    difficulty: estimateDifficulty(notes),
    notes: notes.map(({ t, d, midi, hand, vel }) => ({ t, d, midi, hand, vel })),
  });
  return song;
}

export function estimateDifficulty(notes) {
  if (!notes.length) return 1;
  const span = notes.reduce((m, n) => Math.max(m, n.t + n.d), 0) || 1;
  const density = notes.length / span; // notas por beat
  const hands = new Set(notes.map((n) => n.hand)).size;
  let d = 1;
  if (density > 1.2) d++;
  if (density > 2.2) d++;
  if (density > 3.5) d++;
  if (hands > 1) d++;
  return Math.max(1, Math.min(5, d));
}

// -------------------------------------------------------- entrada en vivo

/**
 * Teclado MIDI por Web MIDI. Safari en iPad no lo implementa: ahí esto
 * devuelve un error claro y la app sigue con pantalla y micrófono.
 */
export class MidiInput {
  constructor() {
    this.access = null;
    this.onNoteOn = null;
    this.onNoteOff = null;
    this.devices = [];
  }

  static get supported() {
    return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
  }

  async connect() {
    if (!MidiInput.supported) {
      throw new Error('Este navegador no tiene Web MIDI. En iPad usa el micrófono o la pantalla.');
    }
    this.access = await navigator.requestMIDIAccess({ sysex: false });
    this.bind();
    this.access.onstatechange = () => this.bind();
    return this.devices;
  }

  bind() {
    this.devices = [];
    for (const input of this.access.inputs.values()) {
      this.devices.push(input.name || 'Teclado MIDI');
      input.onmidimessage = (msg) => this.handle(msg.data);
    }
  }

  handle(data) {
    const type = data[0] & 0xf0;
    const note = data[1];
    const vel = data[2];
    if (type === 0x90 && vel > 0) {
      if (this.onNoteOn) this.onNoteOn(note, Math.max(0.2, vel / 127), 'midi');
    } else if (type === 0x80 || (type === 0x90 && vel === 0)) {
      if (this.onNoteOff) this.onNoteOff(note, 'midi');
    }
  }

  disconnect() {
    if (!this.access) return;
    for (const input of this.access.inputs.values()) input.onmidimessage = null;
    this.access.onstatechange = null;
    this.access = null;
    this.devices = [];
  }
}

/** Exporta una canción como MIDI (SMF 0) para llevársela a otro programa. */
export function songToMidiBytes(song) {
  const division = 480;
  const events = [];
  for (const n of song.notes) {
    events.push({ tick: Math.round(n.t * division), kind: 1, note: n.midi, vel: Math.round(n.vel * 110) });
    events.push({ tick: Math.round((n.t + n.d) * division), kind: 0, note: n.midi, vel: 0 });
  }
  events.sort((a, b) => a.tick - b.tick || a.kind - b.kind);

  const body = [];
  const pushVlq = (value) => {
    const buf = [value & 0x7f];
    let v = value >> 7;
    while (v > 0) { buf.unshift((v & 0x7f) | 0x80); v >>= 7; }
    for (const b of buf) body.push(b);
  };
  const usPerQuarter = Math.round(60000000 / song.bpm);
  pushVlq(0);
  body.push(0xff, 0x51, 0x03, (usPerQuarter >> 16) & 0xff, (usPerQuarter >> 8) & 0xff, usPerQuarter & 0xff);
  pushVlq(0);
  const den = Math.round(Math.log2(song.meter[1] || 4));
  body.push(0xff, 0x58, 0x04, song.meter[0] || 4, den, 24, 8);
  pushVlq(0);
  // El nombre va en UTF-8: recortarlo a ASCII se comía los acentos.
  const name = Array.from(new TextEncoder().encode(song.title)).slice(0, 120);
  body.push(0xff, 0x03, name.length, ...name);

  let last = 0;
  for (const ev of events) {
    pushVlq(ev.tick - last);
    last = ev.tick;
    body.push(ev.kind ? 0x90 : 0x80, ev.note, ev.vel);
  }
  pushVlq(0);
  body.push(0xff, 0x2f, 0x00);

  const out = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, (division >> 8) & 0xff, division & 0xff,
    0x4d, 0x54, 0x72, 0x6b,
    (body.length >>> 24) & 0xff, (body.length >>> 16) & 0xff, (body.length >>> 8) & 0xff, body.length & 0xff,
    ...body];
  return new Uint8Array(out);
}
