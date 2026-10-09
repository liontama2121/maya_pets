import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { dogBySlug, dogInput, listDogs, requestInput, toDogCard, type DogInput } from "../adoption";
import { REQUEST_STATUS } from "../db/schema";
import type { AppEnv } from "../env";
import { uniqueSlug, slugify } from "../lib/slug";
import { requireRole } from "../middleware/auth";
import { mediaUrl } from "../storage/driver";

const onFail = (result: { success: boolean; error?: z.ZodError }, c: { json: (b: unknown, s: 400) => Response }) => {
  if (!result.success) {
    return c.json({ error: "Revisa los campos marcados.", fields: result.error!.flatten().fieldErrors }, 400);
  }
};

/* --------------------------------- Público --------------------------------- */

export const adopcion = new Hono<AppEnv>();

adopcion.get("/perritos", async (c) => {
  c.header("Cache-Control", "public, max-age=60");
  return c.json(await listDogs(c.env.DB, { size: c.req.query("tamano"), age: c.req.query("edad"), energy: c.req.query("energia") }));
});

adopcion.get("/perritos/:slug", async (c) => {
  const dog = await dogBySlug(c.env.DB, c.req.param("slug"));
  if (!dog) throw new HTTPException(404, { message: "No encontramos a ese perrito." });
  return c.json(dog);
});

adopcion.post("/solicitud", zValidator("json", requestInput, onFail), async (c) => {
  const b = c.req.valid("json");
  if (b.website) throw new HTTPException(400, { message: "No se pudo enviar." });
  if (b.dogId) {
    const dog = await c.env.DB.prepare(`SELECT status FROM dogs WHERE id = ?`).bind(b.dogId).first<{ status: string }>();
    if (!dog) throw new HTTPException(404, { message: "Ese perrito ya no está en la lista." });
    if (dog.status === "adoptado") throw new HTTPException(409, { message: "Este perrito ya encontró hogar. ¡Mira los demás!" });
  }
  // Freno simple: máximo 3 solicitudes por celular en 24 horas.
  const recent = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM adoption_requests WHERE phone = ? AND created_at > ?`,
  )
    .bind(b.phone, new Date(Date.now() - 86400_000).toISOString())
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= 3) {
    throw new HTTPException(429, { message: "Ya recibimos tus solicitudes de hoy. Te escribimos pronto por WhatsApp." });
  }
  await c.env.DB.prepare(
    `INSERT INTO adoption_requests (dog_id, full_name, phone, email, neighborhood, home_type, hours_alone, other_pets, has_kids, experience, message, consent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      b.dogId,
      b.fullName,
      b.phone,
      b.email,
      b.neighborhood,
      b.homeType,
      b.hoursAlone,
      b.otherPets,
      b.hasKids ? 1 : 0,
      b.experience,
      b.message,
      new Date().toISOString(),
    )
    .run();
  return c.json({ ok: true }, 201);
});

/* ---------------------------------- Panel ---------------------------------- */

export const adminAdopcion = new Hono<AppEnv>();
adminAdopcion.use("/adopcion/*", requireRole("adopciones"));

