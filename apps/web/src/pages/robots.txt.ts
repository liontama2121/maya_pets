import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = ({ site, url }) => {
  const base = (site ?? new URL(url.origin)).toString().replace(/\/$/, "");
  const body = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
Disallow: /aliado

Sitemap: ${base}/sitemap.xml
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
};
