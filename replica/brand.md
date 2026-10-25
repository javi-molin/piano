# Brand — Cascada

**Nombre:** Cascada. Las notas caen sobre el teclado como agua; en español se lee
solo y no se parece a nada del original.

**Tagline:** Toca piano de verdad. Sin suscripción, sin límites, sin internet.

**Voz:** directa, sin jerga de producto, sin exclamaciones. Habla de tocar, no de
"desbloquear tu potencial". Nunca promete que aprenderás en 7 días.

**Paleta:** `replica/design/tokens.json`. Violeta como acento, turquesa = mano
derecha, ámbar = mano izquierda. Fondo casi negro: es una app que se usa con el
iPad apoyado en el atril, de noche.

**Logo:** tres barras redondeadas cayendo sobre una línea de teclas, en violeta
sobre fondo oscuro. Generado aquí (`tools/make_icons.py`), no tomado de nadie.

**Tipografía:** la del sistema (San Francisco en iPad). Cero webfonts: offline real.

## Comprobaciones antes de vender (las hace el usuario, no esta skill)

- [ ] Búsqueda de marca "Cascada" en la clase 9/41 en INAPI (Chile) y EUIPO/USPTO.
- [ ] Dominio: cascada.app / cascadapiano.com / toca-cascada.com.
- [ ] Nombre en App Store / Google Play: ya hay apps llamadas "Cascada"; para
      publicar en tiendas conviene un apellido ("Cascada Piano").
- [ ] Revisar la licencia de cada pieza del catálogo si se añade algo que no sea
      dominio público. Lo que hay ahora son obras PD (Beethoven, Bach, Satie...).

## Barrido

`npm run sweep` (lee `replica/sweep.json`, para que ni el comando lleve el nombre del
original) debe salir limpio antes de desplegar. El nombre del original aparece solo en
`replica/*.md` como fuente de recon, nunca en el código ni en la UI.
