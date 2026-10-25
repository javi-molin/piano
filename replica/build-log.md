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
| 2026-10-25 | Tu piano (ajustes) | hecho | 25 a 88 teclas, nota más grave ajustable por octavas, y qué hacer con lo que no cabe: omitirlo o plegarlo a la octava más cercana. El detalle de la canción dice cuántas notas se movieron. |
| 2026-10-25 | Tono por octavas | hecho | ±24 semitonos con botones de octava y de semitono, explicado en palabras, recordado por canción. |
| 2026-10-25 | S04 Enlaces de streaming | **parcial, a propósito** | Reconoce YouTube, Spotify y SoundCloud, lee el título por su oEmbed público y lleva a los dos caminos que sí funcionan. La conversión directa desde el enlace no se puede hacer sin servidor; está dicho en la propia pantalla. |
| 2026-10-25 | Teclado de piano real | hecho | Posiciones y proporciones reales, blancas recortadas, deslizable, ampliable y con seguimiento automático. |
| 2026-10-25 | Ajustes de las notas que caen | hecho | Anticipación, teclas a la vista, alto del teclado, paleta de manos (con una apta para daltonismo), rejilla de compases y brillo. |
| 2026-10-25 | Micrófono fiable | hecho | Autocorrelación en dos pasadas, sensibilidad ajustable y lo que oye, en pantalla. |
| 2026-10-25 | Títulos de los MIDI | hecho | Tres codificaciones probadas en orden, descarte de lo ilegible y renombrar a mano. |
| 2026-10-25 | Audio sin límites | hecho | Fuera el tope de 25 MB y el de 6 minutos. Para que "sin límite" sea verdad y no una promesa, el audio se decodifica ya a 16 kHz: una canción de diez minutos pasa de ocupar más de 200 MB a unos 38, que es lo que separa funcionar de tumbar la pestaña en un iPad. Se aceptan mp3, m4a, wav, ogg y flac, y varios archivos de golpe. |
| 2026-10-25 | Escuchar y transcribir | hecho | Grabación por micrófono (o del sonido de otra pestaña donde el navegador lo permita) y transcripción con tempo detectado solo. |

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

## La segunda tanda: enlaces, tono y el tamaño de tu piano

- **Encajar la canción en el teclado que tienes** resultó ser dos pasos encadenados y en
  este orden: primero el tono que pediste, después lo que cabe. Al revés no sirve, porque
  subir una octava puede sacar notas del piano y hay que recortarlas *después*. Al plegar,
  dos notas pueden aterrizar en la misma tecla a la vez: se funden en una.
- **El tempo de lo que grabas** sale por autocorrelación de la envolvente de ataques. Era
  eso o pedirle al usuario que adivine los bpm de una canción que está escuchando.
- **El enlace de YouTube o Spotify** es la petición que no se puede cumplir tal cual, y lo
  honesto fue no fingir. Lo que sí se puede: leer el título con el oEmbed público del
  servicio (sin clave, sin cuenta), ofrecer la búsqueda de un MIDI —que es lo exacto— y
  grabar la canción mientras suena para sacarla de oído. De un enlace pegado a algo que
  tocar hay dos toques.

## El teclado tenía que ser un piano, no una rejilla

Las negras estaban centradas en la junta entre dos blancas. Es lo que sale si uno lo piensa
como una cuadrícula, y es justo lo que hace que un teclado dibujado "no se lea". En un piano
Do# y Re# se reparten simétricos alrededor del Re, y Fa#, Sol# y La# alrededor del Sol#, que
sí cae en su junta; de ahí que las tapas de las blancas tengan anchos distintos. Ahora están
donde tienen que estar, las blancas se dibujan con su silueta recortada, y la proporción de
la negra es 0,55 del ancho de la blanca.

Encima, el teclado se mueve: se puede decir cuántas teclas se quieren ver a la vez, y si no
caben todas se desliza —arrastrando la barra de arriba o arrastrando sobre las propias
notas— y además sigue solo a la canción, con el seguimiento en pausa unos segundos cuando lo
mueves tú.

## Oír una nota no es mirar el pico más alto

El micrófono buscaba picos en el espectro. En un piano eso falla: los armónicos suenan más
fuerte que el fundamental, así que un Mi4 se detectaba como Mi3. Ahora mide cada cuánto se
repite la onda, con dos pasadas —una ventana larga para el grave y muestreo fino para el
agudo— porque ninguna de las dos sola cubre el piano entero: con la ventana del grave, un
Do7 se canta una octava más abajo.

Resultado medido: las 69 notas de Mi1 a Do7, exactas, y también con un 12 % de ruido encima.
En pantalla se ve lo que oye, con la desviación en centésimas, para poder comprobarlo en dos
segundos en vez de confiar.

## Quitar un límite es trabajo, no borrar una línea

Quitar el `if (file.size > 25 MB)` habría durado un segundo y habría cambiado un mensaje de
error por una pestaña muerta. Lo que de verdad costaba era el consumo: `decodeAudioData`
deja el archivo entero en memoria como float, y diez minutos en estéreo a 44,1 kHz son más
de 200 MB. La salida fue pedirle al navegador que decodifique **directamente a 16 kHz** con
un `OfflineAudioContext` —que es todo lo que necesita el detector de tono— y quedarse en
unos 38 MB. La grabación hace lo mismo mientras graba, remuestreando sobre la marcha y
arrastrando el resto entre trozos para que la junta no se oiga.

Lo que sigue creciendo con la duración es el tiempo: unos 12 segundos de análisis por cada
minuto de audio. Eso no se esconde, se dice antes de empezar y se ve en la barra.

## Lo que se dejó fuera, y por qué

- **Vista de partitura.** Estaba en la lista de mejoras. Dibujar un pentagrama decente es
  otro proyecto, y el piano-roll ya cumple el trabajo de "no hay que leer partitura".
  Se quitó de `features.csv` en vez de dejarla como pendiente eterna.
- **Recordatorio de racha.** Una PWA en iOS no manda notificaciones sin más. La racha está,
  el aviso no.
- **Varios idiomas.** Solo español. El original tiene diez.
- **Convertir un enlace de streaming en tutorial sin tocar nada.** Spotify no entrega audio
  que el navegador pueda leer (va cifrado), y YouTube ni permite la descarga desde otra
  página ni lo autoriza en sus términos. Aunque llegara el audio, transcribir una mezcla
  completa con calidad necesita un modelo en servidor. Se construyó el camino que sí
  funciona en vez de un botón que falla.
