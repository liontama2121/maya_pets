import { zValidator } from "@hono/zod-validator";
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { SEASON_SLUGS, seasonEvents, staffUsers } from "../db/schema";
import type { AppEnv } from "../env";
import { requireRole } from "../middleware/auth";
import { seasonInput, staffInput } from "../schemas";
import { isSeasonLive, SEASON_PRESETS } from "../seasons";
import { r2Driver } from "../storage/r2";

const onFail = (result: { success: boolean; error?: z.ZodError }, c: { json: (b: unknown, s: 400) => Response }) => {
  if (!result.success) {
    return c.json({ error: "Revisa los campos marcados.", fields: result.error!.flatten().fieldErrors }, 400);
  }
};

export const adminSite = new Hono<AppEnv>();

/* ------------------------- Quién soy (panel) ------------------------- */

adminSite.get("/me", async (c) => {
  const staff = c.get("staff");
  await c.get("db").update(staffUsers).set({ lastSeenAt: new Date().toISOString() }).where(eq(staffUsers.id, staff.id));
  return c.json(staff);
});

/* ----------------------- Eventos de temporada ----------------------- */

adminSite.get("/seasons", requireRole("admin"), async (c) => {
  const rows = await c.get("db").select().from(seasonEvents).orderBy(asc(seasonEvents.startsAt));
  return c.json(
    rows.map((e) => ({ ...e, live: isSeasonLive(e), preset: SEASON_PRESETS[e.slug] })),
  );
});

adminSite.put(
  "/seasons/:slug",
  requireRole("admin"),
  zValidator("param", z.object({ slug: z.enum(SEASON_SLUGS) })),
  zValidator("json", seasonInput, onFail),
  async (c) => {
    const { slug } = c.req.valid("param");
    const input = c.req.valid("json");
    const staff = c.get("staff");
    const db = c.get("db");

    // Solo un evento forzado a la vez: forzar uno apaga el forzado de los demás.
    if (input.forceActive) {
      await db.update(seasonEvents).set({ forceActive: false });
    }
    const values = { ...input, updatedAt: new Date().toISOString(), updatedBy: staff.name };
    const [row] = await db
      .insert(seasonEvents)
      .values({ slug, name: SEASON_PRESETS[slug].name, ...values })
      .onConflictDoUpdate({ target: seasonEvents.slug, set: values })
      .returning();
    return c.json({ ...row!, live: isSeasonLive(row!), preset: SEASON_PRESETS[slug] });
  },
);

/* ------------------------------- Fotos ------------------------------- */

const ALLOWED = new Map([
  ["image/webp", "webp"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/avif", "avif"],
]);
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * El navegador ya redimensiona y convierte a WebP antes de subir (Workers no tiene sharp).
 * Aquí solo validamos tipo y tamaño y guardamos en R2.
 */
adminSite.post("/uploads", requireRole("admin", "adopciones"), async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  const folder = form.get("folder") === "perritos" ? "perritos" : form.get("folder") === "categorias" ? "categorias" : "productos";
  if (!(file instanceof File)) throw new HTTPException(400, { message: "No llegó ninguna foto." });
  const ext = ALLOWED.get(file.type);
  if (!ext) throw new HTTPException(415, { message: "Sube la foto en JPG, PNG o WebP." });
  if (file.size > MAX_BYTES) throw new HTTPException(413, { message: "La foto pesa más de 4 MB." });

  // Verificación mínima de la firma del archivo, no solo del tipo declarado.
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const sig = String.fromCharCode(...head);
  const valid =
    (ext === "jpg" && head[0] === 0xff && head[1] === 0xd8) ||
    (ext === "png" && sig.startsWith("\x89PNG")) ||
    (ext === "webp" && sig.startsWith("RIFF") && sig.slice(8, 12) === "WEBP") ||
    (ext === "avif" && sig.slice(4, 8) === "ftyp");
  if (!valid) throw new HTTPException(415, { message: "El archivo no parece una imagen válida." });

  const key = `${folder}/${crypto.randomUUID()}.${ext}`;
  const storage = r2Driver(c.env.MEDIA);
  await storage.put(key, await file.arrayBuffer(), file.type);
  return c.json({ key, url: storage.url(key) }, 201);
});

/* ------------------------- Personal del panel ------------------------ */

adminSite.get("/staff", requireRole("admin"), async (c) => {
  return c.json(await c.get("db").select().from(staffUsers).orderBy(asc(staffUsers.name)));
});

adminSite.post("/staff", requireRole("admin"), zValidator("json", staffInput, onFail), async (c) => {
  const input = c.req.valid("json");
  const db = c.get("db");
  const exists = await db.query.staffUsers.findFirst({ where: eq(staffUsers.email, input.email) });
  if (exists) throw new HTTPException(409, { message: "Ese correo ya tiene acceso." });
  const [row] = await db.insert(staffUsers).values(input).returning();
  return c.json(row, 201);
});

adminSite.put(
  "/staff/:id{[0-9]+}",
  requireRole("admin"),
  zValidator("json", staffInput, onFail),
  async (c) => {
    const id = Number(c.req.param("id"));
    const input = c.req.valid("json");
    const me = c.get("staff");
    if (id === me.id && (!input.active || !input.roles.includes("admin"))) {
      throw new HTTPException(409, { message: "No puedes quitarte a ti misma el acceso de administradora." });
    }
    const [row] = await c.get("db").update(staffUsers).set(input).where(eq(staffUsers.id, id)).returning();
    if (!row) throw new HTTPException(404, { message: "Esa persona ya no está en la lista." });
    return c.json(row);
  },
);
