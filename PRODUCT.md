# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Astro 5 (SSR, `@astrojs/cloudflare`) + Tailwind v4, islas React solo donde hace falta (carrito, POS, panel). API Hono montada en el mismo Worker de Astro, Drizzle sobre Cloudflare D1 remota (token de API; sin Docker ni emulación local). Imágenes en R2. Login del panel con Cloudflare Access; roles `admin`, `vendedor`, `adopciones` guardados en D1 por correo. Pagos Wompi (sandbox). Animación con anime.js v4. Decisiones del usuario 2026-10-07: D1, sin Docker, Cloudflare Access en lugar de Keycloak.

## Users

- **Familias en Bogotá con perro o gato**, comprando mayormente desde el celular: alimento, collares, correas, platos, snacks y premios.
- **Personas que quieren adoptar un perrito**: exploran la galería, siguen la guía de Maya y envían una solicitud.
- **Luisa, dueña de la tienda**: no técnica. Sube ella misma categorías y productos, activa eventos de temporada y controla ventas online y en la tienda física. Rol `admin`.
- **Vendedor de mostrador** (rol `vendedor`): POS, pedidos, consulta de inventario.
- **Equipo de adopciones** (rol `adopciones`): solo el módulo de adopción.

## Product Purpose

Tienda para perros y gatos con lema "Mi mascota, mi familia". Vende online y en tienda física con un solo inventario. Su sección más importante es **Adopción ("Adopta con Maya")**. Éxito: ventas desde el celular sin fricción, perritos adoptados por familias compatibles y una dueña que maneja todo sola desde el panel.

## Positioning

Maya, la perrita del logo, es la perrita **imaginaria** de la hija de los fundadores. Maya acompaña al visitante como guía invisible: se nota por lo que hace (huellas, juguetes que se mueven), nunca por un dibujo nuevo. La tienda une compra y adopción bajo la misma historia familiar.

## Operating Context

- Compras desde el celular, a menudo con una sola mano.
- Venta presencial en mostrador con POS: efectivo, tarjeta, Nequi, Daviplata, transferencia; apertura y cierre de caja.
- Luisa carga productos y fotos desde el panel; el resultado debe verse igual que en la tienda pública.
- Eventos de temporada controlados por Luisa: Halloween, Navidad, Año Nuevo, Amor y Amistad (septiembre en Colombia).
- Contacto principal por WhatsApp: +57 304 6585424.

## Capabilities and Constraints

- Stock único compartido entre tienda online y POS.
- Toda venta en una sola tabla `Sale` con `channel` (ONLINE | STORE) y el usuario de Keycloak que la registró.
- Categorías dinámicas: Luisa las crea, no están fijas en código.
- **Sin IA** en ninguna parte del producto (decisión del usuario 2026-10-07).
- Módulo futuro, diferido: "Vecinos que cuidan tu mascota", con negociación guiada por Maya (flujo por pasos, sin IA).
- Datos personales bajo Ley 1581 de 2012 (solicitud de adopción con consentimiento).
- Abierto: dirección y horario de la tienda física (TODO).

## Brand Commitments

- Logo `apps/web/public/brand/maya-logo.png`, usado tal cual: no redibujar, no recrear en SVG, no cambiar colores ni proporciones.
- Colores medidos en el logo: verde petróleo #0F6267 (base) y amarillo #FECA0C (acento), más blanco. Los archivos entregados (logo1.jpg círculo, logo2.png letras) traen el fondo cuadriculado pintado; apps/web/scripts/prepare-logos.mjs los recorta sin redibujar.
- Motivo permitido: la huella del logo, con moderación.
- Footer: "Hecho con amor por JuanCode" + botón de WhatsApp.
- Tono cálido y familiar, no infantil.
- Tema de movimiento elegido por el usuario: "Patio de juegos" (anime.js, muy animado).

## Evidence on Hand

- Logo: logo1.jpg (insignia circular) y logo2.png (letras) en la raíz; versiones web en apps/web/public/brand/.
- Fotos de productos, tienda y perritos: no existen todavía; Luisa las sube luego desde el panel. Usar marcadores de foto claramente identificados, nunca fotos presentadas como reales.
- No hay testimonios, cifras ni reseñas reales: no inventarlos como reales; seeds marcados como ejemplo.
- No publicar nombre, foto ni dibujos de la hija sin autorización escrita (menor de edad).

## Product Principles

1. Adopción primero: cada decisión de diseño debe acercar a un perrito a una familia compatible.
2. Luisa sola puede: el panel no exige conocimientos técnicos ni ayuda externa.
3. Un solo inventario, una sola verdad de ventas entre online y tienda.
4. Maya se siente, no se dibuja.
5. Celular primero: la compra completa cabe en una mano.

## Accessibility & Inclusion

WCAG 2.1 AA. Contraste revisado especialmente en texto sobre amarillo. Toda animación respeta `prefers-reduced-motion`.
