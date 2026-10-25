// mic.js — oír un piano de verdad.
//
// Safari en iPad no implementa Web MIDI, así que el micrófono es el camino para
// tocar en un piano acústico o en un teclado sin USB. Se buscan picos en el
// espectro y se descartan los que son armónicos de otro más grave: sin eso, un
// Do suena como un Do, un Sol y un Mi a la vez.

const A4 = 440;

export function freqToMidi(freq) {
  return 69 + 12 * Math.log2(freq / A4);
}

export class MicInput {
  constructor(engine) {
    this.engine = engine;
    this.stream = null;
    this.analyser = null;
    this.data = null;
    this.raf = 0;
    this.active = new Map(); // midi -> { frames, since }
    this.onNoteOn = null;
    this.onNoteOff = null;
    this.onLevel = null;
    this.noiseFloor = -92;
    this.sensitivity = 18; // dB por encima del suelo de ruido
    this.minMidi = 28;
    this.maxMidi = 96;
  }

  static get supported() {
    return typeof navigator !== 'undefined' && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
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
    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 55;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 8192;
    this.analyser.smoothingTimeConstant = 0.35;
    this.analyser.minDecibels = -110;
    this.analyser.maxDecibels = -10;
    source.connect(highpass).connect(this.analyser);
    this.data = new Float32Array(this.analyser.frequencyBinCount);
    this.sampleRate = ctx.sampleRate;
    this.loop();
    return true;
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const midi of [...this.active.keys()]) {
      if (this.onNoteOff) this.onNoteOff(midi, 'mic');
    }
    this.active.clear();
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    this.analyser = null;
  }

  get listening() {
    return !!this.analyser;
  }

  loop() {
    if (!this.analyser) return;
    this.raf = requestAnimationFrame(() => this.loop());
    this.analyser.getFloatFrequencyData(this.data);
    const peaks = this.findPeaks();
    const now = performance.now();
    const seen = new Set();

    for (const peak of peaks) {
      const midi = Math.round(freqToMidi(peak.freq));
      if (midi < this.minMidi || midi > this.maxMidi) continue;
      seen.add(midi);
      const entry = this.active.get(midi);
      if (entry) {
        entry.frames = Math.min(6, entry.frames + 1);
        entry.lastSeen = now;
      } else {
        this.active.set(midi, { frames: 1, since: now, lastSeen: now, fired: false });
      }
    }

    for (const [midi, entry] of [...this.active.entries()]) {
      if (!seen.has(midi)) entry.frames -= 1;
      if (!entry.fired && entry.frames >= 2) {
        entry.fired = true;
        if (this.onNoteOn) this.onNoteOn(midi, 0.8, 'mic');
      }
      if (entry.frames <= 0 || now - entry.lastSeen > 220) {
        this.active.delete(midi);
        if (entry.fired && this.onNoteOff) this.onNoteOff(midi, 'mic');
      }
    }

    if (this.onLevel) {
      let max = -200;
      for (let i = 0; i < this.data.length; i++) if (this.data[i] > max) max = this.data[i];
      this.onLevel(Math.max(0, Math.min(1, (max + 100) / 70)));
    }
  }

  /** Picos locales con fuerza suficiente, sin los que son armónicos de otro. */
  findPeaks() {
    const bins = this.data;
    const binHz = this.sampleRate / (this.analyser.fftSize);
    const candidates = [];
    const loBin = Math.max(2, Math.floor(60 / binHz));
    const hiBin = Math.min(bins.length - 2, Math.ceil(2200 / binHz));
    let floor = 0;
    for (let i = loBin; i < hiBin; i++) floor += bins[i];
    floor /= Math.max(1, hiBin - loBin);
    const threshold = Math.max(this.noiseFloor, floor + this.sensitivity);

    for (let i = loBin; i < hiBin; i++) {
      const v = bins[i];
      if (v < threshold) continue;
      if (v <= bins[i - 1] || v < bins[i + 1]) continue;
      // Interpolación parabólica: afina la frecuencia entre dos bins.
      const alpha = bins[i - 1];
      const beta = v;
      const gamma = bins[i + 1];
      const shift = (0.5 * (alpha - gamma)) / (alpha - 2 * beta + gamma || 1);
      candidates.push({ freq: (i + shift) * binHz, db: v });
    }

    candidates.sort((a, b) => b.db - a.db);
    const kept = [];
    for (const c of candidates) {
      let isHarmonic = false;
      for (const k of kept) {
        const ratio = c.freq / k.freq;
        for (let n = 2; n <= 6; n++) {
          if (Math.abs(ratio - n) < 0.045 && c.db < k.db - 2) { isHarmonic = true; break; }
        }
        if (isHarmonic) break;
      }
      if (!isHarmonic) kept.push(c);
      if (kept.length >= 6) break;
    }
    return kept;
  }
}
