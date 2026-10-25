// keyboard.js — el teclado: geometría de piano real, dibujo y multitouch.
//
// La geometría la comparte con el piano-roll, así cada nota que cae aterriza
// exactamente sobre su tecla. Las posiciones son las de un piano de verdad, no
// una rejilla: por eso un teclado dibujado así se "lee" sin pensar.

import { isBlackKey, nameFromMidi, pitchClass } from './score.js';

/**
 * Dónde van las negras dentro de una octava, medido en anchos de tecla blanca
 * desde el Do.
 *
 * No están centradas en la junta, y esa es justo la diferencia entre un piano y
 * un dibujo de un piano: Do# y Re# se reparten simétricos alrededor del Re, y
 * Fa#, Sol# y La# alrededor del Sol#, que sí cae en su junta. Así las tapas de
 * las blancas salen con anchos distintos, como en el instrumento.
 */
const BLACK_CENTER = { 1: 0.95, 3: 2.05, 6: 3.95, 8: 5.0, 10: 6.05 };
const BLACK_WIDTH = 0.55;   // en anchos de tecla blanca
const BLACK_HEIGHT = 0.62;  // en alturas de tecla blanca

// Cuántas blancas hay antes de cada altura dentro de su octava.
const WHITE_BEFORE = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];

function whiteIndex(midi) {
  return Math.floor(midi / 12) * 7 + WHITE_BEFORE[pitchClass(midi)];
}

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

export function countWhites(lo, hi) {
  let count = 0;
  for (let m = lo; m <= hi; m++) if (!isBlackKey(m)) count++;
  return count;
}

/**
 * Construye el teclado en coordenadas de contenido: el cero es la tecla más
 * grave, no el borde de la pantalla. Quien dibuja decide después cuánto se ha
 * deslizado. Separar las dos cosas es lo que permite mover y ampliar el
 * teclado sin tocar ni el dibujo ni la detección de toques.
 */
export function buildLayout(lo, hi, whiteWidth) {
  const base = whiteIndex(lo);
  const keys = [];
  const index = new Map();

  for (let m = lo; m <= hi; m++) {
    if (isBlackKey(m)) continue;
    const key = { midi: m, x: (whiteIndex(m) - base) * whiteWidth, w: whiteWidth, black: false };
    key.topX = key.x;
    key.topW = key.w;
    index.set(m, key);
    keys.push(key);
  }

  for (let m = lo; m <= hi; m++) {
    if (!isBlackKey(m)) continue;
    const octaveStart = whiteIndex(m - pitchClass(m)) - base;
    const center = (octaveStart + BLACK_CENTER[pitchClass(m)]) * whiteWidth;
    const w = whiteWidth * BLACK_WIDTH;
    const key = { midi: m, x: center - w / 2, w, black: true };
    index.set(m, key);
    keys.push(key);
  }

  // La tapa de cada blanca se recorta donde la pisa una negra que se dibuja.
  for (const key of keys) {
    if (key.black) continue;
    const left = index.get(key.midi - 1);
    const right = index.get(key.midi + 1);
    const topX = left && left.black ? left.x + left.w : key.x;
    const topRight = right && right.black ? right.x : key.x + key.w;
    key.topX = topX;
    key.topW = Math.max(2, topRight - topX);
  }

  const whites = countWhites(lo, hi);
  return {
    lo, hi, whiteWidth, whites,
    contentWidth: whites * whiteWidth,
    keys,
    key: (midi) => index.get(midi) || null,
  };
}

/** El ancho de tecla blanca que hace que quepan `visible` blancas a lo ancho. */
export function whiteWidthFor(viewWidth, visibleWhites) {
  return viewWidth / Math.max(3, visibleWhites);
}

export function clampOffset(layout, viewWidth, offset) {
  const max = Math.max(0, layout.contentWidth - viewWidth);
  return Math.max(0, Math.min(max, offset));
}

/** Deja centrado un grupo de notas, para que el teclado siga a la canción. */
export function offsetToCenter(layout, viewWidth, midis) {
  if (!midis || !midis.length) return null;
  let min = Infinity;
  let max = -Infinity;
  for (const midi of midis) {
    const key = layout.key(midi);
    if (!key) continue;
    min = Math.min(min, key.x);
    max = Math.max(max, key.x + key.w);
  }
  if (!isFinite(min)) return null;
  return clampOffset(layout, viewWidth, (min + max) / 2 - viewWidth / 2);
}

const KEY_RADIUS = 5;

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
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

