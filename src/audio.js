// audio.js — el motor de sonido.
//
// Sin samples a propósito: un piano grabado son decenas de megas y mataría el
// modo sin conexión. Aquí cada nota es una onda periódica con los armónicos de
// una cuerda pulsada, un filtro que se cierra con el tiempo y una envolvente
// cuyo decaimiento depende de la altura (los graves duran más, como en un piano).

const TIMBRES = {
  piano: {
    name: 'Piano',
    harmonics: [1, 0.46, 0.28, 0.16, 0.1, 0.062, 0.04, 0.022, 0.014, 0.009],
    detune: 4,
    attack: 0.004,
    cutoffBase: 1800,
    cutoffTrack: 4.2,
    decayLow: 7.5,
    decayHigh: 1.1,
    noise: 0.1,
  },
  electric: {
    name: 'Eléctrico',
    harmonics: [1, 0.08, 0.5, 0.05, 0.22, 0.03, 0.1, 0.02],
    detune: 7,
    attack: 0.006,
    cutoffBase: 1200,
    cutoffTrack: 3.2,
    decayLow: 5.5,
    decayHigh: 1.6,
    noise: 0.03,
  },
  caja: {
    name: 'Caja de música',
    harmonics: [1, 0.02, 0.35, 0.01, 0.18, 0.08, 0.04],
    detune: 0,
    attack: 0.002,
    cutoffBase: 2600,
    cutoffTrack: 5,
    decayLow: 2.4,
    decayHigh: 0.9,
    noise: 0.02,
  },
};

