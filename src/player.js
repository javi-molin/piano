// player.js — la máquina de estados del tutor.
//
// El reloj maestro es el del audio (AudioContext.currentTime): rAF y
// setInterval derivan, el audio no. Todo se mide en beats, no en milisegundos:
// así, al bajar la velocidad, la ventana de tolerancia se ensancha sola y
// ralentizar ayuda de verdad.

import { beatsPerBar, groupByTime } from './score.js';

export const MODES = {
  learn: { id: 'learn', name: 'Aprender', wait: true, judge: true, autoOther: true },
  play: { id: 'play', name: 'Tocar', wait: false, judge: true, autoOther: true },
  mastery: { id: 'mastery', name: 'Dominar', wait: false, judge: true, autoOther: true },
  listen: { id: 'listen', name: 'Escuchar', wait: false, judge: false, autoOther: false },
};

export const WINDOWS = { easy: 0.6, medium: 0.4, hard: 0.22 };

const SCHEDULE_AHEAD_S = 0.12;

export class Player {
  constructor(engine, song, options = {}) {
    this.engine = engine;
    this.song = song;
    this.set(options);
    this.reset();
  }

  set(options = {}) {
    const o = { ...options };
    this.mode = MODES[o.mode] ? o.mode : (this.mode || 'learn');
    this.hands = ['both', 'R', 'L'].includes(o.hands) ? o.hands : (this.hands || 'both');
    this.speed = clamp(o.speed != null ? o.speed : (this.speed != null ? this.speed : 1), 0.25, 2);
    this.difficulty = WINDOWS[o.difficulty] ? o.difficulty : (this.difficulty || 'medium');
    this.metronome = o.metronome != null ? !!o.metronome : !!this.metronome;
    this.countInBars = o.countInBars != null ? o.countInBars : (this.countInBars != null ? this.countInBars : 1);
    this.latencyMs = o.latencyMs != null ? o.latencyMs : (this.latencyMs || 0);
    this.range = o.range || this.range || { start: 0, end: this.song.lengthBeats };
    this.loopEnabled = o.loopEnabled != null ? !!o.loopEnabled : !!this.loopEnabled;
    this.onState = o.onState || this.onState || (() => {});
    this.onFinish = o.onFinish || this.onFinish || (() => {});
    this.onNote = o.onNote || this.onNote || (() => {});
  }

  get config() { return MODES[this.mode]; }
  get bpb() { return beatsPerBar(this.song.meter); }
  get bps() { return (this.song.bpm * this.speed) / 60; }
  get window() { return WINDOWS[this.difficulty]; }
  get judged() {
    return this.song.notes.filter((n) => this.isMine(n) && n.t >= this.range.start - 1e-6 && n.t < this.range.end - 1e-6);
  }

  isMine(note) {
    if (!this.config.judge) return false;
    return this.hands === 'both' || this.hands === note.hand;
  }

  reset() {
    this.state = 'idle';
    this.states = new Array(this.song.notes.length).fill(null);
    this.pressed = new Set();
    this.anchorBeat = this.range.start;
    this.anchorTime = 0;
    this.beat = this.range.start;
    this.scheduledUntil = -Infinity;
    this.clickedUntil = -Infinity;
    this.stepIndex = 0;
    this.waiting = false;
    this.passes = 0;
    this.stats = { hits: 0, misses: 0, wrong: 0, combo: 0, maxCombo: 0, startedAt: 0, ms: 0 };
    this.buildSteps();
  }

  /** Los pasos del modo espera: grupos de notas que suenan a la vez. */
  buildSteps() {
    this.steps = groupByTime(this.judged).map((g) => ({
      t: g.t,
      notes: g.notes,
      need: new Set(g.notes.map((n) => n.midi)),
      got: new Set(),
    }));
  }

  async start() {
    await this.engine.ensure();
    this.reset();
    const countIn = this.countInBars * this.bpb;
    this.anchorBeat = this.range.start - countIn;
    this.anchorTime = this.engine.now;
    this.beat = this.anchorBeat;
    this.state = countIn > 0 ? 'countin' : 'playing';
    this.stats.startedAt = Date.now();
    this.scheduledUntil = this.anchorBeat - 0.001;
    this.clickedUntil = Math.ceil(this.anchorBeat) - 1;
    this.onState(this.snapshot());
  }

  pause() {
    if (this.state !== 'playing' && this.state !== 'countin') return;
    this.beat = this.currentBeat();
    this.state = 'paused';
    this.engine.allOff();
    this.pressed.clear();
    this.stats.ms += Date.now() - this.stats.startedAt;
    this.onState(this.snapshot());
  }

  async resume() {
    if (this.state !== 'paused') return;
    await this.engine.ensure();
    this.anchorBeat = this.beat;
    this.anchorTime = this.engine.now;
    this.scheduledUntil = this.beat - 0.001;
    this.clickedUntil = Math.ceil(this.beat) - 1;
    this.state = 'playing';
    this.stats.startedAt = Date.now();
    this.onState(this.snapshot());
  }

  stop() {
    this.state = 'idle';
    this.engine.allOff();
    this.pressed.clear();
    this.waiting = false;
    this.onState(this.snapshot());
  }

