# CLAUDE.md — MAYA Pets

Tienda para perros y gatos en Bogotá ("Mi mascota, mi familia") con programas de comunidad.
Cliente de JuanCode. Producción: https://maya-pets.pages.dev (rama `pro/maya`). `main` está vacía a propósito.

## Reglas que no se rompen

- **Logo** (`apps/web/public/brand/`): usar tal cual. No redibujar, no recrear en SVG, no recolorear.
  Los archivos web se generan desde `logo1.jpg` / `logo2.png` con `node apps/web/scripts/prepare-logos.mjs`.
- **Colores medidos del logo**: verde petróleo `#0F6267` (base) y amarillo `#FECA0C` (acento). Tokens en
  `apps/web/src/styles/global.css`. No cambiar tokens.
- **Sub-marcas** se escriben siempre igual: **Club MAYA**, **MAYA Conecta**, **MAYA Kids**, **MAYA Premia**.
  Se muestran con `<SubBrand brand="…" />` ("MAYA" en la tipografía de marca + el nombre). No inventar logos.
  Fuente única: `apps/web/src/lib/brands.ts`.
- **Voz**: Maya es una perrita imaginaria e invisible (de la hija de los fundadores). Se ve por su sombra y sus huellas;
  nunca se dibuja. Tono cálido, familiar, no infantil.
- **WhatsApp**: solo la constante `CONTACT_WHATSAPP` en `apps/web/src/lib/format.ts` (+57 317 537 8079).
  Nunca escribir el número en otro archivo.
- **Sin IA** en el producto.
- **Commits**: autor `liontama2121` y **sin** línea `Co-Authored-By` de Claude ni "Generated with Claude Code".
- **Datos personales** (Ley 1581 de 2012): consentimiento en cada formulario; de menores solo primer nombre y edad;
  cédulas y teléfonos nunca públicos.
- Todo lo que envía el público entra **pendiente** hasta que MAYA lo aprueba.

## Stack

- Monorepo npm: `apps/web` (Astro 5 SSR + `@astrojs/cloudflare`, Tailwind v4, islas React, anime.js v4)
  y `packages/api` (Hono + Drizzle + zod), montada dentro del mismo Worker en `/api` y `/media`.
- **Cloudflare Pages** (no Worker suelto): `wrangler.jsonc` en la **raíz** manda (carpeta `apps/web/dist`, D1 `DB`,
  R2 `MEDIA`, `nodejs_compat`). `apps/web/wrangler.jsonc` es solo para desarrollo local.
- **D1** `maya-db` (remota). Migraciones Drizzle en `apps/web/migrations` (`npm run db:generate`, luego
  `wrangler d1 migrations apply maya-db --local|--remote`).
- **R2** `maya-media` para fotos. Las fotos se reducen a WebP en el navegador antes de subir.
- Iconos: Phosphor (`@phosphor-icons/react`). En `.astro` se usa `className`, no `class`, en componentes React.
- Redirecciones antiguas (301) en `apps/web/src/middleware.ts` (Pages con Worker no aplica `_redirects`).

## Convenciones

- En Workers/Pages nunca guardar promesas ni objetos con I/O en variables de módulo compartidas entre requests.
  Solo datos ya resueltos o booleanos. Toda inicialización debe ser idempotente.

## Panel `/admin`

- Sin Keycloak ni Cloudflare Access. Dos tipos de cuenta (`packages/api/src/middleware/auth.ts`):
  - **Dueña**: secretos de Cloudflare `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET` (≥32), `ADMIN_NAME`. Rol `admin`.
  - **Equipo**: tabla D1 `staff_users` (correo = usuario, contraseña PBKDF2-SHA256 en `password_hash`, roles).
    La administradora las crea en `/admin/equipo`. El hash nunca sale de la API.
- Roles: `admin` (todo), `vendedor`, `adopciones`, `editor` (solo "Contenido del sitio"; `/admin` lo lleva ahí).
- Cookie HttpOnly firmada 12 h; bloqueo de 15 min tras 5 fallos. Cambiar contraseña o desactivar cierra sus sesiones.
  Local: `apps/web/.dev.vars`.
- Los likes de MAYA Kids **solo** vienen de Instagram (nadie los edita a mano).

## Contenido del sitio (`/admin/contenido`)

