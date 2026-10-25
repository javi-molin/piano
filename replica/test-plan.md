# Test plan — Cascada

Build: rama `jm/epic-clarke-xzil2q` · Fecha: 2026-10-25 · Entorno: Chromium headless sobre un
servidor estático del propio proyecto, y Node para el núcleo.

```
node tests/engine.test.mjs    30 pruebas del núcleo (DSL, MIDI, teclado, tutor)
node tests/tokens.test.mjs    los tokens de diseño no se separan entre sus tres copias
node tests/e2e.mjs            15 recorridos en un navegador de verdad
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
| MIC-1 | micrófono | manual | elegir micrófono en Ajustes y tocar un piano | las teclas se iluminan | manual | pendiente de probar con un piano real |
| MIDI-1 | teclado MIDI | manual | conectar un teclado USB en un navegador con Web MIDI | las notas entran | manual | pendiente de probar con un teclado real |
| IPAD-1 | instalación | manual | Safari → Compartir → Añadir a pantalla de inicio | se abre a pantalla completa y sin conexión | manual | pendiente de probar en el iPad |

## Lo que estas pruebas no cubren

- **El sonido.** Chromium sin ventana no reproduce audio de verdad; se comprueba que se
  programan las notas, no cómo suenan.
- **El micrófono y el MIDI**, que necesitan hardware. El código tiene sus caminos de error
  escritos y probados a mano, pero no automatizados.
- **Safari.** Todo lo automático corre en Chromium. Lo específico de iPad (claves de audio
  tras el primer toque, insets seguros, instalación) está en la lista de manual.
