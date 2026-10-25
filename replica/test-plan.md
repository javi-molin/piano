# Test plan — Cascada

Build: rama `jm/epic-clarke-xzil2q` · Fecha: 2026-10-25 · Entorno: Chromium headless sobre un
servidor estático del propio proyecto, y Node para el núcleo.

```
node tests/engine.test.mjs    54 pruebas del núcleo (DSL, MIDI, teclado, tutor, tu piano, tempo, afinación, micrófono)
node tests/tokens.test.mjs    los tokens de diseño no se separan entre sus tres copias
node tests/e2e.mjs            36 recorridos en un navegador de verdad
```

| caso | flujo | tipo | pasos | esperado | auto | resultado |
| --- | --- | --- | --- | --- | --- | --- |
| F01-H1 | primer uso | feliz | abrir, elegir "C D E", Empezar | va al catálogo, 14 piezas, el ajuste queda guardado y el onboarding no vuelve | e2e | pasa |
| F03-H1 | aprender | feliz | Estrellita, mano derecha, tocar Do Do Sol Sol La La Sol | 7 aciertos, 0 errores, racha de seguidas | e2e | pasa |
| F03-E1 | aprender | borde: nota equivocada | tocar Do# en vez de Do | cuenta como error, **no** bloquea, sigue esperando | e2e | pasa |
| F03-E2 | aprender | borde: te adelantas | tocar las cuatro notas seguidas sin esperar | las cuatro valen y el reloj va contigo | unit | pasa |
| F03-E3 | aprender | borde: no tocas | dejar pasar 5 s | el tiempo no avanza ni una fracción de beat | e2e | pasa |
| F03-H2 | aprender | feliz | pausar, esperar, seguir | el beat no se mueve en pausa y reanuda donde estaba | e2e | pasa |
| F04-H1 | dominar | feliz | tocarla entera bien | precisión 100 %, 3 estrellas, queda "dominada" | unit | pasa |
| F04-E1 | dominar | borde: a media velocidad | tocarla perfecta al 50 % | no da el dominio | unit | pasa |
| F04-N1 | dominar | negativo: no tocar nada | dejar correr la canción | muchas notas perdidas, 0 %, compases en rojo, el consejo no felicita | e2e | pasa |
| F05-H1 | practicar un trozo | feliz | sección 2, "En bucle" | solo se juzgan las notas de ese trozo y vuelve al principio al llegar al final | e2e | pasa |
| F02-H1 | importar | feliz | subir un .mid | aparece el detalle, queda en la biblioteca y sobrevive a recargar | e2e | pasa |
| F02-N1 | importar | negativo: archivo basura | subir un .mid que no lo es | mensaje claro, la hoja no se cierra, nada se rompe | e2e | pasa |
| F02-E1 | importar | borde: ida y vuelta | exportar a MIDI y volver a leer | mismas alturas, tiempos, tempo y compás en 4 piezas | unit | pasa |
| F08-H1 | improvisar | feliz | grabar, tocar 4 teclas, parar | queda guardada como canción en la biblioteca | e2e | pasa |
| F07-H1 | volver cada día | feliz | terminar una canción | el intento se guarda y la racha arranca en 1 | e2e | pasa |
| S11-H1 | ajustes | feliz | cambiar nombres, etiquetas, dedos | se guardan y siguen puestos tras recargar | e2e | pasa |
| S11-H2 | datos | feliz | exportar biblioteca | se descarga un .json con canciones, progreso y ajustes | e2e | pasa |
| A11Y-1 | accesibilidad | — | recorrer con el tabulador hasta Catálogo y pulsar Enter | se abre el catálogo sin ratón | e2e | pasa |
| PWA-1 | sin conexión | — | cargar la app | el service worker queda registrado | e2e | pasa |
| RWD-1 | adaptación | — | 390 px de ancho | no se desborda a lo ancho | e2e | pasa |
| PIA-1 | tu piano | feliz | poner 25 teclas y "traerlas a la octava más cercana", abrir una pieza grande | avisa de cuántas notas se movieron y no queda ninguna fuera del teclado | e2e | pasa |
| PIA-2 | tu piano | feliz | poner 25 teclas y "omitirlas" | la canción tiene menos notas y lo dice | e2e | pasa |
| PIA-3 | tu piano | borde: sin límite | no poner tamaño | ningún aviso y la canción intacta | e2e | pasa |
| PIA-4 | tu piano | borde: teclado minúsculo | plegar en un rango de 5 semitonos | no se rompe ni se pierden notas | unit | pasa |
| PIA-5 | tu piano | borde: colisión | plegar un Do5 sobre un Do4 que ya está | las dos se funden en una | unit | pasa |
| TON-1 | tono | feliz | + Octava, − Semitono, Original, − Octava | la canción entera se mueve, se explica en palabras y se recuerda al volver | e2e | pasa |
| TON-2 | tono | borde: con el piano limitado | subir una octava con 25 teclas puestas | sigue sin quedar nada fuera del teclado | unit | pasa |
| LNK-1 | enlace | feliz | pegar un enlace de YouTube | lee el título y ofrece buscar un MIDI y transcribir de oído, y explica por qué el enlace no basta | e2e | pasa |
| LNK-2 | enlace | borde: sin título | el oEmbed falla | los dos caminos siguen ahí | e2e | pasa |
| LNK-3 | enlace | negativo: no es una url | escribir cualquier cosa | avisa y no enseña caminos | e2e | pasa |
| CAP-1 | grabar | feliz | "Grabar por micrófono" y cancelar | se abre la grabación, el cronómetro corre y se cierra limpio | e2e | pasa |
| TMP-1 | tempo | feliz | pista de clics a 120 y a 80 bpm | los detecta con ±2 bpm de error | unit | pasa |
| TMP-2 | tempo | negativo: silencio | audio plano | devuelve 0 y se usa el valor puesto a mano | unit | pasa |
| HID-1 | interfaz | negativo | mirar lo que debería estar escondido | el botón de borrar, el cronómetro y los bloques del enlace no se ven | e2e | pasa |
| MP3-1 | importar | feliz | subir un .mp3 de verdad (`tests/fixtures/melodia.mp3`, cuatro notas sintetizadas aquí) | se transcribe a Do4 Mi4 Sol4 Do5 y queda en la biblioteca marcada como transcrita | e2e | pasa |
| MP3-2 | importar | borde: archivo grande y largo | subir un wav de 7 minutos y 37 MB | avisa de que tardará y lo importa, sin rechazarlo | e2e | pasa |
| MP3-3 | importar | feliz | dos archivos de golpe | entran los dos y solo se abre el último | e2e | pasa |
| MP3-4 | importar | — | mirar el selector de archivos | ofrece .mp3, .m4a, .wav, .ogg, .flac y .mid, y el texto dice que no hay límite | e2e | pasa |
| TEC-1 | teclado | — | medir la geometría | Do# y Re# simétricos sobre el Re, Sol# en su junta, Do y Mi espejo, negra = 0,55 blanca | unit | pasa |
| TEC-2 | teclado | feliz | poner 12 teclas a la vista y abrir una pieza ancha | aparece la barra y el teclado se desliza | e2e | pasa |
| TEC-3 | teclado | borde | tocar con el teclado deslizado | acierta la tecla que se ve, no la de debajo | unit | pasa |
| AFI-1 | afinación | feliz | las 69 notas de Mi1 a Do7 | todas exactas | unit | pasa |
| AFI-2 | afinación | borde: agudo | Do6, Mi6, Sol6, La6, Do7 | ninguna se va una octava abajo | unit | pasa |
| AFI-3 | afinación | borde: ruido | 12 % de ruido encima | siguen todas exactas | unit | pasa |
| AFI-4 | afinación | feliz | un La4 cuarenta centésimas alto | lo dice, y dice cuánto | unit | pasa |
| AFI-5 | afinación | negativo | silencio | no inventa ninguna nota | unit | pasa |
| MIC-2 | micrófono | feliz | diez notas seguidas con silencios | las diez, en orden, y todas soltadas | unit | pasa |
| MIC-3 | micrófono | — | elegir micrófono en Ajustes | sale lo que oye y la sensibilidad; sin elegirlo, no | e2e | pasa |
| TIT-1 | importar | borde: Shift-JIS | un MIDI con el nombre en japonés | se lee bien, sin rombos | e2e | pasa |
| TIT-2 | importar | negativo: ilegible | bytes que no son nada | se queda el nombre del archivo | e2e | pasa |
| TIT-3 | importar | feliz | renombrar lo importado | cambia y sobrevive a recargar; el catálogo no se renombra | e2e | pasa |
| UXD-1 | pantalla | feliz | cambiar paleta, rejilla, brillo y seguimiento | se guardan y la canción se sigue dibujando | e2e | pasa |
| MIC-1 | micrófono | manual | elegir micrófono en Ajustes y tocar un piano | las teclas se iluminan | manual | pendiente de probar con un piano real |
| CAP-2 | grabar | manual | poner una canción en un altavoz y grabarla entera | sale una melodía reconocible | manual | pendiente de probar con música real |
| CAP-3 | grabar | manual | capturar el sonido de una pestaña en un portátil | graba lo que suena en esa pestaña | manual | pendiente; en el iPad no existe y el botón no sale |
| MIDI-1 | teclado MIDI | manual | conectar un teclado USB en un navegador con Web MIDI | las notas entran | manual | pendiente de probar con un teclado real |
| IPAD-1 | instalación | manual | Safari → Compartir → Añadir a pantalla de inicio | se abre a pantalla completa y sin conexión | manual | pendiente de probar en el iPad |

Las pruebas de navegador **cortan cualquier petición que salga de la máquina**: lo externo
se simula o se bloquea, nunca se deja al azar de la red. Se han corrido con las dos
versiones de Playwright que hay en juego (1.49.1, la de CI, y 1.63, la local), porque sus
patrones de interceptación no se interpretan igual.

## Lo que estas pruebas no cubren

- **El sonido.** Chromium sin ventana no reproduce audio de verdad; se comprueba que se
  programan las notas, no cómo suenan.
- **El micrófono y el MIDI**, que necesitan hardware. El código tiene sus caminos de error
  escritos y probados a mano, pero no automatizados.
- **Safari.** Todo lo automático corre en Chromium. Lo específico de iPad (claves de audio
  tras el primer toque, insets seguros, instalación) está en la lista de manual.
