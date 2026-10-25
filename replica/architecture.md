# Architecture — Cascada (clon web de un tutor de piano de notas que caen)

Destino: **PWA instalable en iPad**, offline, sin cuenta, sin servidor, sin límites.
Esa restricción manda sobre todo lo demás.

## Stack

| capa | elección | por qué |
| --- | --- | --- |
| Entrega | sitio estático (HTML + CSS + JS ES modules), **cero dependencias, cero build** | se abre desde GitHub Pages o desde un `file://`; nada que compilar, nada que caduque, nada que pagar |
| Render del piano-roll | `<canvas>` 2D con `requestAnimationFrame` y escala DPR | 60 fps con 500+ notas en Safari iPad; el DOM no aguanta eso |
| UI | DOM + CSS custom properties desde `tokens.json` | accesible, tipografía del sistema, sin framework |
| Audio | **Web Audio API, síntesis propia** (6 parciales + ruido de ataque + envolvente + filtro) | un piano con samples son decenas de MB: mata el offline. La síntesis pesa 0 bytes |
| Reloj | `AudioContext.currentTime` como reloj maestro, el render interpola | `setInterval` y `rAF` derivan; el audio no |
| Canciones propias | parser **MIDI (SMF 0/1) escrito aquí** | import ilimitado sin servidor |
| Audio → notas | detector monofónico propio (autocorrelación + segmentación + cuantización) en el navegador, marcado **beta** | sustituye la IA en servidor del original sin depender de nadie |
| Entrada | multitouch en el teclado en pantalla · **Web MIDI** donde exista · **micrófono** (FFT + picos armónicos) para piano acústico | Safari iOS no tiene Web MIDI: el micro es el plan A en iPad |
| Persistencia | **IndexedDB** para canciones (blobs grandes) · `localStorage` para ajustes, progreso y racha | cuota grande, sin red |
| Offline | Service Worker, precache de todo el shell, estrategia cache-first | funciona en avión |
| Deploy | GitHub Pages con GitHub Actions | gratis, HTTPS (la PWA lo exige) |

## Módulos

```
index.html            shell, una sola página, pantallas conmutadas
styles.css            tokens + componentes
src/tokens.js         tokens.json inyectado como CSS custom properties
src/store.js          IndexedDB + localStorage: canciones, progreso, racha, ajustes
src/score.js          modelo Song/Note/Section: DSL propio, secciones, dedos, transposición
src/songs.js          catálogo propio de dominio público (S03)
src/midi.js           parser SMF → Song  ·  entrada Web MIDI
src/transcribe.js     audio → notas (beta): autocorrelación, segmentación, cuantización
src/audio.js          motor de sonido: piano sintetizado, metrónomo, claqueta, latencia
src/mic.js            detección de notas por micrófono (FFT + armónicos)
src/keyboard.js       teclado en pantalla: render, multitouch, etiquetas, resaltado
src/roll.js           piano-roll en canvas: notas que caen, manos, compases, dedos
src/player.js         máquina de estados del tutor: wait mode, scoring, bucle A-B, secciones
src/ui.js             pantallas S01–S12, navegación, modales, toasts
src/app.js            arranque, router, registro del SW
sw.js                 service worker
manifest.webmanifest  instalación en iPad
```

## Modelo en memoria

```js
Song = { id, title, composer, source, bpm, meter:[4,4], difficulty:1..5,
         notes:[ {t, d, midi, hand:'L'|'R', finger:1..5, vel} ],  // t y d en beats
         sections:[ {id, label, startBeat, endBeat} ], lengthBeats, keyLabel }
```
Una sola lista de notas ordenada por `t`; mano y dedo son campos, no pistas aparte.
Así el filtro por mano, el bucle y el scoring son todos la misma consulta.

## Orden de construcción (vertical slice primero)

1. **Shell**: tokens, navegación de 4 tabs, pantallas stub. (S02, S03, S09, S10, S11)
2. **Rebanada vertical**: catálogo → reproductor con notas que caen + teclado + sonido + wait mode + resultados. Es el bucle que la gente paga. (S03 → S06 → S07)
3. Biblioteca con progreso, fijar, buscar. (S02)
4. Secciones, bucle A-B, práctica por manos. (S08)
5. Mastery, dificultades, estrellas, racha. (S07, S10)
6. Import MIDI + enlace + transcripción beta. (S04)
7. Entrada MIDI y micrófono. (S12)
8. Juego libre y grabación. (S09)
9. Ajustes, exportar/importar, onboarding. (S11, S01)
10. PWA: manifest, SW, iconos, offline. Deploy.

## Decisiones que cierran puertas a propósito

- **Sin backend.** No hay cuentas que mantener ni facturas. El precio de eso: no hay sincronización entre dispositivos; se cubre con exportar/importar la biblioteca en un `.json`.
- **Sin samples de piano.** El precio: el timbre es sintético, no un Steinway. La ganancia: la app entera pesa menos que una foto y funciona sin red.
- **Scoring con ventana de tolerancia en beats, no en ms.** A 50 % de velocidad la ventana se ensancha sola: ralentizar ayuda de verdad.
- **Dedos calculados, no guardados.** Heurística por dirección e intervalo, recalculada al transponer o cambiar de mano.

## Riesgos

| riesgo | mitigación |
| --- | --- |
| Safari iPad silencia el audio hasta un gesto | `AudioContext.resume()` en el primer toque, aviso si queda suspendido |
| Latencia de salida alta en Bluetooth | calibración manual en ajustes, guardada |
| Micrófono con ruido o eco del propio altavoz | umbral adaptativo, recomendación de auriculares, modo solo-táctil siempre disponible |
| MIDI polifónico muy denso baja los fps | se dibujan solo las notas de la ventana visible |
| Transcripción de audio polifónico pobre | etiquetada beta en la propia UI, con el límite dicho en una línea |

Siguiente: `/replica-design` (hecho: `replica/design/tokens.json`) → `/replica-build`.
