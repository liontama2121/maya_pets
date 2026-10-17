import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { CONTENT_SCHEMAS, DEFAULT_CONTENT, parseBlock } from "../content";
import { CONTENT_KEYS, type ContentKey } from "../db/schema";
import type { AppEnv } from "../env";
import { requireRole } from "../middleware/auth";

/**
 * Contenido del sitio: guardar borrador, publicar, descartar, historial y restaurar.
 * Roles `editor` y `admin`. Publicar no requiere deploy: las páginas leen D1 en cada visita.
 */
export const adminContent = new Hono<AppEnv>();

adminContent.use("/content/*", requireRole("editor"));
adminContent.use("/content", requireRole("editor"));

interface BlockRow {
  key: ContentKey;
  draft: string;
  published: string;
  updated_at: string;
  updated_by: string | null;
  published_at: string | null;
  published_by: string | null;
}

const keyParam = zValidator("param", z.object({ key: z.enum(CONTENT_KEYS) }));
const VERSIONS_SHOWN = 20;

function toBlock(key: ContentKey, row: BlockRow | undefined) {
  const fallback = DEFAULT_CONTENT[key];
  const read = (raw: string | undefined) => {
    if (!raw) return fallback;
    try {
      return parseBlock(key, JSON.parse(raw)) ?? fallback;
    } catch {
      return fallback;
    }
  };
  const draft = read(row?.draft);
  const published = read(row?.published);
  return {
    key,
    draft,
    published,
    /** Hay cambios guardados que todavía no ve el público. */
    pending: JSON.stringify(draft) !== JSON.stringify(published),
    updatedAt: row?.updated_at ?? null,
    updatedBy: row?.updated_by ?? null,
    publishedAt: row?.published_at ?? null,
    publishedBy: row?.published_by ?? null,
  };
}
export type AdminContentBlock = ReturnType<typeof toBlock>;

async function readRow(db: D1Database, key: ContentKey) {
  return (await db.prepare(`SELECT * FROM content_blocks WHERE key = ?`).bind(key).first<BlockRow>()) ?? undefined;
}

adminContent.get("/content", async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT * FROM content_blocks`).all<BlockRow>();
  const byKey = new Map(results.map((r) => [r.key, r]));
  return c.json(CONTENT_KEYS.map((k) => toBlock(k, byKey.get(k))));
});

/** Guarda el borrador. El público no lo ve hasta publicar. */
adminContent.put("/content/:key", keyParam, async (c) => {
  const { key } = c.req.valid("param");
  const parsed = CONTENT_SCHEMAS[key].safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const i of parsed.error.issues) fields[i.path.join(".")] ??= i.message;
    throw new HTTPException(400, { message: "Revisa los campos marcados.", cause: fields });
  }
  const json = JSON.stringify(parsed.data);
  const who = c.get("staff").name;
  const initial = JSON.stringify(DEFAULT_CONTENT[key]);
  // Si el bloque nunca se había guardado, lo publicado sigue siendo el contenido inicial.
  await c.env.DB.prepare(
    `INSERT INTO content_blocks (key, draft, published, updated_by) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET draft = excluded.draft, updated_by = excluded.updated_by,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  )
    .bind(key, json, initial, who)
    .run();
  return c.json(toBlock(key, await readRow(c.env.DB, key)));
});

/** Publica el borrador y guarda la versión en el historial. */
adminContent.post("/content/:key/publish", keyParam, async (c) => {
  const { key } = c.req.valid("param");
  const row = await readRow(c.env.DB, key);
  if (!row) throw new HTTPException(409, { message: "Guarda los cambios antes de publicar." });
  const data = parseBlock(key, JSON.parse(row.draft));
  if (!data) throw new HTTPException(400, { message: "El borrador tiene campos sin completar." });
  const json = JSON.stringify(data);
  const who = c.get("staff").name;
  await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE content_blocks SET published = ?, published_by = ?, published_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE key = ?`,
    ).bind(json, who, key),
    c.env.DB.prepare(`INSERT INTO content_versions (key, data, note, created_by) VALUES (?, ?, 'Publicado', ?)`).bind(
      key,
      json,
      who,
    ),
  ]);
  return c.json(toBlock(key, await readRow(c.env.DB, key)));
});

/** Descarta el borrador: vuelve a lo publicado. */
adminContent.post("/content/:key/discard", keyParam, async (c) => {
  const { key } = c.req.valid("param");
  await c.env.DB.prepare(
    `UPDATE content_blocks SET draft = published, updated_by = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     WHERE key = ?`,
  )
    .bind(c.get("staff").name, key)
    .run();
  return c.json(toBlock(key, await readRow(c.env.DB, key)));
});

adminContent.get("/content/:key/versions", keyParam, async (c) => {
  const { key } = c.req.valid("param");
  const { results } = await c.env.DB.prepare(
    `SELECT id, note, created_at, created_by FROM content_versions WHERE key = ? ORDER BY id DESC LIMIT ?`,
  )
    .bind(key, VERSIONS_SHOWN)
    .all<{ id: number; note: string; created_at: string; created_by: string }>();
  return c.json(results.map((r) => ({ id: r.id, note: r.note, createdAt: r.created_at, createdBy: r.created_by })));
});

/** Restaurar = publicar de nuevo esa versión (queda como versión nueva en el historial). */
adminContent.post(
  "/content/:key/versions/:id{[0-9]+}/restore",
  zValidator("param", z.object({ key: z.enum(CONTENT_KEYS), id: z.coerce.number().int().positive() })),
  async (c) => {
    const { key, id } = c.req.valid("param");
    const version = await c.env.DB.prepare(`SELECT data, created_at FROM content_versions WHERE id = ? AND key = ?`)
      .bind(id, key)
      .first<{ data: string; created_at: string }>();
    if (!version) throw new HTTPException(404, { message: "Esa versión ya no existe." });
    const data = parseBlock(key, JSON.parse(version.data));
    if (!data) throw new HTTPException(409, { message: "Esa versión ya no es compatible con el sitio." });
    const json = JSON.stringify(data);
    const who = c.get("staff").name;
    const when = new Date(version.created_at).toLocaleString("es-CO", {
      timeZone: "America/Bogota",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    });
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO content_blocks (key, draft, published, updated_by, published_by, published_at)
         VALUES (?1, ?2, ?2, ?3, ?3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(key) DO UPDATE SET draft = ?2, published = ?2, updated_by = ?3, published_by = ?3,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), published_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      ).bind(key, json, who),
      c.env.DB.prepare(`INSERT INTO content_versions (key, data, note, created_by) VALUES (?, ?, ?, ?)`).bind(
        key,
        json,
        `Restaurada la versión del ${when}`,
        who,
      ),
    ]);
    return c.json(toBlock(key, await readRow(c.env.DB, key)));
  },
);
