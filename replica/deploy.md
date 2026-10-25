# Deploy — Cascada

## Preflight

| comprobación | comando | estado |
| --- | --- | --- |
| Pruebas del núcleo | `node tests/engine.test.mjs` | 30 bien |
| Tokens de diseño sin deriva | `node tests/tokens.test.mjs` | 18 alineados, cero hex sueltos |
| Pruebas de navegador | `node tests/e2e.mjs` | 15 bien |
| Contraste WCAG | `npm run contrast` | 14 pares, 0 fallando AA |
| Paridad | `npm run parity` | 90,1 / 100 |
| Nada del original en el código | `npm run sweep` | limpio |
| Ficha de tienda | `npm run listing` | 0 errores, 0 avisos |
| Bugs abiertos S1/S2 | `replica/bug-report.md` | ninguno |

`parity.py` avisa de que 4 funciones "must" están a medias y por eso no da el visto bueno de
"shippable". Es correcto y se deja así: son las cuatro que dependen de un modelo en servidor
(transcribir una canción desde un enlace) o de una API que Safari en iPad no tiene (Web MIDI).
Están marcadas como `partial` con su motivo, dichas en el README y dichas en la propia
interfaz. Para el encargo —un tutor de piano ilimitado en un iPad— eso no bloquea nada.

## Producción

Sitio estático. No hay servidor, base de datos, claves ni variables de entorno.

1. **GitHub Pages** desde `.github/workflows/pages.yml`: corre las tres suites y publica.
   En el repositorio: *Settings → Pages → Source: GitHub Actions*.
2. Queda en `https://<usuario>.github.io/<repo>/`.
3. **Hace falta https.** El service worker y "Añadir a pantalla de inicio" no funcionan
   sobre `file://` ni sobre http simple.

### Dominio propio, si algún día

1. En *Settings → Pages → Custom domain*, pon el dominio.
2. En tu DNS, un `CNAME` de `www` a `<usuario>.github.io`, o cuatro `A` del ápice a
   `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.
3. Espera a que GitHub emita el certificado y marca *Enforce HTTPS*.

### Al publicar una versión nueva

Sube `VERSION` en `sw.js` (`cascada-v1` → `cascada-v2`). Si no, los iPads ya instalados
seguirán sirviendo la copia vieja del caché hasta que la red les traiga otra cosa.

## Vuelta atrás

No hay estado en servidor que migrar: volver atrás es volver a publicar el commit anterior.
Lo único que vive fuera del código son los datos del usuario en su propio dispositivo, y el
formato de exportación lleva `version: 1` por si alguna vez cambia.
