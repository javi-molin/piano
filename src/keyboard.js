// keyboard.js — el teclado: geometría, dibujo y multitouch.
// La geometría la comparte con el piano-roll, así cada nota que cae aterriza
// exactamente sobre su tecla.

import { isBlackKey, nameFromMidi, pitchClass } from './score.js';

const WHITE_PC = [0, 2, 4, 5, 7, 9, 11];

/**
 * Lleva el extremo grave al Do de su octava. El agudo sube hasta el Si de la
 * suya, salvo que la nota más alta ya sea un Do: entonces el teclado termina
 * en ese Do, como un teclado de 61 teclas, y no se desperdicia media pantalla.
 */
export function wholeOctaves(lo, hi, minKeys = 13) {
  const pc = (m) => ((m % 12) + 12) % 12;
  let low = lo - pc(lo);
  let high = pc(hi) === 0 ? hi : hi + (11 - pc(hi));
  while (high - low + 1 < minKeys) {
    if (low - 12 >= 21) low -= 12;
    else if (high + 12 <= 108) high += 12;
    else break;
  }
  return { lo: Math.max(21, low), hi: Math.min(108, high) };
}

/**
 * Reparte el ancho disponible entre las teclas blancas; las negras se centran
 * en la junta y se dibujan encima.
 */
export function buildLayout(lo, hi, width) {
  const whites = [];
  for (let m = lo; m <= hi; m++) if (!isBlackKey(m)) whites.push(m);
  const whiteW = width / Math.max(1, whites.length);
  const keys = [];
  const index = new Map();
  whites.forEach((midi, i) => {
    const key = { midi, x: i * whiteW, w: whiteW, black: false };
    index.set(midi, key);
    keys.push(key);
  });
  for (let m = lo; m <= hi; m++) {
    if (!isBlackKey(m)) continue;
    const leftWhite = index.get(m - 1);
    if (!leftWhite) continue;
    const bw = whiteW * 0.56;
    const key = { midi: m, x: leftWhite.x + whiteW - bw / 2, w: bw, black: true };
    index.set(m, key);
    keys.push(key);
  }
  return {
    lo, hi, whiteW, width,
    whiteCount: whites.length,
    keys,
    key: (midi) => index.get(midi) || null,
  };
}

const KEY_RADIUS = 5;

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

export { roundRect };

/**
 * Dibuja el teclado.
 * marks: Map midi -> { state, hand, finger }
 *   state: 'press' (lo estás tocando) | 'expect' (hay que tocarla) |
 *          'hit' (acertaste) | 'miss' (se pasó) | 'auto' (la toca la app)
 */
