import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { AppEnv } from "../env";
import { autoSyncKids, closeKidsContest, kidsContestFromRow, publicKids, submitDrawing, syncInstagramLikes } from "../kids";
import { uniqueSlug } from "../lib/slug";
import { requireRole } from "../middleware/auth";
import { mediaUrl } from "../storage/driver";

const onFail = (result: { success: boolean; error?: z.ZodError }, c: { json: (b: unknown, s: 400) => Response }) => {
  if (!result.success) {
    return c.json({ error: "Revisa los campos marcados.", fields: result.error!.flatten().fieldErrors }, 400);
  }
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa una fecha válida");

/* --------------------------------- Público --------------------------------- */

export const kids = new Hono<AppEnv>();

kids.get("/", async (c) => {
  c.executionCtx.waitUntil(autoSyncKids(c.env));
  c.header("Cache-Control", "public, max-age=60");
  return c.json(await publicKids(c.env.DB));
});

kids.post(
  "/inscribir",
  bodyLimit({ maxSize: 7 * 1024 * 1024, onError: (c) => c.json({ error: "La foto pesa más de 6 MB." }, 413) }),
  async (c) => c.json(await submitDrawing(c.env, await c.req.formData()), 201),
);

/* ---------------------------------- Panel ---------------------------------- */

export const adminKids = new Hono<AppEnv>();
adminKids.use("/kids/*", requireRole("admin"));

const contestInput = z
  .object({
    title: z.string().trim().min(3, "Escribe un nombre").max(80),
    theme: z.string().trim().min(3, "Escribe el tema").max(120),
    description: z.string().trim().max(600).default(""),
    prize: z.string().trim().min(2, "Escribe el premio").max(120),
    ageMin: z.coerce.number().int().min(1).max(17),
    ageMax: z.coerce.number().int().min(1).max(17),
    startsAt: isoDate,
    endsAt: isoDate,
    votingEndsAt: isoDate,
  })
  .refine((v) => v.ageMax >= v.ageMin, { message: "La edad máxima debe ser mayor o igual a la mínima", path: ["ageMax"] })
  .refine((v) => v.endsAt >= v.startsAt, { message: "El cierre de inscripciones debe ser después del inicio", path: ["endsAt"] })
  .refine((v) => v.votingEndsAt >= v.endsAt, { message: "La votación debe terminar después de cerrar inscripciones", path: ["votingEndsAt"] });

adminKids.get("/kids/concursos", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT k.*,
       (SELECT COUNT(*) FROM kids_entries e WHERE e.contest_id = k.id) AS total,
       (SELECT COUNT(*) FROM kids_entries e WHERE e.contest_id = k.id AND e.status = 'pendiente') AS pending,
       (SELECT COUNT(*) FROM kids_entries e WHERE e.contest_id = k.id AND e.status = 'publicado') AS published
     FROM kids_contests k ORDER BY k.starts_at DESC`,
  ).all<Record<string, unknown>>();
  return c.json(
    results.map((r) => ({
      ...kidsContestFromRow(r),
      total: r.total,
      pending: r.pending,
      published: r.published,
    })),
  );
});

adminKids.post("/kids/concursos", zValidator("json", contestInput, onFail), async (c) => {
  const b = c.req.valid("json");
  const slug = await uniqueSlug(b.title, async (s) =>
    Boolean(await c.env.DB.prepare(`SELECT 1 FROM kids_contests WHERE slug = ?`).bind(s).first()),
  );
  const row = await c.env.DB.prepare(
    `INSERT INTO kids_contests (slug, title, theme, description, prize, age_min, age_max, starts_at, ends_at, voting_ends_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(slug, b.title, b.theme, b.description, b.prize, b.ageMin, b.ageMax, b.startsAt, b.endsAt, b.votingEndsAt)
    .first<Record<string, unknown>>();
  return c.json(kidsContestFromRow(row!), 201);
});

adminKids.put("/kids/concursos/:id{[0-9]+}", zValidator("json", contestInput, onFail), async (c) => {
  const id = Number(c.req.param("id"));
  const b = c.req.valid("json");
  const current = await c.env.DB.prepare(`SELECT closed_at FROM kids_contests WHERE id = ?`).bind(id).first<{ closed_at: string | null }>();
  if (!current) throw new HTTPException(404, { message: "Ese concurso no existe." });
  if (current.closed_at) throw new HTTPException(409, { message: "Este concurso ya se cerró y no se puede editar." });
  const row = await c.env.DB.prepare(
    `UPDATE kids_contests SET title = ?, theme = ?, description = ?, prize = ?, age_min = ?, age_max = ?, starts_at = ?, ends_at = ?, voting_ends_at = ?
     WHERE id = ? RETURNING *`,
  )
    .bind(b.title, b.theme, b.description, b.prize, b.ageMin, b.ageMax, b.startsAt, b.endsAt, b.votingEndsAt, id)
    .first<Record<string, unknown>>();
  return c.json(kidsContestFromRow(row!));
});

adminKids.get("/kids/concursos/:id{[0-9]+}/dibujos", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM kids_entries WHERE contest_id = ?
     ORDER BY CASE status WHEN 'pendiente' THEN 0 WHEN 'aprobado' THEN 1 WHEN 'publicado' THEN 2 ELSE 3 END, likes DESC, created_at ASC`,
  )
    .bind(Number(c.req.param("id")))
    .all<Record<string, unknown>>();
  return c.json(
    results.map((r) => ({
      id: r.id,
      childName: r.child_name,
      childAge: r.child_age,
      drawingTitle: r.drawing_title,
      guardianName: r.guardian_name,
      guardianContact: r.guardian_contact,
      imageUrl: mediaUrl(r.image_key as string),
      status: r.status,
      rejectReason: r.reject_reason,
      instagramUrl: r.instagram_url,
      likes: r.likes,
      likesUpdatedAt: r.likes_updated_at,
      likesSource: r.likes_source,
      createdAt: r.created_at,
    })),
  );
});

adminKids.post(
  "/kids/dibujos/:id{[0-9]+}/estado",
  zValidator(
    "json",
    z.object({ status: z.enum(["pendiente", "publicado", "rechazado"]), reason: z.string().trim().max(200).default("") }),
    onFail,
  ),
  async (c) => {
    const { status, reason } = c.req.valid("json");
    if (status === "rechazado" && reason.length < 3) throw new HTTPException(400, { message: "Escribe el motivo del rechazo." });
    const r = await c.env.DB.prepare(
      `UPDATE kids_entries SET status = ?, reject_reason = ? WHERE id = ?`,
    )
      .bind(status, status === "rechazado" ? reason : "", Number(c.req.param("id")))
      .run();
    if (!r.meta.changes) throw new HTTPException(404, { message: "Ese dibujo no existe." });
    return c.json({ ok: true });
  },
);

adminKids.post("/kids/concursos/:id{[0-9]+}/sincronizar", async (c) =>
  c.json(await syncInstagramLikes(c.env, Number(c.req.param("id")))),
);

adminKids.post("/kids/concursos/:id{[0-9]+}/cerrar", async (c) =>
  c.json(await closeKidsContest(c.env, Number(c.req.param("id")), c.get("staff").name)),
);

adminKids.get("/kids/instagram", async (c) => c.json({ connected: Boolean(c.env.INSTAGRAM_ACCESS_TOKEN) }));

