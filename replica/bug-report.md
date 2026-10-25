# Bugs encontrados y cerrados durante la construcción

Severidad: S1 rompe la app · S2 falsea lo que ves · S3 molesta · S4 cosmético.

| # | sev | qué pasaba | por qué | estado |
| --- | --- | --- | --- | --- |
| 1 | S2 | Dejar pasar la canción entera daba **0 fallos, 0 % y todos los compases en verde** | una nota marcada `expect` ("la que viene") ya no podía pasar a `miss` | cerrado; prueba unitaria + prueba de navegador |
| 2 | S2 | En modo aprender, tocar la nota siguiente antes de tiempo contaba como **error** | el buscador de objetivo solo miraba una ventana alrededor del beat actual | cerrado; ahora manda el paso actual y el reloj salta contigo |
| 3 | S2 | Al saltar hacia delante, la mano acompañante **se adelantaba** al paso pendiente | el programador de notas miraba el horizonte y no el punto de espera | cerrado |
| 4 | S2 | El transcriptor detectaba Mi4 como Mi3 y Sol4 como un Mi♭2 | YIN cogía el mínimo más profundo en vez del primero bajo el umbral (subarmónicos) | cerrado; prueba con señal sintética de 4 notas |
| 5 | S3 | Los grupos de botones del onboarding y los filtros **no respondían** | `data-onboard-names` ↔ `dataset.onboardNames`: el selector CSS necesitaba kebab-case | cerrado |
| 6 | S3 | Ida y vuelta por MIDI de piezas con tresillos cambiaba el orden de las notas | sumar 1/3 tres veces no da 1 | cerrado; los tiempos se redondean a 1/960 de beat |
| 7 | S3 | En la mano izquierda, los acordes salían con el pulgar en la nota grave | el reparto de dedos se invertía dos veces | cerrado |
| 8 | S4 | El consejo final decía "limpio y a tempo" con 0 % de precisión | el mapa de calor daba por bueno un compás que nadie había tocado | cerrado |
| 9 | S4 | Teclas negras demasiado anchas, las blancas de en medio quedaban en un hilo | proporción 0,62 del ancho de blanca | cerrado; 0,56, como un piano |
| 10 | S4 | El teclado se extendía hasta el Si de la octava aunque la pieza acabara en Do | redondeo a octava completa siempre | cerrado; si la nota más alta es un Do, el teclado termina ahí |

| 11 | S2 | Cosas escondidas con `hidden` **se seguían viendo**: el botón de borrar en una pieza del catálogo, el cronómetro de grabación, el bloque de los enlaces | cualquier regla de `display` del autor (un `.btn` es `inline-flex`) gana al `display:none` del atributo | cerrado con `[hidden] { display: none !important }` y una prueba de navegador que recorre los cuatro casos |
| 12 | S3 | La etiqueta del tono decía "una octava arriba · Do suena Do" | en octavas enteras la nota se llama igual, así que la coletilla sobraba | cerrado |

**Abiertos: ninguno de S1 ni S2.** Lo que queda son límites conocidos, no fallos:
la transcripción de audio es monofónica, la detección por micrófono se confunde con acordes
densos, y Safari en iPad no tiene Web MIDI.
