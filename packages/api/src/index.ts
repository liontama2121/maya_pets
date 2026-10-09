import { zValidator } from "@hono/zod-validator";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import {
  featuredProducts,
  listBrands,
  listCategories,
  listProducts,
  liveSeason,
  productBySlug,
} from "./catalog";
import * as schema from "./db/schema";
import type { AppEnv } from "./env";
import { z } from "zod";
import { identifyStaff, login, requireStaff, sessionCookie } from "./middleware/auth";
import { adminAdopcion, adopcion } from "./routes/adoption";
import { adminCatalog } from "./routes/admin-catalog";
import { adminSite } from "./routes/admin-site";
import { adminKids, kids } from "./routes/kids";
import { adminPromo, juega } from "./routes/promo";
import { catalogQuery } from "./schemas";
import { r2Driver } from "./storage/r2";

/**
 * API de MAYA Pets. Se monta dentro del Worker de Astro en /api y /media.
 */
export const app = new Hono<AppEnv>();

app.use("*", secureHeaders({ crossOriginResourcePolicy: "same-origin" }));

app.use("*", async (c, next) => {
  c.set("db", drizzle(c.env.DB, { schema }));
  await next();
});

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    const fields = err.cause && typeof err.cause === "object" ? err.cause : undefined;
    return c.json({ error: err.message, ...(fields ? { fields } : {}) }, err.status);
  }
  console.error("[api]", err);
  return c.json({ error: "Algo salió mal de nuestro lado. Intenta de nuevo en un momento." }, 500);
});

app.notFound((c) => c.json({ error: "No encontramos lo que buscas." }, 404));

/* ------------------------------ Público ------------------------------ */

const pub = new Hono<AppEnv>();

pub.get("/catalog/products", zValidator("query", catalogQuery), async (c) => {
  return c.json(await listProducts(c.env.DB, c.req.valid("query")));
});

pub.get("/catalog/products/:slug", async (c) => {
  const product = await productBySlug(c.env.DB, c.req.param("slug"));
  if (!product) throw new HTTPException(404, { message: "Ese producto ya no está disponible." });
  return c.json(product);
});

pub.get("/catalog/featured", async (c) => c.json(await featuredProducts(c.env.DB)));
pub.get("/catalog/categories", async (c) => c.json(await listCategories(c.env.DB)));
pub.get("/catalog/brands", async (c) => c.json(await listBrands(c.env.DB)));
pub.get("/season", async (c) => c.json(await liveSeason(c.env.DB)));

app.route("/api", pub);
app.route("/api/juega", juega);
app.route("/api/kids", kids);
app.route("/api/adopcion", adopcion);

/* ------------------------------ Sesión ------------------------------ */

/** Solo se aceptan peticiones del mismo sitio (otra página no puede iniciar ni cerrar sesión). */
const sameOrigin = (req: Request) => {
  const origin = req.headers.get("Origin");
  return !origin || origin === new URL(req.url).origin;
};

app.post(
  "/api/auth/login",
  zValidator("json", z.object({ username: z.string().max(80), password: z.string().max(200) })),
  async (c) => {
    if (!sameOrigin(c.req.raw)) throw new HTTPException(403, { message: "Origen no permitido." });
    const { username, password } = c.req.valid("json");
    c.header("Set-Cookie", await login(c.req.raw, c.env, username, password));
    c.header("Cache-Control", "no-store");
    return c.json({ ok: true });
  },
);

app.post("/api/auth/logout", (c) => {
  if (!sameOrigin(c.req.raw)) throw new HTTPException(403, { message: "Origen no permitido." });
  c.header("Set-Cookie", sessionCookie(c.req.raw, "", 0));
  return c.json({ ok: true });
});

app.get("/api/auth/me", async (c) => {
  c.header("Cache-Control", "no-store");
  return c.json(await identifyStaff(c.req.raw, c.env));
});

/* ------------------------------- Panel ------------------------------- */

const admin = new Hono<AppEnv>();
admin.use("*", requireStaff);
admin.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store");
});
admin.route("/", adminCatalog);
admin.route("/", adminSite);
admin.route("/", adminPromo);
admin.route("/", adminKids);
admin.route("/", adminAdopcion);

app.route("/api/admin", admin);

/* ------------------------------- Fotos ------------------------------- */

app.get("/media/:folder/:file", async (c) => {
  const key = `${c.req.param("folder")}/${c.req.param("file")}`;
  if (!/^(productos|categorias|perritos|kids)\/[0-9a-f-]{36}\.(webp|jpg|png|avif)$/.test(key)) {
    return c.notFound();
  }
  const obj = await r2Driver(c.env.MEDIA).get(key);
  if (!obj) return c.notFound();
  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: obj.etag,
      "X-Content-Type-Options": "nosniff",
    },
  });
});

export type { AppEnv, Bindings } from "./env";
export * from "./catalog";
export { getContest, getSettings, leaderboard, monthInBogota } from "./promo";
export { publicKids, type PublicContest, type PublicEntry } from "./kids";
export * as adoption from "./adoption";
export { authConfigured, identifyStaff, hasRole } from "./middleware/auth";
export type { StaffIdentity } from "./env";
