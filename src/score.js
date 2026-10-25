// score.js — modelo musical de Cascada.
// Una canción es una sola lista de notas ordenada por tiempo; la mano y el dedo
// son campos de la nota, no pistas separadas. Así filtrar por mano, repetir un
// trozo y puntuar son la misma consulta.

export const NAMES_EN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const NAMES_ES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
const BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];

const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C#4" | "Eb3" | "A-1" -> número MIDI (Do central = C4 = 60). */
export function midiFromName(name) {
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(String(name).trim());
  if (!m) return null;
  const semis = STEP[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return semis + (parseInt(m[3], 10) + 1) * 12;
}

export function pitchClass(midi) {
  return ((midi % 12) + 12) % 12;
}

export function isBlackKey(midi) {
  return BLACK[pitchClass(midi)];
}

export function octaveOf(midi) {
  return Math.floor(midi / 12) - 1;
}

/** Nombre de nota para mostrar. lang: 'es' (Do Re Mi) | 'en' (C D E). */
export function nameFromMidi(midi, lang = 'es', withOctave = false) {
  const names = lang === 'en' ? NAMES_EN : NAMES_ES;
  return names[pitchClass(midi)] + (withOctave ? String(octaveOf(midi)) : '');
}

export { snap };

export function beatsPerBar(meter) {
  const [num, den] = meter || [4, 4];
  return (num * 4) / den;
}

// ---------------------------------------------------------------- el DSL

function parseDuration(raw) {
  if (!raw) return 1;
  if (raw.indexOf('/') >= 0) {
    const [a, b] = raw.split('/');
    const top = parseFloat(a);
    const bottom = parseFloat(b);
    if (!bottom) return 1;
    return (isNaN(top) ? 1 : top) / bottom;
  }
  const v = parseFloat(raw);
  return isNaN(v) || v <= 0 ? 1 : v;
}

const TICKS = 960; // rejilla interna: mata la deriva de los tresillos sin perder exactitud

function snap(beats) {
  return Math.round(beats * TICKS) / TICKS;
}

const TOKEN = /^(\[[^\]]*\]|-|[A-Ga-g][#b]?-?\d+)(?::([0-9./]+))?(?:x(\d+))?$/;
const PITCH_IN_CHORD = /[A-Ga-g][#b]?-?\d+/g;

/**
 * Convierte una línea del DSL en notas.
 *
 *   "C4 E4 G4"            tres notas de un beat (beat = negra)
 *   "C4:.5 D4:.5 E4:2"    corchea, corchea, blanca
 *   "[C3E3G3]:2"          acorde
 *   "-:1.5"               silencio
 *   "G4:.5x4"             la misma nota cuatro veces
 *   "|"                   separador de compás (informativo)
 *
 * Devuelve { notes, warnings }.
 */
export function parseLine(line, hand, opts = {}) {
  const notes = [];
  const warnings = [];
  const velocity = opts.velocity != null ? opts.velocity : hand === 'L' ? 0.62 : 0.78;
  const bpb = opts.beatsPerBar || 4;
  let t = 0;
  let bar = 1;

  for (const rawToken of String(line || '').trim().split(/\s+/)) {
    if (!rawToken) continue;
    if (rawToken === '|') {
      const expected = bar * bpb;
      if (Math.abs(t - expected) > 1e-6) {
        warnings.push(`compás ${bar}: ${t.toFixed(3)} beats, se esperaban ${expected}`);
      }
      bar += 1;
      continue;
    }
    const m = TOKEN.exec(rawToken);
    if (!m) {
      warnings.push(`token no reconocido: "${rawToken}"`);
      continue;
    }
    const [, head, durRaw, repeatRaw] = m;
    const dur = parseDuration(durRaw);
    const repeat = repeatRaw ? parseInt(repeatRaw, 10) : 1;

    for (let r = 0; r < repeat; r++) {
      if (head === '-') {
        t = snap(t + dur);
        continue;
      }
      const pitches = head[0] === '['
        ? (head.match(PITCH_IN_CHORD) || []).map(midiFromName)
        : [midiFromName(head)];
      for (const midi of pitches) {
        if (midi == null) {
          warnings.push(`nota no reconocida en "${rawToken}"`);
          continue;
        }
        notes.push({ t, d: dur, midi, hand, vel: velocity, finger: 0 });
      }
      t = snap(t + dur);
    }
  }
  return { notes, warnings, lengthBeats: t };
}

// ------------------------------------------------------------- digitación

const CHORD_FINGERS = {
  1: [3],
  2: [1, 5],
  3: [1, 3, 5],
  4: [1, 2, 3, 5],
  5: [1, 2, 3, 4, 5],
};

/**
 * Digitación sugerida. Se calcula, no se guarda: al transponer o cambiar de
 * mano se recalcula sola. Heurística: los dedos se alejan del pulgar cuando la
 * melodía va "hacia fuera" de la mano, y el pulgar vuelve a pasar por debajo
 * cuando se acaban los dedos.
 */
export function assignFingers(notes, hand) {
  const mine = notes.filter((n) => n.hand === hand).sort((a, b) => a.t - b.t || a.midi - b.midi);
  if (!mine.length) return;

  const groups = [];
  for (const n of mine) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(last[0].t - n.t) < 1e-6) last.push(n);
    else groups.push([n]);
  }

  let prev = null; // { midi, finger } de la nota de referencia del grupo anterior
  for (const group of groups) {
    group.sort((a, b) => a.midi - b.midi);
    if (group.length > 1) {
      const span = group[group.length - 1].midi - group[0].midi;
      let palette = CHORD_FINGERS[Math.min(group.length, 5)].slice();
      if (group.length === 2 && span <= 4) palette = [1, 3];
      if (group.length === 3 && span >= 12) palette = [1, 2, 5];
      if (hand === 'L') palette = palette.map((f) => 6 - f);
      group.forEach((n, i) => { n.finger = palette[Math.min(i, palette.length - 1)]; });
      const ref = hand === 'R' ? group[group.length - 1] : group[0];
      prev = { midi: ref.midi, finger: ref.finger };
      continue;
    }

    const n = group[0];
    if (!prev) {
      n.finger = 3;
    } else {
      const interval = n.midi - prev.midi;
      // "hacia fuera" = hacia el dedo 5: agudo en la derecha, grave en la izquierda.
      const outward = hand === 'R' ? Math.sign(interval) : -Math.sign(interval);
      const leap = Math.abs(interval);
      if (leap === 0) {
        n.finger = prev.finger;
      } else if (leap <= 2) {
        const next = prev.finger + outward;
        n.finger = next > 5 ? 1 : next < 1 ? 3 : next;
      } else if (leap <= 4) {
        const next = prev.finger + outward * 2;
        n.finger = next > 5 ? 2 : next < 1 ? 4 : next;
      } else if (leap <= 7) {
        n.finger = outward > 0 ? 4 : 2;
      } else {
        n.finger = outward > 0 ? 5 : 1;
      }
    }
    prev = { midi: n.midi, finger: n.finger };
  }
}

// -------------------------------------------------------------- secciones

/** Parte la canción en trozos practicables, alineados a compás. */
export function autoSections(song, barsPerSection) {
  const bpb = beatsPerBar(song.meter);
  const bars = Math.max(1, Math.ceil((song.lengthBeats - 1e-9) / bpb));
  let per = barsPerSection || Math.round(bars / 6) || 2;
  per = Math.max(2, Math.min(8, per));
  const sections = [];
  for (let bar = 0; bar < bars; bar += per) {
    const lastBar = Math.min(bar + per, bars);
    sections.push({
      id: `s${sections.length + 1}`,
      label: `Compases ${bar + 1}–${lastBar}`,
      startBeat: bar * bpb,
      endBeat: Math.min(lastBar * bpb, song.lengthBeats),
    });
  }
  // Un rabito de uno o dos compases se pega a la sección anterior.
  if (sections.length > 1) {
    const tail = sections[sections.length - 1];
    if (tail.endBeat - tail.startBeat <= bpb * 1.5) {
      sections[sections.length - 2].endBeat = tail.endBeat;
      sections[sections.length - 2].label = sections[sections.length - 2].label
        .replace(/–\d+$/, `–${Math.ceil(tail.endBeat / bpb)}`);
      sections.pop();
    }
  }
  return sections;
}

// --------------------------------------------------------------- canciones

let autoId = 0;

/**
 * Construye una canción a partir de una definición del DSL, o de notas ya
 * hechas (lo que devuelve el parser de MIDI o el transcriptor).
 */
export function buildSong(def) {
  const meter = def.meter || [4, 4];
  const bpb = beatsPerBar(meter);
  const warnings = [];
  let notes = [];

  if (def.notes) {
    notes = def.notes.map((n) => ({
      t: n.t, d: n.d, midi: n.midi,
      hand: n.hand === 'L' ? 'L' : 'R',
      vel: n.vel != null ? n.vel : 0.75,
      finger: 0,
    }));
  } else {
    for (const [hand, line] of [['R', def.R], ['L', def.L]]) {
      if (!line) continue;
      const res = parseLine(line, hand, { beatsPerBar: bpb });
      notes = notes.concat(res.notes);
      for (const w of res.warnings) warnings.push(`${hand}: ${w}`);
    }
  }

  notes.sort((a, b) => a.t - b.t || a.midi - b.midi);
  notes.forEach((n, i) => { n.i = i; });
  assignFingers(notes, 'R');
  assignFingers(notes, 'L');

  const lengthBeats = notes.reduce((max, n) => Math.max(max, n.t + n.d), 0);
  const song = {
    id: def.id || `song-${Date.now().toString(36)}-${++autoId}`,
    title: def.title || 'Sin título',
    composer: def.composer || '',
    source: def.source || 'builtin',
    difficulty: def.difficulty || 1,
    bpm: def.bpm || 90,
    meter,
    difficultyLabel: ['', 'Muy fácil', 'Fácil', 'Media', 'Intermedia', 'Avanzada'][def.difficulty || 1],
    notes,
    lengthBeats: Math.ceil(lengthBeats / bpb) * bpb || bpb,
    lengthBars: Math.max(1, Math.ceil(lengthBeats / bpb)),
    tags: def.tags || [],
    createdAt: def.createdAt || Date.now(),
    warnings,
  };
  song.sections = def.sections && def.sections.length ? def.sections : autoSections(song);
  song.range = noteRange(song.notes);
  return song;
}

export function noteRange(notes) {
  if (!notes.length) return { lo: 60, hi: 72 };
  let lo = 127;
  let hi = 0;
  for (const n of notes) {
    if (n.midi < lo) lo = n.midi;
    if (n.midi > hi) hi = n.midi;
  }
  return { lo, hi };
}

/** Transpone una copia de la canción y recalcula la digitación. */
export function transposeSong(song, semitones) {
  if (!semitones) return song;
  const notes = song.notes.map((n) => ({ ...n, midi: Math.max(21, Math.min(108, n.midi + semitones)) }));
  assignFingers(notes, 'R');
  assignFingers(notes, 'L');
  return { ...song, notes, range: noteRange(notes), transposedBy: semitones };
}

export function notesInRange(song, startBeat, endBeat, hands = 'both') {
  return song.notes.filter((n) => {
    if (hands === 'R' && n.hand !== 'R') return false;
    if (hands === 'L' && n.hand !== 'L') return false;
    return n.t >= startBeat - 1e-6 && n.t < endBeat - 1e-6;
  });
}

/** Agrupa notas que suenan a la vez (lo que el modo espera trata como un paso). */
export function groupByTime(notes) {
  const groups = [];
  for (const n of [...notes].sort((a, b) => a.t - b.t)) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(last.t - n.t) < 1e-6) last.notes.push(n);
    else groups.push({ t: n.t, notes: [n] });
  }
  return groups;
}

