// Pruebas de extremo a extremo con un navegador de verdad.
//   node tests/e2e.mjs            (sin ventana)
//   node tests/e2e.mjs --headed   (con ventana, para mirar)
//
// Levanta un servidor estático sobre el propio proyecto y recorre los flujos
// del mapa de recon: F01 primer uso, F02 importar, F03 aprender, F04 dominar,
// F05 practicar un trozo, F07 racha, F08 improvisar.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const HEADED = process.argv.includes('--headed');

async function loadPlaywright() {
  const candidates = ['playwright', '/opt/node-tools/node_modules/playwright/index.js'];
  for (const candidate of candidates) {
    try {
      const mod = await import(candidate);
      return mod.chromium || (mod.default && mod.default.chromium);
    } catch (e) { /* probamos el siguiente */ }
  }
  throw new Error('Playwright no está instalado. Instálalo con: npm i -D playwright');
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mid': 'audio/midi',
};

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (url.pathname === '/' || url.pathname === '') file = path.join(ROOT, 'index.html');
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('no');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

// ------------------------------------------------------------- mini runner
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
function assert(condition, message) {
  if (!condition) throw new Error(message || 'falló');
}
function equal(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message || 'distinto'}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`);
}

// ------------------------------------------------------------------ flujos

/**
 * Corta cualquier petición que salga de la máquina.
 *
 * Sin esto, un stub que no case deja la prueba hablando con internet de verdad
 * y el resultado depende de la red y de la versión de Playwright: los patrones
 * con comodines no se interpretan igual en todas. Con el corte, un stub mal
 * puesto falla en voz alta en vez de pasar por suerte.
 */
async function sealOffline(page) {
  await page.route(/^https?:\/\//, (route) => {
    const { hostname } = new URL(route.request().url());
    if (hostname === '127.0.0.1' || hostname === 'localhost') return route.continue();
    return route.abort();
  });
}

async function fresh(context, base, { onboard = true } = {}) {
  const page = await context.newPage();
  await sealOffline(page);
  const problems = [];
  page.on('pageerror', (e) => problems.push(`PAGEERROR ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`CONSOLE ${m.text()}`); });
  page.problems = problems;
  await page.goto(`${base}/index.html`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  if (onboard) {
    if (await page.locator('[data-screen="onboarding"]').isVisible()) {
      await page.click('#onboard-done');
      await page.waitForTimeout(150);
    }
  }
  return page;
}

test('F01 el primer uso lleva del onboarding al catálogo', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base, { onboard: false });
  assert(await page.locator('[data-screen="onboarding"]').isVisible(), 'no aparece el onboarding');
  await page.click('[data-onboard-names="en"]');
  await page.click('#onboard-done');
  await page.waitForTimeout(200);
  assert(await page.locator('[data-screen="catalog"]').isVisible(), 'no saltó al catálogo');
  equal(await page.locator('#catalog-grid .card').count(), 14, 'número de piezas del catálogo');
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  assert(!(await page.locator('[data-screen="onboarding"]').isVisible()), 'el onboarding volvió a salir');
  equal(await page.evaluate(() => JSON.parse(localStorage.getItem('cascada.settings')).noteNames), 'en', 'no guardó el idioma de las notas');
  equal(page.problems.length, 0, `errores de consola: ${page.problems.join(' | ')}`);
  await page.close();
});

test('F03 modo aprender: espera, acierta y suma precisión', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.click('[data-tab="catalog"]');
  await page.click('#catalog-grid .card:has-text("Estrellita")');
  await page.click('[data-hands="R"]');
  await page.click('#song-start');
  await page.waitForTimeout(300);
  assert(await page.locator('#player').isVisible(), 'no se abrió el reproductor');

  // Se salta la claqueta y se espera a que pida la primera nota.
  await page.waitForFunction(() => window.__cascada.player && window.__cascada.player.waiting, null, { timeout: 8000 });
  const beatBefore = await page.evaluate(() => window.__cascada.player.beat);
  await page.waitForTimeout(600);
  const beatAfter = await page.evaluate(() => window.__cascada.player.beat);
  equal(beatAfter, beatBefore, 'el tiempo avanzó sin tocar la nota');

  // Las primeras notas de Estrellita (mano derecha): Do Do Sol Sol La La Sol.
  const midis = [60, 60, 67, 67, 69, 69, 67];
  for (const midi of midis) {
    await page.evaluate((m) => window.__cascada.press(m), midi);
    await page.waitForTimeout(60);
  }
  const stats = await page.evaluate(() => ({ ...window.__cascada.player.stats }));
  equal(stats.hits, midis.length, 'notas acertadas');
  equal(stats.wrong, 0, 'notas equivocadas');
  assert(stats.maxCombo >= midis.length, 'la racha de seguidas no subió');
  equal(page.problems.length, 0, `errores de consola: ${page.problems.join(' | ')}`);
  await page.close();
});

