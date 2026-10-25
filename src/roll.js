// roll.js — el piano-roll: las notas que caen.
//
// Una nota que empieza en el beat t aterriza con su borde inferior justo sobre
// la línea de ataque en el momento t. Esa es toda la geometría; el resto es
// pintar poco y rápido, dibujando solo lo que está en pantalla.

import { beatsPerBar } from './score.js';
import { roundRect } from './keyboard.js';

export function drawRoll(ctx, view) {
  const {
    layout, song, beat, pxPerBeat, rollTop, hitLine,
    hands = 'both', states, loop, theme = {}, waiting = false,
    showFingers = true, showNames = false, lang = 'es', nameFor,
  } = view;

  const bpb = beatsPerBar(song.meter);
  const width = layout.width;
  const lookAhead = (hitLine - rollTop) / pxPerBeat;
  const from = beat - 1.5;
  const to = beat + lookAhead + 1;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, rollTop, width, hitLine - rollTop + 2);
  ctx.clip();

  // Fondo y carriles de las teclas negras: orienta la vista sin pesar nada.
  ctx.fillStyle = theme.rollBg || '#0a0d14';
  ctx.fillRect(0, rollTop, width, hitLine - rollTop + 2);
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (const key of layout.keys) {
    if (!key.black) continue;
    ctx.fillRect(key.x, rollTop, key.w, hitLine - rollTop);
  }

  // Zona de bucle.
  if (loop && loop.active) {
    const yStart = hitLine - (loop.start - beat) * pxPerBeat;
    const yEnd = hitLine - (loop.end - beat) * pxPerBeat;
    ctx.fillStyle = 'rgba(167,139,250,0.08)';
    ctx.fillRect(0, Math.min(yStart, yEnd), width, Math.abs(yEnd - yStart));
  }

  // Rejilla.
  const firstBeat = Math.ceil(from);
  ctx.lineWidth = 1;
  ctx.font = '600 11px -apple-system, system-ui, sans-serif';
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'left';
  for (let b = firstBeat; b <= to; b++) {
    const y = hitLine - (b - beat) * pxPerBeat;
    if (y < rollTop - 1 || y > hitLine + 1) continue;
    const isBar = Math.abs(b % bpb) < 1e-6;
    ctx.strokeStyle = isBar ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)';
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
    ctx.stroke();
    if (isBar) {
      ctx.fillStyle = 'rgba(163,180,203,0.55)';
      ctx.fillText(String(Math.round(b / bpb) + 1), 6, y - 3);
    }
  }

  // Final de la canción.
  const endY = hitLine - (song.lengthBeats - beat) * pxPerBeat;
  if (endY > rollTop && endY < hitLine) {
    ctx.strokeStyle = 'rgba(95,224,143,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, endY);
    ctx.lineTo(width, endY);
    ctx.stroke();
  }

  // Notas.
  const right = theme.right || '#3ddcc4';
  const left = theme.left || '#ffb24a';
  const pulse = waiting ? 0.78 + 0.22 * Math.sin(Date.now() / 140) : 1;

  for (const n of song.notes) {
    if (n.t > to) break;
    if (n.t + n.d < from) continue;
    const key = layout.key(n.midi);
    if (!key) continue;
    const played = hands === 'both' || hands === n.hand;
    const st = states ? states[n.i] : null;
    const bottom = hitLine - (n.t - beat) * pxPerBeat;
    const h = Math.max(7, n.d * pxPerBeat - 2);
    const top = bottom - h;
    if (bottom < rollTop || top > hitLine) continue;

    const inset = key.black ? 1.5 : 2.5;
    const x = key.x + inset;
    const w = Math.max(4, key.w - inset * 2);
    const base = n.hand === 'L' ? left : right;

    let fill = base;
    let alpha = 1;
    if (!played) { alpha = 0.3; }
    if (st === 'hit') { fill = theme.success || '#5fe08f'; }
    else if (st === 'miss') { fill = theme.danger || '#ff7a7a'; alpha = 0.65; }
    else if (st === 'expect' && waiting) { alpha = pulse; }

    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    roundRect(ctx, x, top, w, h, Math.min(6, w / 2.4));
    ctx.fill();

    // Un filo claro arriba: deja ver dónde empieza cada nota en un acorde.
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(x + 1, top + 1, w - 2, Math.min(3, h / 3));

    if (!played) {
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = base;
      ctx.lineWidth = 1.5;
      roundRect(ctx, x, top, w, h, Math.min(6, w / 2.4));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if (h > 16 && w > 15) {
      const label = showNames && nameFor ? nameFor(n.midi) : (showFingers && n.finger ? String(n.finger) : '');
      if (label) {
        ctx.fillStyle = 'rgba(10,13,20,0.82)';
        ctx.font = `700 ${Math.min(13, w * 0.5)}px -apple-system, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x + w / 2, bottom - Math.min(h / 2, 13));
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Línea de ataque.
  ctx.save();
  const glow = ctx.createLinearGradient(0, hitLine - 26, 0, hitLine);
  glow.addColorStop(0, 'rgba(167,139,250,0)');
  glow.addColorStop(1, 'rgba(167,139,250,0.22)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, hitLine - 26, width, 26);
  ctx.strokeStyle = waiting ? (theme.warn || '#ffd166') : (theme.accent || '#a78bfa');
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, hitLine + 1);
  ctx.lineTo(width, hitLine + 1);
  ctx.stroke();
  ctx.restore();
}

/** Marcas para el teclado: qué teclas hay que tocar ahora y qué está sonando. */
export function keyboardMarks(view) {
  const { song, beat, states, hands, pressed, window: tol = 0.35, autoWindow = 0.08 } = view;
  const marks = new Map();
  for (const n of song.notes) {
    if (n.t > beat + tol) break;
    if (n.t + n.d < beat - tol) continue;
    const played = hands === 'both' || hands === n.hand;
    const st = states ? states[n.i] : null;
    if (played) {
      if (st === 'hit' && n.t <= beat && n.t + n.d > beat - 0.2) {
        marks.set(n.midi, { state: 'hit', hand: n.hand, finger: n.finger });
      } else if (st === 'miss' && Math.abs(n.t - beat) < tol) {
        marks.set(n.midi, { state: 'miss', hand: n.hand, finger: n.finger });
      } else if ((!st || st === 'expect') && Math.abs(n.t - beat) < tol) {
        // 'expect' solo dice "esta es la que viene": tiene que iluminar la tecla
        // igual que una nota todavía sin estado.
        marks.set(n.midi, { state: 'expect', hand: n.hand, finger: n.finger });
      }
    } else if (Math.abs(n.t - beat) < autoWindow || (n.t <= beat && n.t + n.d > beat)) {
      if (!marks.has(n.midi)) marks.set(n.midi, { state: 'auto', hand: n.hand, finger: 0 });
    }
  }
  if (pressed) {
    for (const midi of pressed) marks.set(midi, { state: 'press', hand: 'R', finger: 0 });
  }
  return marks;
}

/** Mapa de calor por compás: dónde se falla. Alimenta la pantalla de resultados. */
export function barHeatmap(song, states) {
  const bpb = beatsPerBar(song.meter);
  const bars = [];
  for (const n of song.notes) {
    const bar = Math.floor(n.t / bpb);
    if (!bars[bar]) bars[bar] = { bar: bar + 1, total: 0, hit: 0, miss: 0 };
    const st = states[n.i];
    if (st === 'hit' || st === 'miss') {
      bars[bar].total++;
      if (st === 'hit') bars[bar].hit++;
      else bars[bar].miss++;
    }
  }
  return bars.filter(Boolean);
}
