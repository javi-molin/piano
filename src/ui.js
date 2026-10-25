// ui.js — las pantallas y el pegamento entre ellas.

import { buildSong, nameFromMidi, transposeSong, songStats, beatsPerBar,
  fitToRange, pianoRange, PIANO_SIZES, describeTranspose } from './score.js';
import { CATALOG, applyWrittenFingers } from './songs.js';
import { engine, TIMBRE_NAMES } from './audio.js';
import { songFromMidi, songToMidiBytes, MidiInput, estimateDifficulty } from './midi.js';
import { MicInput } from './mic.js';
import { transcribeFile, transcribeBuffer, AudioCapture } from './transcribe.js';
import { buildLayout, wholeOctaves, drawKeyboard, attachPointerInput, computerKeyToMidi } from './keyboard.js';
import { drawRoll, keyboardMarks, barHeatmap } from './roll.js';
import { Player, MODES } from './player.js';
import { THEME } from './tokens.js';
import * as store from './store.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  settings: { ...store.DEFAULT_SETTINGS },
  catalog: [],
  userSongs: [],
  screen: 'library',
  lastTab: 'library',
  song: null,          // la canción abierta, ya transpuesta
  songBase: null,      // sin transponer
  options: { mode: 'learn', hands: 'both', speed: 1, transpose: 0 },
  range: null,
  loop: false,
  player: null,
  raf: 0,
  detachKeys: null,
  midiInput: null,
  micInput: null,
  lastResult: null,
  fit: null,
  link: null,
  free: { base: 48, sustain: false, recording: null, pressed: new Set(), detach: null, raf: 0 },
};

// ------------------------------------------------------------------ util

function toast(message, kind = '') {
  const host = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), kind === 'bad' ? 5200 : 3200);
}

