import { authConfigured, identifyStaff } from "@maya/api";
import { defineMiddleware } from "astro:middleware";

/**
 * /admin: exige sesión (usuario y contraseña de las variables de entorno).
 * Sin sesión → /admin/login. Las rutas /api/admin se validan dentro de la API.
 */
export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname } = ctx.url;
  if (!pathname.startsWith("/admin")) return next();

  const env = ctx.locals.runtime.env;
  const isLogin = pathname === "/admin/login" || pathname === "/admin/login/";

  if (!authConfigured(env)) {
    return new Response(
      notice("El panel no está configurado todavía.", "Faltan las variables ADMIN_USERNAME, ADMIN_PASSWORD y SESSION_SECRET en Cloudflare."),
      { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
    );
  }

  let signedIn = true;
  try {
    ctx.locals.staff = await identifyStaff(ctx.request, env);
  } catch {
    signedIn = false;
  }

  if (isLogin) {
    if (signedIn) return ctx.redirect("/admin");
  } else if (!signedIn) {
    const back = pathname + ctx.url.search;
    return ctx.redirect(`/admin/login?volver=${encodeURIComponent(back)}`);
  }

  const res = await next();
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex");
  res.headers.set("X-Frame-Options", "DENY");
  return res;
});

function notice(title: string, detail: string) {
  const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
  return `<!doctype html><html lang="es-CO"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Panel MAYA Pets</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#0f6267;color:#fff;font:18px/1.5 system-ui,sans-serif;padding:24px}main{max-width:440px;text-align:center}p{opacity:.9}a{display:inline-block;margin-top:20px;background:#feca0c;color:#073f40;font-weight:600;padding:12px 24px;border-radius:999px;text-decoration:none;box-shadow:inset 0 -4px 0 #c99d00}</style></head>
<body><main><h1 style="font-size:28px;margin:0 0 8px">Panel de MAYA Pets</h1><p>${esc(title)}</p><p style="font-size:16px">${esc(detail)}</p><a href="/">Volver a la tienda</a></main></body></html>`;
}
