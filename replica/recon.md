# Recon map — "Anything Piano: Toca canciones" (Songscription Inc)

Source app: https://apps.apple.com/cl/app/anything-piano-toca-canciones/id6761146933
Platform studied: iOS / iPadOS 18+, Educación, gratis con compras dentro de la app.
Recon date: 2026-10-24. Sources: ficha pública del App Store (descripción, historial
de versiones 1.0.1 → 1.0.22, compras integradas), sitio del desarrollador
(playanything.com/anythingpiano). No se usó la cuenta de nadie, no se leyó código,
binario ni API privada del original. Clean room.

## 1. Scope

| | |
| --- | --- |
| **Qué clonamos** | El bucle central: añadir una canción → tutorial de notas que caen → practicar hasta dominarla. |
| **Plataforma destino** | Web app instalable (PWA) en iPad, offline, sin cuenta, sin suscripción. |
| **Para quién** | El usuario, en su iPad, uso personal e ilimitado. |
| **Slice** | Biblioteca + reproductor/tutor + modos de práctica + progreso + ajustes. |

## 2. Fuentes

| fuente | URL | qué dio |
| --- | --- | --- |
| Ficha App Store (CL) | apps.apple.com/cl/app/.../id6761146933 | pitch, lista de capacidades, precios IAP, tamaño, idiomas |
| Historial de versiones | misma ficha | hoja de ruta real: secciones (1.0.16/17), mastery con 3 dificultades (1.0.10), rachas (1.0.12), bucles (1.0.3), nombres de notas (1.0.2), teclado Bluetooth/MIDI (1.0.4), KeyLab (1.0.19), indicadores de progreso (1.0.18/20) |
| Compras integradas | misma ficha | Pro mensual / Pro anual (dos niveles de precio listados) → el muro de pago es la restricción que el usuario quiere eliminar |
| Sitio del desarrollador | playanything.com/anythingpiano | posicionamiento: "pega un link, la IA lo convierte en tutorial" |

Capturas de referencia: la ficha del App Store sirve sus screenshots como
placeholders 1x1, así que `replica/screens/` queda vacío a propósito. El layout
se reconstruye desde la descripción textual de las pantallas y desde el patrón
de UI estándar de un piano-roll (no se copió ningún pixel ni ningún texto).

## 3. Inventario de pantallas

| ID | pantalla | cómo se llega | propósito | componentes clave | estados |
| --- | --- | --- | --- | --- | --- |
| S01 | Onboarding | primer arranque | elegir nivel, mano, calibrar sonido | pasos, selector, botón grande | primera vez, saltado |
| S02 | Inicio / Biblioteca | tab 1 | tus canciones, fijadas, progreso, racha | tarjeta de canción, barra de progreso, chip de racha, buscador | vacío, con canciones, filtrado, sin resultados |
| S03 | Catálogo | tab 2 | canciones listas para tocar, por dificultad | grid de tarjetas, filtros por nivel/estilo | cargado, filtrado, vacío |
| S04 | Añadir canción | botón + / chat | pegar link o subir archivo → tutorial | input de link, dropzone, progreso de conversión | idle, procesando, error, listo |
| S05 | Detalle de canción | tocar tarjeta | elegir modo, mano, secciones, velocidad | selector de modo, lista de secciones, stats | nueva, en progreso, dominada |
| S06 | Reproductor / Tutor | desde S05 | notas que caen sobre el teclado, wait mode | piano-roll, teclado, HUD, controles | cuenta atrás, tocando, pausa, esperando nota, fin |
| S07 | Resultados | fin de S06 | precisión, estrellas, qué repetir | puntaje, estrellas, lista de compases fallados | aprobado, repetir |
| S08 | Secciones | desde S05/S06 | partir la canción en trozos y repetir en bucle | lista de secciones, A/B loop | auto-dividido, selección manual |
| S09 | Juego libre | tab 3 | teclado suelto para improvisar y grabar | teclado, octavas, sostenido, grabador | inactivo, grabando |
| S10 | Progreso | tab 4 | racha, minutos, canciones dominadas | calendario de racha, métricas, logros | sin datos, con datos |
| S11 | Ajustes | icono | sonido, etiquetas, entrada, tema, datos | lista de ajustes, selector de entrada, exportar/importar | — |
| S12 | Entrada de instrumento | desde S11/S06 | tocar con teclado MIDI o piano acústico (micro) | selector, medidor de nivel, test de notas | sin permiso, escuchando, MIDI conectado |
| S13 | Muro de pago | al pasar el límite | vender Pro mensual/anual | — | **fuera de alcance a propósito** |

## 4. Flujos

