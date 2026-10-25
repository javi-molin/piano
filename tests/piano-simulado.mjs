// Un piano acústico de mentira, pero honesto.
//
// Las primeras pruebas del micrófono usaban tonos sintéticos perfectos y
// salían impecables; con un piano de verdad fallaba. El error estaba en la
// prueba, no en el código: un piano no suena así. Esto sí se le parece —
// cuerdas con rigidez, tres por nota ligeramente desafinadas, cada parcial
// apagándose a su ritmo, el golpe del martillo y la sala— y es lo que
// vigila que no se vuelva a romper.
import { detectPitch, midiToFreq } from '../src/pitch.js';

const RATE = 44100;

/**
 * Generador con semilla.
 *
 * El piano simulado necesita azar —amplitudes de los parciales, fases, el
 * golpe del martillo— pero una prueba que cambia en cada ejecución no sirve
 * de nada: un día pasa y otro no, y entonces no sabes si rompiste algo. Con
 * semilla fija, la misma señal siempre.
 */
let seed = 20261025;
function random() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

export function reseed(value = 20261025) {
  seed = value;
}

/**
 * Una nota de piano de verdad:
 *  - inarmonicidad: los parciales NO están en múltiplos exactos del fundamental
 *    (la cuerda tiene rigidez), y eso crece en los graves
 *  - cada parcial se apaga a su ritmo; los agudos se van antes
 *  - golpe del martillo: ruido de banda ancha en los primeros milisegundos
 *  - dos cuerdas por nota ligeramente desafinadas entre sí (el "coro" del piano)
 */
export function pianoNote(midi, seconds, { gain = 1, startAt = 0 } = {}) {
  const f0 = midiToFreq(midi);
  const n = Math.floor(RATE * seconds);
  const out = new Float32Array(n);
  // Coeficiente de inarmonicidad: más alto en los graves.
  const B = midi < 40 ? 0.0012 : midi < 60 ? 0.0004 : 0.00018;
  const partials = 14;
  const detunes = [0, 0.6, -0.5]; // tres cuerdas por nota, ligeramente distintas

  for (const cents of detunes) {
    const fd = f0 * Math.pow(2, cents / 1200);
    for (let p = 1; p <= partials; p++) {
      const fp = p * fd * Math.sqrt(1 + B * p * p);
      if (fp > RATE / 2.2) break;
      const amp = (1 / Math.pow(p, 1.15)) * (0.75 + random() * 0.5) / detunes.length;
      const decay = 0.9 + p * 0.55;          // los parciales altos se apagan antes
      const phase = random() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const t = i / RATE;
        out[i] += amp * Math.exp(-decay * t) * Math.sin(2 * Math.PI * fp * t + phase);
      }
    }
  }
  // Golpe del martillo.
  const hit = Math.floor(RATE * 0.012);
  for (let i = 0; i < hit; i++) {
    out[i] += (random() * 2 - 1) * 0.5 * (1 - i / hit);
  }
  for (let i = 0; i < n; i++) out[i] *= gain;
  return { samples: out, startAt: Math.floor(startAt * RATE) };
}

/** Mezcla notas que se solapan (el piano sigue sonando cuando tocas la siguiente). */
export function mix(notes, totalSeconds) {
  const n = Math.floor(RATE * totalSeconds);
  const out = new Float32Array(n);
  for (const { samples, startAt } of notes) {
    for (let i = 0; i < samples.length && startAt + i < n; i++) out[startAt + i] += samples[i];
  }
  return out;
}

/** Sala pequeña: unas reflexiones y una cola corta. */
export function room(samples, amount = 0.25) {
  const out = Float32Array.from(samples);
  const taps = [0.013, 0.021, 0.037, 0.058, 0.089].map((s) => Math.floor(s * RATE));
  taps.forEach((delay, k) => {
    const g = amount * Math.pow(0.65, k);
    for (let i = delay; i < out.length; i++) out[i] += out[i - delay] * g;
  });
  return out;
}

export function addNoise(samples, level) {
  const out = Float32Array.from(samples);
  for (let i = 0; i < out.length; i++) out[i] += (random() * 2 - 1) * level;
  return out;
}

export function normalise(samples, peak = 0.3) {
  let max = 1e-9;
  for (const v of samples) max = Math.max(max, Math.abs(v));
  const g = peak / max;
  const out = Float32Array.from(samples);
  for (let i = 0; i < out.length; i++) out[i] *= g;
  return out;
}

export { RATE, detectPitch, midiToFreq };
