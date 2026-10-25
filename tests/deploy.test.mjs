// Comprueba que el despliegue puede hacer su trabajo.
//   node tests/deploy.test.mjs
//
// El service worker sirve del caché primero. Si al publicar no se cambia el
// nombre del caché, un iPad que ya tenga la app instalada se queda con la
// versión vieja para siempre. Como ahora se publica solo, nadie va a acordarse
// de subir ese número a mano: lo sella el despliegue, y esto vigila que la
// línea que sella siga existiendo tal cual.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const workflow = fs.readFileSync(path.join(ROOT, '.github/workflows/pages.yml'), 'utf8');

const PLACEHOLDER = "const VERSION = 'cascada-dev';";
assert.ok(sw.includes(PLACEHOLDER), `sw.js ya no tiene la línea que sella el despliegue: ${PLACEHOLDER}`);
assert.ok(
  workflow.includes("sed -i \"s/const VERSION = 'cascada-dev';/const VERSION = '$marca';/\" _site/sw.js"),
  'el flujo de despliegue ya no sella la versión del service worker',
);
assert.ok(workflow.includes('grep -q'), 'el flujo no comprueba que el sellado haya funcionado');

// Y que publicar siga dependiendo de que las pruebas pasen.
const publishJob = workflow.slice(workflow.indexOf('  publicar:'));
assert.ok(publishJob.includes('needs: pruebas'), 'publicar debe depender de las pruebas');

// Todo lo que se publica tiene que estar en la lista de copiado.
const copied = workflow.slice(workflow.indexOf('Preparar el sitio'), workflow.indexOf('Sellar la versión'));
for (const file of ['index.html', 'styles.css', 'manifest.webmanifest', 'sw.js']) {
  assert.ok(copied.includes(file), `el despliegue no copia ${file}`);
}
for (const folder of ['src', 'assets']) {
  assert.ok(copied.includes(folder), `el despliegue no copia la carpeta ${folder}`);
}

// Y el service worker tiene que seguir guardando todos los módulos.
const listed = new Set([...sw.matchAll(/'(src\/[^']+\.js)'/g)].map((m) => m[1]));
for (const file of fs.readdirSync(path.join(ROOT, 'src'))) {
  assert.ok(listed.has(`src/${file}`), `sw.js no guarda src/${file}: sin conexión faltaría`);
}

console.log('\x1b[32mel despliegue puede sellar la versión y lleva todo lo que hace falta\x1b[0m');
