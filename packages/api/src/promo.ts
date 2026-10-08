import { HTTPException } from "hono/http-exception";
import { replayCasa, type CasaInputLog } from "./game/casa";
import { replay as replayLluvia, W as LLUVIA_W, type InputLog } from "./game/lluvia";
import type { GameId } from "./db/schema";
import { todayInBogota } from "./seasons";

/**
 * COIN: cada compra (desde el mínimo) entrega un código con N intentos en el juego del mes
 * y 1 boleta para la rifa del mes de entrega.
 * El puntaje oficial lo calcula el servidor repitiendo la partida: el navegador solo envía movimientos.
 */

export const monthInBogota = (d = new Date()) => todayInBogota(d).slice(0, 7);

const ALPHABET = "ACDEFGHJKMNPQRTUVWXY34679"; // sin 0/O, 1/I/L, 2/Z, 5/S, 8/B

function randomChars(n: number) {
  const out: string[] = [];
  const buf = new Uint8Array(n * 2);
  while (out.length < n) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      // Rechazo para que todas las letras tengan la misma probabilidad.
      if (b < 250 && out.length < n) out.push(ALPHABET[b % 25]!);
    }
  }
  return out.join("");
}

export const newCoinCode = () => {
  const c = randomChars(8);
  return `MAYA-${c.slice(0, 4)}-${c.slice(4)}`;
};

