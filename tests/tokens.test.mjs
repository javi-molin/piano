// Comprueba que los tokens de diseño no se separen entre sus tres copias:
// replica/design/tokens.json (el origen), styles.css (lo que ve el navegador)
// y src/tokens.js (lo que necesita el canvas).
//   node tests/tokens.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COLOR } from '../src/tokens.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tokens = JSON.parse(fs.readFileSync(path.join(ROOT, 'replica/design/tokens.json'), 'utf8'));
const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');

let checked = 0;
for (const [name, value] of Object.entries(tokens.color)) {
  assert.equal(COLOR[name], value, `src/tokens.js: ${name} debería ser ${value}`);
  assert.ok(css.includes(`--c-${name}: ${value};`), `styles.css: falta --c-${name}: ${value}`);
  checked++;
}
for (const [name, value] of Object.entries(tokens.radius)) {
  assert.ok(css.includes(`--r-${name}: ${value}px;`), `styles.css: falta --r-${name}`);
  checked++;
}

// Ningún componente puede escribir un color suelto fuera del bloque :root.
const body = css.slice(css.indexOf('}', css.indexOf(':root')) + 1);
const strayHex = [...body.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
assert.deepEqual(strayHex, [], `hex suelto en styles.css fuera de :root: ${strayHex.join(', ')}`);

console.log(`\x1b[32m${checked} tokens alineados, sin colores sueltos\x1b[0m`);