adminAdopcion.get("/adopcion/perritos", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT d.*,
       (SELECT p.key FROM dog_photos p WHERE p.dog_id = d.id ORDER BY p.sort_order, p.id LIMIT 1) AS photo_key,
       (SELECT p.alt FROM dog_photos p WHERE p.dog_id = d.id ORDER BY p.sort_order, p.id LIMIT 1) AS photo_alt,
       (SELECT COUNT(*) FROM dog_photos p WHERE p.dog_id = d.id) AS photo_count,
       (SELECT COUNT(*) FROM adoption_requests r WHERE r.dog_id = d.id AND r.status IN ('nueva', 'en_revision')) AS open_requests
     FROM dogs d ORDER BY CASE d.status WHEN 'disponible' THEN 0 WHEN 'en_proceso' THEN 1 ELSE 2 END, d.updated_at DESC`,
  ).all<Record<string, unknown>>();
  return c.json(results.map((r) => ({ ...toDogCard(r), photoCount: r.photo_count, openRequests: r.open_requests })));
});

adminAdopcion.get("/adopcion/perritos/:id{[0-9]+}", async (c) => {
  const id = Number(c.req.param("id"));
  const dog = await c.env.DB.prepare(`SELECT * FROM dogs WHERE id = ?`).bind(id).first<Record<string, unknown>>();
  if (!dog) throw new HTTPException(404, { message: "Ese perrito no existe." });
  const { results: photos } = await c.env.DB.prepare(
    `SELECT key, alt, width, height FROM dog_photos WHERE dog_id = ? ORDER BY sort_order, id`,
  )
    .bind(id)
    .all<{ key: string; alt: string; width: number | null; height: number | null }>();
  return c.json({
    id: dog.id,
    slug: dog.slug,
    name: dog.name,
    sex: dog.sex,
    ageMonths: dog.age_months,
    size: dog.size,
    weightKg: dog.weight_kg,
    breed: dog.breed,
    energy: dog.energy,
    temperament: dog.temperament,
    goodWithKids: dog.good_with_kids,
    goodWithDogs: dog.good_with_dogs,
    goodWithCats: dog.good_with_cats,
    sterilized: dog.sterilized === 1,
    vaccinated: dog.vaccinated === 1,
    dewormed: dog.dewormed === 1,
    story: dog.story,
    specialNeeds: dog.special_needs,
    status: dog.status,
    featured: dog.featured === 1,
    photos: photos.map((p) => ({ ...p, url: mediaUrl(p.key) })),
  });
});

function dogStatements(DB: D1Database, id: number | string, b: DogInput) {
  return [
    DB.prepare(`DELETE FROM dog_photos WHERE dog_id = ?`).bind(id),
    ...b.photos.map((p, i) =>
      DB.prepare(`INSERT INTO dog_photos (dog_id, key, alt, width, height, sort_order) VALUES (?, ?, ?, ?, ?, ?)`).bind(
        id,
        p.key,
        p.alt,
        p.width ?? null,
        p.height ?? null,
        i,
      ),
    ),
  ];
}

const dogValues = (b: DogInput) => [
  b.name,
  b.sex,
  b.ageMonths,
  b.size,
  b.weightKg,
  b.breed || "Criollo",
  b.energy,
  b.temperament,
  b.goodWithKids,
  b.goodWithDogs,
  b.goodWithCats,
  b.sterilized ? 1 : 0,
  b.vaccinated ? 1 : 0,
  b.dewormed ? 1 : 0,
  b.story,
  b.specialNeeds,
  b.status,
  b.featured ? 1 : 0,
];

adminAdopcion.post("/adopcion/perritos", zValidator("json", dogInput, onFail), async (c) => {
  const b = c.req.valid("json");
  const DB = c.env.DB;
  const slug = await uniqueSlug(b.name, async (s) => Boolean(await DB.prepare(`SELECT 1 FROM dogs WHERE slug = ?`).bind(s).first()));
  const row = await DB.prepare(
    `INSERT INTO dogs (slug, name, sex, age_months, size, weight_kg, breed, energy, temperament, good_with_kids, good_with_dogs, good_with_cats,
       sterilized, vaccinated, dewormed, story, special_needs, status, featured, adopted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(slug, ...dogValues(b), b.status === "adoptado" ? new Date().toISOString() : null)
    .first<{ id: number }>();
  await DB.batch(dogStatements(DB, row!.id, b));
  return c.json({ id: row!.id, slug }, 201);
});

