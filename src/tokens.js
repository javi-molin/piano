// tokens.js — generado a mano desde replica/design/tokens.json (una sola fuente).
// El canvas necesita los colores como cadenas; la hoja de estilos los repite
// como custom properties. tests/tokens.test.mjs comprueba que no se separen.

export const COLOR = {
  'bg': '#0a0d14',
  'surface': '#141a26',
  'surface-2': '#1d2533',
  'border': '#2a3547',
  'border-input': '#8294ae',
  'text': '#f3f6fb',
  'text-muted': '#a3b4cb',
  'accent': '#a78bfa',
  'on-accent': '#120a26',
  'hand-right': '#3ddcc4',
  'hand-left': '#ffb24a',
  'danger': '#ff7a7a',
  'success': '#5fe08f',
  'warn': '#ffd166',
};

/** Lo que necesitan drawKeyboard y drawRoll. */
export const THEME = {
  right: COLOR['hand-right'],
  left: COLOR['hand-left'],
  success: COLOR.success,
  danger: COLOR.danger,
  warn: COLOR.warn,
  accent: COLOR.accent,
  rollBg: COLOR.bg,
  bed: '#070a10',
  rail: COLOR.border,
  white: '#eef2f8',
  black: '#161c27',
};

export const RADIUS = {"sm": 8, "md": 14, "lg": 22, "pill": 999};
export const TOUCH = {"min": 44, "key-white-w": 56, "key-black-w": 34};
