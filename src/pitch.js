// pitch.js — lo que comparten el micrófono y el transcriptor.
//
// Detectar una nota es, en el fondo, medir cada cuánto se repite la onda. Eso
// se hace mejor en el tiempo (YIN) que mirando el espectro: un piano tiene
// armónicos muy fuertes y buscar "el pico más alto" acaba confundiendo un Mi4
// con el Mi3 de debajo o con un armónico de arriba.

export const A4 = 440;

export function freqToMidi(freq) {
  return 69 + 12 * Math.log2(freq / A4);
}

export function midiToFreq(midi) {
  return A4 * Math.pow(2, (midi - 69) / 12);
}

/**
 * YIN: diferencia acumulada normalizada.
 *
 * Lo importante es coger el PRIMER mínimo que baja del umbral, no el más
 * profundo: el más profundo suele caer en un múltiplo del periodo, y entonces
 * la nota se detecta una o dos octavas por debajo.
 *
 * Devuelve [frecuencia, confianza]; confianza 0 cuando no hay nada claro.
 */
export function yin(frame, rate, options = {}) {
  const f0min = options.f0min || 55;
  const f0max = options.f0max || 1600;
  const threshold = options.threshold != null ? options.threshold : 0.16;

  const tauMin = Math.max(2, Math.floor(rate / f0max));
  const tauMax = Math.min(Math.floor(frame.length / 2), Math.floor(rate / f0min));
  if (tauMax <= tauMin + 2) return [0, 0];

  const diff = new Float32Array(tauMax + 2);
  for (let tau = tauMin; tau <= tauMax; tau++) {
    let sum = 0;
    const last = frame.length - tau;
    for (let i = 0; i < last; i++) {
      const d = frame[i] - frame[i + tau];
      sum += d * d;
    }
    diff[tau] = sum / last;
  }

  const cmnd = new Float32Array(tauMax + 2).fill(1);
  let running = 0;
  for (let tau = tauMin; tau <= tauMax; tau++) {
    running += diff[tau];
    cmnd[tau] = (diff[tau] * (tau - tauMin + 1)) / (running || 1);
  }

  let best = -1;
  for (let tau = tauMin + 1; tau < tauMax; tau++) {
    if (cmnd[tau] < threshold && cmnd[tau] <= cmnd[tau - 1] && cmnd[tau] <= cmnd[tau + 1]) {
      best = tau;
      break;
    }
  }
  if (best < 0) {
    let bestValue = Infinity;
    for (let tau = tauMin; tau <= tauMax; tau++) {
      if (cmnd[tau] < bestValue) { bestValue = cmnd[tau]; best = tau; }
    }
  }
  if (best < 0) return [0, 0];

  const a = best - 1 >= tauMin ? cmnd[best - 1] : cmnd[best];
  const b = cmnd[best];
  const c = best + 1 <= tauMax ? cmnd[best + 1] : cmnd[best];
  const denominator = a - 2 * b + c;
  const shift = denominator ? (0.5 * (a - c)) / denominator : 0;
  const tau = best + (isFinite(shift) ? Math.max(-1, Math.min(1, shift)) : 0);
  return [rate / tau, Math.max(0, Math.min(1, 1 - b))];
}

/** Baja el ritmo de muestreo a la mitad tantas veces como haga falta. */
export function decimate(samples, times = 1) {
  let data = samples;
  for (let n = 0; n < times; n++) {
    const out = new Float32Array(Math.floor(data.length / 2));
    for (let i = 0; i < out.length; i++) out[i] = (data[i * 2] + data[i * 2 + 1]) * 0.5;
    data = out;
  }
  return data;
}

export function rms(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, samples.length));
}

// ------------------------------------------------------------------- FFT

const WINDOWS = new Map();

/** Ventana de Hann: sin ella, cada nota mancha el espectro de sus vecinas. */
export function hann(size) {
  if (WINDOWS.has(size)) return WINDOWS.get(size);
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  WINDOWS.set(size, w);
  return w;
}

/** FFT radix-2 en el sitio. `size` tiene que ser potencia de dos. */
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k];
        const ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br;
        im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br;
        im[i + k + len / 2] = ai - bi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** Espectro de magnitudes de un trozo de señal. */
export function spectrum(frame, size) {
  const n = size || frame.length;
  const window = hann(n);
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let i = 0; i < n; i++) re[i] = (frame[i] || 0) * window[i];
  fft(re, im);
  const half = n >> 1;
  const mag = new Float32Array(half);
  for (let i = 0; i < half; i++) mag[i] = Math.hypot(re[i], im[i]);
  return mag;
}

// ------------------------------------------------- detección en dos pasadas

/**
 * Una sola pasada no cubre bien el piano entero. Rango útil: de Mi1 (MIDI 28)
 * a Do7 (MIDI 96), que es todo lo que se toca aprendiendo. Por debajo el
 * fundamental casi no suena ni en un piano de cola, y por encima no hay
 * muestras suficientes por periodo.
 *
 * Para las notas graves hace falta una ventana larga: el periodo de un La1 son
 * cientos de muestras. Para las agudas hace falta justo lo contrario, muestreo
 * fino: el periodo de un Do7 son veinte muestras y, si se mira con la ventana
 * de los graves, YIN se agarra al doble de periodo y canta la nota una octava
 * más abajo. Así que se miran las dos cosas y gana la que esté más segura.
 */
export function detectPitch(frame, rate, options = {}) {
  const minConfidence = options.minConfidence != null ? options.minConfidence : 0.82;

  // Grave y medio: media frecuencia de muestreo, ventana larga en tiempo.
  const low = decimate(frame, 1);
  const [lowFreq, lowConf] = yin(low, rate / 2, { f0min: 38, f0max: 1100 });

  // Agudo: a ritmo completo, donde veinte muestras siguen siendo un periodo.
  const [highFreq, highConf] = yin(frame, rate, { f0min: 950, f0max: 2400 });

  // La firma del error de octava: la pasada grave canta justo la mitad de lo
  // que canta la aguda. Cuando pasa eso, la aguda tiene razón.
  const octaveBelow = lowFreq > 0 && highFreq > 0
    && Math.abs(highFreq / lowFreq - 2) < 0.04;

  const highWins = highFreq > 950 && (
    (highConf > 0.9 && highConf >= lowConf - 0.02)
    || (octaveBelow && highConf > 0.5)  // la relación 2:1 ya es prueba de sobra
  );

  const freq = highWins ? highFreq : lowFreq;
  const confidence = highWins ? highConf : lowConf;
  if (!freq || confidence < minConfidence) return { midi: 0, freq: 0, confidence };
  const midi = Math.round(freqToMidi(freq));
  if (midi < 21 || midi > 108) return { midi: 0, freq, confidence };
  return { midi, freq, confidence, cents: Math.round((freqToMidi(freq) - midi) * 100) };
}