test('F03 una nota equivocada cuenta pero no bloquea', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.click('[data-tab="catalog"]');
  await page.click('#catalog-grid .card:has-text("Estrellita")');
  await page.click('[data-hands="R"]');
  await page.click('#song-start');
  await page.waitForFunction(() => window.__cascada.player && window.__cascada.player.waiting, null, { timeout: 8000 });
  await page.evaluate(() => window.__cascada.press(61));
  await page.waitForTimeout(80);
  equal(await page.evaluate(() => window.__cascada.player.stats.wrong), 1, 'no contó la nota equivocada');
  assert(await page.evaluate(() => window.__cascada.player.waiting), 'dejó de esperar con la nota equivocada');
  await page.evaluate(() => window.__cascada.press(60));
  await page.waitForTimeout(80);
  assert(!(await page.evaluate(() => window.__cascada.player.waiting)), 'no siguió tras acertar');
  await page.close();
});

test('F03 pausar detiene el tiempo y seguir lo reanuda', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.click('[data-tab="catalog"]');
  await page.click('#catalog-grid .card:has-text("Oda a la Alegría")');
  await page.click('[data-mode="listen"]');
  await page.click('#song-start');
  await page.waitForTimeout(900);
  await page.click('#player-pause');
  assert(await page.locator('#player-paused').isVisible(), 'no salió el cartel de pausa');
  const beat = await page.evaluate(() => window.__cascada.player.beat);
  await page.waitForTimeout(700);
  equal(await page.evaluate(() => window.__cascada.player.beat), beat, 'el beat se movió en pausa');
  await page.click('#resume-btn');
  await page.waitForTimeout(500);
  assert(await page.evaluate(() => window.__cascada.player.beat) > beat, 'no reanudó');
  await page.close();
});

test('F05 practicar una sección limita lo que se juzga, y el bucle da la vuelta', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.click('[data-tab="catalog"]');
  await page.click('#catalog-grid .card:has-text("Estrellita")');
  const sections = await page.locator('.section-row').count();
  assert(sections >= 2, `esperaba varias secciones, hay ${sections}`);
  await page.click('[data-mode="play"]');
  await page.locator('.section-row').nth(1).locator('button:has-text("En bucle")')
    .click();
  await page.waitForTimeout(400);
  const range = await page.evaluate(() => ({ ...window.__cascada.player.range }));
  assert(range.start > 0, 'la sección no empieza más allá del principio');
  assert(await page.evaluate(() => window.__cascada.player.loopEnabled), 'el bucle no está activo');
  const judged = await page.evaluate(() => window.__cascada.player.judged.length);
  const total = await page.evaluate(() => window.__cascada.player.song.notes.length);
  assert(judged < total, 'se están juzgando notas de fuera de la sección');
  await page.evaluate(() => { window.__cascada.player.setSpeed(2); });
  await page.waitForFunction(() => window.__cascada.player.passes >= 1, null, { timeout: 15000 });
  assert(await page.evaluate(() => window.__cascada.player.beat) < range.end, 'no volvió al principio del trozo');
  await page.close();
});

test('F04 al terminar aparecen los resultados y queda registrado', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.click('[data-tab="catalog"]');
  await page.click('#catalog-grid .card:has-text("Minueto en Sol")');
  await page.click('[data-mode="mastery"]');
  await page.click('#song-start');
  await page.waitForTimeout(300);
  // Se acelera al máximo y se dejan pasar las notas: interesa el final, no el puntaje.
  await page.evaluate(() => { window.__cascada.player.setSpeed(2); });
  await page.waitForSelector('#results:not([hidden])', { timeout: 30000 });
  assert(await page.locator('#result-headline').isVisible(), 'sin titular de resultados');
  assert((await page.locator('.heat').count()) > 0, 'sin mapa de calor por compás');
  const attempts = await page.evaluate(() => JSON.parse(localStorage.getItem('cascada.attempts') || '[]'));
  equal(attempts.length, 1, 'no se guardó el intento');
  const streak = await page.evaluate(() => JSON.parse(localStorage.getItem('cascada.streak')));
  assert(streak.current >= 1, 'la racha no arrancó');
  await page.click('#result-close');
  assert(await page.locator('[data-screen="song"]').isVisible(), 'no volvió al detalle');
  await page.close();
});

