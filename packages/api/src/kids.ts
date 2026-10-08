import { HTTPException } from "hono/http-exception";
import type { Bindings } from "./env";
import { todayInBogota } from "./seasons";
import { mediaUrl } from "./storage/driver";

/**
 * MAYA Kids: concurso de dibujo. La familia publica el dibujo en su Instagram invitando a la cuenta
 * de MAYA como colaboradora (Collab) e inscribe aquí el enlace + la foto. Luisa aprueba y la página
 * trae los likes de Instagram cada 3 horas. Gana el que tenga más likes al cierre.
 * Datos de menores (Ley 1581): en público solo primer nombre y edad.
 */

export interface PublicEntry {
  id: number;
  childName: string;
  childAge: number;
  drawingTitle: string;
  imageUrl: string;
  width: number | null;
  height: number | null;
  instagramUrl: string | null;
  likes: number;
}

export interface PublicContest {
  id: number;
  slug: string;
  title: string;
  theme: string;
  description: string;
  prize: string;
  ageMin: number;
  ageMax: number;
  startsAt: string;
  endsAt: string;
  votingEndsAt: string;
  phase: "proximo" | "inscripciones" | "votacion" | "cerrado";
  entries: PublicEntry[];
  winner: PublicEntry | null;
}

type Row = Record<string, unknown>;

export function contestPhase(c: { startsAt: string; endsAt: string; votingEndsAt: string; closedAt: string | null }, today = todayInBogota()) {
  if (c.closedAt) return "cerrado" as const;
  if (today < c.startsAt) return "proximo" as const;
  if (today <= c.endsAt) return "inscripciones" as const;
  if (today <= c.votingEndsAt) return "votacion" as const;
  return "cerrado" as const;
}

const toEntry = (r: Row): PublicEntry => ({
  id: r.id as number,
  childName: r.child_name as string,
  childAge: r.child_age as number,
  drawingTitle: r.drawing_title as string,
  imageUrl: mediaUrl(r.image_key as string)!,
  width: (r.width as number | null) ?? null,
  height: (r.height as number | null) ?? null,
  instagramUrl: (r.instagram_url as string | null) ?? null,
  // Solo cuentan los likes leídos de Instagram.
  likes: r.likes_source === "instagram" ? ((r.likes as number) ?? 0) : 0,
});

const toContest = (r: Row) => ({
  id: r.id as number,
  slug: r.slug as string,
  title: r.title as string,
  theme: r.theme as string,
  description: r.description as string,
  prize: r.prize as string,
  ageMin: r.age_min as number,
  ageMax: r.age_max as number,
  startsAt: r.starts_at as string,
  endsAt: r.ends_at as string,
  votingEndsAt: r.voting_ends_at as string,
  winnerEntryId: (r.winner_entry_id as number | null) ?? null,
  closedAt: (r.closed_at as string | null) ?? null,
  closedBy: (r.closed_by as string | null) ?? null,
  likesSyncedAt: (r.likes_synced_at as string | null) ?? null,
});
export type KidsContestRow = ReturnType<typeof toContest>;

/** Concursos visibles: abiertos, en votación y los últimos cerrados con su ganador. */
export async function publicKids(db: D1Database): Promise<PublicContest[]> {
  const today = todayInBogota();
  const { results } = await db
    .prepare(`SELECT * FROM kids_contests WHERE starts_at <= ? ORDER BY starts_at DESC LIMIT 8`)
    .bind(today)
    .all<Row>();
  const contests = results.map(toContest);
  if (!contests.length) return [];
  const ids = contests.map((c) => c.id);
  const { results: entries } = await db
    .prepare(
      `SELECT * FROM kids_entries WHERE contest_id IN (${ids.map(() => "?").join(",")}) AND status = 'publicado'
       ORDER BY likes DESC, created_at ASC`,
    )
    .bind(...ids)
    .all<Row>();
  return contests.map((c) => {
    const mine = entries.filter((e) => e.contest_id === c.id).map(toEntry);
    return {
      id: c.id,
      slug: c.slug,
      title: c.title,
      theme: c.theme,
      description: c.description,
      prize: c.prize,
      ageMin: c.ageMin,
      ageMax: c.ageMax,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      votingEndsAt: c.votingEndsAt,
      phase: contestPhase(c, today),
      entries: mine,
      winner: c.winnerEntryId ? (mine.find((e) => e.id === c.winnerEntryId) ?? null) : null,
    };
  });
}

/* -------------------------------- Inscribir -------------------------------- */

