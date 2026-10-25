// app.js — arranque y cableado de los controles.

import { engine } from './audio.js';
import { computerKeyToMidi } from './keyboard.js';
import * as store from './store.js';
import * as ui from './ui.js';

const { $, $$, state, toast, segmented } = ui;

function wireTabs() {
  $('#tabbar').addEventListener('click', (ev) => {
    const tab = ev.target.closest('.tab');
    if (tab) ui.setScreen(tab.dataset.tab);
  });
  $('#open-settings').addEventListener('click', () => { ui.renderSettings(); ui.setScreen('settings'); });
  $('#settings-back').addEventListener('click', () => ui.setScreen(state.lastTab));
  $('#song-back').addEventListener('click', () => ui.setScreen(state.lastTab));
  $('#streak-chip').addEventListener('click', () => ui.setScreen('progress'));
}

function wireLibrary() {
  for (const grid of [$('#library-grid'), $('#catalog-grid')]) {
    grid.addEventListener('click', (ev) => {
      const card = ev.target.closest('.card');
      if (card) ui.openSong(card.dataset.songId);
    });
  }
  $('#library-search').addEventListener('input', ui.renderLibrary);
  segmented($('[data-library-filter]').parentElement, 'libraryFilter', (value) => {
    ui.libraryFilterRef(value);
    ui.renderLibrary();
  });
  segmented($('[data-catalog-level]').parentElement, 'catalogLevel', (value) => {
    ui.catalogLevelRef(value);
    ui.renderCatalog();
  });
}

function wireSongDetail() {
  const setMode = segmented('#mode-picker', 'mode', (mode) => {
    state.options.mode = mode;
    ui.renderSongDetail();
  });
  const setHands = segmented('#hands-picker', 'hands', (hands) => {
    state.options.hands = hands;
  });
  const setDifficulty = segmented('#difficulty-picker', 'difficulty', (difficulty) => {
    state.settings = store.saveSettings({ difficulty });
  });
  ui.setPickers(setMode, setHands, setDifficulty);

  $('#detail-speed').addEventListener('input', (ev) => {
    state.options.speed = Number(ev.target.value) / 100;
    $('#detail-speed-out').textContent = `${ev.target.value} %`;
  });
  $('#detail-transpose').addEventListener('input', (ev) => {
    state.options.transpose = Number(ev.target.value);
    ui.applyTranspose();
    $('#detail-transpose-out').textContent = ui.transposeLabel(state.options.transpose);
  });
  $('#song-start').addEventListener('click', () => ui.startPlay(null, false));
  $('#song-pin').addEventListener('click', () => {
    store.togglePinned(state.song.id);
    ui.renderSongDetail();
    ui.renderLibrary();
  });
  $('#song-export').addEventListener('click', ui.exportCurrentSongAsMidi);
  $('#song-delete').addEventListener('click', async () => {
    const song = state.song;
    if (!confirm(`¿Borrar "${song.title}" de tu biblioteca? Esto no se puede deshacer.`)) return;
    await store.deleteSong(song.id);
    await ui.loadSongs();
    toast('Borrada.', '');
    ui.setScreen('library');
  });
}

function wirePlayer() {
  $('#player-close').addEventListener('click', ui.closePlayer);
  $('#exit-btn').addEventListener('click', ui.closePlayer);
  $('#player-pause').addEventListener('click', () => {
    const player = state.player;
    if (!player) return;
    if (player.state === 'paused') {
      player.resume();
      $('#player-paused').hidden = true;
    } else {
      player.pause();
      $('#player-paused').hidden = false;
    }
  });
  $('#resume-btn').addEventListener('click', () => {
    if (!state.player) return;
    state.player.resume();
    $('#player-paused').hidden = true;
  });
  $('#restart-btn').addEventListener('click', () => {
    $('#player-paused').hidden = true;
    ui.startPlay(state.range, state.loop);
  });
  $('#player-speed').addEventListener('input', (ev) => {
    const speed = Number(ev.target.value) / 100;
    state.options.speed = speed;
    $('#player-speed-out').textContent = `${ev.target.value} %`;
    if (state.player) state.player.setSpeed(speed);
  });
  segmented('#player-hands', 'hands', (hands) => {
    state.options.hands = hands;
    if (state.player) {
      state.player.set({ hands });
      state.player.buildSteps();
      state.player.seek(state.player.beat);
    }
  });
  $('#player-loop').addEventListener('click', (ev) => {
    state.loop = !state.loop;
    ev.currentTarget.setAttribute('aria-pressed', String(state.loop));
    if (state.player) state.player.loopEnabled = state.loop;
  });
  $('#player-metronome').addEventListener('click', (ev) => {
    state.settings = store.saveSettings({ metronome: !state.settings.metronome });
    ev.currentTarget.setAttribute('aria-pressed', String(state.settings.metronome));
    if (state.player) state.player.metronome = state.settings.metronome;
  });

  $('#result-again').addEventListener('click', () => {
    $('#results').hidden = true;
    ui.startPlay(state.range, state.loop);
  });
  $('#result-practice').addEventListener('click', ui.practiceWorstBars);
  $('#result-close').addEventListener('click', () => {
    $('#results').hidden = true;
    ui.closePlayer();
  });
}