- Nada del inicio va escrito en el código: hero, banner de temporada, "¿Quién te espera en casa?", "Lo que más se
  llevan", textos del footer y la página de Nosotros salen de D1 (`content_blocks`). Esquemas zod y contenido inicial
  en `packages/api/src/content.ts` (si una fila falta o no valida, se usa el inicial).
- Cada bloque tiene **borrador** y **publicado**. Guardar → borrador; "Vista previa" abre la página con `?borrador=1`
  (solo con sesión `editor`/`admin`, `no-store` + `noindex`); "Publicar" actualiza el sitio sin deploy y guarda una
  versión en `content_versions`. Restaurar = publicar de nuevo una versión (queda en el historial; nada se borra).
- Imágenes: recorte en el navegador (`islands/admin/ImageField.tsx`), WebP máx. 1600 px, R2 `contenido/`. Solo rutas
  propias (`/brand/…`, `/media/…`); enlaces solo `/…` o `https://…`.
- Banner: título, subtítulo, botón ("Ver productos"), enlace, imagen, fechas, encendido, "Mostrar precios" y productos
  elegidos. Los colores e ícono salen de la temporada activa (`/admin/temporadas`, que ya no edita textos).
- "Lo que más se llevan": fijados primero, luego lo más vendido de 30 días (`stock_movements` `VENTA_ONLINE` +
  `VENTA_POS`) y, si falta, los destacados.
- Ilustraciones del inicio: `apps/web/public/brand/afiche/perro.svg` y `gato.svg` (perrito y gatico, **no** son Maya).
- La adopción no aparece en el inicio: vive solo en MAYA Conecta (`/maya-conecta/adopta`) y su menú.

## Desarrollo

```bash
npm install
npm run dev -w @maya/web        # http://localhost:4321 (lee ../../.env y apps/web/.dev.vars)
npm test -w @maya/api           # simulaciones de juegos, guía de Maya, contenido del sitio
npx astro check                 # en apps/web
```

Si al agregar íconos nuevos el navegador falla con "Failed to fetch dynamically imported module", borrar
`node_modules/.vite` y reiniciar el servidor (caché de dependencias de Vite).

## Mapa del sitio

- `/` (hero "Hola, soy Maya") · `/nosotros` · `/tienda` · `/club-maya` · `/maya-conecta` (Adopta con MAYA, Ayúdame a volver, Blog MAYA, MAYA Aliados,
  Historias que conectan, MAYA Solidaria) · `/maya-kids` · `/maya-premia` (COIN: 3 intentos + boleta de rifa) · `/contacto`
- Antiguas: `/juega` → `/maya-premia`, `/adopta` → `/maya-conecta/adopta` (301, conservan `?codigo=`).

## Reestructura en curso (oct-2026)

Fases: 1) contacto, menú, sub-marcas, redirecciones, sitemap · 2) MAYA Premia · 3) Club MAYA (clientes, mascotas,
niveles, recordatorios; pedidos se guardan antes de WhatsApp y Luisa confirma la venta, que descuenta stock) ·
4) MAYA Conecta + cola de moderación · 5) MAYA Kids · 6) pulido y despliegue.

## Cloudflare Workers: nada de promesas compartidas entre requests

Nunca guardar una promesa (ni nada que haga I/O: `fetch`, consultas D1/R2/KV, streams) en una variable de módulo para que la reusen otros requests (`let p = null; if (!p) p = init(); return p;`). Si el request que la creó se cancela, la promesa queda pendiente para siempre y todo request que caiga en ese isolate se cuelga sin error (pasó en Feria 4 Vientos, 2026-10-16: el sitio no cargaba en algunas redes y los archivos estáticos sí).
- Bien: un booleano (`let listo = false` → `await init(); listo = true;`); si un request muere, el siguiente reintenta. El trabajo debe ser idempotente (`CREATE TABLE IF NOT EXISTS`, `INSERT OR IGNORE`).
- En el módulo solo datos ya terminados (texto, números, objetos de solo lectura). Las cachés con promesas sí valen en código del navegador, no en el servidor.
- Síntoma para reconocerlo: los estáticos responden y las páginas se quedan "pensando". Ver con `npx wrangler pages deployment tail`; un redeploy destraba pero no lo arregla.