function fmtTime(ms) {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function fmtMinutes(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function pct(value) {
  return `${Math.round(value * 100)} %`;
}

function noteName(midi) {
  return nameFromMidi(midi, state.settings.noteNames, false);
}

/** Grupos de botones tipo radio: un solo sitio donde se maneja aria-checked. */
function segmented(root, attribute, onPick) {
  const host = typeof root === 'string' ? $(root) : root;
  if (!host) return () => {};
  // dataset.onboardNames <-> data-onboard-names: el selector va en kebab.
  const selector = `[data-${attribute.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}]`;
  host.addEventListener('click', (ev) => {
    const button = ev.target.closest(selector);
    if (!button || !host.contains(button)) return;
    for (const b of $$(selector, host)) b.setAttribute('aria-checked', String(b === button));
    onPick(button.dataset[attribute], button);
  });
  return (value) => {
    for (const b of $$(selector, host)) {
      b.setAttribute('aria-checked', String(b.dataset[attribute] === String(value)));
    }
  };
}

function sizeCanvas(canvas) {
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

// --------------------------------------------------------------- canciones

function buildFromDefinition(def) {
  const song = buildSong(def);
  return applyWrittenFingers(song, def);
}

async function loadSongs() {
  state.catalog = CATALOG.map(buildFromDefinition);
  try {
    const records = await store.listSongs();
    state.userSongs = records.map((record) => buildSong({ ...record, source: record.source || 'midi' }));
  } catch (e) {
    state.userSongs = [];
    toast('No se pudo abrir tu biblioteca guardada en este navegador.', 'bad');
  }
}

function allSongs() {
  return [...state.userSongs, ...state.catalog];
}

function findSong(id) {
  return allSongs().find((s) => s.id === id) || null;
}

// --------------------------------------------------------------- pantallas

function setScreen(name) {
  state.screen = name;
  for (const section of $$('.screen')) {
    if (section.dataset.screen === 'onboarding') continue;
    section.hidden = section.dataset.screen !== name;
  }
  for (const tab of $$('.tab')) {
    const current = tab.dataset.tab === name;
    if (current) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  if (['library', 'catalog', 'free', 'progress'].includes(name)) state.lastTab = name;
  window.scrollTo({ top: 0 });
  if (name === 'library') renderLibrary();
  if (name === 'catalog') renderCatalog();
  if (name === 'progress') renderProgress();
  if (name === 'free') startFree();
  else stopFree();
}

// ------------------------------------------------------------- biblioteca

let libraryFilter = 'all';
let catalogLevel = 0;

function songCard(song, progress) {
  const stats = songStats(song);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'card';
  button.dataset.songId = song.id;

  const title = document.createElement('div');
  title.className = 'card-title';
  title.textContent = song.title;
  if (progress.pinned) {
    const pin = document.createElement('span');
    pin.className = 'pin';
    pin.textContent = 'fijada';
    title.appendChild(pin);
  }

  const meta = document.createElement('div');
  meta.className = 'card-meta';
  meta.textContent = [song.composer, `${stats.bars} compases`, `${Math.round(stats.seconds)} s`]
    .filter(Boolean).join(' · ');

  const badges = document.createElement('div');
  badges.className = 'card-badges';
  badges.append(badge(song.difficultyLabel || `Nivel ${song.difficulty}`, `level${song.difficulty}`));
  if (song.source !== 'builtin') badges.append(badge(song.source === 'audio' ? 'transcrita' : song.source === 'recorded' ? 'grabada' : 'MIDI'));
  if (progress.mastered) badges.append(badge('dominada', 'mastered'));
  else if (progress.bestStars) badges.append(badge('★'.repeat(progress.bestStars)));

  button.append(title, meta, badges);

  if (progress.timesPlayed) {
    const bar = document.createElement('div');
    bar.className = 'bar';
    const fill = document.createElement('i');
    fill.style.width = pct(Math.min(1, progress.bestAccuracy));
    bar.appendChild(fill);
    const label = document.createElement('div');
    label.className = 'card-meta';
    label.textContent = `Mejor: ${pct(progress.bestAccuracy)} · ${progress.timesPlayed} ${progress.timesPlayed === 1 ? 'vez' : 'veces'}`;
    button.append(bar, label);
  }
  return button;
}

function badge(text, extra = '') {
  const el = document.createElement('span');
  el.className = `badge ${extra}`.trim();
  el.textContent = text;
  return el;
}

function renderLibrary() {
  const grid = $('#library-grid');
  const query = ($('#library-search').value || '').trim().toLowerCase();
  const progress = store.allProgress();

  let songs = allSongs().filter((song) => {
    const p = progress[song.id];
    if (libraryFilter === 'progress' && !(p && p.timesPlayed)) return false;
    if (libraryFilter === 'mastered' && !(p && p.mastered)) return false;
    if (libraryFilter === 'mine' && song.source === 'builtin') return false;
    if (libraryFilter === 'all' && song.source === 'builtin' && !(p && p.timesPlayed) && !(p && p.pinned)) return false;
    if (query && !`${song.title} ${song.composer}`.toLowerCase().includes(query)) return false;
    return true;
  });

  songs.sort((a, b) => {
    const pa = progress[a.id] || {};
    const pb = progress[b.id] || {};
    if (!!pb.pinned - !!pa.pinned) return !!pb.pinned - !!pa.pinned;
    return (pb.lastPlayedAt || b.createdAt || 0) - (pa.lastPlayedAt || a.createdAt || 0);
  });

  grid.replaceChildren(...songs.map((song) => songCard(song, store.getProgress(song.id))));
  $('#library-empty').hidden = songs.length > 0;
  if (songs.length === 0 && (query || libraryFilter !== 'all')) {
    $('#library-empty').textContent = 'Nada con ese filtro.';
  } else if (songs.length === 0) {
    $('#library-empty').innerHTML = 'Aún no has tocado nada. Abre el <b>Catálogo</b> y elige una pieza, o importa un MIDI tuyo con <b>+ Añadir canción</b>.';
  }
  renderDailyGoal();
}

function renderDailyGoal() {
  const goal = Math.max(1, state.settings.dailyGoalMinutes) * 60000;
  const done = store.practiceToday();
  const ratio = Math.min(1, done / goal);
  const host = $('#daily-goal');
  host.replaceChildren();
  const label = document.createElement('span');
  label.textContent = done >= goal
    ? `Objetivo de hoy cumplido: ${fmtMinutes(done)}`
    : `Hoy: ${fmtMinutes(done)} de ${state.settings.dailyGoalMinutes} min`;
  const bar = document.createElement('div');
  bar.className = 'bar';
  const fill = document.createElement('i');
  fill.style.width = pct(ratio);
  bar.appendChild(fill);
  host.append(label, bar);
}

function renderCatalog() {
  const grid = $('#catalog-grid');
  const songs = state.catalog.filter((s) => !catalogLevel || s.difficulty === catalogLevel);
  songs.sort((a, b) => a.difficulty - b.difficulty || a.title.localeCompare(b.title, 'es'));
  grid.replaceChildren(...songs.map((song) => songCard(song, store.getProgress(song.id))));
  $('#catalog-empty').hidden = songs.length > 0;
}

function renderProgress() {
  const progress = store.allProgress();
  const streak = store.getStreak();
  const attempts = store.listAttempts().slice(-25).reverse();
  const totalMs = Object.values(progress).reduce((sum, p) => sum + (p.practiceMs || 0), 0);
  const mastered = Object.values(progress).filter((p) => p.mastered).length;
  const started = Object.values(progress).filter((p) => p.timesPlayed).length;

  $('#progress-stats').replaceChildren(
    stat(String(streak.current || 0), 'días de racha'),
    stat(String(streak.longest || 0), 'mejor racha'),
    stat(fmtMinutes(totalMs), 'practicado'),
    stat(String(started), 'canciones empezadas'),
    stat(String(mastered), 'dominadas'),
    stat(String(attempts.length ? Math.round(Math.max(...Object.values(progress).map((p) => p.bestAccuracy || 0)) * 100) : 0) + ' %', 'mejor precisión'),
  );

  const calendar = $('#streak-calendar');
  calendar.replaceChildren();
  const goal = Math.max(1, state.settings.dailyGoalMinutes) * 60000;
  for (let i = 34; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = store.todayKey(date);
    const ms = (streak.days && streak.days[key]) || 0;
    const cell = document.createElement('div');
    cell.className = 'day';
    cell.dataset.level = ms <= 0 ? '0' : ms >= goal ? '3' : ms >= goal / 2 ? '2' : '1';
    cell.title = `${key}: ${ms ? fmtMinutes(ms) : 'sin practicar'}`;
    calendar.appendChild(cell);
  }

  const list = $('#attempt-list');
  list.replaceChildren();
  if (!attempts.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'Todavía no hay sesiones. Toca una canción y vuelve aquí.';
    list.appendChild(empty);
  }
  for (const attempt of attempts) {
    const song = findSong(attempt.songId);
    const row = document.createElement('div');
    row.className = 'attempt';
    const title = document.createElement('b');
    title.textContent = song ? song.title : 'Canción borrada';
    const detail = document.createElement('span');
    detail.textContent = `${MODES[attempt.mode] ? MODES[attempt.mode].name : attempt.mode} · ${pct(attempt.accuracy)} · ${Math.round(attempt.speed * 100)} % · ${new Date(attempt.playedAt).toLocaleDateString('es')}`;
    row.append(title, detail);
    list.appendChild(row);
  }
}

function stat(value, label) {
  const el = document.createElement('div');
  el.className = 'stat';
  const b = document.createElement('b');
  b.textContent = value;
  const small = document.createElement('small');
  small.textContent = label;
  el.append(b, small);
  return el;
}

// ---------------------------------------------------------- detalle S05

let setMode = () => {};
let setHands = () => {};
let setDifficulty = () => {};

function openSong(id) {
  const song = findSong(id);
  if (!song) { toast('Esa canción ya no está.', 'bad'); return; }
  state.songBase = song;
  state.options.transpose = store.getProgress(id).transpose || 0;
  applyArrangement();
  state.range = null;
  state.loop = false;
  renderSongDetail();
  setScreen('song');
}

/** El rango del teclado que el usuario dijo tener, o null si no puso límite. */
function userPianoRange() {
  return pianoRange(state.settings.pianoKeys, state.settings.pianoLowShift);
}

/**
 * Lo que se toca sale de dos pasos encadenados: primero el tono que pediste,
 * y después lo que de verdad cabe en tu teclado. En ese orden, porque subir
 * una octava puede sacar notas del piano y hay que recortarlas después.
 */
function applyArrangement() {
  const transposed = state.options.transpose
    ? transposeSong(state.songBase, state.options.transpose)
    : state.songBase;
  const range = userPianoRange();
  const fit = fitToRange(transposed, range
    ? { lo: range.lo, hi: range.hi, mode: state.settings.outOfRange }
    : {});
  state.song = fit.song;
  state.fit = { ...fit, range };
  return fit;
}

// El nombre viejo, por compatibilidad con quien ya lo llamaba.
const applyTranspose = applyArrangement;

function renderSongDetail() {
  const song = state.song;
  const stats = songStats(song);
  const progress = store.getProgress(song.id);
  $('#song-title').textContent = song.title;
  $('#song-meta').textContent = [
    song.composer,
    `${song.bpm} bpm`,
    `compás ${song.meter.join('/')}`,
    `${stats.bars} compases`,
    `${stats.notes} notas (${stats.right} der · ${stats.left} izq)`,
    song.difficultyLabel,
  ].filter(Boolean).join(' · ');
  $('#song-pin').textContent = progress.pinned ? 'No fijar' : 'Fijar';
  $('#song-delete').hidden = song.source === 'builtin';
  $('#difficulty-field').hidden = state.options.mode === 'learn' || state.options.mode === 'listen';

  setMode(state.options.mode);
  setHands(state.options.hands);
  setDifficulty(state.settings.difficulty);
  $('#detail-speed').value = String(Math.round(state.options.speed * 100));
  $('#detail-speed-out').textContent = `${Math.round(state.options.speed * 100)} %`;
  $('#detail-transpose').value = String(state.options.transpose);
  $('#detail-transpose-out').textContent = describeTranspose(state.options.transpose, state.settings.noteNames);
  renderFitNotice();
  $('#song-start').textContent = state.options.mode === 'listen'
    ? 'Escuchar la canción completa'
    : 'Tocar la canción completa';

  renderSections();
  renderSongStats();
}

function transposeLabel(semitones) {
  return describeTranspose(semitones, state.settings.noteNames);
}

function fullName(midi) {
  return nameFromMidi(midi, state.settings.noteNames, true);
}

/** Dice, en una línea, qué pasó con lo que no cabe en tu teclado. */
function renderFitNotice() {
  const notice = $('#fit-notice');
  if (!notice) return;
  const fit = state.fit;
  const range = fit && fit.range;
  if (!range || !fit.outside) { notice.hidden = true; return; }
  const where = `tu piano de ${range.keys} teclas (${fullName(range.lo)}–${fullName(range.hi)})`;
  const tail = ' Se cambia en Ajustes → Tu piano.';
  if (fit.mode === 'fold') {
    const dropped = fit.dropped ? ` y ${fit.dropped} se quitan` : '';
    notice.textContent = `${fit.outside} ${fit.outside === 1 ? 'nota no entra' : 'notas no entran'} en ${where}: ${fit.moved} ${fit.moved === 1 ? 'se trae' : 'se traen'} a la octava más cercana${dropped}.${tail}`;
  } else if (fit.mode === 'skip') {
    notice.textContent = `${fit.outside} ${fit.outside === 1 ? 'nota queda fuera' : 'notas quedan fuera'} de ${where} y ${fit.outside === 1 ? 'se omite' : 'se omiten'}.${tail}`;
  } else {
    notice.textContent = `${fit.outside} ${fit.outside === 1 ? 'nota queda fuera' : 'notas quedan fuera'} de ${where}. Se siguen mostrando, pero no vas a poder tocarlas.${tail}`;
  }
  notice.hidden = false;
}

/** Cambia el tono y vuelve a montar la canción. Se recuerda por canción. */
function setTranspose(semitones) {
  const value = Math.max(-24, Math.min(24, Math.round(semitones)));
  state.options.transpose = value;
  applyArrangement();
  store.updateProgress(state.songBase.id, { transpose: value });
  renderSongDetail();
}

function renderSections() {
  const host = $('#section-list');
  host.replaceChildren();
  const song = state.song;
  song.sections.forEach((section) => {
    const row = document.createElement('div');
    row.className = 'section-row';
    const name = document.createElement('span');
    name.className = 'section-name';
    name.textContent = section.label;
    const info = document.createElement('span');
    info.className = 'section-info';
    const notes = song.notes.filter((n) => n.t >= section.startBeat && n.t < section.endBeat);
    info.textContent = `${notes.length} notas`;
    const practice = document.createElement('button');
    practice.className = 'btn btn-ghost';
    practice.type = 'button';
    practice.textContent = 'Practicar';
    practice.addEventListener('click', () => startPlay({ start: section.startBeat, end: section.endBeat }, false));
    const loop = document.createElement('button');
    loop.className = 'btn btn-ghost';
    loop.type = 'button';
    loop.textContent = 'En bucle';
    loop.addEventListener('click', () => startPlay({ start: section.startBeat, end: section.endBeat }, true));
    row.append(name, info, practice, loop);
    host.appendChild(row);
  });
  if (!song.sections.length) {
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = 'Esta pieza es demasiado corta para partirla.';
    host.appendChild(hint);
  }
}

function renderSongStats() {
  const progress = store.getProgress(state.song.id);
  const attempts = store.listAttempts(state.song.id);
  $('#song-stats').replaceChildren(
    stat(progress.timesPlayed ? pct(progress.bestAccuracy) : '—', 'mejor precisión'),
    stat(progress.bestStars ? '★'.repeat(progress.bestStars) : '—', 'estrellas'),
    stat(String(progress.timesPlayed), 'veces tocada'),
    stat(fmtMinutes(progress.practiceMs), 'practicado'),
    stat(progress.mastered ? 'Sí' : 'Todavía no', 'dominada'),
    stat(String(attempts.length), 'sesiones'),
  );
}

export { $, $$, state, toast, segmented, sizeCanvas, setScreen, renderLibrary, renderCatalog, renderProgress,
  renderSongDetail, openSong, loadSongs, allSongs, findSong, applyTranspose, applyArrangement,
  userPianoRange, fmtTime, fmtMinutes, pct,
  noteName, stat, buildFromDefinition, libraryFilterRef, catalogLevelRef };

function libraryFilterRef(value) { if (value !== undefined) libraryFilter = value; return libraryFilter; }
function catalogLevelRef(value) { if (value !== undefined) catalogLevel = Number(value); return catalogLevel; }
function setPickers(mode, hands, difficulty) { setMode = mode; setHands = hands; setDifficulty = difficulty; }
export { setPickers };

// ==================================================== reproductor S06/S07

const playerCanvas = () => $('#player-canvas');
let playerGeo = null;
let keyRange = { lo: 60, hi: 83 };

function computeKeyRange(song) {
  const r = song.range || { lo: 60, hi: 72 };
  return wholeOctaves(r.lo, r.hi, 13);
}

async function startPlay(range, loop) {
  const song = state.song;
  if (!song) return;
  state.range = range ? { ...range } : { start: 0, end: song.lengthBeats };
  state.loop = !!loop;
  keyRange = computeKeyRange(song);

  const player = new Player(engine, song, {
    mode: state.options.mode,
    hands: state.options.hands,
    speed: state.options.speed,
    difficulty: state.settings.difficulty,
    metronome: state.settings.metronome,
    countInBars: state.settings.countInBars,
    latencyMs: state.settings.latencyMs,
    range: state.range,
    loopEnabled: state.loop,
    onFinish: onPlayerFinish,
  });
  state.player = player;

  $('#player-song').textContent = song.title;
  const bpb = beatsPerBar(song.meter);
  const full = state.range.start <= 0 && state.range.end >= song.lengthBeats - 1e-6;
  $('#player-range').textContent = full
    ? 'Completa'
    : `Compases ${Math.floor(state.range.start / bpb) + 1}–${Math.ceil(state.range.end / bpb)}`;
  $('#player-sub').textContent = [
    MODES[state.options.mode].name,
    state.options.hands === 'both' ? 'las dos manos' : state.options.hands === 'R' ? 'mano derecha' : 'mano izquierda',
    state.options.transpose ? transposeLabel(state.options.transpose) : '',
  ].filter(Boolean).join(' · ');
  $('#player-speed').value = String(Math.round(state.options.speed * 100));
  $('#player-speed-out').textContent = `${Math.round(state.options.speed * 100)} %`;
  setPlayerHands(state.options.hands);
  $('#player-loop').setAttribute('aria-pressed', String(state.loop));
  $('#player-metronome').setAttribute('aria-pressed', String(!!state.settings.metronome));
  $('#player').hidden = false;
  $('#results').hidden = true;
  $('#player-paused').hidden = true;
  document.body.style.overflow = 'hidden';

  try {
    await engine.ensure();
  } catch (e) {
    toast('Este navegador no deja crear audio.', 'bad');
  }
  engine.setTimbre(state.settings.timbre);
  engine.setVolume(state.settings.volume);

  if (!state.detachKeys) {
    state.detachKeys = attachPointerInput(playerCanvas(), () => playerGeo, {
      onDown: (midi) => handleNoteOn(midi, 0.85, 'touch'),
      onUp: (midi) => handleNoteOff(midi, 'touch'),
    });
  }
  await player.start();
  if (!engine.ready) toast('Toca una tecla para activar el sonido.', '');
  runLoop();
}

function runLoop() {
  cancelAnimationFrame(state.raf);
  const step = () => {
    if ($('#player').hidden || !state.player) return;
    drawPlayerFrame();
    state.raf = requestAnimationFrame(step);
  };
  state.raf = requestAnimationFrame(step);
}

function drawPlayerFrame() {
  const player = state.player;
  const song = player.song;
  const canvas = playerCanvas();
  const { ctx, w, h } = sizeCanvas(canvas);
  const keyboardHeight = Math.max(84, Math.min(210, h * 0.34));
  const hitLine = Math.max(60, h - keyboardHeight);
  const layout = buildLayout(keyRange.lo, keyRange.hi, w);
  playerGeo = { layout, top: hitLine, height: keyboardHeight };

  const snapshot = player.tick();
  const lookAheadSeconds = 2.6;
  const pxPerBeat = Math.max(22, Math.min(440, hitLine / Math.max(0.2, player.bps * lookAheadSeconds)));

  ctx.clearRect(0, 0, w, h);
  drawRoll(ctx, {
    layout, song,
    beat: snapshot.beat,
    pxPerBeat, rollTop: 0, hitLine,
    hands: player.config.judge ? player.hands : 'none',
    states: snapshot.states,
    loop: state.loop ? { active: true, start: state.range.start, end: state.range.end } : null,
    theme: THEME,
    waiting: snapshot.waiting,
    showFingers: state.settings.showFingers,
    showNames: state.settings.showNames,
    nameFor: noteName,
  });

  const marks = keyboardMarks({
    song,
    beat: snapshot.beat,
    states: snapshot.states,
    hands: player.config.judge ? player.hands : 'none',
    pressed: snapshot.pressed,
    window: Math.max(player.window, 0.2),
  });
  drawKeyboard(ctx, layout, hitLine, keyboardHeight, marks, {
    theme: THEME,
    labels: state.settings.labels,
    lang: state.settings.noteNames,
  });

  updateHud(snapshot);
}

function updateHud(snapshot) {
  $('#hud-bar').textContent = `${Math.max(1, snapshot.bar)}/${snapshot.bars}`;
  $('#hud-accuracy').textContent = state.player.config.judge && state.player.judged.length
    ? pct(snapshot.accuracy) : '—';
  $('#hud-combo').textContent = String(snapshot.stats.maxCombo);
  $('#player-wait').hidden = !snapshot.waiting;
  const counting = snapshot.state === 'countin';
  $('#player-countin').hidden = !counting;
  if (counting) {
    const left = Math.max(1, Math.ceil(state.range.start - snapshot.beat));
    $('#countin-number').textContent = String(left);
  }
  $('#player-pause').textContent = snapshot.state === 'paused' ? 'Seguir' : 'Pausa';
}

function closePlayer() {
  cancelAnimationFrame(state.raf);
  state.raf = 0;
  if (state.player) state.player.stop();
  if (state.detachKeys) { state.detachKeys(); state.detachKeys = null; }
  state.player = null;
  playerGeo = null;
  $('#player').hidden = true;
  $('#player-paused').hidden = true;
  document.body.style.overflow = '';
  renderSongDetail();
  renderLibrary();
}

function onPlayerFinish(result) {
  cancelAnimationFrame(state.raf);
  state.raf = 0;
  state.lastResult = result;
  if (result.total > 0) {
    const { streak } = store.recordAttempt(result);
    $('#streak-days').textContent = String(streak.current || 0);
  } else if (result.ms > 0) {
    store.touchStreak(result.ms);
  }
  engine.blip(result.stars >= 2 ? 'end' : 'good');
  showResults(result);
}

function showResults(result) {
  const song = state.song;
  const stars = $('#result-stars');
  stars.replaceChildren();
  for (let i = 0; i < 3; i++) {
    const star = document.createElement('span');
    star.className = i < result.stars ? '' : 'off';
    star.textContent = '★';
    stars.appendChild(star);
  }

  if (!result.total) {
    $('#result-headline').textContent = 'Escuchada';
  } else if (result.mastered) {
    $('#result-headline').textContent = '¡Dominada!';
  } else if (result.stars === 3) {
    $('#result-headline').textContent = 'Casi perfecto';
  } else if (result.stars) {
    $('#result-headline').textContent = 'Bien, sigue';
  } else {
    $('#result-headline').textContent = 'A por otra';
  }

  $('#result-stats').replaceChildren(
    stat(result.total ? pct(result.accuracy) : '—', 'precisión'),
    stat(String(result.hits), 'acertadas'),
    stat(String(result.misses), 'perdidas'),
    stat(String(result.wrong), 'equivocadas'),
    stat(String(result.maxCombo), 'seguidas'),
    stat(`${Math.round(result.speed * 100)} %`, 'velocidad'),
  );

  const heat = $('#result-heatmap');
  heat.replaceChildren();
  const bars = barHeatmap(song, result.states);
  const worst = [];
  for (const bar of bars) {
    const cell = document.createElement('div');
    cell.className = 'heat';
    cell.textContent = String(bar.bar);
    const ratio = bar.total ? bar.hit / bar.total : 0;
    cell.dataset.ok = ratio >= 0.8 ? '1' : '0';
    cell.title = `Compás ${bar.bar}: ${bar.hit} de ${bar.total}`;
    heat.appendChild(cell);
    if (ratio < 0.8) worst.push(bar.bar);
  }

  const advice = $('#result-advice');
  if (!result.total) advice.textContent = 'Ahora pruébala en modo aprender: te esperará en cada nota.';
  else if (result.accuracy < 0.35) advice.textContent = 'Esta va muy por delante de ti todavía. Prueba en modo aprender, con una mano y al 50 %: ahí la canción te espera.';
  else if (worst.length) advice.textContent = `Donde más se te escapa: compases ${worst.slice(0, 6).join(', ')}${worst.length > 6 ? '…' : ''}.`;
  else if (result.speed < 1) advice.textContent = 'Limpio. Sube la velocidad un 10 % y repite.';
  else advice.textContent = 'Limpio y a tempo. Prueba con las dos manos o con otra pieza.';

  $('#result-practice').hidden = !worst.length;
  $('#result-practice').dataset.bars = worst.join(',');
  $('#results').hidden = false;
}

function practiceWorstBars() {
  const bars = ($('#result-practice').dataset.bars || '').split(',').filter(Boolean).map(Number);
  if (!bars.length) return;
  const bpb = beatsPerBar(state.song.meter);
  const start = (Math.min(...bars) - 1) * bpb;
  const end = Math.min(state.song.lengthBeats, Math.max(...bars) * bpb);
  $('#results').hidden = true;
  startPlay({ start, end }, true);
}

// ---------------------------------------------------------------- entrada

function handleNoteOn(midi, velocity, source) {
  if (state.player && !$('#player').hidden) {
    const verdict = state.player.noteOn(midi, velocity, source);
    if (verdict === 'wrong' && state.settings.difficulty === 'hard') engine.blip('bad');
    return;
  }
  freeNoteOn(midi, velocity, source);
}

function handleNoteOff(midi, source) {
  if (state.player && !$('#player').hidden) {
    state.player.noteOff(midi, source);
    return;
  }
  freeNoteOff(midi, source);
}

async function setInputMode(mode) {
  state.settings = store.saveSettings({ inputMode: mode });
  const status = $('#input-status');
  const level = $('#mic-level');
  const test = $('#input-test');
  level.hidden = true;
  test.hidden = true;

  if (state.micInput) { state.micInput.stop(); state.micInput = null; }
  if (state.midiInput) { state.midiInput.disconnect(); state.midiInput = null; }

  if (mode === 'touch') {
    if (status) status.textContent = 'Toca las teclas en la pantalla. Funciona con varios dedos a la vez.';
    return;
  }

  if (mode === 'midi') {
    if (!MidiInput.supported) {
      if (status) status.textContent = 'Este navegador no tiene Web MIDI (Safari en iPad no lo trae). Usa el micrófono o la pantalla.';
      toast('Sin Web MIDI aquí. En iPad, usa el micrófono.', 'bad');
      return;
    }
    try {
      const input = new MidiInput();
      input.onNoteOn = (midi, velocity) => handleNoteOn(midi, velocity, 'midi');
      input.onNoteOff = (midi) => handleNoteOff(midi, 'midi');
      const devices = await input.connect();
      state.midiInput = input;
      if (status) status.textContent = devices.length ? `Conectado: ${devices.join(', ')}` : 'Web MIDI listo, pero no veo ningún teclado conectado.';
    } catch (e) {
      if (status) status.textContent = `No se pudo abrir el MIDI: ${e.message}`;
    }
    return;
  }

  if (mode === 'mic') {
    if (!MicInput.supported) {
      if (status) status.textContent = 'Este navegador no da acceso al micrófono.';
      return;
    }
    try {
      const input = new MicInput(engine);
      input.onNoteOn = (midi, velocity) => handleNoteOn(midi, velocity, 'mic');
      input.onNoteOff = (midi) => handleNoteOff(midi, 'mic');
      input.onLevel = (value) => { $('#mic-level-fill').style.width = pct(value); };
      await input.start();
      state.micInput = input;
      level.hidden = false;
      if (status) status.textContent = 'Escuchando. Toca una nota en tu piano: debería iluminarse en la pantalla. Con auriculares va mejor, el altavoz se oye a sí mismo.';
    } catch (e) {
      if (status) status.textContent = `No se pudo abrir el micrófono: ${e.message}`;
      toast('Sin permiso de micrófono.', 'bad');
      state.settings = store.saveSettings({ inputMode: 'touch' });
      setInputSegment('touch');
    }
  }
}

let setInputSegment = () => {};

// ---------------------------------------------------------- juego libre S09

function freeNoteOn(midi, velocity = 0.85) {
  engine.ensure().then(() => {
    engine.setTimbre(state.settings.timbre);
    engine.noteOn(midi, velocity);
  });
  state.free.pressed.add(midi);
  const rec = state.free.recording;
  if (rec) rec.events.push({ midi, on: true, at: performance.now() - rec.startedAt, velocity });
}

function freeNoteOff(midi) {
  state.free.pressed.delete(midi);
  if (!state.free.sustain) engine.noteOff(midi);
  const rec = state.free.recording;
  if (rec) rec.events.push({ midi, on: false, at: performance.now() - rec.startedAt });
}

function freeRange() {
  return wholeOctaves(state.free.base, state.free.base + 28, 25);
}

function startFree() {
  const canvas = $('#free-canvas');
  let geo = null;
  if (!state.free.detach) {
    state.free.detach = attachPointerInput(canvas, () => geo, {
      onDown: (midi) => handleNoteOn(midi, 0.85, 'touch'),
      onUp: (midi) => handleNoteOff(midi, 'touch'),
    });
  }
  const draw = () => {
    if ($('[data-screen="free"]').hidden) return;
    const { ctx, w, h } = sizeCanvas(canvas);
    const range = freeRange();
    const layout = buildLayout(range.lo, range.hi, w);
    geo = { layout, top: 0, height: h };
    ctx.clearRect(0, 0, w, h);
    const marks = new Map();
    for (const midi of state.free.pressed) marks.set(midi, { state: 'press', hand: 'R', finger: 0 });
    drawKeyboard(ctx, layout, 0, h, marks, {
      theme: THEME, labels: state.settings.labels === 'none' ? 'white' : state.settings.labels,
      lang: state.settings.noteNames,
    });
    const rec = state.free.recording;
    if (rec) $('#free-record-label').textContent = fmtTime(performance.now() - rec.startedAt);
    state.free.raf = requestAnimationFrame(draw);
  };
  cancelAnimationFrame(state.free.raf);
  state.free.raf = requestAnimationFrame(draw);
  updateFreeLabels();
}

function stopFree() {
  cancelAnimationFrame(state.free.raf);
  state.free.raf = 0;
}

function updateFreeLabels() {
  const range = freeRange();
  $('#free-octave-label').textContent = `${nameFromMidi(range.lo, state.settings.noteNames, true)} – ${nameFromMidi(range.hi, state.settings.noteNames, true)}`;
}

function toggleRecording() {
  const button = $('#free-record');
  const label = $('#free-record-label');
  if (state.free.recording) {
    const rec = state.free.recording;
    state.free.recording = null;
    button.setAttribute('aria-pressed', 'false');
    button.textContent = '● Grabar';
    label.hidden = true;
    saveRecording(rec);
    return;
  }
  state.free.recording = { startedAt: performance.now(), events: [] };
  button.setAttribute('aria-pressed', 'true');
  button.textContent = '■ Parar';
  label.hidden = false;
  label.textContent = '0:00';
  toast('Grabando. Toca lo que quieras.', '');
}

async function saveRecording(rec) {
  const bpm = 90;
  const beatsPerMs = bpm / 60000;
  const open = new Map();
  const notes = [];
  for (const ev of rec.events) {
    if (ev.on) {
      if (!open.has(ev.midi)) open.set(ev.midi, []);
      open.get(ev.midi).push(ev);
    } else {
      const stack = open.get(ev.midi);
      if (stack && stack.length) {
        const start = stack.shift();
        notes.push({
          t: Math.max(0, start.at * beatsPerMs),
          d: Math.max(0.125, (ev.at - start.at) * beatsPerMs),
          midi: ev.midi,
          vel: start.velocity || 0.8,
          hand: ev.midi < 60 ? 'L' : 'R',
        });
      }
    }
  }
  for (const [midi, stack] of open) {
    for (const start of stack) {
      notes.push({ t: Math.max(0, start.at * beatsPerMs), d: 0.5, midi, vel: 0.8, hand: midi < 60 ? 'L' : 'R' });
    }
  }
  if (notes.length < 2) { toast('No se grabó nada que valga la pena.', 'bad'); return; }
  notes.sort((a, b) => a.t - b.t);
  const offset = notes[0].t;
  for (const n of notes) n.t = Math.round((n.t - offset) * 4) / 4;

  const song = buildSong({
    title: `Grabación ${new Date().toLocaleString('es')}`,
    source: 'recorded',
    bpm,
    meter: [4, 4],
    difficulty: estimateDifficulty(notes),
    notes,
  });
  try {
    await store.saveSong(song);
    await loadSongs();
    toast(`Guardada en tu biblioteca: ${notes.length} notas.`, 'good');
    renderLibrary();
  } catch (e) {
    toast(`No se pudo guardar: ${e.message}`, 'bad');
  }
}

// --------------------------------------------------------- añadir S04

function openAddSheet() {
  $('#add-sheet').hidden = false;
  $('#import-status').textContent = '';
  $('#import-progress').hidden = true;
}

function closeAddSheet() {
  $('#add-sheet').hidden = true;
}

function importProgress(ratio) {
  const bar = $('#import-progress');
  bar.hidden = false;
  $('#import-progress-fill').style.width = pct(ratio);
}

async function addSongFromBuffer(buffer, filename) {
  const lower = (filename || '').toLowerCase();
  const status = $('#import-status');
  const isMidi = lower.endsWith('.mid') || lower.endsWith('.midi') || looksLikeMidi(buffer);

  if (lower.endsWith('.json')) {
    const text = new TextDecoder().decode(new Uint8Array(buffer));
    const imported = await store.importLibrary(JSON.parse(text));
    await loadSongs();
    renderLibrary();
    toast(`Copia importada: ${imported} canciones.`, 'good');
    closeAddSheet();
    return;
  }

  let song;
  if (isMidi) {
    status.textContent = 'Leyendo el MIDI…';
    song = songFromMidi(buffer, filename ? filename.replace(/\.[^.]+$/, '') : 'Canción importada');
  } else {
    status.textContent = 'Escuchando el audio y buscando la melodía… esto tarda un rato.';
    const result = await transcribeFile(buffer, engine, {
      bpm: transcribeBpm(), quantize: transcribeGrid(), onProgress: importProgress,
    });
    await saveTranscription(result, filename ? filename.replace(/\.[^.]+$/, '') : 'Transcripción');
    return;
  }

  await store.saveSong(song);
  await loadSongs();
  renderLibrary();
  closeAddSheet();
  openSong(song.id);
  if (isMidi) toast(`"${song.title}" añadida.`, 'good');
}

function looksLikeMidi(buffer) {
  const head = new Uint8Array(buffer.slice(0, 4));
  return head[0] === 0x4d && head[1] === 0x54 && head[2] === 0x68 && head[3] === 0x64;
}

async function handleFiles(files) {
  const status = $('#import-status');
  for (const file of files) {
    if (file.size > 25 * 1024 * 1024) {
      status.textContent = `${file.name} pesa demasiado (más de 25 MB).`;
      continue;
    }
    try {
      const buffer = await file.arrayBuffer();
      await addSongFromBuffer(buffer, file.name);
    } catch (e) {
      status.textContent = e.message;
      toast(e.message, 'bad');
    } finally {
      $('#import-progress').hidden = true;
    }
  }
}

const LINK_SERVICES = [
  {
    name: 'YouTube',
    test: /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i,
    oembed: (url) => `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
  },
  {
    name: 'Spotify',
    test: /(^|\.)spotify\.com$/i,
    oembed: (url) => `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`,
  },
  {
    name: 'SoundCloud',
    test: /(^|\.)soundcloud\.com$/i,
    oembed: (url) => `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`,
  },
  { name: 'Apple Music', test: /(^|\.)music\.apple\.com$/i, oembed: null },
];

function hideRoutes() {
  $('#link-routes').hidden = true;
  state.link = null;
}

/**
 * Qué hacer con un enlace pegado.
 *
 * Un .mid se trae y se lee. Un enlace de streaming no trae notas dentro, así
 * que lo honesto es decirlo y llevar a los dos caminos que sí funcionan:
 * buscar un MIDI de esa canción, o ponerla y transcribirla de oído.
 */
async function analyzeLink(raw) {
  const status = $('#import-status');
  hideRoutes();
  $('#capture-panel').hidden = true;
  if (!/^https?:\/\//i.test(raw)) {
    status.textContent = 'Eso no parece una dirección web.';
    return;
  }
  let url;
  try { url = new URL(raw); } catch (e) {
    status.textContent = 'Ese enlace no se entiende.';
    return;
  }
  if (/\.midi?$/i.test(url.pathname)) {
    await fetchMidiUrl(raw);
    return;
  }
  const service = LINK_SERVICES.find((candidate) => candidate.test.test(url.hostname));
  if (!service) {
    status.textContent = 'No reconozco ese servicio; pruebo a traerlo como si fuera un MIDI…';
    await fetchMidiUrl(raw);
    return;
  }
  status.textContent = `Enlace de ${service.name}. Buscando el título…`;
  const info = await resolveLinkTitle(service, raw);
  showLinkRoutes(service, info);
  status.textContent = '';
}

/** El título sale del oEmbed público del servicio. Sin clave y sin cuenta. */
async function resolveLinkTitle(service, raw) {
  if (!service.oembed) return { title: '', author: '' };
  try {
    const response = await fetch(service.oembed(raw));
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json();
    return {
      title: String(data.title || '').slice(0, 120),
      author: String(data.author_name || '').slice(0, 80),
    };
  } catch (e) {
    return { title: '', author: '' };
  }
}

function showLinkRoutes(service, info) {
  state.link = { service: service.name, info };
  const head = $('#route-title');
  head.textContent = info.title
    ? `${service.name}: ${info.title}${info.author ? ` · ${info.author}` : ''}`
    : `Enlace de ${service.name}. No pude leer el título, pero los dos caminos de abajo funcionan igual.`;

  const search = $('#route-search');
  search.replaceChildren();
  const query = `${info.title} ${info.author || ''}`.trim();
  if (query) {
    search.append(
      searchLink('Buscar un MIDI', `"${query}" midi`),
      searchLink('Buscar la partitura', `${query} piano sheet music`),
    );
  } else {
    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = 'Copia el nombre de la canción y búscalo seguido de la palabra «midi».';
    search.append(hint);
  }

  $('#capture-tab').hidden = !AudioCapture.tabSupported;
  $('#route-why').textContent = `Un enlace de ${service.name} no lleva las notas dentro: lleva audio, y en Spotify ni siquiera audio que el navegador pueda leer. Convertir ese audio en partitura con calidad decente necesita un modelo corriendo en un servidor, y aquí no hay servidor: ese es el precio de que la app sea tuya, gratis, sin cuenta y sin conexión.`;
  $('#link-routes').hidden = false;
}

function searchLink(label, query) {
  const a = document.createElement('a');
  a.className = 'btn btn-primary';
  a.href = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = label;
  return a;
}

// --------------------------------------------------- escuchar y transcribir

let capture = null;
let captureTimer = 0;

async function startCapture(source) {
  if (capture) return;
  const status = $('#import-status');
  try {
    capture = new AudioCapture(engine);
    capture.onLevel = (value) => { $('#capture-level').style.width = pct(value); };
    capture.onAuto = () => finishCapture();
    await capture.start(source);
    $('#capture-panel').hidden = false;
    $('#capture-hint').textContent = source === 'tab'
      ? 'Dale al play en la pestaña que acabas de compartir. Escucho hasta 5 minutos.'
      : 'Pon la canción a sonar cerca del dispositivo. Escucho hasta 5 minutos.';
    $('#capture-time').textContent = '0:00';
    status.textContent = '';
    clearInterval(captureTimer);
    captureTimer = setInterval(() => {
      if (capture) $('#capture-time').textContent = fmtTime(capture.seconds * 1000);
    }, 300);
  } catch (e) {
    capture = null;
    status.textContent = e.message;
    toast(e.message, 'bad');
  }
}

function cancelCapture() {
  clearInterval(captureTimer);
  if (capture) capture.cleanup();
  capture = null;
  $('#capture-panel').hidden = true;
}

async function finishCapture() {
  if (!capture) return;
  clearInterval(captureTimer);
  const buffer = capture.stop();
  capture = null;
  $('#capture-panel').hidden = true;
  const status = $('#import-status');
  if (!buffer || buffer.duration < 2) {
    status.textContent = 'Se grabó muy poco. Dale al play antes de empezar a grabar.';
    return;
  }
  status.textContent = `Grabados ${fmtTime(buffer.duration * 1000)}. Buscando las notas…`;
  try {
    const result = await transcribeBuffer(buffer, {
      bpm: transcribeBpm(),
      quantize: transcribeGrid(),
      onProgress: importProgress,
    });
    if (!result.notes.length) {
      status.textContent = 'No encontré ninguna melodía clara. Esto saca una línea melódica, no una canción entera con su banda.';
      return;
    }
    const name = state.link && state.link.info && state.link.info.title
      ? state.link.info.title
      : `De oído ${new Date().toLocaleDateString('es')}`;
    await saveTranscription(result, name);
  } catch (e) {
    status.textContent = e.message;
  } finally {
    $('#import-progress').hidden = true;
  }
}

function transcribeBpm() {
  return $('#transcribe-auto').checked ? 0 : Number($('#transcribe-bpm').value);
}

function transcribeGrid() {
  const chosen = $('[data-grid][aria-checked="true"]', $('#transcribe-grid'));
  return chosen ? Number(chosen.dataset.grid) : 0.25;
}

/** Guarda lo transcrito y lo abre, para que se pueda tocar enseguida. */
async function saveTranscription(result, title) {
  const song = buildSong({
    title: String(title).slice(0, 80),
    source: 'audio',
    bpm: result.bpm,
    meter: [4, 4],
    difficulty: estimateDifficulty(result.notes),
    notes: result.notes,
  });
  await store.saveSong(song);
  await loadSongs();
  renderLibrary();
  hideRoutes();
  closeAddSheet();
  openSong(song.id);
  const tempo = result.detectedBpm
    ? `tempo detectado ${result.detectedBpm} bpm`
    : `tempo ${result.bpm} bpm`;
  toast(`${song.notes.length} notas sacadas de oído, ${tempo}. Revísalas: esto es beta.`, '');
}

async function fetchMidiUrl(url) {
  const status = $('#import-status');
  if (!/^https?:\/\//i.test(url)) { status.textContent = 'Eso no parece una dirección web.'; return; }
  status.textContent = 'Descargando…';
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) throw new Error(`el servidor respondió ${response.status}`);
    const buffer = await response.arrayBuffer();
    await addSongFromBuffer(buffer, url.split('/').pop() || 'Canción importada');
    $('#url-input').value = '';
  } catch (e) {
    status.textContent = `No se pudo traer: ${e.message}. Muchos servidores no permiten la descarga desde otra página; descárgalo al iPad y súbelo como archivo.`;
  }
}

// --------------------------------------------------------------- ajustes

function renderSettings() {
  const s = state.settings;
  $('#set-volume').value = String(Math.round(s.volume * 100));
  $('#set-volume-out').textContent = pct(s.volume);
  $('#set-metronome').checked = !!s.metronome;
  $('#set-countin').value = String(s.countInBars);
  $('#set-countin-out').textContent = s.countInBars === 0 ? 'sin claqueta' : `${s.countInBars} compás${s.countInBars > 1 ? 'es' : ''}`;
  $('#set-latency').value = String(s.latencyMs);
  $('#set-latency-out').textContent = `${s.latencyMs} ms`;
  $('#set-goal').value = String(s.dailyGoalMinutes);
  $('#set-goal-out').textContent = `${s.dailyGoalMinutes} min`;
  $('#set-fingers').checked = !!s.showFingers;
  $('#set-shownames').checked = !!s.showNames;

  const timbres = $('#set-timbre');
  if (!timbres.children.length) {
    for (const t of TIMBRE_NAMES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.dataset.timbre = t.id;
      button.textContent = t.name;
      timbres.appendChild(button);
    }
    segmented(timbres, 'timbre', (id) => {
      state.settings = store.saveSettings({ timbre: id });
      engine.setTimbre(id);
      engine.ensure().then(() => engine.noteOn(64, 0.8, 0, 1.2));
    });
  }
  for (const b of $$('[data-timbre]', timbres)) b.setAttribute('aria-checked', String(b.dataset.timbre === s.timbre));
  for (const b of $$('[data-names]', $('#set-names'))) b.setAttribute('aria-checked', String(b.dataset.names === s.noteNames));
  for (const b of $$('[data-labels]', $('#set-labels'))) b.setAttribute('aria-checked', String(b.dataset.labels === s.labels));
  for (const b of $$('[data-input]', $('#set-input'))) b.setAttribute('aria-checked', String(b.dataset.input === s.inputMode));
  renderPianoSettings();
}

/** El panel "Tu piano": tamaño, nota más grave y qué hacer con lo que no cabe. */
function renderPianoSettings() {
  const host = $('#set-piano');
  if (!host) return;
  if (!host.children.length) {
    for (const size of PIANO_SIZES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'radio');
      button.dataset.piano = String(size.keys);
      button.textContent = size.label;
      host.appendChild(button);
    }
  }
  const keys = Number(state.settings.pianoKeys) || 0;
  for (const b of $$('[data-piano]', host)) b.setAttribute('aria-checked', String(Number(b.dataset.piano) === keys));
  for (const b of $$('[data-outofrange]', $('#set-outofrange'))) {
    b.setAttribute('aria-checked', String(b.dataset.outofrange === state.settings.outOfRange));
  }
  const range = userPianoRange();
  $('#piano-low-field').hidden = !range;
  $('#out-of-range-field').hidden = !range;
  if (range) {
    $('#piano-range-label').textContent = `${fullName(range.lo)} – ${fullName(range.hi)}`;
  }
}

async function doExport() {
  const data = await store.exportLibrary();
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  download(blob, `cascada-biblioteca-${store.todayKey()}.json`);
  toast('Descargado. Guárdalo donde no se te pierda.', 'good');
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function exportCurrentSongAsMidi() {
  const bytes = songToMidiBytes(state.song);
  download(new Blob([bytes], { type: 'audio/midi' }), `${slug(state.song.title)}.mid`);
  toast('MIDI descargado.', 'good');
}

function slug(text) {
  return String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cancion';
}

export { startPlay, closePlayer, practiceWorstBars, handleNoteOn, handleNoteOff,
  setInputMode, openAddSheet, closeAddSheet, handleFiles, fetchMidiUrl, renderSettings, doExport,
  exportCurrentSongAsMidi, toggleRecording, updateFreeLabels, transposeLabel, download, slug,
  analyzeLink, hideRoutes, startCapture, cancelCapture, finishCapture, setTranspose,
  renderPianoSettings, renderFitNotice, fullName };

function setPlayerHands(value) {
  for (const b of $$('[data-hands]', $('#player-hands'))) b.setAttribute('aria-checked', String(b.dataset.hands === value));
}
function setInputSegmentSetter(fn) { setInputSegment = fn; }
export { setPlayerHands, setInputSegmentSetter };
