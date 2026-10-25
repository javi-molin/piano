// mic.js — oír un piano de verdad.
//
// Safari en iPad no implementa Web MIDI, así que el micrófono es el camino
// para tocar en un piano acústico o en un teclado sin USB.
//
// Oye **varias notas a la vez**, que es como suena un piano de verdad: con
// pedal, o simplemente tocando seguido, las cuerdas anteriores siguen
// sonando. Por eso no pregunta "¿qué nota suena?" sino "¿qué notas suenan?",
// y da por nueva la que aparece en ese conjunto. Preguntar lo primero era lo
// que hacía aparecer notas graves que nadie había tocado: varias cuerdas
// juntas forman una onda con un periodo largo que no es ninguna tecla.

import { detectPitch, rms, freqToMidi, spectrum, framePitches } from './pitch.js';

export { freqToMidi };

const FRAME = 4096;          // ~93 ms a 44,1 kHz: llega hasta el Mi1
const HOLD_MS = 190;         // sin señal este rato, se suelta la nota
const MAX_VOICES = 3;        // cuántas notas a la vez se buscan
const VOICE_FLOOR = 0.55;    // una nota tiene que pesar la mitad que la más clara
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
    this.sounding = new Set();   // lo que suena ahora mismo
    this.seen = new Map();       // midi -> confianza acumulada
    this.startedAt = new Map();  // midi -> cuándo empezó
    this.stoppedAt = new Map();  // midi -> cuándo se apagó
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
    for (const midi of [...this.sounding]) this.stopNote(midi);
    this.seen.clear();
  }

  loop() {
    if (!this.analyser) return;
    this.raf = requestAnimationFrame(() => this.loop());
    this.analyser.getFloatTimeDomainData(this.data);

    const level = rms(this.data);
    if (level < this.floor * 1.5 || this.floor === 0) this.floor = this.floor * 0.95 + level * 0.05;
    const now = performance.now();
    const gate = this.gate;

    if (this.onLevel) this.onLevel(Math.min(1, level / Math.max(0.02, gate * 6)));

    if (level < gate) {
      this.loudness *= 0.82;
      this.seen.clear();
      for (const midi of [...this.sounding]) this.stopNote(midi);
      if (this.onDetect) this.onDetect(null);
      return;
    }

    // Un piano con pedal son varias cuerdas sonando a la vez, así que la
    // pregunta correcta no es "¿qué nota suena?" sino "¿qué notas suenan?".
    // Se mide, para cada tecla posible, cuánta señal encaja con que esa tecla
    // esté sonando, se acepta la más clara, se borra del espectro lo que esa
    // nota explica, y se repite. Una nota nueva es la que aparece en ese
    // conjunto; las que siguen resonando ya estaban y no vuelven a contarse.
    const mag = spectrum(this.data, FRAME);
    const binHz = this.sampleRate / FRAME;
    let sum = 0;
    for (let i = 0; i < mag.length; i++) sum += mag[i];
    const floor = (sum / mag.length) * 9;
    const found = framePitches(mag, binHz, MAX_VOICES, floor, VOICE_FLOOR)
      .filter((p) => p.midi >= MIN_MIDI && p.midi <= MAX_MIDI);

    if (this.onDetect) {
      const strongest = found[0];
      this.onDetect(strongest
        ? { midi: strongest.midi, confidence: 1, cents: this.centsOf(strongest.midi), level }
        : null);
    }

    // Una nota tiene que salir en dos lecturas seguidas para darla por buena, y
    // faltar en tres seguidas para darla por acabada. Eso quita el parpadeo.
    // Una tecla recién golpeada DOMINA el instante en que se toca. El residuo
    // que deja la resta de armónicos nunca domina: aparece flojo, a la sombra
    // de la nota de verdad. Así que para empezar a contar una nota se le exige
    // pesar casi tanto como la más clara del momento; para seguir sonando, no.
    const strongestScore = found.length ? found[0].score : 0;
    const nowSeen = new Set(found.map((p) => p.midi));
    const dominant = new Set(
      found.filter((p) => p.score >= strongestScore * 0.75).map((p) => p.midi),
    );
    for (const midi of nowSeen) this.seen.set(midi, Math.min(4, (this.seen.get(midi) || 0) + 2));
    for (const [midi, count] of [...this.seen]) {
      if (!nowSeen.has(midi)) {
        if (count <= 1) this.seen.delete(midi);
        else this.seen.set(midi, count - 1);
      }
    }

    const attack = level > this.loudness * 1.5 && level > gate * 1.4;
    this.loudness = Math.max(level, this.loudness * 0.9);

    for (const [midi, count] of this.seen) {
      if (count < 3 || this.sounding.has(midi)) continue;
      if (!dominant.has(midi)) continue;
      // Un semitono pegado a algo que ya suena casi siempre es residuo de la
      // resta, no una tecla: nadie toca dos teclas contiguas a la vez.
      if (this.sounding.has(midi - 1) || this.sounding.has(midi + 1)) continue;
      // Y una nota que acaba de apagarse no puede "volver" sin un golpe nuevo.
      const stopped = this.stoppedAt.get(midi) || 0;
      if (now - stopped < 250 && !attack) continue;
      this.startNote(midi, level, now);
    }
    for (const midi of [...this.sounding]) {
      if (!this.seen.has(midi)) this.stopNote(midi);
    }
    // La misma tecla otra vez, sin que llegara a apagarse: hace falta un golpe.
    if (attack && found.length) {
      const top = found[0].midi;
      const started = this.startedAt.get(top) || 0;
      if (this.sounding.has(top) && now - started > 140) {
        this.stopNote(top);
        this.startNote(top, level, now);
      }
    }
  }

  startNote(midi, level, now) {
    this.sounding.add(midi);
    this.startedAt.set(midi, now);
    if (this.onNoteOn) this.onNoteOn(midi, Math.min(1, 0.5 + level * 6), 'mic');
  }

  stopNote(midi) {
    if (!this.sounding.has(midi)) return;
    this.sounding.delete(midi);
    this.seen.delete(midi);
    this.stoppedAt.set(midi, performance.now());
    if (this.onNoteOff) this.onNoteOff(midi, 'mic');
  }

  /** Cuánto se desvía de la afinación, para poder enseñarlo. */
  centsOf(midi) {
    const read = detectPitch(this.data, this.sampleRate, { minConfidence: 0.6 });
    if (!read.freq) return 0;
    return Math.round((freqToMidi(read.freq) - midi) * 100);
  }


}
