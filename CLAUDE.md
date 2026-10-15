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

## Panel `/admin`

- Usuario y contraseña desde secretos de Cloudflare: `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET` (≥32),
  `ADMIN_NAME`. Cookie HttpOnly firmada 12 h; bloqueo de 15 min tras 5 fallos. Local: `apps/web/.dev.vars`.
- Los likes de MAYA Kids **solo** vienen de Instagram (nadie los edita a mano).

## Desarrollo

```bash
npm install
npm run dev -w @maya/web        # http://localhost:4321 (lee ../../.env y apps/web/.dev.vars)
npm test -w @maya/api           # simulaciones de juegos, guía de Maya
npx astro check                 # en apps/web
```

Si al agregar íconos nuevos el navegador falla con "Failed to fetch dynamically imported module", borrar
`node_modules/.vite` y reiniciar el servidor (caché de dependencias de Vite).

## Mapa del sitio

- `/` · `/tienda` · `/club-maya` · `/maya-conecta` (Adopta con MAYA, Ayúdame a volver, Blog MAYA, MAYA Aliados,
  Historias que conectan, MAYA Solidaria) · `/maya-kids` · `/maya-premia` (COIN: 3 intentos + boleta de rifa) · `/contacto`
- Antiguas: `/juega` → `/maya-premia`, `/adopta` → `/maya-conecta/adopta` (301, conservan `?codigo=`).

## Reestructura en curso (oct-2026)

Fases: 1) contacto, menú, sub-marcas, redirecciones, sitemap · 2) MAYA Premia · 3) Club MAYA (clientes, mascotas,
niveles, recordatorios; pedidos se guardan antes de WhatsApp y Luisa confirma la venta, que descuenta stock) ·
4) MAYA Conecta + cola de moderación · 5) MAYA Kids · 6) pulido y despliegue.