export function drawKeyboard(ctx, layout, top, height, marks, opts = {}) {
  const theme = opts.theme || {};
  const whiteFill = theme.white || '#eef2f8';
  const blackFill = theme.black || '#161c27';
  const blackH = height * 0.6;
  const labels = opts.labels || 'none'; // none | white | all
  const lang = opts.lang || 'es';

  ctx.save();
  ctx.fillStyle = theme.bed || '#070a10';
  ctx.fillRect(0, top - 3, layout.width, height + 3);
  ctx.fillStyle = theme.rail || '#2a3547';
  ctx.fillRect(0, top - 3, layout.width, 3);

  for (const key of layout.keys) {
    if (key.black) continue;
    const mark = marks && marks.get(key.midi);
    ctx.fillStyle = mark ? markColor(mark, theme, false) : whiteFill;
    roundRect(ctx, key.x + 0.5, top, key.w - 1, height, KEY_RADIUS);
    ctx.fill();
    if (!mark) {
      const g = ctx.createLinearGradient(0, top, 0, top + height);
      g.addColorStop(0, 'rgba(0,0,0,0.05)');
      g.addColorStop(0.82, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.22)');
      ctx.fillStyle = g;
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (labels !== 'none' && layout.whiteW > 22) {
      ctx.fillStyle = mark ? 'rgba(10,13,20,.85)' : 'rgba(30,38,52,.62)';
      ctx.font = `600 ${Math.min(13, layout.whiteW * 0.34)}px -apple-system, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      const showOctave = pitchClass(key.midi) === 0 && layout.whiteW > 30;
      ctx.fillText(nameFromMidi(key.midi, lang, showOctave), key.x + key.w / 2, top + height - 8);
    }
    if (mark && mark.finger && layout.whiteW > 18) {
      drawFinger(ctx, key.x + key.w / 2, top + height - height * 0.62, mark.finger, layout.whiteW);
    }
  }

  for (const key of layout.keys) {
    if (!key.black) continue;
    const mark = marks && marks.get(key.midi);
    ctx.fillStyle = mark ? markColor(mark, theme, true) : blackFill;
    roundRect(ctx, key.x, top, key.w, blackH, KEY_RADIUS);
    ctx.fill();
    if (!mark) {
      const g = ctx.createLinearGradient(0, top, 0, top + blackH);
      g.addColorStop(0, 'rgba(255,255,255,0.14)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (labels === 'all' && key.w > 20) {
      ctx.fillStyle = mark ? 'rgba(10,13,20,.9)' : 'rgba(226,234,246,.55)';
      ctx.font = `600 ${Math.min(10, key.w * 0.4)}px -apple-system, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(nameFromMidi(key.midi, lang), key.x + key.w / 2, top + blackH - 6);
    }
    if (mark && mark.finger && key.w > 16) {
      drawFinger(ctx, key.x + key.w / 2, top + blackH * 0.42, mark.finger, key.w * 1.4);
    }
  }
  ctx.restore();
}

function drawFinger(ctx, cx, cy, finger, scale) {
  const r = Math.max(7, Math.min(12, scale * 0.3));
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(10,13,20,.72)';
  ctx.fill();
  ctx.fillStyle = '#f3f6fb';
  ctx.font = `700 ${Math.round(r * 1.25)}px -apple-system, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(finger), cx, cy + 0.5);
  ctx.restore();
}

function markColor(mark, theme, black) {
  const hand = mark.hand === 'L' ? (theme.left || '#ffb24a') : (theme.right || '#3ddcc4');
  switch (mark.state) {
    case 'hit': return theme.success || '#5fe08f';
    case 'miss': return theme.danger || '#ff7a7a';
    case 'expect': return hand;
    case 'auto': return black ? mix(hand, '#161c27', 0.5) : mix(hand, '#eef2f8', 0.45);
    default: return hand;
  }
}

function mix(a, b, amount) {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  if (!pa || !pb) return a;
  const c = pa.map((v, i) => Math.round(v * (1 - amount) + pb[i] * amount));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export { mix };

/** Qué tecla hay en (x, y). Las negras ganan porque están encima. */
export function keyAt(layout, x, y, top, height) {
  if (y < top || y > top + height) return null;
  const blackH = height * 0.6;
  if (y <= top + blackH) {
    for (const key of layout.keys) {
      if (key.black && x >= key.x && x <= key.x + key.w) return key.midi;
    }
  }
  for (const key of layout.keys) {
    if (!key.black && x >= key.x && x <= key.x + key.w) return key.midi;
  }
  return null;
}

/**
 * Teclas del ordenador, para quien use la app con teclado físico (y para que
 * los flujos se puedan completar sin ratón ni pantalla táctil).
 */
export const COMPUTER_KEYS = {
  z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11,
  q: 12, 2: 13, w: 14, 3: 15, e: 16, r: 17, 5: 18, t: 19, 6: 20, y: 21, 7: 22, u: 23,
  i: 24, 9: 25, o: 26, 0: 27, p: 28,
};

export function computerKeyToMidi(key, baseMidi = 60) {
  const offset = COMPUTER_KEYS[String(key).toLowerCase()];
  return offset == null ? null : baseMidi + offset;
}

/**
 * Conecta punteros (dedo, lápiz o ratón) al teclado. Devuelve una función para
 * desconectar.
 */
export function attachPointerInput(canvas, getGeometry, handlers) {
  const active = new Map(); // pointerId -> midi
  const toLocal = (ev) => {
    const rect = canvas.getBoundingClientRect();
    return { x: (ev.clientX - rect.left) * (canvas.width / canvas.clientWidth / (window.devicePixelRatio || 1)), y: (ev.clientY - rect.top) * (canvas.height / canvas.clientHeight / (window.devicePixelRatio || 1)) };
  };
  const down = (ev) => {
    const geo = getGeometry();
    if (!geo) return;
    const { x, y } = toLocal(ev);
    const midi = keyAt(geo.layout, x, y, geo.top, geo.height);
    if (midi == null) return;
    ev.preventDefault();
    canvas.setPointerCapture && canvas.setPointerCapture(ev.pointerId);
    active.set(ev.pointerId, midi);
    handlers.onDown(midi);
  };
  const move = (ev) => {
    if (!active.has(ev.pointerId)) return;
    const geo = getGeometry();
    if (!geo) return;
    const { x, y } = toLocal(ev);
    const midi = keyAt(geo.layout, x, y, geo.top, geo.height);
    const previous = active.get(ev.pointerId);
    if (midi != null && midi !== previous) {
      handlers.onUp(previous);
      active.set(ev.pointerId, midi);
      handlers.onDown(midi);
    }
  };
  const up = (ev) => {
    if (!active.has(ev.pointerId)) return;
    handlers.onUp(active.get(ev.pointerId));
    active.delete(ev.pointerId);
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', up);
  return () => {
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', up);
    canvas.removeEventListener('pointerleave', up);
    for (const midi of active.values()) handlers.onUp(midi);
    active.clear();
  };
}