export function songStats(song) {
  const right = song.notes.filter((n) => n.hand === 'R').length;
  return {
    notes: song.notes.length,
    right,
    left: song.notes.length - right,
    bars: song.lengthBars,
    seconds: Math.round((song.lengthBeats / song.bpm) * 60),
  };
}

// ------------------------------------------------- el piano que tienes tú

/**
 * Teclados reales, por número de teclas. `lo` es la nota más grave de fábrica;
 * se puede mover por octavas para los modelos que no empiezan en Do.
 */
export const PIANO_SIZES = [
  { keys: 0, label: 'Sin límite', lo: 21, hi: 108 },
  { keys: 25, label: '25 teclas', lo: 48, hi: 72 },
  { keys: 37, label: '37 teclas', lo: 48, hi: 84 },
  { keys: 49, label: '49 teclas', lo: 36, hi: 84 },
  { keys: 61, label: '61 teclas', lo: 36, hi: 96 },
  { keys: 76, label: '76 teclas', lo: 28, hi: 103 },
  { keys: 88, label: '88 teclas', lo: 21, hi: 108 },
];

export function pianoSize(keys) {
  return PIANO_SIZES.find((p) => p.keys === Number(keys)) || PIANO_SIZES[0];
}

/** Rango real de un teclado de `keys` teclas cuya nota más grave es `lo`. */
export function pianoRange(keys, lowShift = 0) {
  const size = pianoSize(keys);
  if (!size.keys) return null;
  const lo = Math.max(21, Math.min(96, size.lo + lowShift * 12));
  return { lo, hi: Math.min(108, lo + size.keys - 1), keys: size.keys, label: size.label };
}