/** La silueta real de una blanca: cuello estrecho arriba, cuerpo ancho abajo. */
function whiteKeyPath(ctx, key, top, height) {
  const neck = height * BLACK_HEIGHT;
  const r = Math.min(KEY_RADIUS, key.w / 3);
  const x = key.x + 0.5;
  const w = key.w - 1;
  const tx = key.topX + 0.5;
  const tw = Math.max(1, key.topW - 1);
  ctx.beginPath();
  ctx.moveTo(tx, top);
  ctx.lineTo(tx + tw, top);
  ctx.lineTo(tx + tw, top + neck);
  ctx.lineTo(x + w, top + neck);
  ctx.lineTo(x + w, top + height - r);
  ctx.quadraticCurveTo(x + w, top + height, x + w - r, top + height);
  ctx.lineTo(x + r, top + height);
  ctx.quadraticCurveTo(x, top + height, x, top + height - r);
  ctx.lineTo(x, top + neck);
  ctx.lineTo(tx, top + neck);
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
  const offset = opts.offset || 0;
  const viewWidth = opts.viewWidth || layout.contentWidth;
  const whiteFill = theme.white || '#eef2f8';
  const blackFill = theme.black || '#161c27';
  const blackH = height * BLACK_HEIGHT;
  const labels = opts.labels || 'none';
  const lang = opts.lang || 'es';

  ctx.save();
  ctx.fillStyle = theme.bed || '#070a10';
  ctx.fillRect(0, top - 3, viewWidth, height + 3);
  ctx.fillStyle = theme.rail || '#2a3547';
  ctx.fillRect(0, top - 3, viewWidth, 3);

  ctx.beginPath();
  ctx.rect(0, top - 3, viewWidth, height + 4);
  ctx.clip();
  ctx.translate(-offset, 0);

  const visible = (key) => key.x + key.w >= offset - 2 && key.x <= offset + viewWidth + 2;

  for (const key of layout.keys) {
    if (key.black || !visible(key)) continue;
    const mark = marks && marks.get(key.midi);
    ctx.fillStyle = mark ? markColor(mark, theme, false) : whiteFill;
    whiteKeyPath(ctx, key, top, height);
    ctx.fill();
    if (!mark) {
      const g = ctx.createLinearGradient(0, top, 0, top + height);
      g.addColorStop(0, 'rgba(0,0,0,0.07)');
      g.addColorStop(0.8, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.24)');
      ctx.fillStyle = g;
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.38)';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (labels !== 'none' && layout.whiteWidth > 22) {
      ctx.fillStyle = mark ? 'rgba(10,13,20,.85)' : 'rgba(30,38,52,.62)';
      ctx.font = `600 ${Math.min(13, layout.whiteWidth * 0.34)}px -apple-system, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      const showOctave = pitchClass(key.midi) === 0 && layout.whiteWidth > 30;
      ctx.fillText(nameFromMidi(key.midi, lang, showOctave), key.x + key.w / 2, top + height - 8);
    }
    if (mark && mark.finger && layout.whiteWidth > 18) {
      drawFinger(ctx, key.x + key.w / 2, top + height - blackH, mark.finger, layout.whiteWidth);
    }
  }

  for (const key of layout.keys) {
    if (!key.black || !visible(key)) continue;
    const mark = marks && marks.get(key.midi);
    ctx.fillStyle = mark ? markColor(mark, theme, true) : blackFill;
    roundRect(ctx, key.x, top, key.w, blackH, Math.min(4, key.w / 3));
    ctx.fill();
    if (!mark) {
      const g = ctx.createLinearGradient(0, top, 0, top + blackH);
      g.addColorStop(0, 'rgba(255,255,255,0.16)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.04)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (labels === 'all' && key.w > 20) {
      ctx.fillStyle = mark ? 'rgba(10,13,20,.9)' : 'rgba(226,234,246,.55)';
      ctx.font = `600 ${Math.min(10, key.w * 0.4)}px -apple-system, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(nameFromMidi(key.midi, lang), key.x + key.w / 2, top + blackH - 6);
    }
    if (mark && mark.finger && key.w > 14) {
      drawFinger(ctx, key.x + key.w / 2, top + blackH * 0.42, mark.finger, key.w * 1.5);
    }
  }
  ctx.restore();
}

/**
 * La barra de desplazamiento: enseña el teclado entero en pequeño y dónde
 * estás mirando. Se arrastra, y así tocar y moverse no se pisan.
 */