export const TIMBRE_NAMES = Object.entries(TIMBRES).map(([id, t]) => ({ id, name: t.name }));

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export class Engine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.voices = new Map(); // midi -> voz activa
    this.timbre = 'piano';
    this.volume = 0.75;
    this.waves = new Map();
    this.noiseBuffer = null;
    this.latencyMs = 0;
  }

  /** Safari no deja crear audio sin un gesto: esto se llama al primer toque. */
  async ensure() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) throw new Error('Este navegador no tiene Web Audio.');
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -8;
      limiter.knee.value = 6;
      limiter.ratio.value = 6;
      limiter.attack.value = 0.004;
      limiter.release.value = 0.12;
      this.master.connect(limiter).connect(this.ctx.destination);
      this.buildNoise();
    }
    if (this.ctx.state === 'suspended') {
      try { await this.ctx.resume(); } catch (e) { /* el usuario tendrá que tocar otra vez */ }
    }
    return this.ctx;
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  buildNoise() {
    const len = Math.floor(this.ctx.sampleRate * 0.05);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    this.noiseBuffer = buf;
  }

  wave(timbreId) {
    if (this.waves.has(timbreId)) return this.waves.get(timbreId);
    const t = TIMBRES[timbreId] || TIMBRES.piano;
    const real = new Float32Array(t.harmonics.length + 1);
    const imag = new Float32Array(t.harmonics.length + 1);
    t.harmonics.forEach((amp, i) => { imag[i + 1] = amp; });
    const w = this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    this.waves.set(timbreId, w);
    return w;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.value = this.volume;
  }

  setTimbre(id) {
    if (TIMBRES[id]) this.timbre = id;
  }

  /**
   * Toca una nota. Si se pasa `duration` la nota se apaga sola (reproducción
   * programada); si no, queda sonando hasta noteOff (alguien tocando).
   */
  noteOn(midi, velocity = 0.8, when = 0, duration = 0) {
    if (!this.ctx) return null;
    const t = TIMBRES[this.timbre] || TIMBRES.piano;
    const start = Math.max(when || this.ctx.currentTime, this.ctx.currentTime);
    const freq = midiToFreq(midi);
    const pitchFactor = (midi - 21) / 87; // 0 grave, 1 agudo
    const decay = t.decayLow + (t.decayHigh - t.decayLow) * pitchFactor;
    const peak = Math.max(0.05, Math.min(1, velocity)) * 0.26;

    const out = this.ctx.createGain();
    out.gain.setValueAtTime(0, start);
    out.gain.linearRampToValueAtTime(peak, start + t.attack);
    out.gain.setTargetAtTime(0.0001, start + t.attack, decay / 4.5);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const cutoff = Math.min(16000, t.cutoffBase + freq * t.cutoffTrack);
    filter.frequency.setValueAtTime(cutoff, start);
    filter.frequency.setTargetAtTime(Math.max(380, cutoff * 0.3), start + t.attack, decay / 3);
    filter.Q.value = 0.6;

    const osc = this.ctx.createOscillator();
    osc.setPeriodicWave(this.wave(this.timbre));
    osc.frequency.value = freq;

    const osc2 = this.ctx.createOscillator();
    osc2.setPeriodicWave(this.wave(this.timbre));
    osc2.frequency.value = freq;
    osc2.detune.value = t.detune;
    const mix2 = this.ctx.createGain();
    mix2.gain.value = 0.35;

    osc.connect(filter);
    osc2.connect(mix2).connect(filter);
    filter.connect(out).connect(this.master);
    osc.start(start);
    osc2.start(start);

    let noise = null;
    if (t.noise > 0 && this.noiseBuffer) {
      noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const ng = this.ctx.createGain();
      ng.gain.value = t.noise * peak;
      const nf = this.ctx.createBiquadFilter();
      nf.type = 'bandpass';
      nf.frequency.value = Math.min(9000, freq * 3);
      nf.Q.value = 0.8;
      noise.connect(nf).connect(ng).connect(this.master);
      noise.start(start);
    }

    const voice = { osc, osc2, out, filter, start, midi, stopAt: 0 };
    const previous = this.voices.get(midi);
    if (previous) this.release(previous, start, 0.03);
    this.voices.set(midi, voice);

    const maxLife = decay * 1.6;
    const stopAt = duration > 0 ? start + Math.max(0.08, duration) : start + maxLife;
    if (duration > 0) {
      out.gain.setTargetAtTime(0.0001, stopAt, 0.09);
      this.hardStop(voice, stopAt + 0.5);
    } else {
      this.hardStop(voice, start + maxLife + 0.5);
    }
    return voice;
  }

  release(voice, when, time = 0.14) {
    if (!voice || voice.released) return;
    voice.released = true;
    const t = Math.max(when || this.ctx.currentTime, this.ctx.currentTime);
    try {
      voice.out.gain.cancelScheduledValues(t);
      voice.out.gain.setTargetAtTime(0.0001, t, time);
    } catch (e) { /* la voz ya murió */ }
    this.hardStop(voice, t + time * 6 + 0.1);
  }

  hardStop(voice, at) {
    try {
      voice.osc.stop(at);
      voice.osc2.stop(at);
    } catch (e) { /* ya estaba parado */ }
    voice.osc.onended = () => {
      try { voice.out.disconnect(); voice.filter.disconnect(); } catch (e) { /* ya */ }
      if (this.voices.get(voice.midi) === voice) this.voices.delete(voice.midi);
    };
  }

  noteOff(midi, when = 0) {
    const voice = this.voices.get(midi);
    if (voice) this.release(voice, when);
  }

  /** Una nota con principio y fin, para reproducir la canción. */
  play(midi, velocity, when, durationSeconds) {
    return this.noteOn(midi, velocity, when, durationSeconds);
  }

  allOff() {
    for (const voice of [...this.voices.values()]) this.release(voice, this.now, 0.05);
    this.voices.clear();
  }

  /** Claqueta y metrónomo. */
  click(when = 0, accent = false) {
    if (!this.ctx) return;
    const t = Math.max(when || this.ctx.currentTime, this.ctx.currentTime);
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = accent ? 1760 : 1180;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(accent ? 0.16 : 0.1, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  /** Avisos cortos de la interfaz: acierto, fallo, fin. */
  blip(kind) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = kind === 'good' ? [76, 83] : kind === 'bad' ? [49, 48] : [72, 76, 79, 84];
    notes.forEach((midi, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = kind === 'bad' ? 'sawtooth' : 'triangle';
      osc.frequency.value = midiToFreq(midi);
      const g = this.ctx.createGain();
      const at = t + i * (kind === 'end' ? 0.09 : 0.05);
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(0.09, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
      osc.connect(g).connect(this.master);
      osc.start(at);
      osc.stop(at + 0.25);
    });
  }
}

export const engine = new Engine();