  /** Salta a un beat: se usa al elegir una sección o al rebobinar. */
  seek(beat) {
    const target = clamp(beat, this.range.start, this.range.end);
    this.beat = target;
    this.anchorBeat = target;
    this.anchorTime = this.engine.now;
    this.scheduledUntil = target - 0.001;
    this.clickedUntil = Math.ceil(target) - 1;
    this.waiting = false;
    for (const n of this.song.notes) {
      if (n.t >= target) this.states[n.i] = null;
    }
    for (const step of this.steps) {
      if (step.t >= target) step.got.clear();
    }
    this.stepIndex = this.steps.findIndex((s) => s.t >= target - 1e-6);
    if (this.stepIndex < 0) this.stepIndex = this.steps.length;
  }

  setSpeed(speed) {
    const beat = this.currentBeat();
    this.speed = clamp(speed, 0.25, 2);
    this.anchorBeat = beat;
    this.anchorTime = this.engine.now;
  }

  currentBeat() {
    if (this.state === 'paused' || this.state === 'idle' || this.state === 'done') return this.beat;
    if (this.waiting) return this.anchorBeat;
    const elapsed = this.engine.now - this.anchorTime - this.latencyMs / 1000;
    return this.anchorBeat + Math.max(0, elapsed) * this.bps;
  }

  /** Un paso del bucle de render. Devuelve la vista que hay que dibujar. */
  tick() {
    if (this.state === 'idle' || this.state === 'paused' || this.state === 'done') return this.snapshot();
    let beat = this.currentBeat();

    if (this.state === 'countin') {
      this.scheduleClicks(beat);
      if (beat >= this.range.start) this.state = 'playing';
      this.beat = beat;
      return this.snapshot();
    }

    // Modo espera: si llega un grupo que aún no has tocado, el tiempo se para.
    if (this.config.wait) {
      const step = this.steps[this.stepIndex];
      if (step && beat >= step.t - 1e-6 && step.got.size < step.need.size) {
        if (!this.waiting) {
          this.waiting = true;
          this.anchorBeat = step.t;
          this.anchorTime = this.engine.now;
          for (const n of step.notes) if (!this.states[n.i]) this.states[n.i] = 'expect';
        }
        beat = step.t;
      }
    }

    this.beat = beat;
    this.scheduleAutoNotes(beat);
    this.scheduleClicks(beat);
    if (!this.waiting) this.markMisses(beat);

    const end = this.loopEnabled ? this.range.end : this.range.end;
    if (beat >= end - 1e-6) {
      if (this.loopEnabled) this.loopBack();
      else this.finish();
    }
    return this.snapshot();
  }

  loopBack() {
    this.passes += 1;
    for (const n of this.song.notes) {
      if (n.t >= this.range.start && n.t < this.range.end) this.states[n.i] = null;
    }
    for (const step of this.steps) step.got.clear();
    this.stepIndex = 0;
    this.waiting = false;
    this.anchorBeat = this.range.start;
    this.anchorTime = this.engine.now;
    this.beat = this.range.start;
    this.scheduledUntil = this.range.start - 0.001;
    this.clickedUntil = Math.ceil(this.range.start) - 1;
    this.onState(this.snapshot());
  }

  finish() {
    this.state = 'done';
    this.engine.allOff();
    this.stats.ms += Date.now() - this.stats.startedAt;
    this.waiting = false;
    const result = this.result();
    this.onState(this.snapshot());
    this.onFinish(result);
  }

  /** Toca lo que no estás practicando (y todo, en modo escuchar). */
  scheduleAutoNotes(beat) {
    let horizon = beat + SCHEDULE_AHEAD_S * this.bps;
    if (this.waiting && this.steps[this.stepIndex]) {
      // Esperando, la otra mano no puede adelantarse al paso que falta.
      horizon = Math.min(horizon, this.steps[this.stepIndex].t + 1e-6);
    }
    for (const n of this.song.notes) {
      if (n.t <= this.scheduledUntil) continue;
      if (n.t > horizon) break;
      if (n.t < this.range.start - 1e-6 || n.t >= this.range.end - 1e-6) continue;
      if (n.t < beat - 0.25) continue; // se quedó atrás tras un salto: no la amontonamos
      const mine = this.isMine(n);
      const shouldPlay = this.config.judge ? (!mine && this.config.autoOther) : true;
      if (shouldPlay) {
        const when = this.engine.now + Math.max(0, (n.t - beat) / this.bps);
        this.engine.play(n.midi, n.vel * 0.85, when, (n.d / this.bps) * 0.95);
      }
    }
    this.scheduledUntil = Math.max(this.scheduledUntil, horizon);
  }

  scheduleClicks(beat) {
    if (!this.metronome && this.state !== 'countin') return;
    const horizon = beat + SCHEDULE_AHEAD_S * this.bps;
    let b = Math.ceil(this.clickedUntil + 1e-6);
    while (b <= horizon) {
      if (b >= this.anchorBeatFloor()) {
        const when = this.engine.now + Math.max(0, (b - beat) / this.bps);
        const accent = Math.abs(b % this.bpb) < 1e-6;
        this.engine.click(when, accent);
      }
      this.clickedUntil = b;
      b += 1;
    }
  }

