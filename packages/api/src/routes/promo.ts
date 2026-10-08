import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { GAMES } from "../db/schema";
import type { AppEnv } from "../env";
import { requireRole } from "../middleware/auth";
import {
  claimCoin,
  closeGame,
  drawRaffle,
  finishPlay,
  getContest,
  getSettings,
  issueCoin,
  leaderboard,
  lookupCoin,
  monthInBogota,
  startPlay,
} from "../promo";

const onFail = (result: { success: boolean; error?: z.ZodError }, c: { json: (b: unknown, s: 400) => Response }) => {
  if (!result.success) {
    return c.json({ error: "Revisa los campos marcados.", fields: result.error!.flatten().fieldErrors }, 400);
  }
};

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mes inválido");

/* --------------------------------- Público --------------------------------- */

export const juega = new Hono<AppEnv>();

const codeBody = z.object({ code: z.string().min(4).max(40) });

juega.post("/coin", zValidator("json", codeBody, onFail), async (c) => c.json(await lookupCoin(c.env.DB, c.req.valid("json").code)));

juega.post(
  "/registro",
  zValidator(
    "json",
    z.object({
      code: z.string().min(4).max(40),
      name: z.string().max(40),
      contact: z.string().max(80),
      consent: z.boolean(),
    }),
    onFail,
  ),
  async (c) => c.json(await claimCoin(c.env.DB, c.req.valid("json"))),
);

juega.post("/iniciar", zValidator("json", codeBody, onFail), async (c) =>
  c.json(await startPlay(c.env.DB, c.req.valid("json").code)),
);

juega.post(
  "/terminar",
  bodyLimit({ maxSize: 1024 * 1024, onError: (c) => c.json({ error: "La partida es demasiado larga." }, 413) }),
  zValidator(
    "json",
    z.object({
      code: z.string().min(4).max(40),
      playId: z.number().int().positive(),
      inputs: z.array(z.tuple([z.number().int(), z.number().int()])).max(30000),
      clientScore: z.number().int(),
    }),
    onFail,
  ),
  async (c) => c.json(await finishPlay(c.env.DB, c.req.valid("json"))),
);

juega.get("/tabla", async (c) => {
  const m = monthInBogota();
  const [contest, rows] = await Promise.all([getContest(c.env.DB, m), leaderboard(c.env.DB, m, 20)]);
  c.header("Cache-Control", "public, max-age=30");
  return c.json({
    month: m,
    game: contest.game,
    gamePrize: contest.gamePrize,
    raffleEnabled: contest.raffleEnabled,
    rafflePrize: contest.rafflePrize,
    rows: rows.map((r) => ({ name: r.name, score: r.best })),
  });
});

/* ---------------------------------- Panel ---------------------------------- */

export const adminPromo = new Hono<AppEnv>();

adminPromo.get("/promo/settings", requireRole("vendedor"), async (c) => c.json(await getSettings(c.env.DB)));

adminPromo.put(
  "/promo/settings",
  requireRole("admin"),
  zValidator(
    "json",
    z.object({
      minPurchase: z.coerce.number().int().min(0).max(5_000_000),
      attemptsPerCoin: z.coerce.number().int().min(1).max(10),
      coinValidDays: z.coerce.number().int().min(1).max(120),
      defaultGame: z.enum(GAMES),
    }),
    onFail,
  ),
  async (c) => {
    const s = c.req.valid("json");
    await c.env.DB.prepare(
      `UPDATE promo_settings SET min_purchase = ?, attempts_per_coin = ?, coin_valid_days = ?, default_game = ?, updated_at = ?, updated_by = ? WHERE id = 1`,
    )
      .bind(s.minPurchase, s.attemptsPerCoin, s.coinValidDays, s.defaultGame, new Date().toISOString(), c.get("staff").name)
      .run();
    return c.json(await getSettings(c.env.DB));
  },
);

adminPromo.post(
  "/promo/coins",
  requireRole("vendedor"),
  zValidator(
    "json",
    z.object({
      purchaseAmount: z.coerce.number({ invalid_type_error: "Escribe el valor de la compra" }).int().min(1, "Escribe el valor de la compra"),
      saleRef: z.string().trim().max(60).default(""),
    }),
    onFail,
  ),
  async (c) => {
    const body = c.req.valid("json");
    const coin = await issueCoin(c.env.DB, { ...body, channel: "STORE", issuedBy: c.get("staff").email });
    return c.json(coin, 201);
  },
);