const ALLOWED = new Map([
  ["image/webp", "webp"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
]);
const MAX_BYTES = 6 * 1024 * 1024;

const firstName = (raw: string) =>
  raw
    .normalize("NFC")
    .replace(/[^\p{L} -]/gu, "")
    .trim()
    .split(/\s+/)[0]
    ?.slice(0, 20) ?? "";

export async function submitDrawing(env: Bindings, form: FormData) {
  // Trampa para robots: campo invisible que una persona nunca llena.
  if (String(form.get("sitio_web") ?? "")) throw new HTTPException(400, { message: "No se pudo enviar." });

  const contestId = Number(form.get("contestId"));
  const contest = await env.DB.prepare(`SELECT * FROM kids_contests WHERE id = ?`).bind(contestId).first<Row>();
  if (!contest) throw new HTTPException(404, { message: "Ese concurso no existe." });
  const c = toContest(contest);
  if (contestPhase(c) !== "inscripciones") throw new HTTPException(409, { message: "Las inscripciones de este concurso están cerradas." });

  const childName = firstName(String(form.get("childName") ?? ""));
  const childAge = Number(form.get("childAge"));
  const drawingTitle = String(form.get("drawingTitle") ?? "").trim().slice(0, 60);
  const guardianName = String(form.get("guardianName") ?? "").trim().slice(0, 80);
  const guardianContact = String(form.get("guardianContact") ?? "").trim().slice(0, 80);
  const instagramUrl = String(form.get("instagramUrl") ?? "").trim().slice(0, 300);
  const consent = form.get("consent") === "si";
  const file = form.get("file");

  const fields: Record<string, string> = {};
  if (childName.length < 2) fields.childName = "Escribe el primer nombre del niño o la niña.";
  if (!Number.isInteger(childAge) || childAge < c.ageMin || childAge > c.ageMax)
    fields.childAge = `Este concurso es para niños de ${c.ageMin} a ${c.ageMax} años.`;
  if (guardianName.length < 3) fields.guardianName = "Escribe tu nombre.";
  if (guardianContact.replace(/\D/g, "").length < 7 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(guardianContact))
    fields.guardianContact = "Deja tu WhatsApp o correo para avisarte.";
  if (!instagramShortcode(instagramUrl))
    fields.instagramUrl = "Pega el enlace de tu publicación, por ejemplo https://www.instagram.com/p/ABC123/";
  if (!consent) fields.consent = "Necesitamos tu autorización como acudiente para publicar el dibujo.";
  if (!(file instanceof File)) fields.file = "Sube la foto del dibujo.";
  if (Object.keys(fields).length) {
    throw new HTTPException(400, { message: "Revisa los campos marcados.", cause: fields });
  }

  const f = file as File;
  const ext = ALLOWED.get(f.type);
  if (!ext) throw new HTTPException(415, { message: "Sube la foto en JPG, PNG o WebP." });
  if (f.size > MAX_BYTES) throw new HTTPException(413, { message: "La foto pesa más de 6 MB." });
  const head = new Uint8Array(await f.slice(0, 12).arrayBuffer());
  const sig = String.fromCharCode(...head);
  const valid =
    (ext === "jpg" && head[0] === 0xff && head[1] === 0xd8) ||
    (ext === "png" && sig.startsWith("\x89PNG")) ||
    (ext === "webp" && sig.startsWith("RIFF") && sig.slice(8, 12) === "WEBP");
  if (!valid) throw new HTTPException(415, { message: "El archivo no parece una foto válida." });

  // El mismo post no se puede inscribir dos veces.
  const shortcode = instagramShortcode(instagramUrl)!;
  const dup = await env.DB.prepare(`SELECT 1 FROM kids_entries WHERE contest_id = ? AND instagram_url LIKE ?`)
    .bind(contestId, `%/${shortcode}%`)
    .first();
  if (dup) throw new HTTPException(409, { message: "Esa publicación ya está inscrita en este concurso." });

  // Máximo 3 dibujos por acudiente en cada concurso.
  const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM kids_entries WHERE contest_id = ? AND guardian_contact = ?`)
    .bind(contestId, guardianContact)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= 3) throw new HTTPException(409, { message: "Ya inscribiste 3 dibujos en este concurso." });

  const key = `kids/${crypto.randomUUID()}.${ext}`;
  await env.MEDIA.put(key, await f.arrayBuffer(), {
    httpMetadata: { contentType: f.type, cacheControl: "public, max-age=31536000, immutable" },
  });
  const width = Number(form.get("width")) || null;
  const height = Number(form.get("height")) || null;
  await env.DB.prepare(
    `INSERT INTO kids_entries (contest_id, child_name, child_age, drawing_title, guardian_name, guardian_contact, image_key, width, height, instagram_url, consent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      contestId,
      childName,
      childAge,
      drawingTitle,
      guardianName,
      guardianContact,
      key,
      width,
      height,
      `https://www.instagram.com/p/${shortcode}/`,
      new Date().toISOString(),
    )
    .run();
  return { ok: true, childName };
}

/* ------------------------------- Instagram ------------------------------- */

/** Código corto de una publicación: instagram.com/p/ABC123/ o /reel/ABC123/. */
export function instagramShortcode(url: string): string | null {
  const m = url.match(/instagram\.com\/(?:[\w.]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
  return m?.[1] ?? null;
}

/**
 * Trae los likes de las publicaciones de la cuenta de MAYA (API de Instagram para cuentas profesionales).
 * Necesita INSTAGRAM_ACCESS_TOKEN como secreto del Worker.
 */
export async function syncInstagramLikes(env: Bindings, contestId: number) {
  const token = env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) {
    throw new HTTPException(409, {
      message: "Instagram todavía no está conectado. Los likes solo se pueden leer desde Instagram.",
    });
  }
  const base = env.INSTAGRAM_GRAPH_URL || "https://graph.instagram.com";
  const likes = new Map<string, number>();
  let url: string | null = `${base}/me/media?fields=id,permalink,like_count&limit=100&access_token=${encodeURIComponent(token)}`;
  for (let page = 0; url && page < 6; page++) {
    const res: Response = await fetch(url);
    const data = (await res.json().catch(() => ({}))) as {
      data?: { permalink?: string; like_count?: number }[];
      paging?: { next?: string };
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new HTTPException(502, { message: `Instagram respondió con un error: ${data.error?.message ?? res.status}` });
    }
    for (const m of data.data ?? []) {
      const sc = m.permalink ? instagramShortcode(m.permalink) : null;
      if (sc && typeof m.like_count === "number") likes.set(sc, m.like_count);
    }
    url = data.paging?.next ?? null;
  }

  const { results } = await env.DB.prepare(
    `SELECT id, instagram_url FROM kids_entries WHERE contest_id = ? AND status IN ('pendiente', 'publicado') AND instagram_url IS NOT NULL`,
  )
    .bind(contestId)
    .all<{ id: number; instagram_url: string }>();
  const now = new Date().toISOString();
  const stmts: D1PreparedStatement[] = [];
  let updated = 0;
  const missing: number[] = [];
  for (const e of results) {
    const sc = instagramShortcode(e.instagram_url);
    const n = sc ? likes.get(sc) : undefined;
    if (n === undefined) {
      missing.push(e.id);
      continue;
    }
    updated++;
    stmts.push(
      env.DB.prepare(`UPDATE kids_entries SET likes = ?, likes_updated_at = ?, likes_source = 'instagram' WHERE id = ?`).bind(n, now, e.id),
    );
  }
  stmts.push(env.DB.prepare(`UPDATE kids_contests SET likes_synced_at = ? WHERE id = ?`).bind(now, contestId));
  await env.DB.batch(stmts);
  return { updated, missing };
}

/* --------------------------------- Cierre --------------------------------- */

export async function closeKidsContest(env: Bindings, contestId: number, staffName: string) {
  const row = await env.DB.prepare(`SELECT * FROM kids_contests WHERE id = ?`).bind(contestId).first<Row>();
  if (!row) throw new HTTPException(404, { message: "Ese concurso no existe." });
  const c = toContest(row);
  if (c.closedAt) throw new HTTPException(409, { message: "Este concurso ya se cerró." });
  if (todayInBogota() <= c.votingEndsAt) {
    throw new HTTPException(409, { message: "Los likes cuentan hasta el último día de votación. Ciérralo después de esa fecha." });
  }
  // Los likes que deciden el ganador se leen de Instagram en este momento; nunca se escriben a mano.
  if (!env.INSTAGRAM_ACCESS_TOKEN) {
    throw new HTTPException(409, { message: "Conecta Instagram para cerrar: el ganador se decide con los likes de Instagram." });
  }
  await syncInstagramLikes(env, contestId);
  const top = await env.DB.prepare(
    `SELECT id FROM kids_entries WHERE contest_id = ? AND status = 'publicado' AND likes_source = 'instagram'
     ORDER BY likes DESC, created_at ASC LIMIT 1`,
  )
    .bind(contestId)
    .first<{ id: number }>();
  if (!top) throw new HTTPException(409, { message: "No hay dibujos con likes leídos de Instagram en este concurso." });
  await env.DB.prepare(`UPDATE kids_contests SET winner_entry_id = ?, closed_at = ?, closed_by = ? WHERE id = ? AND closed_at IS NULL`)
    .bind(top.id, new Date().toISOString(), staffName, contestId)
    .run();
  return { winnerEntryId: top.id };
}

const AUTO_SYNC_MS = 3 * 3600 * 1000;

/**
 * Actualización automática "cada cierto tiempo" sin cron: cuando alguien visita MAYA Kids
 * y la última sincronización tiene más de 3 horas, se traen los likes en segundo plano.
 */
export async function autoSyncKids(env: Bindings) {
  if (!env.INSTAGRAM_ACCESS_TOKEN) return;
  const today = todayInBogota();
  const { results } = await env.DB.prepare(
    `SELECT id, likes_synced_at FROM kids_contests WHERE closed_at IS NULL AND starts_at <= ? AND voting_ends_at >= ?`,
  )
    .bind(today, today)
    .all<{ id: number; likes_synced_at: string | null }>();
  for (const c of results) {
    const last = c.likes_synced_at ? new Date(c.likes_synced_at).getTime() : 0;
    if (Date.now() - last < AUTO_SYNC_MS) continue;
    // Se marca primero para que dos visitas simultáneas no consulten Instagram a la vez.
    await env.DB.prepare(`UPDATE kids_contests SET likes_synced_at = ? WHERE id = ?`).bind(new Date().toISOString(), c.id).run();
    try {
      await syncInstagramLikes(env, c.id);
    } catch (err) {
      console.error("[kids] no se pudieron traer los likes", c.id, err);
    }
  }
}

export { toContest as kidsContestFromRow };
