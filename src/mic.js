// mic.js — oír un piano de verdad.
//
// Safari en iPad no implementa Web MIDI, así que el micrófono es el camino
// para tocar en un piano acústico o en un teclado sin USB.
//
// Detecta **una nota a la vez**, y lo hace bien: mide cada cuánto se repite la
// onda (ver pitch.js) en vez de buscar el pico más alto del espectro, que es
// lo que hacía antes y lo que confundía un Mi4 con el Mi3 de debajo. Para
// acordes hace falta otra cosa; aquí no se finge que los oye.

import { detectPitch, rms, freqToMidi } from './pitch.js';

export { freqToMidi };

const FRAME = 4096;          // ~93 ms a 44,1 kHz: llega hasta el Mi1
const HOLD_MS = 190;         // sin señal este rato, se suelta la nota
const CONFIRM_FRAMES = 2;    // dos lecturas seguidas antes de darla por buena
const MIN_MIDI = 28;         // Mi1
const MAX_MIDI = 96;         // Do7

export class MicInput {
  constructor(engine) {
    this.engine = engine;
    this.stream = null;
    this.analyser = null;
    this.data = null;
    this.raf = 0;
    this.onNoteOn = null;
    this.onNoteOff = null;
    this.onLevel = null;
    this.onDetect = null;     // para que los ajustes enseñen lo que se oye
    this.sensitivity = 0.5;   // 0 = sordo en sala ruidosa, 1 = muy sensible
    this.held = null;         // { midi, since }
    this.candidate = null;    // { midi, frames }
    this.floor = 0.004;       // suelo de ruido, se aprende solo
    this.loudness = 0;        // media suave, para notar los ataques
  }

  static get supported() {
    return typeof navigator !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  get gate() {
    // Más sensibilidad = umbral más bajo sobre el suelo de ruido aprendido.
    return Math.max(0.0025, this.floor * (5.5 - 3.5 * this.sensitivity));
  }

  async start() {
    if (!MicInput.supported) throw new Error('Este navegador no da acceso al micrófono.');
    const ctx = await this.engine.ensure();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });
    const source = ctx.createMediaStreamSource(this.stream);
    // Un corte en graves quita el retumbe de la sala sin tocar las notas.
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 35;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = FRAME;
    this.analyser.smoothingTimeConstant = 0;
    source.connect(highpass).connect(this.analyser);
    this.data = new Float32Array(FRAME);
    this.sampleRate = ctx.sampleRate;
    this.loop();
    return true;
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.release();
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    this.analyser = null;
  }

  get listening() {
    return !!this.analyser;
  }

  release() {
    if (this.held && this.onNoteOff) this.onNoteOff(this.held.midi, 'mic');
    this.held = null;
    this.candidate = null;
  }

  loop() {
    if (!this.analyser) return;
    this.raf = requestAnimationFrame(() => this.loop());
    this.analyser.getFloatTimeDomainData(this.data);

    const level = rms(this.data);
    // El suelo de ruido se aprende de los ratos callados.
    if (level < this.floor * 1.5 || this.floor === 0) this.floor = this.floor * 0.95 + level * 0.05;
    const now = performance.now();
    const gate = this.gate;

    if (this.onLevel) this.onLevel(Math.min(1, level / Math.max(0.02, gate * 6)));

    if (level < gate) {
      this.loudness = this.loudness * 0.8;
      if (this.held && now - this.held.seen > HOLD_MS) this.release();
      if (this.onDetect && !this.held) this.onDetect(null);
      return;
    }

    const result = detectPitch(this.data, this.sampleRate, { minConfidence: 0.78 });
    if (this.onDetect) this.onDetect(result.midi ? { ...result, level } : null);

    if (!result.midi || result.midi < MIN_MIDI || result.midi > MAX_MIDI) {
      if (this.held && now - this.held.seen > HOLD_MS) this.release();
      return;
    }

    // Golpe nuevo sobre la misma tecla: sube el volumen de golpe.
    const attack = level > this.loudness * 1.8 && level > gate * 1.6;
    this.loudness = Math.max(level, this.loudness * 0.85);

    if (this.held && this.held.midi === result.midi) {
      this.held.seen = now;
      if (attack && now - this.held.since > 120) {
        if (this.onNoteOff) this.onNoteOff(result.midi, 'mic');
        if (this.onNoteOn) this.onNoteOn(result.midi, 0.85, 'mic');
        this.held.since = now;
      }
      return;
    }

    // Nota distinta: hay que verla dos veces seguidas antes de creérsela.
    if (this.candidate && this.candidate.midi === result.midi) this.candidate.frames += 1;
    else this.candidate = { midi: result.midi, frames: 1 };

    if (this.candidate.frames >= CONFIRM_FRAMES) {
      if (this.held && this.onNoteOff) this.onNoteOff(this.held.midi, 'mic');
      this.held = { midi: result.midi, since: now, seen: now };
      this.candidate = null;
      if (this.onNoteOn) this.onNoteOn(result.midi, Math.min(1, 0.5 + level * 6), 'mic');
    }
  }
}