export function notesOutside(notes, lo, hi) {
  if (lo == null || hi == null) return 0;
  let count = 0;
  for (const n of notes) if (n.midi < lo || n.midi > hi) count++;
  return count;
}

/**
 * Encaja la canción en el teclado que tiene el usuario.
 *
 *   'show' deja las notas donde están (puede que no las alcances)
 *   'skip' quita las que no están en tu piano
 *   'fold' las trae a la octava más cercana que sí tienes
 *
 * Plegar cambia la música —un bajo sube una octava y se nota— pero es lo que
 * hace cualquiera al tocar una pieza grande en un teclado pequeño. Devuelve
 * cuántas notas se tocaron para poder decirlo en pantalla.
 */
export function fitToRange(song, options = {}) {
  const { lo, hi } = options;
  const mode = options.mode || 'show';
  const outside = notesOutside(song.notes, lo, hi);
  if (!outside || mode === 'show' || lo == null || hi == null || hi - lo < 11) {
    return { song, outside, moved: 0, dropped: 0, mode };
  }

  let moved = 0;
  let dropped = 0;
  const kept = [];
  for (const n of song.notes) {
    if (n.midi >= lo && n.midi <= hi) { kept.push({ ...n }); continue; }
    if (mode === 'skip') { dropped++; continue; }
    let midi = n.midi;
    while (midi < lo) midi += 12;
    while (midi > hi) midi -= 12;
    if (midi < lo || midi > hi) { dropped++; continue; }
    moved++;
    kept.push({ ...n, midi });
  }

  // Al plegar, dos notas pueden caer en la misma tecla a la vez.
  kept.sort((a, b) => a.t - b.t || a.midi - b.midi || a.hand.localeCompare(b.hand));
  const notes = [];
  for (const n of kept) {
    const last = notes[notes.length - 1];
    if (last && last.midi === n.midi && Math.abs(last.t - n.t) < 1e-6) {
      last.d = Math.max(last.d, n.d);
      continue;
    }
    notes.push(n);
  }

  notes.forEach((n, i) => { n.i = i; n.finger = 0; });
  assignFingers(notes, 'R');
  assignFingers(notes, 'L');
  return {
    song: { ...song, notes, range: noteRange(notes), fittedTo: { lo, hi, mode } },
    outside, moved, dropped, mode,
  };
}

/** "+12 (una octava arriba)", para decirlo en pantalla sin que haya que pensar. */
export function describeTranspose(semitones, lang = 'es') {
  if (!semitones) return 'tono original';
  const sign = semitones > 0 ? '+' : '−';
  const abs = Math.abs(semitones);
  const octaves = abs / 12;
  const direction = semitones > 0 ? 'arriba' : 'abajo';
  if (Number.isInteger(octaves)) {
    // En octavas enteras la nota se llama igual, así que decirlo sobra.
    const shape = octaves === 1 ? 'una octava' : `${octaves} octavas`;
    return `${sign}${abs}: ${shape} ${direction}`;
  }
  const shape = `${abs} ${abs === 1 ? 'semitono' : 'semitonos'} ${direction}`;
  return `${sign}${abs}: ${shape} · Do suena ${nameFromMidi(60 + semitones, lang)}`;
}
