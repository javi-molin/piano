// store.js — todo vive en el dispositivo. Sin cuenta, sin nube, sin servidor.
// Las canciones van a IndexedDB (pueden ser grandes); ajustes, progreso y racha
// a localStorage (son pequeños y se leen en cada arranque).

const DB_NAME = 'cascada';
const DB_VERSION = 1;
const SONGS = 'songs';
const LS = {
  settings: 'cascada.settings',
  progress: 'cascada.progress',
  streak: 'cascada.streak',
  attempts: 'cascada.attempts',
  onboarded: 'cascada.onboarded',
};

export const DEFAULT_SETTINGS = {
  lang: 'es',
  noteNames: 'es',      // es (Do Re Mi) | en (C D E)
  labels: 'white',      // none | white | all
  showFingers: true,
  showNames: false,
  volume: 0.75,
  timbre: 'piano',
  metronome: false,
  countInBars: 1,
  latencyMs: 0,
  inputMode: 'touch',   // touch | midi | mic
  difficulty: 'medium',
  dailyGoalMinutes: 10,
  theme: 'dark',
  pianoKeys: 0,        // 0 = sin límite; si no, 25/37/49/61/76/88
  pianoLowShift: 0,    // octavas que se mueve la nota más grave del teclado
  outOfRange: 'fold',  // show | skip | fold, para lo que no entra en tu piano
  // La zona donde caen las notas
  keysVisible: 0,          // blancas a la vista; 0 = las que haga falta
  keyboardHeight: 34,      // % de la altura de la pantalla
  lookAheadSeconds: 2.6,   // cuánto se ve venir
  autoFollow: true,        // el teclado sigue a la canción al deslizarse
  showGrid: true,          // líneas y números de compás
  showGlow: true,          // brillo sobre la línea de ataque
  palette: 'clasica',      // clasica | daltonismo | contraste
  micSensitivity: 50,      // 0 sala ruidosa, 100 muy sensible
};

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Este navegador no tiene IndexedDB.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SONGS)) {
        db.createObjectStore(SONGS, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir la base local.'));
  });
  return dbPromise;
}

function tx(store, mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const result = fn(transaction.objectStore(store));
    transaction.oncomplete = () => resolve(result && result.value !== undefined ? result.value : result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  }));
}

function readLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return structuredCloneSafe(fallback);
    const parsed = JSON.parse(raw);
    return parsed == null ? structuredCloneSafe(fallback) : parsed;
  } catch (e) {
    return structuredCloneSafe(fallback);
  }
}

function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false; // modo privado o cuota llena: la app sigue, sin recordar
  }
}

function structuredCloneSafe(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

// ----------------------------------------------------------- canciones

/** Guarda una canción importada. Se guardan las notas, no el audio. */
export async function saveSong(song) {
  const record = {
    id: song.id,
    title: song.title,
    composer: song.composer || '',
    source: song.source || 'midi',
    difficulty: song.difficulty,
    bpm: song.bpm,
    meter: song.meter,
    createdAt: song.createdAt || Date.now(),
    notes: song.notes.map((n) => ({ t: n.t, d: n.d, midi: n.midi, hand: n.hand, vel: n.vel })),
    sections: song.sections,
  };
  const result = await tx(SONGS, 'readwrite', (os) => { os.put(record); return record; });
  return result;
}

export async function listSongs() {
  return tx(SONGS, 'readonly', (os) => {
    const box = { value: [] };
    const request = os.getAll();
    request.onsuccess = () => { box.value = request.result || []; };
    return box;
  });
}

export async function deleteSong(id) {
  return tx(SONGS, 'readwrite', (os) => { os.delete(id); return true; });
}

// ------------------------------------------------------------ ajustes

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...readLocal(LS.settings, {}) };
}

export function saveSettings(patch) {
  const next = { ...getSettings(), ...patch };
  writeLocal(LS.settings, next);
  return next;
}

export function isOnboarded() {
  return readLocal(LS.onboarded, false) === true;
}

export function setOnboarded(value = true) {
  writeLocal(LS.onboarded, value);
}

// ----------------------------------------------------------- progreso

const EMPTY_PROGRESS = {
  bestAccuracy: 0, bestStars: 0, bestScore: 0, timesPlayed: 0,
  mastered: false, pinned: false, lastPlayedAt: 0, practiceMs: 0,
};

export function getProgress(songId) {
  const all = readLocal(LS.progress, {});
  return { ...EMPTY_PROGRESS, ...(all[songId] || {}) };
}

export function allProgress() {
  return readLocal(LS.progress, {});
}

