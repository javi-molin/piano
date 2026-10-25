// songs.js — catálogo propio de Cascada.
//
// Todas las obras son de dominio público (Beethoven, Bach, Pachelbel, Hanon,
// Petzold, Gruber, Pierpont, tradicionales). Los arreglos se escribieron aquí,
// en el DSL de score.js: no vienen de ninguna app ni de ninguna edición con
// derechos. Tu biblioteca real es ilimitada: importa cualquier MIDI.

import { buildSong } from './score.js';

// --- generadores -----------------------------------------------------------

const C_MAJOR = [0, 2, 4, 5, 7, 9, 11]; // grados de la escala, en semitonos

function scaleNote(index, rootMidi = 60) {
  const octave = Math.floor(index / 7);
  return rootMidi + octave * 12 + C_MAJOR[((index % 7) + 7) % 7];
}

/** Hanon n.º 1: el mismo dibujo subiendo y bajando por la escala. */
function hanon() {
  const notes = [];
  const dur = 0.25;
  let t = 0;
  const addGroup = (startIndex, dir, octaveShift) => {
    const steps = dir > 0 ? [0, 2, 3, 4, 5, 4, 3, 2] : [0, -2, -3, -4, -5, -4, -3, -2];
    const fingersR = dir > 0 ? [1, 2, 3, 4, 5, 4, 3, 2] : [5, 4, 3, 2, 1, 2, 3, 4];
    steps.forEach((step, i) => {
      const midi = scaleNote(startIndex + step, 60 + octaveShift);
      notes.push({ t, d: dur, midi, hand: 'R', vel: 0.72, fingerHint: fingersR[i] });
      notes.push({ t, d: dur, midi: midi - 24, hand: 'L', vel: 0.6, fingerHint: 6 - fingersR[i] });
      t += dur;
    });
  };
  for (let i = 0; i <= 7; i++) addGroup(i, 1, 0);
  for (let i = 14; i >= 7; i--) addGroup(i, -1, 0);
  const top = scaleNote(7, 60);
  notes.push({ t, d: 1, midi: top, hand: 'R', vel: 0.8, fingerHint: 1 });
  notes.push({ t, d: 1, midi: top - 24, hand: 'L', vel: 0.7, fingerHint: 5 });
  return notes;
}

/**
 * Preludio en Do BWV 846: cada compás son dos mitades iguales de ocho
 * semicorcheas; las dos primeras las toma la izquierda y las seis siguientes
 * la derecha, repitiendo el tresillo.
 */
function preludeC() {
  const bars = [
    ['C3', 'E3', 'G3', 'C4', 'E4'],
    ['C3', 'D3', 'A3', 'D4', 'F4'],
    ['B2', 'D3', 'G3', 'D4', 'F4'],
    ['C3', 'E3', 'G3', 'C4', 'E4'],
    ['C3', 'E3', 'A3', 'E4', 'A4'],
    ['C3', 'D3', 'F#3', 'A3', 'D4'],
    ['B2', 'D3', 'G3', 'D4', 'G4'],
    ['B2', 'C3', 'E3', 'G3', 'C4'],
  ];
  const L = [];
  const R = [];
  for (const [n1, n2, n3, n4, n5] of bars) {
    for (let half = 0; half < 2; half++) {
      L.push(`${n1}:.5 ${n2}:1.5`);
      R.push(`-:.5 ${n3}:.25 ${n4}:.25 ${n5}:.25 ${n3}:.25 ${n4}:.25 ${n5}:.25`);
    }
    L.push('|');
    R.push('|');
  }
  return { L: L.join(' '), R: R.join(' ') };
}

/** Un compás de tresillos: tres notas por pulso, cuatro pulsos. */
function tripletBar(groups) {
  // groups: [[notas...] x4], una lista de tres notas por pulso
  return groups.map((g) => g.map((n) => `${n}:1/3`).join(' ')).join(' ');
}

const prelude = preludeC();

// --- el catálogo -----------------------------------------------------------

