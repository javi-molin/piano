# Cascada — piano en tu iPad

Un tutor de piano con las notas cayendo sobre el teclado. Vive entero en el navegador:
sin cuenta, sin suscripción, sin límite de canciones y sin internet una vez instalado.

Hecho con el pack de skills [replica-skill](https://github.com/Jakeschincariol/replica-skill),
a partir del mapa de funciones de una app de App Store. Clean room: se replicaron las
funciones y el recorrido, no su código, su catálogo, sus textos ni su marca.
El trabajo de reconocimiento está en [`replica/`](replica/).

![Cascada tocando](assets/icon-512.png)

---

## Ponerlo en el iPad (3 minutos)

### 1. Publica la página

El repositorio ya trae el flujo de GitHub Pages. Solo hay que encenderlo:

1. En GitHub, ve a **Settings → Pages**.
2. En **Source**, elige **GitHub Actions**.
3. Fusiona esta rama a `main`. El flujo corre las pruebas y publica.

Queda en `https://javi-molin.github.io/piano/`.

> Hace falta `https`. Instalarla y el modo sin conexión dependen de un service worker, y
> eso no funciona abriendo el archivo a pelo.

### 2. Instálala

En el **iPad, con Safari** (no con Chrome: en iOS solo Safari sabe instalar):

1. Abre la dirección de arriba.
2. Toca **Compartir** (el cuadrado con la flecha).
3. **Añadir a pantalla de inicio** → **Añadir**.

Ya tienes el icono. Ábrelo desde ahí: va a pantalla completa, sin barras, y funciona en avión.

### 3. Primer uso

Elige si quieres los nombres de nota en **Do Re Mi** o en **C D E**, y empieza. El catálogo
trae 14 piezas; la primera recomendada es la escala de Do mayor o *Estrellita*.

---

## Cómo se usa

| | |
| --- | --- |
| **Aprender** | La canción **te espera** en cada nota, el tiempo que necesites. Si te adelantas, va contigo: el tempo lo pones tú. Es el modo para empezar. |
| **Tocar** | A tiempo, con la precisión contada pero sin presión. |
| **Dominar** | Con puntaje, estrellas y tres niveles de exigencia. Una pieza queda "dominada" con 90 % a velocidad real. |
| **Escuchar** | Solo oírla, viendo caer las notas. Para enterarte de cómo va antes de tocarla. |

Dentro del reproductor: **velocidad** del 25 al 200 % en vivo, **manos** (la que no practicas
la toca la app), **bucle**, **metrónomo**. Al terminar, un mapa de calor te dice en qué
compases se te escapa, y un botón te mete a practicar justo esos.

### Con qué puedes tocar

- **La pantalla.** Multitouch, con los nombres de nota sobre las teclas.
- **Tu piano de verdad**, por el **micrófono**. Ajustes → Con qué toco → Micrófono.
  Va bien con notas sueltas y acordes sencillos; con auriculares, mejor (si no, el altavoz
  se oye a sí mismo).
- **Un teclado MIDI**, donde el navegador tenga Web MIDI. **Safari en iPad no lo trae**:
  en el iPad, el camino es la pantalla o el micrófono.
- **El teclado del ordenador**: fila `Z`…`M` y `Q`…`P`.

### Tus canciones

- **Importa cualquier `.mid`**: arrastrándolo, eligiéndolo o pegando el enlace directo.
  Esto es lo que hace que la biblioteca no tenga límite, y es exacto.
- **Transcribir audio** (`.mp3`, `.m4a`, `.wav`) está, **en beta**: escucha el archivo y
  escribe las notas. Funciona con **una melodía sola** —voz, silbido, flauta, una línea de
  piano— y se pierde con acordes o con una banda entera. Un enlace de YouTube o Spotify no
  sirve: eso es audio con derechos, no una partitura.
- **Graba** lo que improvises en Juego libre y se guarda como una canción más.
- **Exporta** toda tu biblioteca a un `.json` desde Ajustes. Como no hay nube, esa es la
  forma de llevártela a otro dispositivo o de no perderla si borras los datos de Safari.

### El catálogo

14 piezas de **dominio público**, arregladas aquí: escala de Do y arpegios, Hanon n.º 1,
*Estrellita*, *Oda a la Alegría*, *Jingle Bells*, *Noche de paz*, Minueto en Sol,
estudio de arpegios, *Greensleeves*, *Para Elisa*, Canon en Re, Preludio en Do de Bach y
el tema del *Claro de luna*. No hay nada con derechos: lo demás lo pones tú con tus MIDI.

---

## Para desarrollar

Cero dependencias y cero compilación. Solo hace falta un servidor estático, porque los
módulos ES no cargan desde `file://`.

```bash
python3 -m http.server 8080     # o: npm start
# http://localhost:8080
```

```bash
npm test          # 30 pruebas del núcleo + los tokens de diseño (solo Node)
npm run test:e2e  # 15 recorridos en Chromium (necesita playwright)
npm run icons     # regenera los iconos desde los tokens
```

### Qué hay dentro

```
index.html             una sola página, pantallas conmutadas
styles.css             tokens de diseño como custom properties
sw.js                  service worker: todo del caché primero
src/score.js           modelo musical: DSL propio, digitación, secciones
src/songs.js           el catálogo de dominio público
src/midi.js            lector y escritor de MIDI estándar, y entrada Web MIDI
src/audio.js           piano sintetizado (sin un solo byte de sample)
src/mic.js             notas por micrófono: picos del espectro sin armónicos
src/transcribe.js      audio a notas con YIN (beta)
src/keyboard.js        geometría, dibujo y multitouch del teclado
src/roll.js            el piano-roll que cae
src/player.js          el tutor: modo espera, puntuación, bucle
src/store.js           IndexedDB + localStorage, exportar e importar
src/ui.js, src/app.js  pantallas y cableado
tools/make_icons.py    genera los PNG del icono, sin librerías
tests/                 núcleo, tokens y navegador
replica/               recon, arquitectura, diseño, marca, pruebas, paridad
.claude/skills/        el pack replica-skill, por si quieres repetir algún paso
```

Decisiones que explican casi todo lo demás:

- **El reloj maestro es el del audio**, no `requestAnimationFrame`. rAF deriva; el audio no.
- **Todo se mide en beats**, no en milisegundos. Así, al bajar la velocidad, el margen de
  acierto se ensancha solo: ralentizar ayuda de verdad.
- **Sin samples de piano.** Un piano grabado son decenas de megas y mataría el modo sin
  conexión. El timbre es sintético y la app entera pesa menos que una foto.
- **Sin backend.** El precio: no hay sincronización entre dispositivos. Se cubre exportando.

---

## Lo que esta app **no** hace

Dicho antes de que lo descubras tú:

- **No convierte una canción de Spotify o YouTube en un tutorial.** Eso necesita un modelo
  de transcripción corriendo en un servidor, y aquí no hay servidor. El import de MIDI
  cubre lo mismo y es exacto; la transcripción de audio propia es monofónica y está marcada
  como beta en la propia pantalla.
- **No tiene catálogo de canciones conocidas.** Serían licencias. El catálogo es de dominio
  público y lo tuyo lo pones tú.
- **No hay cuenta ni nube.** Si borras los datos del navegador sin exportar, se va.
- **No manda recordatorios.** Una PWA en iOS no da notificaciones sin más. La racha está,
  el aviso no.
- **Está solo en español.**

Paridad medida contra el mapa de recon: **90 / 100**
(`npm run parity`). Lo que falta es exactamente lo de arriba.

## Licencia

MIT. Las obras del catálogo son de dominio público; los arreglos se escribieron aquí.