function wireAddSheet() {
  $('#add-song').addEventListener('click', ui.openAddSheet);
  $('#add-close').addEventListener('click', ui.closeAddSheet);
  $('#add-sheet').addEventListener('click', (ev) => {
    if (ev.target === $('#add-sheet')) ui.closeAddSheet();
  });
  const input = $('#file-input');
  const zone = $('#dropzone');
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); input.click(); }
  });
  input.addEventListener('change', () => {
    if (input.files && input.files.length) ui.handleFiles([...input.files]);
    input.value = '';
  });
  for (const type of ['dragenter', 'dragover']) {
    zone.addEventListener(type, (ev) => { ev.preventDefault(); zone.classList.add('over'); });
  }
  for (const type of ['dragleave', 'drop']) {
    zone.addEventListener(type, (ev) => { ev.preventDefault(); zone.classList.remove('over'); });
  }
  zone.addEventListener('drop', (ev) => {
    const files = ev.dataTransfer && ev.dataTransfer.files;
    if (files && files.length) ui.handleFiles([...files]);
  });
  $('#url-go').addEventListener('click', () => ui.fetchMidiUrl($('#url-input').value.trim()));
  $('#url-input').addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') ui.fetchMidiUrl($('#url-input').value.trim());
  });
  $('#transcribe-bpm').addEventListener('input', (ev) => {
    $('#transcribe-bpm-out').textContent = ev.target.value;
  });
  segmented('#transcribe-grid', 'grid', () => {});
}

function wireFree() {
  $('#free-octave-down').addEventListener('click', () => {
    state.free.base = Math.max(24, state.free.base - 12);
    ui.updateFreeLabels();
  });
  $('#free-octave-up').addEventListener('click', () => {
    state.free.base = Math.min(84, state.free.base + 12);
    ui.updateFreeLabels();
  });
  $('#free-sustain').addEventListener('click', (ev) => {
    state.free.sustain = !state.free.sustain;
    ev.currentTarget.setAttribute('aria-pressed', String(state.free.sustain));
    if (!state.free.sustain) engine.allOff();
  });
  $('#free-record').addEventListener('click', ui.toggleRecording);
}

function wireSettings() {
  $('#set-volume').addEventListener('input', (ev) => {
    const volume = Number(ev.target.value) / 100;
    state.settings = store.saveSettings({ volume });
    engine.setVolume(volume);
    $('#set-volume-out').textContent = `${ev.target.value} %`;
  });
  $('#set-metronome').addEventListener('change', (ev) => {
    state.settings = store.saveSettings({ metronome: ev.target.checked });
  });
  $('#set-countin').addEventListener('input', (ev) => {
    const bars = Number(ev.target.value);
    state.settings = store.saveSettings({ countInBars: bars });
    $('#set-countin-out').textContent = bars === 0 ? 'sin claqueta' : `${bars} compás${bars > 1 ? 'es' : ''}`;
  });
  $('#set-latency').addEventListener('input', (ev) => {
    const latencyMs = Number(ev.target.value);
    state.settings = store.saveSettings({ latencyMs });
    $('#set-latency-out').textContent = `${latencyMs} ms`;
    if (state.player) state.player.latencyMs = latencyMs;
  });
  $('#set-goal').addEventListener('input', (ev) => {
    const minutes = Number(ev.target.value);
    state.settings = store.saveSettings({ dailyGoalMinutes: minutes });
    $('#set-goal-out').textContent = `${minutes} min`;
  });
  $('#set-fingers').addEventListener('change', (ev) => {
    state.settings = store.saveSettings({ showFingers: ev.target.checked });
  });
  $('#set-shownames').addEventListener('change', (ev) => {
    state.settings = store.saveSettings({ showNames: ev.target.checked });
  });
  segmented('#set-names', 'names', (value) => {
    state.settings = store.saveSettings({ noteNames: value });
    ui.updateFreeLabels();
  });
  segmented('#set-labels', 'labels', (value) => {
    state.settings = store.saveSettings({ labels: value });
  });
  const setInput = segmented('#set-input', 'input', (value) => { ui.setInputMode(value); });
  ui.setInputSegmentSetter(setInput);

  $('#export-library').addEventListener('click', ui.doExport);
  $('#import-library').addEventListener('click', () => {
    ui.openAddSheet();
    $('#import-status').textContent = 'Elige el archivo .json que exportaste antes.';
  });
  $('#wipe-library').addEventListener('click', async () => {
    if (!confirm('Esto borra tus canciones importadas, tu progreso y tu racha de este dispositivo. ¿Seguro?')) return;
    await store.clearEverything();
    state.settings = store.getSettings();
    await ui.loadSongs();
    toast('Todo borrado.', '');
    ui.setScreen('library');
  });
}