  anchorBeatFloor() {
    return this.range.start - this.countInBars * this.bpb;
  }

  markMisses(beat) {
    for (const n of this.judged) {
      // 'expect' es solo "esta es la que viene": no cierra nada, así que una
      // nota que entró en la ventana y se pasó tiene que poder fallarse.
      if (this.states[n.i] === 'hit' || this.states[n.i] === 'miss') continue;
      if (n.t < beat - this.window) {
        this.states[n.i] = 'miss';
        this.stats.misses += 1;
        this.stats.combo = 0;
      } else if (n.t <= beat + this.window) {
        this.states[n.i] = 'expect';
      }
    }
  }

  // ------------------------------------------------------------- entrada

  /** Alguien tocó una nota: pantalla, MIDI o micrófono. */
  noteOn(midi, velocity = 0.8, source = 'touch') {
    if (source !== 'mic') {
      this.pressed.add(midi);
      this.engine.noteOn(midi, velocity);
    }
    this.onNote(midi, true, source);
    if (!this.config.judge || (this.state !== 'playing' && this.state !== 'countin')) return null;

    const beat = this.currentBeat();
    const target = this.findTarget(midi, beat);
    if (target) {
      this.states[target.i] = 'hit';
      this.stats.hits += 1;
      this.stats.combo += 1;
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.stats.combo);
      const step = this.steps[this.stepIndex];
      if (step && Math.abs(step.t - target.t) < 1e-6) {
        step.got.add(midi);
        if (step.got.size >= step.need.size) {
          this.stepIndex += 1;
          if (this.config.wait) {
            // El reloj se planta donde acabas de tocar: ni te adelanta ni te frena.
            this.waiting = false;
            this.anchorBeat = step.t;
            this.anchorTime = this.engine.now;
            this.beat = step.t;
          }
        }
      }
      return 'hit';
    }
    this.stats.wrong += 1;
    this.stats.combo = 0;
    return 'wrong';
  }

  noteOff(midi, source = 'touch') {
    this.pressed.delete(midi);
    if (source !== 'mic') this.engine.noteOff(midi);
    this.onNote(midi, false, source);
  }

  /**
   * La nota a la que corresponde lo que acabas de tocar.
   *
   * En modo espera manda el paso actual, estés donde estés en el tiempo: si te
   * adelantas, la canción salta contigo. El tempo lo pones tú; eso es lo que
   * hace que este modo sirva para aprender.
   */
  findTarget(midi, beat) {
    if (this.config.wait) {
      const step = this.steps[this.stepIndex];
      if (step) {
        const note = step.notes.find((n) => n.midi === midi && this.states[n.i] !== 'hit');
        if (note) return note;
      }
    }
    let best = null;
    let bestDistance = Infinity;
    const reach = this.waiting ? Math.max(this.window, 0.75) : this.window;
    for (const n of this.judged) {
      if (n.midi !== midi || this.states[n.i] === 'hit') continue;
      const distance = Math.abs(n.t - beat);
      if (distance > reach) continue;
      if (this.states[n.i] === 'miss' && !this.waiting) continue;
      if (distance < bestDistance) { best = n; bestDistance = distance; }
    }
    return best;
  }

  // ------------------------------------------------------------ resultado

  result() {
    const total = this.judged.length;
    const { hits, misses, wrong, maxCombo } = this.stats;
    const attempted = hits + misses;
    const accuracy = total ? hits / total : 0;
    const penalty = Math.min(0.25, wrong * 0.01);
    const score = Math.max(0, Math.round((accuracy - penalty) * 1000 + maxCombo * 5));
    const stars = accuracy >= 0.95 && wrong <= total * 0.05 ? 3 : accuracy >= 0.85 ? 2 : accuracy >= 0.7 ? 1 : 0;
    return {
      songId: this.song.id,
      mode: this.mode,
      hands: this.hands,
      speed: this.speed,
      difficulty: this.difficulty,
      range: { ...this.range },
      total, hits, misses, wrong, attempted, maxCombo,
      accuracy: Math.round(accuracy * 1000) / 1000,
      score,
      stars,
      mastered: this.mode === 'mastery' && this.speed >= 0.95 && accuracy >= 0.9,
      ms: this.stats.ms,
      states: this.states.slice(),
      playedAt: Date.now(),
    };
  }

  snapshot() {
    return {
      state: this.state,
      beat: this.beat,
      waiting: this.waiting,
      bar: Math.floor(this.beat / this.bpb) + 1,
      bars: this.song.lengthBars,
      states: this.states,
      pressed: this.pressed,
      stats: this.stats,
      hands: this.hands,
      speed: this.speed,
      mode: this.mode,
      passes: this.passes,
      progress: clamp((this.beat - this.range.start) / Math.max(0.001, this.range.end - this.range.start), 0, 1),
      accuracy: this.judged.length ? this.stats.hits / this.judged.length : 0,
    };
  }
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export { clamp };