export function drawPanStrip(ctx, layout, top, height, offset, viewWidth, opts = {}) {
  const theme = opts.theme || {};
  if (layout.contentWidth <= viewWidth + 1) return null;
  const scale = viewWidth / layout.contentWidth;
  const windowX = offset * scale;
  const windowW = Math.max(26, viewWidth * scale);

  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  roundRect(ctx, 0, top, viewWidth, height, height / 2);
  ctx.fill();

  // Las notas que vienen, marcadas en pequeño: se ve hacia dónde moverse.
  if (opts.marks) {
    for (const [midi, mark] of opts.marks) {
      const key = layout.key(midi);
      if (!key) continue;
      ctx.fillStyle = mark.hand === 'L' ? (theme.left || '#ffb24a') : (theme.right || '#3ddcc4');
      ctx.fillRect(key.x * scale, top + 1, Math.max(2, key.w * scale), height - 2);
    }
  }

  ctx.fillStyle = 'rgba(167,139,250,0.35)';
  roundRect(ctx, windowX, top, windowW, height, height / 2);
  ctx.fill();
  ctx.strokeStyle = theme.accent || '#a78bfa';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
  return { x: windowX, w: windowW, scale };
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

/** Qué tecla hay en (x, y), ya contando lo que se haya deslizado. */
export function keyAt(layout, x, y, top, height, offset = 0) {
  if (y < top || y > top + height) return null;
  const cx = x + offset;
  const blackH = height * BLACK_HEIGHT;
  if (y <= top + blackH) {
    for (const key of layout.keys) {
      if (key.black && cx >= key.x && cx <= key.x + key.w) return key.midi;
    }
    for (const key of layout.keys) {
      if (!key.black && cx >= key.topX && cx <= key.topX + key.topW) return key.midi;
    }
    return null;
  }
  for (const key of layout.keys) {
    if (!key.black && cx >= key.x && cx <= key.x + key.w) return key.midi;
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
 * desconectar. `getGeometry` dice dónde está el teclado y cuánto se ha
 * deslizado; si devuelve `pan`, ese trozo arrastra en vez de tocar.
 */
export function attachPointerInput(canvas, getGeometry, handlers) {
  const active = new Map();   // pointerId -> midi
  const dragging = new Map(); // pointerId -> arrastre en curso

  const toLocal = (ev) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return {
      x: (ev.clientX - rect.left) * (canvas.width / canvas.clientWidth / dpr),
      y: (ev.clientY - rect.top) * (canvas.height / canvas.clientHeight / dpr),
    };
  };

  /** Dónde cayó el dedo: en la barra, en el carril de las notas, o en una tecla. */
  const dragZone = (geo, y) => {
    if (!handlers.onPan) return null;
    if (geo.pan && y >= geo.pan.top && y <= geo.pan.top + geo.pan.height) {
      return { scale: geo.pan.scale || 1, jump: true };
    }
    if (geo.rollDrag && y >= geo.rollDrag.top && y < geo.rollDrag.top + geo.rollDrag.height) {
      // Arrastrar sobre las notas: el teclado sigue al dedo, como un mapa.
      return { scale: -1, jump: false };
    }
    return null;
  };

  const down = (ev) => {
    const geo = getGeometry();
    if (!geo) return;
    const { x, y } = toLocal(ev);

    const zone = dragZone(geo, y);
    if (zone) {
      ev.preventDefault();
      canvas.setPointerCapture && canvas.setPointerCapture(ev.pointerId);
      dragging.set(ev.pointerId, { startX: x, startOffset: geo.offset || 0, scale: zone.scale });
      // En la barra, tocar fuera de la ventana salta ahí directamente.
      if (zone.jump) handlers.onPan(x / zone.scale - (geo.viewWidth || 0) / 2);
      return;
    }

    const midi = keyAt(geo.layout, x, y, geo.top, geo.height, geo.offset || 0);
    if (midi == null) return;
    ev.preventDefault();
    canvas.setPointerCapture && canvas.setPointerCapture(ev.pointerId);
    active.set(ev.pointerId, midi);
    handlers.onDown(midi);
  };

  const move = (ev) => {
    const drag = dragging.get(ev.pointerId);
    if (drag && handlers.onPan) {
      const { x } = toLocal(ev);
      handlers.onPan(drag.startOffset + (x - drag.startX) / drag.scale);
      return;
    }
    if (!active.has(ev.pointerId)) return;
    const geo = getGeometry();
    if (!geo) return;
    const { x, y } = toLocal(ev);
    const midi = keyAt(geo.layout, x, y, geo.top, geo.height, geo.offset || 0);
    const previous = active.get(ev.pointerId);
    if (midi != null && midi !== previous) {
      handlers.onUp(previous);
      active.set(ev.pointerId, midi);
      handlers.onDown(midi);
    }
  };

  const up = (ev) => {
    dragging.delete(ev.pointerId);
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
    dragging.clear();
  };
}