test('F04 si no tocas nada, el resultado lo dice: 0 % y compases en rojo', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.click('[data-tab="catalog"]');
  await page.click('#catalog-grid .card:has-text("Minueto en Sol")');
  await page.click('[data-mode="play"]');
  await page.click('#song-start');
  await page.waitForTimeout(300);
  await page.evaluate(() => { window.__cascada.player.setSpeed(2); });
  await page.waitForSelector('#results:not([hidden])', { timeout: 30000 });
  const misses = Number(await page.locator('.stat:has-text("perdidas") b').textContent());
  assert(misses > 20, `esperaba muchas notas perdidas, hubo ${misses}`);
  equal(await page.locator('.heat[data-ok="1"]').count(), 0, 'hay compases en verde sin haber tocado nada');
  const advice = await page.locator('#result-advice').textContent();
  assert(!/limpio/i.test(advice), `el consejo felicita por nada: "${advice}"`);
  await page.close();
});

test('F02 importar un MIDI añade una canción a la biblioteca', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.click('[data-tab="library"]');
  await page.click('#add-song');
  assert(await page.locator('#add-sheet').isVisible(), 'no se abrió la hoja de añadir');
  await page.setInputFiles('#file-input', ctx.midiPath);
  await page.waitForSelector('[data-screen="song"]:not([hidden])', { timeout: 10000 });
  const title = await page.locator('#song-title').textContent();
  assert(title.includes('prueba'), `título inesperado: ${title}`);
  assert(await page.locator('#song-delete').isVisible(), 'una canción importada debería poder borrarse');
  await page.click('[data-tab="library"]');
  equal(await page.locator('#library-grid .card').count(), 1, 'la importada no está en la biblioteca');
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  equal(await page.locator('#library-grid .card').count(), 1, 'no sobrevivió a recargar');
  equal(page.problems.length, 0, `errores de consola: ${page.problems.join(' | ')}`);
  await page.close();
});

test('F02 un archivo que no es MIDI avisa en vez de romperse', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.click('[data-tab="library"]');
  await page.click('#add-song');
  await page.setInputFiles('#file-input', ctx.junkPath);
  await page.waitForTimeout(1200);
  const status = await page.locator('#import-status').textContent();
  assert(status && status.length > 5, 'no dijo nada sobre el archivo malo');
  assert(await page.locator('#add-sheet').isVisible(), 'cerró la hoja pese al error');
  await page.close();
});

test('F08 el juego libre suena y graba lo que tocas', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.click('[data-tab="free"]');
  assert(await page.locator('#free-canvas').isVisible(), 'sin teclado libre');
  await page.click('#free-record');
  for (const key of ['z', 'x', 'c', 'v']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(90);
  }
  await page.click('#free-record');
  await page.waitForTimeout(400);
  await page.click('[data-tab="library"]');
  const cards = await page.locator('#library-grid .card').count();
  equal(cards, 1, 'la grabación no llegó a la biblioteca');
  await page.close();
});

test('los ajustes se guardan y cambian lo que se ve', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.click('#open-settings');
  await page.click('[data-names="en"]');
  await page.click('[data-labels="all"]');
  await page.locator('#set-fingers').uncheck();
  const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('cascada.settings')));
  equal(settings.noteNames, 'en', 'nombres de nota');
  equal(settings.labels, 'all', 'etiquetas');
  equal(settings.showFingers, false, 'dedos');
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await page.click('#open-settings');
  equal(await page.locator('[data-names="en"]').getAttribute('aria-checked'), 'true', 'no recordó el ajuste');
  await page.close();
});

test('exportar la biblioteca descarga un archivo con todo dentro', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.click('#open-settings');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 10000 }),
    page.click('#export-library'),
  ]);
  const file = await download.path();
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  equal(data.app, 'cascada', 'la copia no se identifica');
  assert('songs' in data && 'progress' in data && 'settings' in data, 'faltan trozos en la copia');
  await page.close();
});

test('se puede llegar a tocar solo con el teclado del ordenador', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.keyboard.press('Tab');
  let guard = 0;
  while (guard++ < 60) {
    const label = await page.evaluate(() => (document.activeElement && document.activeElement.textContent || '').trim());
    if (label.includes('Catálogo')) break;
    await page.keyboard.press('Tab');
  }
  assert(guard < 60, 'no se llega al catálogo con el tabulador');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  assert(await page.locator('[data-screen="catalog"]').isVisible(), 'Enter no abrió el catálogo');
  await page.close();
});

test('el service worker queda registrado para el modo sin conexión', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  const registered = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return !!registration;
  });
  assert(registered, 'no se registró el service worker');
  await page.close();
});