```
F01 Primer uso                S01 -> S02 (vacío) -> S03 -> S06
    clics felices: 3
F02 Añadir canción propia     S02 -> S04 (archivo MIDI / audio) -> S05 -> S06
    bordes: archivo no válido, sin notas, archivo enorme, mismo nombre
F03 Aprender una canción      S05 -> S06 (wait mode, mano derecha, 60%) -> S07 -> S08 (repetir compases fallados)
    bordes: nota sostenida, acorde, nota fuera del rango visible, pausa a mitad
F04 Dominar (mastery)         S05 -> S06 (sin espera, dificultad) -> S07 (estrellas) -> S05 (marcada dominada)
    bordes: fallar al final, abandonar, superar récord
F05 Practicar un trozo        S06 -> S08 (A/B loop) -> S06 en bucle
F06 Tocar con piano real      S11 -> S12 (MIDI o micro) -> S06 reconoce lo que suena
    bordes: permiso denegado, ruido ambiente, latencia, Web MIDI no existe en iOS
F07 Volver cada día           S02 (racha) -> S06 -> S10
F08 Improvisar                S09 -> grabar -> guardar como canción propia
```

## 5. Componentes repetidos

Tarjeta de canción (con progreso, fijado, dificultad) · barra/anillo de progreso ·
chip (racha, nivel, mano) · teclado de piano (octavas, etiquetas, resaltado,
táctil multitouch) · piano-roll (notas que caen, dos manos, líneas de compás) ·
HUD (precisión, combo, compás actual) · selector segmentado (modo, mano) ·
slider (velocidad, volumen) · lista de secciones · hoja modal (ajustes, añadir) ·
toast · dropzone · estado vacío · botón primario grande (apto para dedos).

## 6. Modelo de datos inferido

```
Song      id, title, artist, source (builtin|midi|audio|recorded), difficulty,
          bpm, meter, keySignature, durationBeats, tracks[], sections[], createdAt
          evidencia: S02 tarjetas, S05 detalle, historial 1.0.16 (secciones)
          confianza: alta

Note      time (beats), duration (beats), midi (0-127), hand (L|R), finger (1-5),
          velocity
          evidencia: S06 piano-roll con dos manos y dedos; descripción "muestra qué dedo usar"
          confianza: alta

Section   id, songId, label, startBeat, endBeat, hand
          evidencia: 1.0.16/1.0.17 "song sectioning for one-hand practice"
          confianza: alta

Attempt   id, songId, sectionId?, mode (learn|play|mastery), hand, speed,
          accuracy, notesHit, notesMissed, maxCombo, stars, durationMs, playedAt
          evidencia: 1.0.10 mastery con puntaje y 3 dificultades, S07
          confianza: media-alta

Progress  songId, bestAccuracy, bestStars, timesPlayed, mastered, lastPlayedAt, pinned
          evidencia: 1.0.18/1.0.20 indicadores de progreso, 1.0.15 fijar canciones
          confianza: alta

Streak    currentDays, longestDays, lastPracticeDate, dailyGoalMinutes, days[]
          evidencia: 1.0.12 rachas, 1.0.16 recordatorios de racha
          confianza: media

Settings  inputMode, instrument, volume, labels, colors, theme, latencyMs, handedness
          evidencia: 1.0.2 nombres de notas, 1.0.4 teclado Bluetooth, S11
          confianza: media
```

## 7. Lo que no se clona (y por qué)

| cosa | motivo |
| --- | --- |
| Transcripción IA audio→MIDI del original | es su modelo y su servicio en servidor. No se replica. **Se sustituye** por import de MIDI ilimitado + transcripción monofónica propia en el navegador (beta). |
| Catálogo de canciones con copyright | contenido licenciado. Nuestro catálogo propio es solo dominio público. |
| Cuenta, nube, sincronización, compartir con amigos | red y backend del original; aquí todo es local al dispositivo (y exportable). |
| Suscripción Pro, muro de pago, analítica, tracking | es exactamente lo que el usuario quiere fuera. |
| Soporte de teclados concretos (KeyLab) y personaje "Annie" | hardware específico y su marca/arte. |
| Nombre, logo, textos, iconografía y paleta del original | propiedad suya. Marca nueva: ver `replica/brand.md`. |

## 8. Tamaño

13 pantallas (12 en alcance), 8 flujos, 7 entidades. Partes difíciles:
(1) el bucle de render/audio a 60 fps con latencia baja en Safari iPad,
(2) detección de notas por micrófono (polifónica, con ruido),
(3) parser de MIDI estándar propio sin dependencias,
(4) dedos y separación de manos automáticas,
(5) PWA offline real con audio sin samples descargados.
Tamaño: **M** (semanas de trabajo humano). No se promete clon perfecto:
la transcripción automática de audio polifónico queda explícitamente como beta.

## 9. Siguiente paso

`/replica-architect` → `replica/architecture.md`.