adminAdopcion.put("/adopcion/perritos/:id{[0-9]+}", zValidator("json", dogInput, onFail), async (c) => {
  const id = Number(c.req.param("id"));
  const b = c.req.valid("json");
  const DB = c.env.DB;
  const current = await DB.prepare(`SELECT name, slug FROM dogs WHERE id = ?`).bind(id).first<{ name: string; slug: string }>();
  if (!current) throw new HTTPException(404, { message: "Ese perrito no existe." });
  let slug = current.slug;
  if (slugify(b.name) !== slugify(current.name)) {
    slug = await uniqueSlug(b.name, async (s) => Boolean(await DB.prepare(`SELECT 1 FROM dogs WHERE slug = ? AND id != ?`).bind(s, id).first()));
  }
  await DB.batch([
    DB.prepare(
      `UPDATE dogs SET slug = ?, name = ?, sex = ?, age_months = ?, size = ?, weight_kg = ?, breed = ?, energy = ?, temperament = ?,
         good_with_kids = ?, good_with_dogs = ?, good_with_cats = ?, sterilized = ?, vaccinated = ?, dewormed = ?, story = ?,
         special_needs = ?, status = ?, featured = ?,
         adopted_at = CASE WHEN ? = 'adoptado' THEN COALESCE(adopted_at, ?) ELSE NULL END,
         updated_at = ?
       WHERE id = ?`,
    ).bind(slug, ...dogValues(b), b.status, new Date().toISOString(), new Date().toISOString(), id),
    ...dogStatements(DB, id, b),
  ]);
  return c.json({ id, slug });
});

adminAdopcion.get("/adopcion/solicitudes", async (c) => {
  const estado = c.req.query("estado");
  const filter = estado && (REQUEST_STATUS as readonly string[]).includes(estado) ? "WHERE r.status = ?" : "";
  const stmt = c.env.DB.prepare(
    `SELECT r.*, d.name AS dog_name, d.slug AS dog_slug,
       (SELECT COUNT(*) FROM adoption_notes n WHERE n.request_id = r.id) AS notes
     FROM adoption_requests r LEFT JOIN dogs d ON d.id = r.dog_id ${filter}
     ORDER BY CASE r.status WHEN 'nueva' THEN 0 WHEN 'en_revision' THEN 1 ELSE 2 END, r.created_at DESC LIMIT 200`,
  );
  const { results } = await (filter ? stmt.bind(estado) : stmt).all();
  return c.json(results);
});

adminAdopcion.get("/adopcion/solicitudes/:id{[0-9]+}/notas", async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT * FROM adoption_notes WHERE request_id = ? ORDER BY created_at`)
    .bind(Number(c.req.param("id")))
    .all();
  return c.json(results);
});

adminAdopcion.post(
  "/adopcion/solicitudes/:id{[0-9]+}/notas",
  zValidator("json", z.object({ text: z.string().trim().min(2, "Escribe la nota").max(1000) }), onFail),
  async (c) => {
    const row = await c.env.DB.prepare(`INSERT INTO adoption_notes (request_id, text, author) VALUES (?, ?, ?) RETURNING *`)
      .bind(Number(c.req.param("id")), c.req.valid("json").text, c.get("staff").name)
      .first();
    return c.json(row, 201);
  },
);

adminAdopcion.put(
  "/adopcion/solicitudes/:id{[0-9]+}/estado",
  zValidator("json", z.object({ status: z.enum(REQUEST_STATUS) }), onFail),
  async (c) => {
    const id = Number(c.req.param("id"));
    const { status } = c.req.valid("json");
    const staff = c.get("staff");
    const r = await c.env.DB.batch([
      c.env.DB.prepare(`UPDATE adoption_requests SET status = ?, updated_at = ? WHERE id = ?`).bind(status, new Date().toISOString(), id),
      c.env.DB.prepare(`INSERT INTO adoption_notes (request_id, text, author) SELECT ?, ?, ? WHERE changes() > 0`).bind(
        id,
        `Cambió el estado a "${status.replace("_", " ")}".`,
        staff.name,
      ),
    ]);
    if (!r[0]!.meta.changes) throw new HTTPException(404, { message: "Esa solicitud no existe." });
    return c.json({ ok: true });
  },
);