test('funciona en el ancho de un móvil sin desbordarse', async (ctx) => {
  const page = await ctx.context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${ctx.base}/index.html`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  if (await page.locator('[data-screen="onboarding"]').isVisible()) await page.click('#onboard-done');
  await page.waitForTimeout(200);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(overflow <= 1, `la página se desborda ${overflow}px a lo ancho`);
  await page.close();
});

// ------------------------------------------------- el piano que tienes tú
test('decir el tamaño de tu piano encaja la canción dentro de él', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.click('#open-settings');
  await page.click('[data-piano="25"]');
  await page.click('[data-outofrange="fold"]');
  const range = await page.evaluate(() => JSON.parse(localStorage.getItem('cascada.settings')));
  equal(range.pianoKeys, 25, 'no guardó el tamaño del piano');

  await page.click('[data-tab="catalog"]');
  await page.click('#catalog-grid .card:has-text("Claro de luna")');
  await page.waitForTimeout(200);
  assert(await page.locator('#fit-notice').isVisible(), 'no avisa de que la pieza no cabe');
  const notice = await page.locator('#fit-notice').textContent();
  assert(/octava más cercana/.test(notice), `aviso inesperado: ${notice}`);

  const outside = await page.evaluate(() => {
    const { lo, hi } = window.__cascada.state.fit.range;
    return window.__cascada.state.song.notes.filter((n) => n.midi < lo || n.midi > hi).length;
  });
  equal(outside, 0, 'quedaron notas fuera del teclado del usuario');
  equal(page.problems.length, 0, `errores de consola: ${page.problems.join(' | ')}`);
  await page.close();
});

test('omitir deja fuera las notas que no tienes, y se nota en el total', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.click('[data-tab="catalog"]');
  await page.click('#catalog-grid .card:has-text("Claro de luna")');
  const before = await page.evaluate(() => window.__cascada.state.song.notes.length);

  await page.click('#open-settings');
  await page.click('[data-piano="25"]');
  await page.click('[data-outofrange="skip"]');
  await page.click('[data-tab="catalog"]');
  await page.click('#catalog-grid .card:has-text("Claro de luna")');
  const after = await page.evaluate(() => window.__cascada.state.song.notes.length);
  assert(after < before, `omitir debería dejar menos notas: ${after} vs ${before}`);
  assert(/se omiten|se omite/.test(await page.locator('#fit-notice').textContent()), 'no dice que las omite');
  await page.close();
});

test('lo que se esconde con hidden está escondido de verdad', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.click('[data-tab="catalog"]');
  await page.click('#catalog-grid .card:has-text("Estrellita")');
  // Una pieza del catálogo no se puede borrar: el botón no debe verse.
  assert(!(await page.locator('#song-delete').isVisible()), 'el botón de borrar sale en una pieza del catálogo');
  await page.click('[data-tab="library"]');
  await page.click('#add-song');
  assert(!(await page.locator('#link-routes').isVisible()), 'los caminos del enlace salen sin haber pegado nada');
  assert(!(await page.locator('#capture-panel').isVisible()), 'la grabación sale sin haberla empezado');
  assert(!(await page.locator('#transcribe-bpm-field').isVisible()), 'el tempo manual sale con el automático puesto');
  await page.keyboard.press('Escape');
  await page.click('[data-tab="free"]');
  assert(!(await page.locator('#free-record-label').isVisible()), 'el cronómetro sale sin estar grabando');
  await page.close();
});

test('sin límite de teclas no hay aviso ni se toca la canción', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.click('[data-tab="catalog"]');
  await page.click('#catalog-grid .card:has-text("Claro de luna")');
  assert(!(await page.locator('#fit-notice').isVisible()), 'avisa sin que haya límite puesto');
  await page.close();
});

// ------------------------------------------------------------------ tono
test('subir una octava mueve la canción entera y se recuerda', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.click('[data-tab="catalog"]');
  await page.click('#catalog-grid .card:has-text("Estrellita")');
  const before = await page.evaluate(() => window.__cascada.state.song.notes.map((n) => n.midi));
  await page.click('#transpose-oct-up');
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => window.__cascada.state.song.notes.map((n) => n.midi));
  equal(after.length, before.length, 'se perdieron notas al transponer');
  assert(after.every((m, i) => m - before[i] === 12), 'no subió exactamente una octava');
  const label = await page.locator('#detail-transpose-out').textContent();
  assert(/una octava arriba/.test(label), `etiqueta inesperada: ${label}`);

  await page.click('#transpose-down');
  await page.waitForTimeout(100);
  assert(/11 semitonos arriba/.test(await page.locator('#detail-transpose-out').textContent()), 'el ajuste fino no funciona');

  await page.click('#transpose-reset');
  await page.waitForTimeout(100);
  equal(await page.locator('#detail-transpose-out').textContent(), 'tono original');

  await page.click('#transpose-oct-down');
  await page.click('[data-tab="catalog"]');
  await page.click('#catalog-grid .card:has-text("Estrellita")');
  await page.waitForTimeout(150);
  assert(/una octava abajo/.test(await page.locator('#detail-transpose-out').textContent()), 'no recordó el tono de la canción');
  equal(page.problems.length, 0, `errores de consola: ${page.problems.join(' | ')}`);
  await page.close();
});

// --------------------------------------------- enlaces de YouTube/Spotify
test('un enlace de YouTube lleva a los dos caminos que sí funcionan', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  // Una expresión regular se interpreta igual en todas las versiones; los
  // comodines de Playwright, no (fue justo lo que rompió esta prueba en CI).
  await page.route(/\/oembed/, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ title: 'Estudio de prueba', author_name: 'Alguien' }),
  }));
  await page.click('[data-tab="library"]');
  await page.click('#add-song');
  await page.fill('#url-input', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.click('#url-go');
  await page.waitForSelector('#link-routes:not([hidden])', { timeout: 8000 });
  const head = await page.locator('#route-title').textContent();
  assert(/Estudio de prueba/.test(head), `no leyó el título: ${head}`);
  assert((await page.locator('#route-search a').count()) >= 1, 'no ofrece buscar un MIDI');
  const href = await page.locator('#route-search a').first().getAttribute('href');
  assert(/midi/i.test(decodeURIComponent(href)), `la búsqueda no busca un midi: ${href}`);
  assert(await page.locator('#capture-mic').isVisible(), 'no ofrece transcribir de oído');
  const why = await page.locator('#route-why').textContent();
  assert(/no lleva las notas dentro/.test(why), 'no explica por qué el enlace no basta');
  equal(page.problems.length, 0, `errores de consola: ${page.problems.join(' | ')}`);
  await page.close();
});

test('si el título no se puede leer, los caminos siguen estando', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  // El corte de red ya lo tumba; esto lo deja dicho en la propia prueba.
  await page.route(/\/oembed/, (route) => route.abort());
  await page.click('[data-tab="library"]');
  await page.click('#add-song');
  await page.fill('#url-input', 'https://open.spotify.com/track/abc123');
  await page.click('#url-go');
  await page.waitForSelector('#link-routes:not([hidden])', { timeout: 8000 });
  assert(/Spotify/.test(await page.locator('#route-title').textContent()), 'no identifica el servicio');
  assert(await page.locator('#capture-mic').isVisible(), 'sin título ya no deja transcribir');
  await page.close();
});

test('escuchar y transcribir abre la grabación y se puede cancelar', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.click('[data-tab="library"]');
  await page.click('#add-song');
  await page.fill('#url-input', 'https://youtu.be/abc123');
  await page.click('#url-go');
  await page.waitForSelector('#link-routes:not([hidden])', { timeout: 8000 });
  await page.click('#capture-mic');
  await page.waitForSelector('#capture-panel:not([hidden])', { timeout: 10000 });
  await page.waitForFunction(() => document.querySelector('#capture-time').textContent !== '0:00', null, { timeout: 8000 });
  await page.click('#capture-cancel');
  assert(!(await page.locator('#capture-panel').isVisible()), 'no se cerró la grabación');
  await page.close();
});

test('un enlace que no es nada avisa en vez de romperse', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.click('[data-tab="library"]');
  await page.click('#add-song');
  await page.fill('#url-input', 'esto no es una url');
  await page.click('#url-go');
  await page.waitForTimeout(400);
  assert(/dirección web/.test(await page.locator('#import-status').textContent()), 'no avisa del enlace malo');
  assert(!(await page.locator('#link-routes').isVisible()), 'enseña caminos para un enlace inválido');
  await page.close();
});

// ------------------------------------------------------- audio sin límites
test('un mp3 se sube y se transcribe', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.click('[data-tab="library"]');
  await page.click('#add-song');
  await page.setInputFiles('#file-input', ctx.mp3Path);
  await page.waitForSelector('[data-screen="song"]:not([hidden])', { timeout: 60000 });

  const notes = await page.evaluate(() => window.__cascada.state.song.notes.map((n) => n.midi));
  assert(notes.length >= 3, `esperaba la melodía, salieron ${notes.length} notas`);
  // El fixture es Do4 Mi4 Sol4 Do5, sintetizado aquí mismo.
  for (const midi of notes) {
    assert([60, 64, 67, 72].includes(midi), `nota inesperada: ${midi}`);
  }
  assert(notes.includes(60) && notes.includes(72), `faltan los extremos: ${notes.join(' ')}`);

  await page.click('[data-tab="library"]');
  equal(await page.locator('#library-grid .card').count(), 1, 'la transcripción no llegó a la biblioteca');
  assert(/transcrita/.test(await page.locator('#library-grid .card').first().textContent()), 'no se marca como transcrita');
  equal(page.problems.length, 0, `errores de consola: ${page.problems.join(' | ')}`);
  await page.close();
});

test('un audio largo y pesado ya no se rechaza', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.click('[data-tab="library"]');
  await page.click('#add-song');
  await page.setInputFiles('#file-input', ctx.longWavPath);
  // Avisa de que va a tardar, en vez de negarse.
  await page.waitForFunction(() => /MB/.test(document.querySelector('#import-status').textContent), null, { timeout: 15000 });
  await page.waitForSelector('[data-screen="song"]:not([hidden])', { timeout: 180000 });
  const status = await page.locator('#import-status').textContent();
  assert(!/muy largo|pesa demasiado|más de/.test(status), `lo rechazó: ${status}`);
  const seconds = await page.evaluate(() => {
    const song = window.__cascada.state.song;
    return (song.lengthBeats / song.bpm) * 60;
  });
  assert(seconds > 120, `la canción salió demasiado corta: ${Math.round(seconds)} s`);
  equal(page.problems.length, 0, `errores de consola: ${page.problems.join(' | ')}`);
  await page.close();
});

test('importar dos archivos de golpe guarda los dos y abre solo el último', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.click('[data-tab="library"]');
  await page.click('#add-song');
  await page.setInputFiles('#file-input', [ctx.midiPath, ctx.mp3Path]);
  await page.waitForSelector('[data-screen="song"]:not([hidden])', { timeout: 60000 });
  await page.click('[data-tab="library"]');
  equal(await page.locator('#library-grid .card').count(), 2, 'no entraron las dos');
  await page.close();
});

test('se puede elegir entre buscar acordes o solo la melodía', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.click('[data-tab="library"]');
  await page.click('#add-song');
  await page.click('#add-sheet details summary');
  assert(await page.locator('[data-mode2="acordes"]').isVisible(), 'no se puede elegir el modo');
  equal(await page.locator('[data-mode2="acordes"]').getAttribute('aria-checked'), 'true', 'acordes debería venir puesto');
  await page.click('[data-mode2="melodia"]');
  equal(await page.locator('[data-mode2="melodia"]').getAttribute('aria-checked'), 'true');
  // Y en ese modo el mp3 de prueba se transcribe igual de bien.
  await page.setInputFiles('#file-input', ctx.mp3Path);
  await page.waitForSelector('[data-screen="song"]:not([hidden])', { timeout: 60000 });
  const notes = await page.evaluate(() => window.__cascada.state.song.notes.map((n) => n.midi));
  assert(notes.includes(60) && notes.includes(72), `melodía incompleta: ${notes.join(' ')}`);
  await page.close();
});

test('el selector de archivos acepta mp3 y compañía', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.click('[data-tab="library"]');
  await page.click('#add-song');
  const accept = await page.locator('#file-input').getAttribute('accept');
  for (const extension of ['.mp3', '.m4a', '.wav', '.ogg', '.flac', '.mid']) {
    assert(accept.includes(extension), `el selector no ofrece ${extension}`);
  }
  const copy = await page.locator('#dropzone').textContent();
  assert(/\.mp3/.test(copy), 'el texto no menciona mp3');
  assert(/[Ss]in límite/.test(copy), 'el texto no dice que no hay límite');
  await page.close();
});

// -------------------------------------------- el teclado y lo que se ve
test('el teclado se puede ajustar y deslizar', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.click('#open-settings');
  await page.locator('#set-keys-visible').fill('12');
  await page.locator('#set-kb-height').fill('44');
  await page.locator('#set-lookahead').fill('40');
  const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('cascada.settings')));
  equal(settings.keysVisible, 12, 'teclas a la vista');
  equal(settings.keyboardHeight, 44, 'alto del teclado');
  equal(settings.lookAheadSeconds, 4, 'anticipación');

  await page.click('[data-tab="catalog"]');
  await page.click('#catalog-grid .card:has-text("Para Elisa")');
  await page.click('#song-start');
  await page.waitForTimeout(900);

  // Con doce teclas a la vista, una pieza que abarca más tiene que poder deslizarse.
  const geo = await page.evaluate(() => {
    const g = window.__cascada.geometry();
    return { content: g.layout.contentWidth, view: g.viewWidth, hasPan: !!g.pan, offset: g.offset };
  });
  assert(geo.content > geo.view, 'el teclado debería ser más ancho que la pantalla');
  assert(geo.hasPan, 'no apareció la barra para deslizar');

  await page.evaluate(() => window.__cascada.pan(400));
  await page.waitForTimeout(120);
  const moved = await page.evaluate(() => window.__cascada.geometry().offset);
  assert(moved > 10, `el teclado no se movió: ${moved}`);
  equal(page.problems.length, 0, `errores de consola: ${page.problems.join(' | ')}`);
  await page.close();
});

test('los colores de las manos se pueden cambiar', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.click('#open-settings');
  assert((await page.locator('#set-palette button').count()) >= 3, 'faltan paletas');
  await page.click('[data-palette="daltonismo"]');
  equal(await page.evaluate(() => JSON.parse(localStorage.getItem('cascada.settings')).palette), 'daltonismo');
  await page.close();
});

test('se puede quitar la rejilla y el brillo', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.click('#open-settings');
  await page.locator('#set-grid').uncheck();
  await page.locator('#set-glow').uncheck();
  await page.locator('#set-autofollow').uncheck();
  const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('cascada.settings')));
  equal(settings.showGrid, false);
  equal(settings.showGlow, false);
  equal(settings.autoFollow, false);
  // Y la canción sigue dibujándose sin ellos.
  await page.click('[data-tab="catalog"]');
  await page.click('#catalog-grid .card:has-text("Estrellita")');
  await page.click('#song-start');
  await page.waitForTimeout(700);
  equal(page.problems.length, 0, `errores de consola: ${page.problems.join(' | ')}`);
  await page.close();
});

test('los ajustes del micrófono solo salen con el micrófono elegido', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.click('#open-settings');
  assert(!(await page.locator('#mic-panel').isVisible()), 'el panel sale sin elegir micrófono');
  await page.click('[data-input="mic"]');
  await page.waitForTimeout(600);
  assert(await page.locator('#mic-panel').isVisible(), 'no sale el panel del micrófono');
  assert(await page.locator('#mic-heard').isVisible(), 'no sale lo que oye');
  await page.locator('#set-mic-sensitivity').fill('80');
  equal(await page.evaluate(() => JSON.parse(localStorage.getItem('cascada.settings')).micSensitivity), 80);
  await page.close();
});

// --------------------------------------------- títulos de los archivos
test('un título que no es UTF-8 se lee bien, no en rombos', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.click('[data-tab="library"]');
  await page.click('#add-song');
  // Bytes japoneses de verdad, en la codificación con la que se guardan miles
  // de MIDI. Leerlos como UTF-8 "a lo que salga" daba un churro de rombos.
  await page.setInputFiles('#file-input', ctx.shiftJisPath);
  await page.waitForSelector('[data-screen="song"]:not([hidden])', { timeout: 30000 });
  const title = await page.locator('#song-title').textContent();
  assert(!/\ufffd/.test(title), `el título trae rombos: ${title}`);
  equal(title, '日本語', `no se decodificó bien: ${title}`);
  // Y si el idioma no te sirve, se renombra.
  assert(await page.locator('#song-rename').isVisible(), 'no deja renombrarla');
  await page.close();
});

test('un título que no se puede leer de ninguna forma cede al nombre del archivo', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.click('[data-tab="library"]');
  await page.click('#add-song');
  await page.setInputFiles('#file-input', ctx.badTitlePath);
  await page.waitForSelector('[data-screen="song"]:not([hidden])', { timeout: 30000 });
  const title = await page.locator('#song-title').textContent();
  assert(!/\ufffd/.test(title), `el título trae rombos: ${title}`);
  assert(/nombre-ilegible/.test(title), `esperaba el nombre del archivo, salió: ${title}`);
  await page.close();
});

test('una canción importada se puede renombrar', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.click('[data-tab="library"]');
  await page.click('#add-song');
  await page.setInputFiles('#file-input', ctx.midiPath);
  await page.waitForSelector('[data-screen="song"]:not([hidden])', { timeout: 30000 });
  assert(await page.locator('#song-rename').isVisible(), 'no se puede renombrar lo importado');
  page.once('dialog', (dialog) => dialog.accept('Mi versión'));
  await page.click('#song-rename');
  await page.waitForTimeout(600);
  equal(await page.locator('#song-title').textContent(), 'Mi versión');
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  assert(/Mi versión/.test(await page.locator('#library-grid').textContent()), 'el nombre no sobrevivió');
  await page.close();
});

test('las piezas del catálogo no se renombran ni se borran', async (ctx) => {
  const page = await fresh(ctx.context, ctx.base);
  await page.click('[data-tab="catalog"]');
  await page.click('#catalog-grid .card:has-text("Estrellita")');
  assert(!(await page.locator('#song-rename').isVisible()), 'deja renombrar una pieza del catálogo');
  assert(!(await page.locator('#song-delete').isVisible()), 'deja borrar una pieza del catálogo');
  await page.close();
});

// --------------------------------------------------------------------- run
const { server, port } = await serve();
const base = `http://127.0.0.1:${port}`;
const chromium = await loadPlaywright();
const browser = await chromium.launch({
  headless: !HEADED,
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--mute-audio',
    // Un micrófono de mentira, para poder recorrer la grabación sin hardware.
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
  ],
});

// Un MIDI de verdad y un archivo basura, generados aquí.
const { buildSong } = await import('../src/score.js');
const { songToMidiBytes } = await import('../src/midi.js');
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'cascada-'));
const midiPath = path.join(tmp, 'cancion-de-prueba.mid');
fs.writeFileSync(midiPath, songToMidiBytes(buildSong({
  title: 'Canción de prueba', bpm: 96, meter: [4, 4],
  R: 'C4 D4 E4 F4 | G4 A4 B4 C5 | C5 B4 A4 G4 | F4 E4 D4 C4',
  L: '[C3G3]:4 | [C3G3]:4 | [G2D3]:4 | [C3G3]:4',
})));
const junkPath = path.join(tmp, 'esto-no-es-musica.mid');
fs.writeFileSync(junkPath, Buffer.from('hola, no soy un midi ni de lejos'));