export function updateProgress(songId, patch) {
  const all = readLocal(LS.progress, {});
  all[songId] = { ...EMPTY_PROGRESS, ...(all[songId] || {}), ...patch };
  writeLocal(LS.progress, all);
  return all[songId];
}

export function togglePinned(songId) {
  const current = getProgress(songId);
  return updateProgress(songId, { pinned: !current.pinned });
}

/** Guarda el intento, actualiza los récords de la canción y mueve la racha. */
export function recordAttempt(result) {
  const previous = getProgress(result.songId);
  const full = result.range && result.total > 0
    && result.range.start <= 0.001;
  const progress = updateProgress(result.songId, {
    timesPlayed: previous.timesPlayed + 1,
    lastPlayedAt: result.playedAt,
    practiceMs: previous.practiceMs + (result.ms || 0),
    bestAccuracy: Math.max(previous.bestAccuracy, result.accuracy),
    bestStars: Math.max(previous.bestStars, result.stars),
    bestScore: Math.max(previous.bestScore, result.score),
    mastered: previous.mastered || (result.mastered && full),
  });

  const attempts = readLocal(LS.attempts, []);
  attempts.push({
    songId: result.songId, mode: result.mode, hands: result.hands,
    speed: result.speed, accuracy: result.accuracy, stars: result.stars,
    score: result.score, ms: result.ms, playedAt: result.playedAt,
  });
  writeLocal(LS.attempts, attempts.slice(-500));

  const streak = touchStreak(result.ms || 0);
  return { progress, streak };
}

export function listAttempts(songId) {
  const attempts = readLocal(LS.attempts, []);
  return songId ? attempts.filter((a) => a.songId === songId) : attempts;
}

// -------------------------------------------------------------- racha

function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dayDistance(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const first = Date.UTC(ay, am - 1, ad);
  const second = Date.UTC(by, bm - 1, bd);
  return Math.round((second - first) / 86400000);
}

export function getStreak() {
  const streak = readLocal(LS.streak, { current: 0, longest: 0, lastDay: '', days: {} });
  const today = todayKey();
  if (streak.lastDay && dayDistance(streak.lastDay, today) > 1) streak.current = 0;
  return streak;
}

export function touchStreak(ms = 0) {
  const streak = getStreak();
  const today = todayKey();
  if (streak.lastDay !== today) {
    streak.current = streak.lastDay && dayDistance(streak.lastDay, today) === 1 ? streak.current + 1 : 1;
    streak.lastDay = today;
  } else if (!streak.current) {
    streak.current = 1;
  }
  streak.longest = Math.max(streak.longest || 0, streak.current);
  streak.days = streak.days || {};
  streak.days[today] = (streak.days[today] || 0) + ms;
  const keys = Object.keys(streak.days).sort();
  if (keys.length > 400) for (const k of keys.slice(0, keys.length - 400)) delete streak.days[k];
  writeLocal(LS.streak, streak);
  return streak;
}

export function practiceToday() {
  const streak = getStreak();
  return (streak.days && streak.days[todayKey()]) || 0;
}

export { todayKey, dayDistance };

// ------------------------------------------------------ exportar/importar

/** Tu biblioteca entera en un archivo. Es la única "nube" que hay aquí. */
export async function exportLibrary() {
  const songs = await listSongs();
  return {
    app: 'cascada',
    version: 1,
    exportedAt: new Date().toISOString(),
    songs,
    progress: allProgress(),
    streak: getStreak(),
    attempts: listAttempts(),
    settings: getSettings(),
  };
}

export async function importLibrary(data, { merge = true } = {}) {
  if (!data || data.app !== 'cascada') throw new Error('Ese archivo no es una copia de Cascada.');
  let imported = 0;
  for (const song of data.songs || []) {
    if (!song || !song.id || !Array.isArray(song.notes)) continue;
    await tx(SONGS, 'readwrite', (os) => { os.put(song); return true; });
    imported++;
  }
  if (data.progress) {
    const current = merge ? allProgress() : {};
    writeLocal(LS.progress, { ...current, ...data.progress });
  }
  if (data.streak) writeLocal(LS.streak, data.streak);
  if (data.settings) writeLocal(LS.settings, { ...getSettings(), ...data.settings });
  if (data.attempts) writeLocal(LS.attempts, (data.attempts || []).slice(-500));
  return imported;
}

export async function clearEverything() {
  await tx(SONGS, 'readwrite', (os) => { os.clear(); return true; });
  for (const key of Object.values(LS)) {
    try { localStorage.removeItem(key); } catch (e) { /* nada que borrar */ }
  }
}
