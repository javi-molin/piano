// Pruebas del núcleo: DSL, digitación, MIDI y la máquina de estados del tutor.
// Se corren con:  node tests/engine.test.mjs
import assert from 'node:assert/strict';
import { buildSong, parseLine, nameFromMidi, midiFromName, transposeSong, autoSections } from '../src/score.js';
import { songToMidiBytes, songFromMidi, estimateDifficulty } from '../src/midi.js';
import { buildLayout, wholeOctaves, keyAt, computerKeyToMidi } from '../src/keyboard.js';
import { Player, WINDOWS } from '../src/player.js';
import { keyboardMarks, barHeatmap } from '../src/roll.js';
import { CATALOG, applyWrittenFingers } from '../src/songs.js';

let passed = 0;
const failures = [];
const queue = [];
function test(name, fn) { queue.push([name, fn]); }
async function run() {
  for (const [name, fn] of queue) {
    try { await fn(); passed++; } catch (e) { failures.push([name, e]); }
  }
}

// ---------------------------------------------------------------- score
test('nombres de nota en los dos idiomas', () => {
  assert.equal(midiFromName('C4'), 60);
  assert.equal(midiFromName('A-1'), 9);
  assert.equal(midiFromName('Eb3'), 51);
  assert.equal(nameFromMidi(60, 'es'), 'Do');
  assert.equal(nameFromMidi(61, 'en', true), 'C#4');
});

test('el DSL respeta duraciones, acordes, silencios y repeticiones', () => {
  const { notes, lengthBeats } = parseLine('C4:.5 [E4G4]:1.5 -:1 D4:.25x4', 'R', { beatsPerBar: 4 });
  assert.equal(lengthBeats, 4);
  assert.equal(notes.length, 1 + 2 + 4);
  assert.equal(notes[1].t, 0.5);
  assert.equal(notes[3].t, 3);
});

test('los tresillos suman el pulso exacto', () => {
  const { lengthBeats } = parseLine('C4:1/3 D4:1/3 E4:1/3', 'R', { beatsPerBar: 4 });
  assert.ok(Math.abs(lengthBeats - 1) < 1e-9);
});

test('avisa cuando un compás no cuadra', () => {
  const song = buildSong({ meter: [3, 4], R: 'C4 D4 | E4:3' });
  assert.equal(song.warnings.length, 1);
  assert.match(song.warnings[0], /compás 1/);
});

test('ningún compás del catálogo está mal medido', () => {
  for (const def of CATALOG) {
    const song = buildSong(def);
    assert.deepEqual(song.warnings, [], `${def.id}: ${song.warnings.join('; ')}`);
    assert.ok(song.notes.length > 20, `${def.id} tiene muy pocas notas`);
    assert.ok(song.sections.length >= 2, `${def.id} no se pudo seccionar`);
  }
});

test('la digitación escrita a mano gana a la calculada', () => {
  const def = CATALOG.find((d) => d.id === 'escala-do');
  const song = applyWrittenFingers(buildSong(def), def);
  const right = song.notes.filter((n) => n.hand === 'R').map((n) => n.finger).join('');
  assert.equal(right, def.RF);
});

test('la digitación calculada se queda entre 1 y 5 y pasa el pulgar', () => {
  const song = buildSong({ R: 'C4 D4 E4 F4 G4 A4 B4 C5 | D5 E5 F5 G5 A5 B5 C6:2' });
  const fingers = song.notes.map((n) => n.finger);
  assert.ok(fingers.every((f) => f >= 1 && f <= 5), 'dedo fuera de rango');
  assert.ok(fingers.includes(1), 'nunca usa el pulgar');
});

test('transponer recalcula y no se sale del piano', () => {
  const song = buildSong({ R: 'C4 E4 G4' });
  const up = transposeSong(song, 7);
  assert.deepEqual(up.notes.map((n) => n.midi), [67, 71, 74]);
  const extreme = transposeSong(song, 60);
  assert.ok(extreme.notes.every((n) => n.midi <= 108));
});

test('las secciones cubren la canción sin huecos', () => {
  const song = buildSong({ meter: [4, 4], R: Array.from({ length: 16 }, () => 'C4 D4 E4 F4').join(' | ') });
  const sections = autoSections(song);
  assert.equal(sections[0].startBeat, 0);
  assert.equal(sections[sections.length - 1].endBeat, song.lengthBeats);
  for (let i = 1; i < sections.length; i++) {
    assert.equal(sections[i].startBeat, sections[i - 1].endBeat, 'hueco entre secciones');
  }
});