export const CATALOG = [
  {
    id: 'estrellita',
    title: 'Estrellita',
    composer: 'Tradicional',
    difficulty: 1,
    bpm: 100,
    meter: [4, 4],
    tags: ['melodía', 'para empezar'],
    R: 'C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2 | G4 G4 F4 F4 | E4 E4 D4:2 | G4 G4 F4 F4 | E4 E4 D4:2 | C4 C4 G4 G4 | A4 A4 G4:2 | F4 F4 E4 E4 | D4 D4 C4:2',
    L: '[C3E3]:4 | [F2A2]:2 [C3E3]:2 | [F2A2]:2 [C3E3]:2 | [G2B2]:2 [C3E3]:2 | [C3E3]:2 [F2A2]:2 | [C3E3]:2 [G2B2]:2 | [C3E3]:2 [F2A2]:2 | [C3E3]:2 [G2B2]:2 | [C3E3]:4 | [F2A2]:2 [C3E3]:2 | [F2A2]:2 [C3E3]:2 | [G2B2]:2 [C3E3]:2',
  },
  {
    id: 'oda-alegria',
    title: 'Oda a la Alegría',
    composer: 'Beethoven',
    difficulty: 1,
    bpm: 112,
    meter: [4, 4],
    tags: ['clásica', 'melodía'],
    R: 'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4:1.5 D4:.5 D4:2 | E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:.5 C4:2 | D4 D4 E4 C4 | D4 E4:.5 F4:.5 E4 C4 | D4 E4:.5 F4:.5 E4 D4 | C4 D4 G3:2 | E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:.5 C4:2',
    L: '[C3E3G3]:4 | [C3E3G3]:2 [G2B2D3]:2 | [C3E3G3]:2 [G2B2D3]:2 | [C3E3G3]:2 [G2B2D3]:2 | [C3E3G3]:4 | [C3E3G3]:2 [G2B2D3]:2 | [C3E3G3]:2 [G2B2D3]:2 | [G2B2D3]:2 [C3E3G3]:2 | [G2B2D3]:2 [C3E3G3]:2 | [G2B2D3]:2 [C3E3G3]:2 | [G2B2D3]:4 | [C3E3G3]:2 [G2B2D3]:2 | [C3E3G3]:4 | [C3E3G3]:2 [G2B2D3]:2 | [C3E3G3]:2 [G2B2D3]:2 | [G2B2D3]:2 [C3E3G3]:2',
  },
  {
    id: 'jingle-bells',
    title: 'Jingle Bells',
    composer: 'J. Pierpont',
    difficulty: 1,
    bpm: 120,
    meter: [4, 4],
    tags: ['navidad', 'melodía'],
    R: 'E4 E4 E4:2 | E4 E4 E4:2 | E4 G4 C4:1.5 D4:.5 | E4:4 | F4 F4 F4:1.5 F4:.5 | F4 E4 E4 E4:.5 E4:.5 | E4 D4 D4 E4 | D4:2 G4:2 | E4 E4 E4:2 | E4 E4 E4:2 | E4 G4 C4:1.5 D4:.5 | E4:4 | F4 F4 F4:1.5 F4:.5 | F4 E4 E4 E4:.5 E4:.5 | G4 G4 F4 D4 | C4:4',
    L: '[C3E3G3]:4 | [C3E3G3]:4 | [C3E3G3]:2 [G2B2D3]:2 | [C3E3G3]:4 | [F2A2C3]:4 | [C3E3G3]:4 | [G2B2D3]:4 | [G2B2D3]:2 [C3E3G3]:2 | [C3E3G3]:4 | [C3E3G3]:4 | [C3E3G3]:2 [G2B2D3]:2 | [C3E3G3]:4 | [F2A2C3]:4 | [C3E3G3]:4 | [G2B2D3]:4 | [C3E3G3]:4',
  },
  {
    id: 'noche-de-paz',
    title: 'Noche de paz',
    composer: 'F. X. Gruber',
    difficulty: 1,
    bpm: 72,
    meter: [3, 4],
    tags: ['navidad', 'vals'],
    R: 'G4:1.5 A4:.5 G4 | E4:3 | G4:1.5 A4:.5 G4 | E4:3 | D5:2 D5 | B4:3 | C5:2 C5 | G4:3 | A4:2 A4 | C5:1.5 B4:.5 A4 | G4:1.5 A4:.5 G4 | E4:3 | A4:2 A4 | C5:1.5 B4:.5 A4 | G4:1.5 A4:.5 G4 | E4:3 | D5:2 D5 | F5:1.5 D5:.5 B4 | C5:3 | C5:2 G4 | E4:1.5 G4:.5 F4 | D4 C4:2',
    L: '[C3G3]:3 | [C3G3]:3 | [C3G3]:3 | [C3G3]:3 | [G2D3]:3 | [G2D3]:3 | [C3G3]:3 | [C3G3]:3 | [F2C3]:3 | [C3G3]:3 | [C3G3]:3 | [C3G3]:3 | [F2C3]:3 | [C3G3]:3 | [C3G3]:3 | [C3G3]:3 | [G2D3]:3 | [G2D3]:3 | [C3G3]:3 | [C3G3]:3 | [F2C3]:3 | [G2D3] [C3G3]:2',
  },
  {
    id: 'escala-do',
    title: 'Escala de Do mayor, dos octavas',
    composer: 'Ejercicio',
    difficulty: 1,
    bpm: 84,
    meter: [4, 4],
    tags: ['técnica', 'manos juntas'],
    R: 'C4 D4 E4 F4 | G4 A4 B4 C5 | D5 E5 F5 G5 | A5 B5 C6:2 | B5 A5 G5 F5 | E5 D5 C5 B4 | A4 G4 F4 E4 | D4 C4:3',
    L: 'C3 D3 E3 F3 | G3 A3 B3 C4 | D4 E4 F4 G4 | A4 B4 C5:2 | B4 A4 G4 F4 | E4 D4 C4 B3 | A3 G3 F3 E3 | D3 C3:3',
    RF: '12312345123123443213214321321',
    LF: '54321321432132123123412312345',
  },
  {
    id: 'arpegios',
    title: 'Arpegios de Do, Fa y Sol',
    composer: 'Ejercicio',
    difficulty: 2,
    bpm: 88,
    meter: [4, 4],
    tags: ['técnica', 'manos juntas'],
    R: 'C4 E4 G4 C5 | G4 E4 C4:2 | F4 A4 C5 F5 | C5 A4 F4:2 | G4 B4 D5 G5 | D5 B4 G4:2 | C4 E4 G4 C5 | E5:2 C5:2',
    L: 'C3 E3 G3 C4 | G3 E3 C3:2 | F3 A3 C4 F4 | C4 A3 F3:2 | G3 B3 D4 G4 | D4 B3 G3:2 | C3 E3 G3 C4 | E4:2 C4:2',
    RF: '123532112353211235321123531',
    LF: '532123553212355321235532135',
  },
  {
    id: 'hanon-1',
    title: 'Hanon n.º 1',
    composer: 'C.-L. Hanon',
    difficulty: 2,
    bpm: 76,
    meter: [4, 4],
    tags: ['técnica', 'manos juntas'],
    notes: hanon(),
  },
  {
    id: 'minueto-sol',
    title: 'Minueto en Sol',
    composer: 'C. Petzold',
    difficulty: 2,
    bpm: 104,
    meter: [3, 4],
    tags: ['clásica', 'barroco'],
    R: 'D5 G4:.5 A4:.5 B4:.5 C5:.5 | D5 G4 G4 | E5 C5:.5 D5:.5 E5:.5 F#5:.5 | G5 G4 G4 | C5:.5 D5:.5 C5:.5 B4:.5 A4:.5 B4:.5 | C5:.5 B4:.5 A4:.5 G4:.5 F#4:.5 G4:.5 | A4:.5 B4:.5 C5:.5 B4:.5 A4:.5 G4:.5 | A4 D5:2',
    L: '[G2B2D3]:3 | [G2B2D3]:3 | [C3E3G3]:3 | [G2B2D3]:3 | [C3E3G3]:3 | [G2B2D3]:3 | [D3F#3A3]:3 | [D3F#3A3]:3',
  },
  {
    id: 'sol-naciente',
    title: 'Estudio de arpegios (La casa del sol naciente)',
    composer: 'Tradicional',
    difficulty: 2,
    bpm: 66,
    meter: [6, 8],
    tags: ['arpegios', 'balada'],
    R: 'A3:.5 C4:.5 E4:.5 A4:.5 E4:.5 C4:.5 | C4:.5 E4:.5 G4:.5 C5:.5 G4:.5 E4:.5 | D4:.5 F#4:.5 A4:.5 D5:.5 A4:.5 F#4:.5 | F3:.5 A3:.5 C4:.5 F4:.5 C4:.5 A3:.5 | A3:.5 C4:.5 E4:.5 A4:.5 E4:.5 C4:.5 | C4:.5 E4:.5 G4:.5 C5:.5 G4:.5 E4:.5 | E3:.5 G#3:.5 B3:.5 E4:.5 B3:.5 G#3:.5 | E3:.5 G#3:.5 B3:.5 E4:.5 B3:.5 G#3:.5 | A3:.5 C4:.5 E4:.5 A4:.5 E4:.5 C4:.5 | C4:.5 E4:.5 G4:.5 C5:.5 G4:.5 E4:.5 | D4:.5 F#4:.5 A4:.5 D5:.5 A4:.5 F#4:.5 | F3:.5 A3:.5 C4:.5 F4:.5 C4:.5 A3:.5 | A3:.5 C4:.5 E4:.5 A4:.5 E4:.5 C4:.5 | E3:.5 G#3:.5 B3:.5 E4:.5 B3:.5 G#3:.5 | [A3C4E4]:3 | [A3C4E4]:3',
    L: 'A2:3 | C3:3 | D3:3 | F2:3 | A2:3 | C3:3 | E2:3 | E2:3 | A2:3 | C3:3 | D3:3 | F2:3 | A2:3 | E2:3 | [A1A2]:3 | [A1A2]:3',
  },
  {
    id: 'fur-elise',
    title: 'Para Elisa (tema)',
    composer: 'Beethoven',
    difficulty: 3,
    bpm: 76,
    meter: [3, 8],
    tags: ['clásica', 'famosa'],
    R: '-:.5 E5:.5 D#5:.5 | E5:.5 D#5:.5 E5:.5 | B4:.5 D5:.5 C5:.5 | A4:1 -:.5 | -:.5 C4:.5 E4:.5 | A4:.5 B4:1 | -:.5 E4:.5 G#4:.5 | B4:.5 C5:1 | -:.5 E4:.5 E5:.5 | D#5:.5 E5:.5 D#5:.5 | E5:.5 D#5:.5 E5:.5 | B4:.5 D5:.5 C5:.5 | A4:1 -:.5 | -:.5 C4:.5 E4:.5 | A4:.5 B4:1 | -:.5 E4:.5 C5:.5 | B4:.5 A4:1',
    L: '-:1.5 | -:1.5 | -:1.5 | A2:.5 E3:.5 A3:.5 | -:1.5 | E2:.5 E3:.5 G#3:.5 | -:1.5 | A2:.5 E3:.5 A3:.5 | -:1.5 | -:1.5 | -:1.5 | -:1.5 | A2:.5 E3:.5 A3:.5 | -:1.5 | E2:.5 E3:.5 G#3:.5 | A2:.5 E3:.5 A3:.5 | A2:1.5',
  },
  {
    id: 'canon-re',
    title: 'Canon en Re (tema)',
    composer: 'J. Pachelbel',
    difficulty: 3,
    bpm: 68,
    meter: [4, 4],
    tags: ['clásica', 'barroco'],
    R: 'F#5:2 E5:2 | D5:2 C#5:2 | B4:2 A4:2 | B4:2 C#5:2 | F#5 G5 F#5 E5 | D5 E5 D5 C#5 | B4 C#5 B4 A4 | B4 C#5 D5 E5',
    L: '[D2A2]:2 [A2E3]:2 | [B2F#3]:2 [F#2C#3]:2 | [G2D3]:2 [D2A2]:2 | [G2D3]:2 [A2E3]:2 | [D2A2]:2 [A2E3]:2 | [B2F#3]:2 [F#2C#3]:2 | [G2D3]:2 [D2A2]:2 | [G2D3]:2 [A2E3]:2',
  },
  {
    id: 'greensleeves',
    title: 'Greensleeves',
    composer: 'Tradicional',
    difficulty: 3,
    bpm: 66,
    meter: [6, 8],
    tags: ['folk', 'melodía'],
    R: '-:2.5 A4:.5 | C5:1 D5:.5 E5:1 F#5:.5 | E5:1.5 D5:1 B4:.5 | G4:1 A4:.5 B4:1 C5:.5 | A4:1.5 A4:1 G#4:.5 | A4:1 B4:.5 C5:1 B4:.5 | A4:1.5 G4:1 E4:.5 | G4:1 A4:.5 B4:1 C5:.5 | A4:3 | G5:1.5 G5:1 F#5:.5 | E5:1.5 D5:1 B4:.5 | G4:1 A4:.5 B4:1 C5:.5 | A4:3',
    L: '-:3 | [A2E3]:3 | [G2D3]:3 | [A2E3]:3 | [E2B2]:3 | [A2E3]:3 | [G2D3]:3 | [A2E3]:3 | [A2E3]:3 | [C3G3]:3 | [G2D3]:3 | [A2E3]:3 | [A2E3]:3',
  },
  {
    id: 'preludio-do',
    title: 'Preludio en Do, BWV 846',
    composer: 'J. S. Bach',
    difficulty: 4,
    bpm: 64,
    meter: [4, 4],
    tags: ['clásica', 'barroco'],
    R: prelude.R,
    L: prelude.L,
  },
  {
    id: 'claro-de-luna',
    title: 'Claro de luna, 1.er movimiento (tema)',
    composer: 'Beethoven',
    difficulty: 4,
    bpm: 56,
    meter: [4, 4],
    tags: ['clásica', 'tresillos'],
    R: [
      tripletBar([['G#3', 'C#4', 'E4'], ['G#3', 'C#4', 'E4'], ['G#3', 'C#4', 'E4'], ['G#3', 'C#4', 'E4']]),
      tripletBar([['G#3', 'C#4', 'E4'], ['G#3', 'C#4', 'E4'], ['G#3', 'C#4', 'E4'], ['G#3', 'C#4', 'E4']]),
      tripletBar([['A3', 'C#4', 'E4'], ['A3', 'C#4', 'E4'], ['A3', 'D4', 'F#4'], ['A3', 'D4', 'F#4']]),
      tripletBar([['G#3', 'C4', 'D#4'], ['G#3', 'C4', 'D#4'], ['G#3', 'C#4', 'E4'], ['G#3', 'C#4', 'E4']]),
      tripletBar([['G#3', 'C#4', 'E4'], ['G#3', 'C#4', 'E4'], ['G#3', 'C#4', 'E4'], ['G#3', 'C#4', 'E4']]),
      tripletBar([['G#3', 'C#4', 'E4'], ['G#3', 'C#4', 'E4'], ['G#3', 'C#4', 'E4'], ['G#3', 'C#4', 'E4']]),
      tripletBar([['A3', 'C#4', 'E4'], ['A3', 'C#4', 'E4'], ['A3', 'D4', 'F#4'], ['A3', 'D4', 'F#4']]),
      tripletBar([['G#3', 'C4', 'D#4'], ['G#3', 'C4', 'D#4'], ['G#3', 'C#4', 'E4'], ['G#3', 'C#4', 'E4']]),
    ].join(' | '),
    L: '[C#2C#3]:4 | [C#2C#3]:4 | [A1A2]:2 [A1A2]:2 | [G#1G#2]:4 | [C#2C#3]:4 | [C#2C#3]:4 | [A1A2]:2 [A1A2]:2 | [G#1G#2]:4',
  },
];

export function buildCatalog() {
  return CATALOG.map((def) => buildSong({ ...def, source: 'builtin' }));
}

/** Aplica la digitación escrita a mano (RF/LF) sobre la calculada. */
export function applyWrittenFingers(song, def) {
  for (const [hand, digits] of [['R', def.RF], ['L', def.LF]]) {
    if (!digits) continue;
    const clean = String(digits).replace(/\s+/g, '');
    const mine = song.notes.filter((n) => n.hand === hand);
    mine.forEach((n, i) => {
      const d = clean[i];
      if (d) n.finger = parseInt(d, 10);
    });
  }
  // Hanon y otros generados traen la pista en la propia nota.
  for (const n of song.notes) {
    if (n.fingerHint) n.finger = n.fingerHint;
  }
  return song;
}