// Un MIDI cuyo nombre interno está en una codificación que no es UTF-8:
// así se comprueba que no acaba en rombos.
const shiftJisPath = path.join(tmp, 'cancion-japonesa.mid');
fs.writeFileSync(shiftJisPath, withRawTrackName(Buffer.from([0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea])));

// Bytes que no son válidos en ninguna de las tres codificaciones que se prueban.
const badTitlePath = path.join(tmp, 'nombre-ilegible.mid');
fs.writeFileSync(badTitlePath, withRawTrackName(Buffer.from([0x81, 0xff, 0x90, 0x8d, 0xff, 0x81])));

function withRawTrackName(nameBytes) {
  const base = songToMidiBytes(buildSong({ title: 'X', bpm: 90, meter: [4, 4], R: 'C4 D4 E4 F4' }));
  const file = Buffer.from(base);
  // Se reemplazan los bytes del nombre por los crudos, dejando el resto igual.
  const marker = Buffer.from([0xff, 0x03]);
  const at = file.indexOf(marker);
  const oldLength = file[at + 2];
  const head = file.subarray(0, at);
  const tail = file.subarray(at + 3 + oldLength);
  const body = Buffer.concat([head, marker, Buffer.from([nameBytes.length]), nameBytes, tail]);
  // Se recalcula la longitud de la pista (los cuatro bytes tras 'MTrk').
  const trackAt = body.indexOf(Buffer.from('MTrk'));
  const newLength = body.length - (trackAt + 8);
  body.writeUInt32BE(newLength, trackAt + 4);
  return body;
}

