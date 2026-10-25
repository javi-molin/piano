# Build log — Cascada

Una línea por pieza construida. Lo que quedó a medias está dicho aquí, no escondido.

| fecha | pantalla / pieza | estado | notas |
| --- | --- | --- | --- |
| 2026-10-25 | Núcleo musical (`score.js`) | hecho | DSL propio con compases validados; digitación calculada; secciones automáticas. 30 pruebas unitarias. |
| 2026-10-25 | Catálogo (`songs.js`) | hecho | 14 piezas de dominio público, arregladas aquí. Cero avisos de compás mal medido. |
| 2026-10-25 | MIDI (`midi.js`) | hecho | Lector SMF 0/1 y escritor, con prueba de ida y vuelta sobre 4 piezas. Reparto de manos por pista o por altura. |
| 2026-10-25 | Sonido (`audio.js`) | hecho | Piano sintetizado con onda periódica, filtro que se cierra y decaimiento según la altura. 3 timbres. Sin un solo byte de sample. |
| 2026-10-25 | Teclado (`keyboard.js`) | hecho | Geometría compartida con el piano-roll, multitouch, teclas del ordenador, etiquetas Do/C. |
| 2026-10-25 | Piano-roll (`roll.js`) | hecho | Solo dibuja la ventana visible. Dedos dentro de la nota, compases numerados, zona de bucle. |
| 2026-10-25 | Tutor (`player.js`) | hecho | Reloj de audio, modo espera, puntuación, bucle A-B, claqueta, metrónomo. |
| 2026-10-25 | S02 Biblioteca | hecho | Buscador, 4 filtros, fijadas, objetivo diario. |
| 2026-10-25 | S03 Catálogo | hecho | Filtro por nivel. |
| 2026-10-25 | S04 Añadir | hecho | Archivo, arrastrar, enlace directo a .mid, transcripción beta, importar copia .json. |
| 2026-10-25 | S05 Detalle | hecho | Modo, manos, velocidad, exigencia, transporte, secciones, estadísticas. |
| 2026-10-25 | S06 Reproductor | hecho | Todos los estados: claqueta, tocando, esperando, pausa, fin. |
| 2026-10-25 | S07 Resultados | hecho | Estrellas, precisión, mapa de calor por compás y botón para repetir justo esos compases. |
| 2026-10-25 | S08 Secciones | hecho | Automáticas por compás, practicar o repetir en bucle. |
| 2026-10-25 | S09 Juego libre | hecho | Teclado suelto, octavas, sostenido, grabar y guardar como canción. |
| 2026-10-25 | S10 Progreso | hecho | Racha, calendario de 35 días, últimas sesiones. |
| 2026-10-25 | S11 Ajustes | hecho | Sonido, pantalla, práctica, entrada, exportar/importar/borrar. |
| 2026-10-25 | S12 Entrada | **parcial** | Teclado MIDI por Web MIDI (no existe en Safari/iPad, y la app lo dice). Micrófono con detección por picos: bien con notas sueltas, aproximada con acordes. |
| 2026-10-25 | S01 Onboarding | hecho | Tres pasos, se salta y no vuelve. |
| 2026-10-25 | PWA | hecho | Manifest, service worker, iconos generados con `tools/make_icons.py`, offline real. |
| 2026-10-25 | S13 Muro de pago | **fuera a propósito** | Es lo que se quitaba. |

## Lo que costó más de lo que parecía

- **El modo espera.** La primera versión paraba el tiempo y ya. Pero si te adelantas y tocas
  la nota siguiente antes de tiempo, lo correcto es que la canción vaya contigo: el tempo lo
  pone quien toca. Ahora el reloj salta al paso que acabas de tocar, y el acompañamiento no
  se adelanta nunca al paso que falta.
- **Puntuar.** Un fallo tonto (una nota marcada "la que viene" ya no podía marcarse como
  fallada) hacía que dejar pasar la canción entera diera 0 fallos y todos los compases en
  verde. Está corregido y hay dos pruebas que lo vigilan, una unitaria y una de navegador.
- **La transcripción de audio.** El primer YIN cogía el mínimo más profundo y detectaba un
  Mi4 como Mi3, o peor, como un quinto subarmónico. Hay que coger el **primer** mínimo bajo
  el umbral. Con eso, una melodía sintética de cuatro notas sale exacta.
- **Los tresillos.** Sumar 1/3 tres veces no da 1. Los tiempos se redondean a una rejilla de
  1/960 de beat al escribir la canción, y así el ida y vuelta por MIDI sale idéntico.

## Lo que se dejó fuera, y por qué

- **Vista de partitura.** Estaba en la lista de mejoras. Dibujar un pentagrama decente es
  otro proyecto, y el piano-roll ya cumple el trabajo de "no hay que leer partitura".
  Se quitó de `features.csv` en vez de dejarla como pendiente eterna.
- **Recordatorio de racha.** Una PWA en iOS no manda notificaciones sin más. La racha está,
  el aviso no.
- **Varios idiomas.** Solo español. El original tiene diez.