adminPromo.get("/promo/coins", requireRole("vendedor"), async (c) => {
  const m = c.req.query("mes") ?? monthInBogota();
  const q = (c.req.query("q") ?? "").trim().toUpperCase().slice(0, 40);
  const binds: unknown[] = [m];
  let extra = "";
  if (q) {
    extra = "AND (c.code LIKE ? OR UPPER(c.player_name) LIKE ? OR c.sale_ref LIKE ?)";
    binds.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const { results } = await c.env.DB.prepare(
    `SELECT c.id, c.code, c.ticket, c.purchase_amount, c.channel, c.sale_ref, c.issued_by, c.issued_at, c.expires_at,
            c.attempts_used, c.attempts_total, c.player_name, c.voided, c.void_reason,
            (SELECT MAX(score) FROM game_plays p WHERE p.coin_id = c.id AND p.valid = 1) AS best,
            (SELECT COUNT(*) FROM game_plays p WHERE p.coin_id = c.id AND p.valid = 0 AND p.finished_at IS NOT NULL) AS rejected
     FROM coins c WHERE c.month = ? ${extra} ORDER BY c.ticket DESC LIMIT 300`,
  )
    .bind(...binds)
    .all();
  return c.json(results);
});

adminPromo.post(
  "/promo/coins/:id{[0-9]+}/anular",
  requireRole("admin"),
  zValidator("json", z.object({ reason: z.string().trim().min(3, "Escribe el motivo").max(200) }), onFail),
  async (c) => {
    const id = Number(c.req.param("id"));
    const r = await c.env.DB.prepare(`UPDATE coins SET voided = 1, void_reason = ? WHERE id = ?`)
      .bind(c.req.valid("json").reason, id)
      .run();
    if (!r.meta.changes) throw new HTTPException(404, { message: "Ese COIN no existe." });
    return c.json({ id, voided: true });
  },
);

adminPromo.get("/promo/concurso/:month", requireRole("admin"), zValidator("param", z.object({ month })), async (c) => {
  const m = c.req.valid("param").month;
  const DB = c.env.DB;
  const contest = await getContest(DB, m);
  const [board, tickets, plays, winners] = await Promise.all([
    DB.prepare(
      `SELECT c.id AS coin_id, c.code, c.ticket, c.player_name AS name, c.player_contact AS contact, MAX(p.score) AS best, COUNT(p.id) AS plays
       FROM game_plays p JOIN coins c ON c.id = p.coin_id
       WHERE p.month = ? AND p.valid = 1 AND c.voided = 0
       GROUP BY p.coin_id ORDER BY best DESC, MIN(p.finished_at) ASC LIMIT 50`,
    )
      .bind(m)
      .all(),
    DB.prepare(`SELECT COUNT(*) AS n FROM coins WHERE month = ? AND voided = 0`).bind(m).first<{ n: number }>(),
    DB.prepare(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN valid = 0 AND finished_at IS NOT NULL THEN 1 ELSE 0 END) AS rejected FROM game_plays WHERE month = ?`,
    )
      .bind(m)
      .first<{ total: number; rejected: number | null }>(),
    DB.prepare(`SELECT id, code, ticket, player_name AS name, player_contact AS contact FROM coins WHERE id IN (?, ?)`)
      .bind(contest.raffleWinnerCoinId ?? -1, contest.gameWinnerCoinId ?? -1)
      .all<{ id: number; code: string; ticket: number; name: string | null; contact: string | null }>(),
  ]);
  const byId = new Map(winners.results.map((w) => [w.id, w]));
  return c.json({
    contest,
    currentMonth: monthInBogota(),
    leaderboard: board.results,
    tickets: tickets?.n ?? 0,
    plays: plays?.total ?? 0,
    rejected: plays?.rejected ?? 0,
    raffleWinner: contest.raffleWinnerCoinId ? byId.get(contest.raffleWinnerCoinId) ?? null : null,
    gameWinner: contest.gameWinnerCoinId ? byId.get(contest.gameWinnerCoinId) ?? null : null,
  });
});

adminPromo.put(
  "/promo/concurso/:month",
  requireRole("admin"),
  zValidator("param", z.object({ month })),
  zValidator(
    "json",
    z.object({
      game: z.enum(GAMES),
      gamePrize: z.string().trim().min(2, "Escribe el premio").max(120),
      raffleEnabled: z.boolean(),
      rafflePrize: z.string().trim().min(2, "Escribe el premio").max(120),
      coljuegosAuth: z.string().trim().max(60).nullable().default(null),
      prizeNotes: z.string().trim().max(500).default(""),
    }),
    onFail,
  ),
  async (c) => {
    const m = c.req.valid("param").month;
    const body = c.req.valid("json");
    const current = await getContest(c.env.DB, m);
    if (body.game !== current.game) {
      const played = await c.env.DB.prepare(`SELECT 1 FROM game_plays WHERE month = ? AND valid = 1 LIMIT 1`).bind(m).first();
      if (played) {
        throw new HTTPException(409, {
          message: "Ya hay partidas este mes con el otro juego. Cambiarlo ahora sería injusto: hazlo para el próximo mes.",
        });
      }
    }
    if (current.raffleDrawnAt && body.rafflePrize !== current.rafflePrize) {
      throw new HTTPException(409, { message: "La rifa ya se sorteó: su premio no se puede cambiar." });
    }
    await c.env.DB.prepare(
      `UPDATE contests SET game = ?, game_prize = ?, raffle_enabled = ?, raffle_prize = ?, coljuegos_auth = ?, prize_notes = ?, updated_at = ?
       WHERE month = ?`,
    )
      .bind(
        body.game,
        body.gamePrize,
        body.raffleEnabled ? 1 : 0,
        body.rafflePrize,
        current.coljuegosAuth,
        body.prizeNotes,
        new Date().toISOString(),
        m,
      )
      .run();
    return c.json(await getContest(c.env.DB, m));
  },
);

adminPromo.post("/promo/concurso/:month/sortear", requireRole("admin"), zValidator("param", z.object({ month })), async (c) =>
  c.json(await drawRaffle(c.env.DB, c.req.valid("param").month, c.get("staff").name)),
);

adminPromo.post("/promo/concurso/:month/cerrar", requireRole("admin"), zValidator("param", z.object({ month })), async (c) =>
  c.json(await closeGame(c.env.DB, c.req.valid("param").month, c.get("staff").name)),
);