function wireComputerKeyboard() {
  const held = new Set();
  window.addEventListener('keydown', (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.repeat) return;
    const tag = (ev.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    if (ev.key === 'Escape') {
      if (!$('#results').hidden) { $('#results').hidden = true; ui.closePlayer(); return; }
      if (!$('#add-sheet').hidden) { ui.closeAddSheet(); return; }
      if (!$('#player').hidden) { ui.closePlayer(); return; }
    }
    if (ev.key === ' ' && !$('#player').hidden) {
      ev.preventDefault();
      $('#player-pause').click();
      return;
    }

    const base = $('#player').hidden ? state.free.base : 60;
    const midi = computerKeyToMidi(ev.key, base);
    if (midi == null || held.has(ev.key)) return;
    held.add(ev.key);
    ev.preventDefault();
    ui.handleNoteOn(midi, 0.85, 'keyboard');
  });
  window.addEventListener('keyup', (ev) => {
    if (!held.has(ev.key)) return;
    held.delete(ev.key);
    const base = $('#player').hidden ? state.free.base : 60;
    const midi = computerKeyToMidi(ev.key, base);
    if (midi != null) ui.handleNoteOff(midi, 'keyboard');
  });
}

function wireLifecycle() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.player && state.player.state === 'playing') {
      state.player.pause();
      $('#player-paused').hidden = false;
    }
  });
  window.addEventListener('pagehide', () => engine.allOff());
  // El primer gesto desbloquea el audio en Safari.
  const unlock = () => { engine.ensure(); };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
}

function wireOnboarding() {
  const hints = {
    touch: 'Toca las teclas en la pantalla con los dedos. Funciona con varios dedos a la vez.',
    mic: 'La app escucha tu piano por el micrófono. Pediremos permiso cuando lo elijas en Ajustes.',
    midi: 'Con un teclado USB o Bluetooth. Ojo: Safari en iPad no tiene Web MIDI; ahí usa el micrófono.',
  };
  let chosenInput = 'touch';
  let chosenNames = 'es';
  segmented($('[data-onboard-input]').parentElement, 'onboardInput', (value) => {
    chosenInput = value;
    $('#onboard-input-hint').textContent = hints[value];
  });
  segmented($('[data-onboard-names]').parentElement, 'onboardNames', (value) => { chosenNames = value; });
  $('#onboard-done').addEventListener('click', async () => {
    state.settings = store.saveSettings({ noteNames: chosenNames, inputMode: 'touch' });
    store.setOnboarded(true);
    $('[data-screen="onboarding"]').hidden = true;
    ui.renderSettings();
    if (chosenInput !== 'touch') {
      toast('Elige el micrófono o el MIDI en Ajustes cuando quieras.', '');
    }
    await engine.ensure();
    ui.setScreen('catalog');
  });
}

async function registerServiceWorker() {
  const status = $('#sw-status');
  if (!('serviceWorker' in navigator)) {
    if (status) status.textContent = 'Este navegador no guarda la app para usarla sin conexión.';
    return;
  }
  if (location.protocol === 'file:') {
    if (status) status.textContent = 'Abierta como archivo local: para instalarla hace falta servirla por https.';
    return;
  }
  try {
    const registration = await navigator.serviceWorker.register('sw.js', { scope: './' });
    if (status) {
      status.textContent = registration.active
        ? 'Lista para usarse sin conexión.'
        : 'Guardando la app para usarla sin conexión…';
    }
  } catch (e) {
    if (status) status.textContent = `No se pudo preparar el modo sin conexión: ${e.message}`;
  }
}

/**
 * Un asidero para las pruebas de navegador y para depurar desde la consola.
 * No manda nada a ninguna parte: solo deja mirar y tocar notas por código.
 */
function exposeDebugHook() {
  window.__cascada = {
    get player() { return state.player; },
    get state() { return state; },
    press: (midi, velocity = 0.9) => ui.handleNoteOn(midi, velocity, 'test'),
    release: (midi) => ui.handleNoteOff(midi, 'test'),
    store,
  };
}

async function boot() {
  state.settings = store.getSettings();
  engine.setVolume(state.settings.volume);
  engine.setTimbre(state.settings.timbre);

  wireTabs();
  wireLibrary();
  wireSongDetail();
  wirePlayer();
  wireAddSheet();
  wireFree();
  wireSettings();
  wireComputerKeyboard();
  wireLifecycle();
  wireOnboarding();

  await ui.loadSongs();
  $('#streak-days').textContent = String(store.getStreak().current || 0);
  ui.renderSettings();

  if (!store.isOnboarded()) {
    $('[data-screen="onboarding"]').hidden = false;
    ui.setScreen('library');
  } else {
    $('[data-screen="onboarding"]').hidden = true;
    ui.setScreen('library');
  }
  registerServiceWorker();
  exposeDebugHook();
  document.documentElement.dataset.ready = '1';
}

boot().catch((error) => {
  console.error(error);
  const host = document.getElementById('toasts');
  if (host) {
    const el = document.createElement('div');
    el.className = 'toast bad';
    el.textContent = `Algo falló al arrancar: ${error.message}`;
    host.appendChild(el);
  }
});
