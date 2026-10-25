// transcribe.js — audio a notas, en el navegador. BETA, y lo dice la interfaz.
//
// Esto no es la transcripción con IA en servidor de otras apps: es un detector
// de tono monofónico (YIN) que funciona bien con una melodía sola —una voz, un
// silbido, una flauta, una línea de piano tocada sin acordes— y mal con una
// canción pop completa, donde hay muchas notas a la vez. Para eso está el
// import de MIDI, que es exacto.

const TARGET_RATE = 16000;
const FRAME = 1024;
const HOP = 256;
const F0_MIN = 65;    // Do2
const F0_MAX = 1200;  // ~Re6
const YIN_THRESHOLD = 0.16;

export const TRANSCRIBE_LIMITS = {
  mono: 'Una melodía a la vez. Con acordes o con toda la banda sonando, se pierde.',
  best: 'Mejor: voz, silbido, flauta, violín o una sola línea de piano.',
  exact: 'Si quieres exactitud, importa un MIDI: eso no se adivina, se lee.',
};

function toMono(buffer) {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const out = new Float32Array(length);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) out[i] += data[i] / channels;
  }
  return out;
}

/** Remuestreo lineal: sobra para detectar tono y es diez veces más rápido. */
function resample(samples, fromRate, toRate) {
  if (Math.abs(fromRate - toRate) < 1) return samples;
  const ratio = fromRate / toRate;
  const length = Math.floor(samples.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = samples[idx] || 0;
    const b = samples[idx + 1] != null ? samples[idx + 1] : a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/**
 * YIN: diferencia acumulada normalizada. Devuelve [frecuencia, confianza].
 *
 * Lo importante es coger el PRIMER mínimo que baja del umbral, no el más
 * profundo: el más profundo suele caer en un múltiplo del periodo y entonces
 * un Mi4 se detecta como Mi3 o peor.
 */
function yin(frame, rate) {
  const tauMin = Math.max(2, Math.floor(rate / F0_MAX));
  const tauMax = Math.min(Math.floor(frame.length / 2), Math.floor(rate / F0_MIN));
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
    if (cmnd[tau] < YIN_THRESHOLD && cmnd[tau] <= cmnd[tau - 1] && cmnd[tau] <= cmnd[tau + 1]) {
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

function median(values) {
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.floor(sorted.length / 2)];
}

function freqToMidi(freq) {
  return 69 + 12 * Math.log2(freq / 440);
}

/**
 * Analiza un AudioBuffer y devuelve notas en beats.
 * options: { bpm, quantize (en beats, 0 = sin cuantizar), onProgress }
 */
export async function transcribeBuffer(audioBuffer, options = {}) {
  const quantize = options.quantize != null ? options.quantize : 0.25;
  const onProgress = options.onProgress || (() => {});

  const mono = resample(toMono(audioBuffer), audioBuffer.sampleRate, TARGET_RATE);
  const frames = Math.max(0, Math.floor((mono.length - FRAME) / HOP));
  const pitches = new Float32Array(frames);
  const energies = new Float32Array(frames);
  let peakEnergy = 1e-9;

  for (let f = 0; f < frames; f++) {
    const start = f * HOP;
    const frame = mono.subarray(start, start + FRAME);
    let rms = 0;
    for (let i = 0; i < frame.length; i++) rms += frame[i] * frame[i];
    rms = Math.sqrt(rms / frame.length);
    energies[f] = rms;
    if (rms > peakEnergy) peakEnergy = rms;
    if (rms > 0.004) {
      const [freq, confidence] = yin(frame, TARGET_RATE);
      pitches[f] = confidence > 0.55 && freq > F0_MIN && freq < F0_MAX ? freqToMidi(freq) : 0;
    }
    if ((f & 63) === 0) {
      onProgress(f / Math.max(1, frames));
      await new Promise((r) => setTimeout(r, 0)); // deja respirar a la interfaz
    }
  }

  // Suavizado por mediana: quita los saltos de octava de un solo frame.
  const smooth = new Float32Array(frames);
  const half = 2;
  for (let f = 0; f < frames; f++) {
    const window = [];
    for (let k = -half; k <= half; k++) {
      const v = pitches[Math.min(frames - 1, Math.max(0, f + k))];
      if (v > 0) window.push(v);
    }
    smooth[f] = window.length >= 2 ? median(window) : 0;
  }

  // Segmentación: una nota es un tramo con la misma altura redondeada.
  const secondsPerFrame = HOP / TARGET_RATE;
  const energyGate = Math.max(0.006, peakEnergy * 0.08);
  const segments = [];
  let current = null;
  for (let f = 0; f < frames; f++) {
    const loud = energies[f] > energyGate;
    const midi = smooth[f] > 0 ? Math.round(smooth[f]) : 0;
    if (!loud || !midi) {
      if (current) { segments.push(current); current = null; }
      continue;
    }
    if (current && Math.abs(current.midi - midi) < 0.5) {
      current.frames += 1;
      current.energy = Math.max(current.energy, energies[f]);
    } else {
      if (current) segments.push(current);
      current = { midi, startFrame: f, frames: 1, energy: energies[f] };
    }
  }
  if (current) segments.push(current);

  const detectedBpm = estimateTempo(energies, secondsPerFrame);
  const bpm = options.bpm
    ? Math.max(30, Math.min(220, options.bpm))
    : (detectedBpm || 100);
  const beatsPerSecond = bpm / 60;
  const minFrames = Math.max(3, Math.round(0.06 / secondsPerFrame));
  const notes = [];
  for (const seg of segments) {
    if (seg.frames < minFrames) continue;
    let t = seg.startFrame * secondsPerFrame * beatsPerSecond;
    let d = seg.frames * secondsPerFrame * beatsPerSecond;
    if (quantize > 0) {
      t = Math.round(t / quantize) * quantize;
      d = Math.max(quantize, Math.round(d / quantize) * quantize);
    }
    notes.push({
      t, d,
      midi: Math.max(21, Math.min(108, seg.midi)),
      vel: Math.max(0.25, Math.min(1, seg.energy / peakEnergy)),
      hand: 'R',
    });
  }

  // Desplaza el silencio inicial al compás 1.
  if (notes.length) {
    const offset = notes[0].t;
    for (const n of notes) n.t -= offset;
  }
  // Si la melodía baja mucho, la mano izquierda se lleva lo grave.
  const low = notes.filter((n) => n.midi < 55).length;
  if (low > notes.length * 0.25) for (const n of notes) if (n.midi < 55) n.hand = 'L';

  onProgress(1);
  return { notes, bpm, detectedBpm, frames, seconds: audioBuffer.duration };
}

/**
 * Tempo a ojo, por autocorrelación de la envolvente de ataques.
 *
 * No hace falta que el usuario adivine los bpm de lo que grabó: si hay pulso,
 * sale solo; si no, devuelve 0 y se usa el valor que haya puesto a mano.
 */
export function estimateTempo(energies, secondsPerFrame, min = 50, max = 190) {
  const n = energies.length;
  if (n < 32 || !secondsPerFrame) return 0;
  const onset = new Float32Array(n);
  let total = 0;
  for (let i = 1; i < n; i++) {
    onset[i] = Math.max(0, energies[i] - energies[i - 1]);
    total += onset[i];
  }
  if (total <= 0) return 0;

  const minLag = Math.max(2, Math.round(60 / max / secondsPerFrame));
  const maxLag = Math.min(n - 2, Math.round(60 / min / secondsPerFrame));
  if (maxLag <= minLag) return 0;

  let bestLag = 0;
  let bestScore = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    const limit = n - lag;
    for (let i = 1; i < limit; i++) sum += onset[i] * onset[i + lag];
    const score = sum / limit;
    if (score > bestScore) { bestScore = score; bestLag = lag; }
  }
  if (!bestLag) return 0;

  let bpm = 60 / (bestLag * secondsPerFrame);
  while (bpm < min) bpm *= 2;
  while (bpm > max) bpm /= 2;
  return Math.round(bpm);
}

/**
 * Graba lo que suena, para transcribirlo después.
 *
 * Dos fuentes: el micrófono (pon la canción en un altavoz y que escuche) o el
 * sonido de otra pestaña, donde el navegador lo permita. En las dos manda el
 * usuario: el navegador pide permiso y enseña qué se está compartiendo.
 * Es para sacar de oído lo que estás escuchando, como hace cualquiera con un
 * instrumento delante; no descarga nada de ningún sitio.
 */
export class AudioCapture {
  constructor(engine) {
    this.engine = engine;
    this.stream = null;
    this.node = null;
    this.chunks = [];
    this.frames = 0;
    this.startedAt = 0;
    this.onLevel = null;
    this.maxSeconds = 300;
    this.onAuto = null;
  }

  static get micSupported() {
    return typeof navigator !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  static get tabSupported() {
    return typeof navigator !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  }

  get recording() { return !!this.stream; }

  get seconds() {
    return this.sampleRate ? this.frames / this.sampleRate : 0;
  }

  async start(source = 'mic') {
    if (this.stream) throw new Error('Ya está grabando.');
    const ctx = await this.engine.ensure();
    const quality = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };

    if (source === 'tab') {
      if (!AudioCapture.tabSupported) {
        throw new Error('Este navegador no deja capturar el sonido de otra pestaña. En el iPad usa el micrófono.');
      }
      this.stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: quality });
      if (!this.stream.getAudioTracks().length) {
        this.cleanup();
        throw new Error('Compartiste la pestaña pero no su sonido. Vuelve a intentarlo marcando "compartir audio".');
      }
      for (const track of this.stream.getVideoTracks()) track.stop();
    } else {
      if (!AudioCapture.micSupported) throw new Error('Este navegador no da acceso al micrófono.');
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { ...quality, channelCount: 1 } });
    }

    this.sampleRate = ctx.sampleRate;
    this.chunks = [];
    this.frames = 0;
    this.startedAt = Date.now();

    const source_ = ctx.createMediaStreamSource(this.stream);
    // ScriptProcessor está marcado como obsoleto, pero es lo único que recoge
    // muestras crudas en todos los navegadores, Safari incluido.
    this.node = ctx.createScriptProcessor(4096, 1, 1);
    const sink = ctx.createGain();
    sink.gain.value = 0; // conectado al destino para que corra, en silencio para no acoplar
    this.node.onaudioprocess = (event) => {
      const data = event.inputBuffer.getChannelData(0);
      this.chunks.push(new Float32Array(data));
      this.frames += data.length;
      if (this.onLevel) {
        let peak = 0;
        for (let i = 0; i < data.length; i += 8) peak = Math.max(peak, Math.abs(data[i]));
        this.onLevel(Math.min(1, peak * 1.6));
      }
      if (this.seconds >= this.maxSeconds && this.onAuto) {
        const done = this.onAuto;
        this.onAuto = null;
        done();
      }
    };
    source_.connect(this.node);
    this.node.connect(sink);
    sink.connect(ctx.destination);
    this.sink = sink;
    this.source = source_;
    return true;
  }

  /** Corta la grabación y devuelve lo grabado como AudioBuffer. */
  stop() {
    if (!this.stream) return null;
    const ctx = this.engine.ctx;
    const total = this.frames;
    const buffer = total > 0 ? ctx.createBuffer(1, total, this.sampleRate) : null;
    if (buffer) {
      const out = buffer.getChannelData(0);
      let offset = 0;
      for (const chunk of this.chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
      }
    }
    this.cleanup();
    return buffer;
  }

  cleanup() {
    if (this.node) {
      this.node.onaudioprocess = null;
      try { this.node.disconnect(); this.sink.disconnect(); this.source.disconnect(); } catch (e) { /* ya */ }
    }
    if (this.stream) for (const track of this.stream.getTracks()) track.stop();
    this.stream = null;
    this.node = null;
    this.chunks = [];
  }
}

/** Lee un archivo de audio (mp3, m4a, wav, ogg...) y lo transcribe. */
export async function transcribeFile(arrayBuffer, engine, options = {}) {
  const ctx = await engine.ensure();
  let audioBuffer;
  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  } catch (e) {
    throw new Error('No se pudo leer ese audio. Prueba con un .m4a, .mp3 o .wav.');
  }
  if (audioBuffer.duration > 360) {
    throw new Error('El audio es muy largo (más de 6 minutos). Corta el trozo que quieras aprender.');
  }
  const result = await transcribeBuffer(audioBuffer, options);
  if (!result.notes.length) {
    throw new Error('No se encontró ninguna melodía clara. Esto funciona con una sola línea melódica.');
  }
  return result;
}
