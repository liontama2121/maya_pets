import { identifyStaff } from "@maya/api";
import { defineMiddleware } from "astro:middleware";

/**
 * /admin: Cloudflare Access autentica antes de llegar aquí (en producción).
 * Aquí se autoriza contra staff_users. Las rutas /api/admin se validan dentro de la API.
 */
export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname } = ctx.url;
  if (!pathname.startsWith("/admin")) return next();

  try {
    ctx.locals.staff = await identifyStaff(ctx.request, ctx.locals.runtime.env);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : "No pudimos verificar tu acceso.";
    return new Response(deniedPage(message), {
      status,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const res = await next();
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex");
  return res;
});

function deniedPage(message: string) {
  const safe = message.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
  return `<!doctype html><html lang="es-CO"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Panel MAYA Pets</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#0f6267;color:#fff;font:18px/1.5 system-ui,sans-serif;padding:24px}main{max-width:420px;text-align:center}a{display:inline-block;margin-top:20px;background:#feca0c;color:#073f40;font-weight:600;padding:12px 24px;border-radius:999px;text-decoration:none;box-shadow:inset 0 -4px 0 #c99d00}</style></head>
<body><main><h1 style="font-size:28px;margin:0 0 8px">Panel de MAYA Pets</h1><p>${safe}</p><p style="opacity:.85;font-size:16px">Si crees que es un error, pídele a Luisa que agregue tu correo en Equipo.</p><a href="/">Volver a la tienda</a></main></body></html>`;
}