// ----------------------------------------------------------------- midi
test('MIDI: ida y vuelta conserva notas, tempo y compás', () => {
  for (const id of ['minueto-sol', 'fur-elise', 'preludio-do', 'claro-de-luna']) {
    const original = buildSong(CATALOG.find((d) => d.id === id));
    const bytes = songToMidiBytes(original);
    const back = songFromMidi(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    assert.deepEqual(back.meter, original.meter, id);
    assert.equal(Math.round(back.bpm), Math.round(original.bpm), id);
    assert.equal(back.notes.length, original.notes.length, `${id}: se perdieron notas`);
    original.notes.forEach((n, i) => {
      assert.equal(back.notes[i].midi, n.midi, `${id}: altura distinta en ${i}`);
      assert.ok(Math.abs(back.notes[i].t - n.t) < 0.01, `${id}: tiempo distinto en ${i}`);
    });
  }
});

test('MIDI: un archivo que no lo es da un error legible', () => {
  const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  assert.throws(() => songFromMidi(bytes.buffer), /MIDI/);
});

test('MIDI: reparte las manos por altura cuando viene en una sola pista', () => {
  const original = buildSong(CATALOG.find((d) => d.id === 'minueto-sol'));
  const bytes = songToMidiBytes(original);
  const back = songFromMidi(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const leftBack = back.notes.filter((n) => n.hand === 'L').length;
  assert.equal(leftBack, original.notes.filter((n) => n.hand === 'L').length);
});

test('la dificultad estimada crece con la densidad', () => {
  const sparse = estimateDifficulty([{ t: 0, d: 1, midi: 60, hand: 'R' }, { t: 4, d: 1, midi: 62, hand: 'R' }]);
  const dense = estimateDifficulty(Array.from({ length: 64 }, (_, i) => ({ t: i / 8, d: 0.125, midi: 60 + (i % 12), hand: i % 2 ? 'R' : 'L' })));
  assert.ok(dense > sparse, 'una canción densa debería puntuar más difícil');
});

// ------------------------------------------------------------- teclado
test('el teclado alinea cada tecla negra con su junta', () => {
  const { lo, hi } = wholeOctaves(60, 72);
  const layout = buildLayout(lo, hi, 700);
  assert.equal(layout.whiteCount, 8);
  const c4 = layout.key(60);
  const cs4 = layout.key(61);
  assert.ok(cs4.black && !c4.black);
  assert.ok(Math.abs((cs4.x + cs4.w / 2) - (c4.x + c4.w)) < 0.001, 'la negra no está centrada en la junta');
  assert.equal(keyAt(layout, cs4.x + 2, 110, 100, 100), 61, 'la negra debería ganar arriba');
  assert.equal(keyAt(layout, cs4.x + 2, 190, 100, 100), 60, 'abajo debería tocar la blanca');
});

test('las teclas del ordenador cubren dos octavas', () => {
  assert.equal(computerKeyToMidi('z'), 60);
  assert.equal(computerKeyToMidi('m'), 71);
  assert.equal(computerKeyToMidi('q'), 72);
  assert.equal(computerKeyToMidi('ñ'), null);
});

// ------------------------------------------------------------ piano-roll
test('el teclado ilumina la nota que toca ahora, también si ya está en espera', () => {
  const song = buildSong({ bpm: 60, R: 'C4 D4 E4 F4' });
  const states = new Array(song.notes.length).fill(null);
  const first = song.notes[0];
  const second = song.notes[1];
  states[first.i] = 'hit';
  states[second.i] = 'expect'; // es lo que hace el modo espera al plantarse
  const marks = keyboardMarks({ song, beat: 1, states, hands: 'both', pressed: new Set() });
  assert.equal(marks.get(second.midi).state, 'expect', 'la nota en espera no se ilumina');
  assert.equal(marks.get(second.midi).finger, second.finger);
});

test('el mapa de calor cuenta por compás solo lo que se juzgó', () => {
  const song = buildSong({ meter: [4, 4], R: 'C4 D4 E4 F4 | G4 A4 B4 C5' });
  const states = new Array(song.notes.length).fill(null);
  song.notes.forEach((n, i) => { states[i] = i < 4 ? 'hit' : 'miss'; });
  const bars = barHeatmap(song, states);
  assert.equal(bars.length, 2);
  assert.equal(bars[0].hit, 4);
  assert.equal(bars[1].miss, 4);
});

// -------------------------------------------------------------- player
function fakeEngine() {
  return {
    t: 0,
    played: [],
    clicks: 0,
    get now() { return this.t; },
    async ensure() { return this; },
    play(midi, vel, when, dur) { this.played.push({ midi, when, dur }); },
    noteOn() {}, noteOff() {}, allOff() {}, click() { this.clicks++; }, blip() {},
  };
}

const simple = buildSong({ id: 'x', bpm: 60, meter: [4, 4], R: 'C4 D4 E4 F4', L: 'C3:4' });

test('modo aprender: el tiempo no avanza hasta que toques la nota', async () => {
  const engine = fakeEngine();
  const player = new Player(engine, simple, { mode: 'learn', hands: 'R', countInBars: 0 });
  await player.start();
  player.tick();
  assert.equal(player.waiting, true, 'debería estar esperando la primera nota');
  engine.t += 5;
  player.tick();
  assert.equal(player.beat, 0, 'el tiempo avanzó sin tocar nada');
  assert.equal(player.noteOn(60), 'hit');
  assert.equal(player.waiting, false);
  engine.t += 1;
  player.tick();
  assert.ok(Math.abs(player.beat - 1) < 1e-6, 'tras acertar debería avanzar un beat');
});

test('modo aprender: una nota equivocada cuenta como fallo pero no bloquea', async () => {
  const engine = fakeEngine();
  const player = new Player(engine, simple, { mode: 'learn', hands: 'R', countInBars: 0 });
  await player.start();
  player.tick();
  assert.equal(player.noteOn(61), 'wrong');
  assert.equal(player.stats.wrong, 1);
  assert.equal(player.waiting, true);
  assert.equal(player.noteOn(60), 'hit');
  assert.equal(player.waiting, false);
});

test('la mano que no practicas la toca la app', async () => {
  const engine = fakeEngine();
  const player = new Player(engine, simple, { mode: 'play', hands: 'R', countInBars: 0 });
  await player.start();
  player.tick();
  assert.ok(engine.played.some((p) => p.midi === 48), 'la izquierda debería sonar sola');
  assert.ok(!engine.played.some((p) => p.midi === 60), 'la derecha no debería sonar sola');
});

test('modo escuchar toca las dos manos y no juzga', async () => {
  const engine = fakeEngine();
  const player = new Player(engine, simple, { mode: 'listen', countInBars: 0 });
  await player.start();
  for (let i = 0; i < 40; i++) { player.tick(); engine.t += 0.1; } // como el bucle de render

  assert.ok(engine.played.some((p) => p.midi === 48));
  assert.ok(engine.played.some((p) => p.midi === 60));
  assert.equal(player.result().total, 0);
});

test('modo tocar: lo que se pasa de la ventana se marca fallado', async () => {
  const engine = fakeEngine();
  const player = new Player(engine, simple, { mode: 'play', hands: 'R', difficulty: 'hard', countInBars: 0 });
  await player.start();
  engine.t += 0.5;
  player.tick();
  assert.equal(player.stats.misses, 1, 'solo la primera nota debería estar fallada');
  assert.ok(WINDOWS.hard < WINDOWS.easy);
});

test('dejar pasar la canción entera la cuenta como fallada, no como perfecta', async () => {
  const engine = fakeEngine();
  const player = new Player(engine, simple, { mode: 'play', hands: 'R', countInBars: 0 });
  await player.start();
  for (let i = 0; i < 60; i++) { player.tick(); engine.t += 0.1; }
  const result = player.result();
  assert.equal(result.hits, 0);
  assert.equal(result.misses, 4, 'las notas que pasaron sin tocarse deberían estar falladas');
  assert.equal(result.accuracy, 0);
  assert.equal(result.stars, 0);
});

test('adelantarse en modo aprender arrastra la canción contigo', async () => {
  const engine = fakeEngine();
  const player = new Player(engine, simple, { mode: 'learn', hands: 'R', countInBars: 0 });
  await player.start();
  player.tick();
  for (const midi of [60, 62, 64, 65]) {
    assert.equal(player.noteOn(midi), 'hit', `no aceptó ${midi} tocada por delante`);
  }
  assert.equal(player.stats.hits, 4);
  assert.equal(player.stats.wrong, 0);
  assert.ok(player.beat >= 3, 'el reloj no siguió al que toca');
});

test('la cuenta atrás suena antes de empezar y no juzga nada', async () => {
  const engine = fakeEngine();
  const player = new Player(engine, simple, { mode: 'play', hands: 'R', countInBars: 1 });
  await player.start();
  assert.equal(player.state, 'countin');
  player.tick();
  assert.ok(engine.clicks > 0, 'la claqueta no sonó');
  assert.ok(player.beat < 0);
  engine.t += 4;
  player.tick();
  assert.equal(player.state, 'playing');
  assert.equal(player.stats.misses, 0);
});

test('el bucle vuelve al principio del trozo y limpia los aciertos', async () => {
  const engine = fakeEngine();
  const player = new Player(engine, simple, {
    mode: 'play', hands: 'R', countInBars: 0, loopEnabled: true, range: { start: 0, end: 2 },
  });
  await player.start();
  player.noteOn(60);
  assert.equal(player.stats.hits, 1);
  engine.t += 2.5;
  player.tick();
  assert.equal(player.passes, 1, 'debería haber dado una vuelta');
  assert.equal(player.beat, 0);
  assert.equal(player.states[simple.notes.find((n) => n.midi === 60).i], null, 'no limpió el estado de la nota');
});

test('solo se juzgan las notas de la sección elegida', async () => {
  const engine = fakeEngine();
  const player = new Player(engine, simple, { mode: 'play', hands: 'R', countInBars: 0, range: { start: 2, end: 4 } });
  await player.start();
  assert.equal(player.judged.length, 2);
  assert.equal(player.judged[0].midi, 64);
});

test('la precisión, las estrellas y el dominio salen del resultado', async () => {
  const engine = fakeEngine();
  const player = new Player(engine, simple, { mode: 'mastery', hands: 'R', countInBars: 0, speed: 1 });
  await player.start();
  for (const midi of [60, 62, 64, 65]) {
    player.tick();
    player.noteOn(midi);
    engine.t += 1;
  }
  player.tick();
  const result = player.result();
  assert.equal(result.hits, 4);
  assert.equal(result.accuracy, 1);
  assert.equal(result.stars, 3);
  assert.equal(result.mastered, true);
  assert.equal(player.state, 'done', 'al pasar del final debería terminar');
});

test('a media velocidad no se gana el dominio', async () => {
  const engine = fakeEngine();
  const player = new Player(engine, simple, { mode: 'mastery', hands: 'R', countInBars: 0, speed: 0.5 });
  await player.start();
  for (const midi of [60, 62, 64, 65]) { player.tick(); player.noteOn(midi); engine.t += 2; }
  assert.equal(player.result().mastered, false);
});

test('bajar la velocidad ensancha la ventana en tiempo real', () => {
  const engine = fakeEngine();
  const player = new Player(engine, simple, { mode: 'play', difficulty: 'medium', speed: 1 });
  const fullSpeedSeconds = player.window / player.bps;
  player.setSpeed(0.5);
  assert.ok(player.window / player.bps > fullSpeedSeconds * 1.9, 'ralentizar debería dar casi el doble de margen');
});

test('pausar y seguir no mueve el beat', async () => {
  const engine = fakeEngine();
  const player = new Player(engine, simple, { mode: 'play', hands: 'R', countInBars: 0 });
  await player.start();
  engine.t += 1;
  player.tick();
  const beat = player.beat;
  player.pause();
  engine.t += 10;
  assert.equal(player.beat, beat, 'el beat se movió estando en pausa');
  await player.resume();
  player.tick();
  assert.ok(Math.abs(player.beat - beat) < 1e-6);
});

test('seek limpia lo que viene y respeta los límites', async () => {
  const engine = fakeEngine();
  const player = new Player(engine, simple, { mode: 'learn', hands: 'R', countInBars: 0 });
  await player.start();
  player.tick();
  player.noteOn(60);
  player.seek(2);
  assert.equal(player.beat, 2);
  assert.equal(player.stepIndex, 2);
  player.seek(999);
  assert.equal(player.beat, simple.lengthBeats);
});

// ------------------------------------------------------------------ fin
await run();
if (failures.length) {
  for (const [name, error] of failures) {
    console.error(`\x1b[31mFALLA\x1b[0m ${name}\n      ${error.message.split('\n')[0]}`);
  }
  console.error(`\n${passed} bien, ${failures.length} mal`);
  process.exit(1);
}
console.log(`\x1b[32m${passed} pruebas bien\x1b[0m`);
