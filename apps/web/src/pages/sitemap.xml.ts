import type { APIRoute } from "astro";
import { CONECTA_SECTIONS } from "../lib/brands";

export const prerender = false;

/** Sitemap dinámico: páginas fijas + productos activos + perritos en adopción. */
export const GET: APIRoute = async ({ locals, site, url }) => {
  const base = (site ?? new URL(url.origin)).toString().replace(/\/$/, "");
  const DB = locals.runtime.env.DB;

  const fixed = [
    "/",
    "/tienda",
    "/tienda?especie=perro",
    "/tienda?especie=gato",
    "/club-maya",
    "/maya-conecta",
    ...CONECTA_SECTIONS.filter((s) => s.ready).map((s) => s.href),
    "/maya-kids",
    "/maya-premia",
    "/maya-premia/terminos",
    "/maya-kids/terminos",
    "/contacto",
    "/nosotros",
    "/privacidad",
  ];

  const [products, dogs] = await Promise.all([
    DB.prepare(`SELECT slug, updated_at FROM products WHERE active = 1`).all<{ slug: string; updated_at: string }>(),
    DB.prepare(`SELECT slug, updated_at FROM dogs WHERE status != 'adoptado'`).all<{ slug: string; updated_at: string }>(),
  ]);

  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const entry = (path: string, lastmod?: string) =>
    `<url><loc>${esc(base + path)}</loc>${lastmod ? `<lastmod>${lastmod.slice(0, 10)}</lastmod>` : ""}</url>`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[
  ...fixed.map((p) => entry(p)),
  ...products.results.map((p) => entry(`/tienda/${p.slug}`, p.updated_at)),
  ...dogs.results.map((d) => entry(`/maya-conecta/adopta/${d.slug}`, d.updated_at)),
].join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
};