/** Acepta "maya 7k3p q9xx", "7K3PQ9XX", etc. */
export function normalizeCode(input: string) {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^MAYA/, "");
  if (raw.length !== 8) return null;
  return `MAYA-${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function cleanPlayerName(raw: string) {
  return raw
    .normalize("NFC")
    .replace(/[^\p{L}\p{N} ._-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 16);
}

export interface Settings {
  minPurchase: number;
  attemptsPerCoin: number;
  coinValidDays: number;
  defaultGame: GameId;
}

export async function getSettings(db: D1Database): Promise<Settings> {
  const row = await db
    .prepare(`SELECT min_purchase, attempts_per_coin, coin_valid_days, default_game FROM promo_settings WHERE id = 1`)
    .first<{ min_purchase: number; attempts_per_coin: number; coin_valid_days: number; default_game: GameId }>();
  return {
    minPurchase: row?.min_purchase ?? 30000,
    attemptsPerCoin: row?.attempts_per_coin ?? 3,
    coinValidDays: row?.coin_valid_days ?? 30,
    defaultGame: row?.default_game ?? "casa",
  };
}

export interface ContestRow {
  id: number;
  month: string;
  game: GameId;
  gamePrize: string;
  raffleEnabled: boolean;
  rafflePrize: string;
  coljuegosAuth: string | null;
  raffleDrawnAt: string | null;
  raffleDrawnBy: string | null;
  raffleWinnerCoinId: number | null;
  raffleTickets: number | null;
  gameClosedAt: string | null;
  gameClosedBy: string | null;
  gameWinnerCoinId: number | null;
  gameWinnerScore: number | null;
  prizeNotes: string;
}

const toContest = (r: Record<string, unknown>): ContestRow => ({
  id: r.id as number,
  month: r.month as string,
  game: r.game as GameId,
  gamePrize: r.game_prize as string,
  raffleEnabled: r.raffle_enabled === 1,
  rafflePrize: r.raffle_prize as string,
  coljuegosAuth: (r.coljuegos_auth as string | null) || null,
  raffleDrawnAt: (r.raffle_drawn_at as string | null) ?? null,
  raffleDrawnBy: (r.raffle_drawn_by as string | null) ?? null,
  raffleWinnerCoinId: (r.raffle_winner_coin_id as number | null) ?? null,
  raffleTickets: (r.raffle_tickets as number | null) ?? null,
  gameClosedAt: (r.game_closed_at as string | null) ?? null,
  gameClosedBy: (r.game_closed_by as string | null) ?? null,
  gameWinnerCoinId: (r.game_winner_coin_id as number | null) ?? null,
  gameWinnerScore: (r.game_winner_score as number | null) ?? null,
  prizeNotes: (r.prize_notes as string) ?? "",
});

/** El concurso del mes; si no existe, se crea con el juego por defecto. */
export async function getContest(db: D1Database, month = monthInBogota()): Promise<ContestRow> {
  const found = await db.prepare(`SELECT * FROM contests WHERE month = ?`).bind(month).first<Record<string, unknown>>();
  if (found) return toContest(found);
  const settings = await getSettings(db);
  await db.prepare(`INSERT OR IGNORE INTO contests (month, game) VALUES (?, ?)`).bind(month, settings.defaultGame).run();
  const row = await db.prepare(`SELECT * FROM contests WHERE month = ?`).bind(month).first<Record<string, unknown>>();
  return toContest(row!);
}

/* --------------------------------- Entregar -------------------------------- */

export async function issueCoin(
  db: D1Database,
  input: { purchaseAmount: number; channel: "STORE" | "ONLINE"; saleRef: string; issuedBy: string },
) {
  const settings = await getSettings(db);
  if (input.purchaseAmount < settings.minPurchase) {
    throw new HTTPException(400, {
      message: `La compra debe ser de al menos $${settings.minPurchase.toLocaleString("es-CO")} para recibir un COIN.`,
    });
  }
  const month = monthInBogota();
  const expires = new Date(Date.now() + settings.coinValidDays * 86400_000).toISOString();
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = newCoinCode();
    try {
      // El número de boleta se calcula dentro del mismo INSERT: dos ventas al tiempo no repiten número.
      const row = await db
        .prepare(
          `INSERT INTO coins (code, month, ticket, purchase_amount, channel, sale_ref, issued_by, expires_at, attempts_total)
           SELECT ?, ?, COALESCE(MAX(ticket), 0) + 1, ?, ?, ?, ?, ?, ? FROM coins WHERE month = ?
           RETURNING id, code, month, ticket, expires_at, attempts_total`,
        )
        .bind(
          code,
          month,
          input.purchaseAmount,
          input.channel,
          input.saleRef,
          input.issuedBy,
          expires,
          settings.attemptsPerCoin,
          month,
        )
        .first<{ id: number; code: string; month: string; ticket: number; expires_at: string; attempts_total: number }>();
      return row!;
    } catch (err) {
      if (!String(err).includes("UNIQUE")) throw err;
    }
  }
  throw new HTTPException(503, { message: "No se pudo generar el código. Intenta de nuevo." });
}

/* ---------------------------------- Jugar ---------------------------------- */

interface CoinRow {
  id: number;
  code: string;
  month: string;
  ticket: number;
  expires_at: string;
  attempts_used: number;
  attempts_total: number;
  player_name: string | null;
  player_contact: string | null;
  voided: number;
}

async function findCoin(db: D1Database, rawCode: string): Promise<CoinRow> {
  const code = normalizeCode(rawCode);
  if (!code) throw new HTTPException(400, { message: "El código tiene la forma MAYA-XXXX-XXXX. Revísalo en tu recibo." });
  const coin = await db.prepare(`SELECT * FROM coins WHERE code = ?`).bind(code).first<CoinRow>();
  if (!coin) throw new HTTPException(404, { message: "Ese código no existe. Revisa que esté bien escrito." });
  if (coin.voided) throw new HTTPException(403, { message: "Este código fue anulado. Escríbenos si crees que es un error." });
  return coin;
}

export async function coinStatus(db: D1Database, coin: CoinRow) {
  const month = monthInBogota();
  const [best, contest] = await Promise.all([
    db
      .prepare(`SELECT MAX(score) AS best FROM game_plays WHERE coin_id = ? AND month = ? AND valid = 1`)
      .bind(coin.id, month)
      .first<{ best: number | null }>(),
    getContest(db, month),
  ]);
  const expired = new Date(coin.expires_at).getTime() < Date.now();
  return {
    code: coin.code,
    name: coin.player_name,
    claimed: Boolean(coin.player_name),
    ticket: coin.ticket,
    raffleMonth: coin.month,
    attemptsLeft: expired ? 0 : Math.max(0, coin.attempts_total - coin.attempts_used),
    attemptsTotal: coin.attempts_total,
    expired,
    expiresAt: coin.expires_at,
    best: best?.best ?? null,
    game: contest.game,
    month,
  };
}

export async function lookupCoin(db: D1Database, rawCode: string) {
  return coinStatus(db, await findCoin(db, rawCode));
}

export async function claimCoin(
  db: D1Database,
  input: { code: string; name: string; contact: string; consent: boolean },
) {
  const coin = await findCoin(db, input.code);
  if (!coin.player_name) {
    const name = cleanPlayerName(input.name);
    if (name.length < 2) throw new HTTPException(400, { message: "Escribe un apodo de al menos 2 letras." });
    const contact = input.contact.trim().slice(0, 80);
    if (contact.replace(/\D/g, "").length < 7 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact)) {
      throw new HTTPException(400, { message: "Deja tu WhatsApp o correo para avisarte si ganas." });
    }
    if (!input.consent) {
      throw new HTTPException(400, { message: "Para participar debes aceptar los términos y el tratamiento de tus datos." });
    }
    await db
      .prepare(
        `UPDATE coins SET player_name = ?, player_contact = ?, consent_at = ? WHERE id = ? AND player_name IS NULL`,
      )
      .bind(name, contact, new Date().toISOString(), coin.id)
      .run();
  }
  return lookupCoin(db, input.code);
}

export async function startPlay(db: D1Database, rawCode: string) {
  const coin = await findCoin(db, rawCode);
  if (!coin.player_name) throw new HTTPException(400, { message: "Primero registra tu apodo." });
  if (new Date(coin.expires_at).getTime() < Date.now()) {
    throw new HTTPException(410, { message: "Este COIN ya venció. Con tu próxima compra recibes uno nuevo." });
  }
  const month = monthInBogota();
  const contest = await getContest(db, month);
  const seedBuf = new Int32Array(1);
  crypto.getRandomValues(seedBuf);
  const seed = seedBuf[0]!;

  // Gastar el intento y crear la partida en un solo lote atómico.
  const [spend, play] = await db.batch([
    db.prepare(`UPDATE coins SET attempts_used = attempts_used + 1 WHERE id = ? AND attempts_used < attempts_total`).bind(coin.id),
    db
      .prepare(
        `INSERT INTO game_plays (coin_id, month, game, seed, started_at)
         SELECT ?, ?, ?, ?, ? WHERE changes() > 0 RETURNING id`,
      )
      .bind(coin.id, month, contest.game, seed, Date.now()),
  ]);
  if (!spend!.meta.changes) throw new HTTPException(409, { message: "Ya usaste todos los intentos de este COIN." });
  const playId = (play!.results[0] as { id: number } | undefined)?.id;
  if (!playId) throw new HTTPException(500, { message: "No se pudo iniciar la partida." });
  return {
    playId,
    seed,
    game: contest.game,
    attemptsLeft: coin.attempts_total - coin.attempts_used - 1,
  };
}

const MAX_INPUTS = 30000;
const MAX_PLAY_MS = 25 * 60 * 1000;

function validInputs(game: GameId, inputs: unknown): inputs is InputLog | CasaInputLog {
  if (!Array.isArray(inputs) || inputs.length > MAX_INPUTS) return false;
  let last = -1;
  for (const it of inputs) {
    if (!Array.isArray(it) || it.length !== 2) return false;
    const [t, v] = it as [unknown, unknown];
    if (!Number.isInteger(t) || (t as number) < last || (t as number) < 0) return false;
    if (!Number.isInteger(v)) return false;
    if (game === "lluvia" && ((v as number) < 0 || (v as number) > LLUVIA_W)) return false;
    if (game === "casa" && ((v as number) < 1 || (v as number) > 4)) return false;
    last = t as number;
  }
  return true;
}

export async function finishPlay(
  db: D1Database,
  input: { code: string; playId: number; inputs: unknown; clientScore: number },
) {
  const coin = await findCoin(db, input.code);
  const play = await db
    .prepare(`SELECT * FROM game_plays WHERE id = ? AND coin_id = ?`)
    .bind(input.playId, coin.id)
    .first<{ id: number; game: GameId; seed: number; started_at: number; finished_at: number | null; month: string }>();
  if (!play) throw new HTTPException(404, { message: "No encontramos esa partida." });
  if (play.finished_at) throw new HTTPException(409, { message: "Esta partida ya se registró." });

  const now = Date.now();
  const elapsed = now - play.started_at;
  let score = 0;
  let ticks = 0;
  let valid = true;
  let reason = "";

  if (!validInputs(play.game, input.inputs)) {
    valid = false;
    reason = "movimientos inválidos";
  } else {
    const result =
      play.game === "casa"
        ? replayCasa(play.seed, input.inputs as CasaInputLog)
        : replayLluvia(play.seed, input.inputs as InputLog);
    score = result.score;
    ticks = result.ticks;
    // No se puede terminar más rápido que el tiempo real de juego (se permite pausar, no acelerar).
    const minMs = (ticks / 60) * 1000 * 0.85 - 2000;
    if (elapsed < minMs) {
      valid = false;
      reason = "terminó demasiado rápido";
    } else if (elapsed > MAX_PLAY_MS) {
      valid = false;
      reason = "partida vencida";
    }
    if (valid && Number.isInteger(input.clientScore) && input.clientScore !== score) {
      reason = `puntaje del navegador distinto (${input.clientScore})`;
    }
  }

  await db
    .prepare(
      `UPDATE game_plays SET finished_at = ?, score = ?, client_score = ?, ticks = ?, valid = ?, reason = ?
       WHERE id = ? AND finished_at IS NULL`,
    )
    .bind(now, score, Number.isInteger(input.clientScore) ? input.clientScore : null, ticks, valid ? 1 : 0, reason, play.id)
    .run();

  const status = await coinStatus(db, coin);
  const rank = status.best
    ? await db
        .prepare(
          `SELECT COUNT(*) + 1 AS r FROM (
             SELECT p.coin_id, MAX(p.score) AS best FROM game_plays p JOIN coins c ON c.id = p.coin_id
             WHERE p.month = ? AND p.valid = 1 AND c.voided = 0 GROUP BY p.coin_id
           ) WHERE best > ?`,
        )
        .bind(play.month, status.best)
        .first<{ r: number }>()
    : null;

  return { score, valid, ...status, rank: rank?.r ?? null };
}

export async function leaderboard(db: D1Database, month = monthInBogota(), limit = 20) {
  const { results } = await db
    .prepare(
      `SELECT c.id AS coin_id, c.player_name AS name, MAX(p.score) AS best, MIN(p.finished_at) AS first_at
       FROM game_plays p JOIN coins c ON c.id = p.coin_id
       WHERE p.month = ? AND p.valid = 1 AND c.voided = 0
       GROUP BY p.coin_id
       ORDER BY best DESC, first_at ASC
       LIMIT ?`,
    )
    .bind(month, limit)
    .all<{ coin_id: number; name: string; best: number }>();
  return results;
}

/* --------------------------------- Cierres --------------------------------- */

const monthEnded = (month: string) => monthInBogota() > month;

/** Sorteo de la rifa: una sola vez y solo cuando el mes ya terminó. */
export async function drawRaffle(db: D1Database, month: string, staffName: string) {
  const contest = await getContest(db, month);
  if (!contest.raffleEnabled) throw new HTTPException(409, { message: "La rifa de este mes está desactivada." });
  if (!monthEnded(month)) throw new HTTPException(409, { message: "La rifa se sortea cuando termine el mes." });
  if (contest.raffleDrawnAt) throw new HTTPException(409, { message: "Esta rifa ya se sorteó." });

  const { results } = await db
    .prepare(`SELECT id, ticket FROM coins WHERE month = ? AND voided = 0 ORDER BY ticket`)
    .bind(month)
    .all<{ id: number; ticket: number }>();
  if (!results.length) throw new HTTPException(409, { message: "No hay boletas para este mes." });

  // Número al azar uniforme con el generador criptográfico.
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / results.length) * results.length;
  do crypto.getRandomValues(buf);
  while (buf[0]! >= limit);
  const winner = results[buf[0]! % results.length]!;

  const done = await db
    .prepare(
      `UPDATE contests SET raffle_drawn_at = ?, raffle_drawn_by = ?, raffle_winner_coin_id = ?, raffle_tickets = ?, updated_at = ?
       WHERE month = ? AND raffle_drawn_at IS NULL`,
    )
    .bind(new Date().toISOString(), staffName, winner.id, results.length, new Date().toISOString(), month)
    .run();
  if (!done.meta.changes) throw new HTTPException(409, { message: "Esta rifa ya se sorteó." });
  return getContest(db, month);
}

export async function closeGame(db: D1Database, month: string, staffName: string) {
  const contest = await getContest(db, month);
  if (!monthEnded(month)) throw new HTTPException(409, { message: "El concurso se cierra cuando termine el mes." });
  if (contest.gameClosedAt) throw new HTTPException(409, { message: "Este concurso ya se cerró." });
  const [top] = await leaderboard(db, month, 1);
  if (!top) throw new HTTPException(409, { message: "Nadie jugó este mes." });
  await db
    .prepare(
      `UPDATE contests SET game_closed_at = ?, game_closed_by = ?, game_winner_coin_id = ?, game_winner_score = ?, updated_at = ?
       WHERE month = ? AND game_closed_at IS NULL`,
    )
    .bind(new Date().toISOString(), staffName, top.coin_id, top.best, new Date().toISOString(), month)
    .run();
  return getContest(db, month);
}