// Un mp3 de verdad, sintetizado aquí (tests/fixtures/melodia.mp3).
const mp3Path = path.join(ROOT, 'tests', 'fixtures', 'melodia.mp3');

// Un wav largo y pesado, para comprobar que ya no hay tope. Se genera en el
// momento para no cargar un archivo enorme en el repositorio.
const longWavPath = path.join(tmp, 'siete-minutos.wav');
fs.writeFileSync(longWavPath, longWav(7 * 60));

function longWav(seconds) {
  const rate = 44100;
  const total = rate * seconds;
  const data = Buffer.alloc(total * 2);
  // Mayormente silencio con una nota larga cada veinte segundos: pesa lo que
  // tiene que pesar y dura lo que tiene que durar, sin tardar una eternidad.
  for (let i = 0; i < total; i++) {
    const t = i / rate;
    const inside = t % 20;
    let value = 0;
    if (inside < 2.5) {
      const envelope = Math.min(1, inside * 40) * Math.exp(-0.8 * inside);
      value = envelope * 0.5 * Math.sin(2 * Math.PI * 261.63 * t);
    }
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 28000), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

let passed = 0;
const failures = [];
for (const [name, fn] of tests) {
  const context = await browser.newContext({ permissions: ['microphone'] });
  try {
    await fn({ context, base, midiPath, junkPath, mp3Path, longWavPath, badTitlePath, shiftJisPath });
    passed++;
    process.stdout.write(`\x1b[32m·\x1b[0m`);
  } catch (error) {
    failures.push([name, error]);
    process.stdout.write(`\x1b[31m×\x1b[0m`);
  } finally {
    await context.close();
  }
}
process.stdout.write('\n');
await browser.close();
server.close();
fs.rmSync(tmp, { recursive: true, force: true });

for (const [name, error] of failures) {
  console.error(`\x1b[31mFALLA\x1b[0m ${name}\n      ${String(error.message).split('\n')[0]}`);
}
console.log(failures.length
  ? `\n${passed} bien, ${failures.length} mal`
  : `\x1b[32m${passed} pruebas de navegador bien\x1b[0m`);
process.exit(failures.length ? 1 : 0);
