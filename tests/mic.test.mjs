// El micrófono, contra un piano simulado con todo lo que lo hace difícil.
//   node tests/mic.test.mjs
//
// Lo que se mide es lo que importa al tocar: que aparezcan las notas que
// tocaste, en orden, y que no se cuelen demasiadas que no tocaste.
import assert from 'node:assert/strict';
import { pianoNote, mix, room, addNoise, normalise, RATE, reseed } from './piano-simulado.mjs';

globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
let clock = 0;
globalThis.performance = { now: () => clock };
const { MicInput } = await import('../src/mic.js');

const FRAME = 4096;

function play(melody, gap, ring, noise) {
  reseed(); // misma señal en cada ejecución: una prueba intermitente no vale nada
  const total = melody.length * gap + ring;
  const notes = melody.map((midi, i) => pianoNote(midi, ring, { startAt: i * gap }));
  return normalise(addNoise(room(mix(notes, total)), noise), 0.3);
}

function listen(signal) {
  const mic = new MicInput({ ensure: async () => ({ sampleRate: RATE }) });
  mic.sampleRate = RATE;
  mic.data = new Float32Array(FRAME);
  mic.analyser = { fftSize: FRAME, getFloatTimeDomainData: (a) => a.set(mic.data) };
  const heard = [];
  mic.onNoteOn = (midi) => heard.push(midi);
  mic.onNoteOff = () => {};
  const hop = Math.floor(RATE * 0.016); // ~60 fps, como en el navegador
  for (let pos = 0; pos + FRAME < signal.length; pos += hop) {
    mic.data.set(signal.subarray(pos, pos + FRAME));
    clock += 16;
    mic.loop();
  }
  return heard;
}

/** Cuántas de las tocadas aparecen, en orden, y cuántas sobran. */
function score(played, heard) {
  let cursor = 0;
  let found = 0;
  for (const midi of played) {
    const at = heard.indexOf(midi, cursor);
    if (at >= 0) { found += 1; cursor = at + 1; }
  }
  return { found, extra: Math.max(0, heard.length - found) };
}

const ESCALA = [60, 62, 64, 65, 67, 69, 71, 72];
const CASES = [
  { name: 'notas sueltas', melody: ESCALA, gap: 0.9, ring: 0.8, noise: 0.002 },
  { name: 'tempo normal, el piano resuena', melody: ESCALA, gap: 0.6, ring: 2.5, noise: 0.002 },
  { name: 'rápido y con pedal', melody: ESCALA, gap: 0.35, ring: 4.0, noise: 0.002 },
  { name: 'sala ruidosa', melody: ESCALA, gap: 0.6, ring: 2.5, noise: 0.012 },
  { name: 'mano izquierda', melody: [48, 52, 55, 60, 55, 52], gap: 0.6, ring: 3.0, noise: 0.002 },
  { name: 'agudos', melody: [72, 76, 79, 84], gap: 0.6, ring: 2.0, noise: 0.002 },
];

let passed = 0;
const failures = [];
let totalPlayed = 0;
let totalFound = 0;
let totalExtra = 0;

for (const testCase of CASES) {
  const heard = listen(play(testCase.melody, testCase.gap, testCase.ring, testCase.noise));
  const { found, extra } = score(testCase.melody, heard);
  totalPlayed += testCase.melody.length;
  totalFound += found;
  totalExtra += extra;
  try {
    // Lo primero es no perder notas: si no te oye, no sirve de nada.
    assert.ok(found >= testCase.melody.length - 1,
      `solo oyó ${found} de ${testCase.melody.length}: ${heard.join(' ')}`);
    // Y que lo que se cuela no ahogue lo tocado.
    assert.ok(extra <= testCase.melody.length,
      `se coló demasiado (${extra} de más): ${heard.join(' ')}`);
    passed += 1;
  } catch (error) {
    failures.push([testCase.name, error]);
  }
}

try {
  assert.ok(totalFound >= totalPlayed * 0.92,
    `oye ${totalFound} de ${totalPlayed}, por debajo del 92 %`);
  assert.ok(totalExtra <= totalPlayed * 0.4,
    `${totalExtra} notas de más sobre ${totalPlayed} tocadas, por encima del 40 %`);
  passed += 1;
} catch (error) {
  failures.push(['balance general', error]);
}

for (const [name, error] of failures) {
  console.error(`\x1b[31mFALLA\x1b[0m ${name}\n      ${error.message.split('\n')[0]}`);
}
console.log(`${totalFound}/${totalPlayed} notas oídas en orden · ${totalExtra} de más`);
if (failures.length) {
  console.error(`\n${passed} bien, ${failures.length} mal`);
  process.exit(1);
}
console.log(`\x1b[32m${passed} escenarios de piano real, bien\x1b[0m`);
