import { Lock } from "@phosphor-icons/react/dist/csr/Lock";
import { Ticket } from "@phosphor-icons/react/dist/csr/Ticket";
import { Trophy } from "@phosphor-icons/react/dist/csr/Trophy";
import { useCallback, useEffect, useId, useState } from "react";
import { api, ApiError } from "../../lib/admin-api";
import { formatCOP } from "../../lib/format";

type GameId = "casa" | "lluvia";

interface Contest {
  month: string;
  game: GameId;
  gamePrize: string;
  raffleEnabled: boolean;
  rafflePrize: string;
  coljuegosAuth: string | null;
  raffleDrawnAt: string | null;
  raffleDrawnBy: string | null;
  raffleTickets: number | null;
  gameClosedAt: string | null;
  gameClosedBy: string | null;
  gameWinnerScore: number | null;
  prizeNotes: string;
}

interface Winner {
  code: string;
  ticket: number;
  name: string | null;
  contact: string | null;
}

interface Detail {
  contest: Contest;
  currentMonth: string;
  leaderboard: { coin_id: number; code: string; ticket: number; name: string; contact: string; best: number; plays: number }[];
  tickets: number;
  plays: number;
  rejected: number;
  raffleWinner: Winner | null;
  gameWinner: Winner | null;
}

interface Settings {
  minPurchase: number;
  attemptsPerCoin: number;
  coinValidDays: number;
  defaultGame: GameId;
}

const GAME_NAME: Record<GameId, string> = { casa: "Maya en casa", lluvia: "Lluvia de premios" };
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const shiftMonth = (m: string, d: number) => {
  const dt = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + d, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
};
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" });

export default function ContestManager({ initialMonth, initialSettings }: { initialMonth: string; initialSettings: Settings }) {
  const id = useId();
  const [month, setMonth] = useState(initialMonth);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [form, setForm] = useState<Contest | null>(null);
  const [settings, setSettings] = useState(initialSettings);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"draw" | "close" | null>(null);

  const load = useCallback(async () => {
    setDetail(null);
    try {
      const d = await api<Detail>(`/promo/concurso/${month}`);
      setDetail(d);
      setForm(d.contest);
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof Error ? err.message : "No se pudo cargar." });
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ kind: "ok", text: ok });
      await load();
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof ApiError ? err.message : "No se pudo completar." });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const saveContest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    void run(
      () =>
        api(`/promo/concurso/${month}`, {
          method: "PUT",
          json: {
            game: form.game,
            gamePrize: form.gamePrize,
            raffleEnabled: form.raffleEnabled,
            rafflePrize: form.rafflePrize,
            prizeNotes: form.prizeNotes,
          },
        }),
      "Concurso guardado.",
    );
  };

  const saveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => setSettings(await api<Settings>("/promo/settings", { method: "PUT", json: settings })), "Reglas del COIN guardadas.");
  };

  const ended = detail ? detail.currentMonth > month : false;
  const c = detail?.contest;
  const drawBlock = !c
    ? ""
    : !c.raffleEnabled
      ? "La rifa está desactivada este mes."
      : !ended
        ? "Se sortea cuando termine el mes."
        : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-soft btn-sm" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Mes anterior">
          ←
        </button>
        <p className="min-w-40 text-center text-xl font-semibold first-letter:uppercase">{monthLabel(month)}</p>
        <button
          type="button"
          className="btn btn-soft btn-sm"
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          disabled={detail ? month >= detail.currentMonth : true}
          aria-label="Mes siguiente"
        >
          →
        </button>
      </div>

      {msg && (
        <p role={msg.kind === "error" ? "alert" : "status"} className={`rounded-2xl px-4 py-3 font-medium ${msg.kind === "error" ? "bg-danger-soft text-danger" : "bg-teal-100 text-teal-900"}`}>
          {msg.text}
        </p>
      )}

      {!detail || !form ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="skeleton h-64" />
          <div className="skeleton h-64" />
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-3 sm:max-w-xl">
            <div className="rounded-[var(--radius-toy)] bg-white p-4">
              <dt className="text-sm text-ink-soft">Boletas</dt>
              <dd className="tnum text-3xl font-bold text-teal-900">{detail.tickets}</dd>
            </div>
            <div className="rounded-[var(--radius-toy)] bg-white p-4">
              <dt className="text-sm text-ink-soft">Partidas</dt>
              <dd className="tnum text-3xl font-bold text-teal-900">{detail.plays}</dd>
            </div>
            <div className="rounded-[var(--radius-toy)] bg-white p-4">
              <dt className="text-sm text-ink-soft">Rechazadas</dt>
              <dd className={`tnum text-3xl font-bold ${detail.rejected ? "text-danger" : "text-teal-900"}`}>{detail.rejected}</dd>
            </div>
          </dl>

          <div className="grid gap-6 xl:grid-cols-2">
            {/* Juego */}
            <section className="rounded-[var(--radius-toy)] bg-white p-5" aria-labelledby={`${id}-game`}>
              <h2 id={`${id}-game`} className="flex items-center gap-2 text-xl font-semibold">
                <Trophy weight="fill" size={22} className="text-sun-500" aria-hidden="true" /> Concurso del juego
              </h2>
              {detail.gameWinner ? (
                <div className="mt-4 rounded-2xl bg-sun-100 p-4 text-teal-900">
                  <p className="font-semibold">Ganador: {detail.gameWinner.name}</p>
                  <p className="tnum">
                    {c!.gameWinnerScore} puntos · {detail.gameWinner.code}
                  </p>
                  <p className="mt-1">Contacto: {detail.gameWinner.contact}</p>
                  <p className="mt-1 text-sm">Cerrado por {c!.gameClosedBy} el {fmtDateTime(c!.gameClosedAt!)}</p>
                </div>
              ) : (
                <div className="mt-4">
                  {confirm === "close" ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-ground p-3">
                      <span>¿Cerrar y declarar ganador al primero de la tabla?</span>
                      <button type="button" className="btn btn-teal btn-sm" disabled={busy} onClick={() => run(() => api(`/promo/concurso/${month}/cerrar`, { method: "POST" }), "Concurso cerrado.")}>
                        Sí, cerrar
                      </button>
                      <button type="button" className="btn btn-soft btn-sm" onClick={() => setConfirm(null)}>
                        No
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="btn btn-teal btn-sm" disabled={!ended || detail.leaderboard.length === 0} onClick={() => setConfirm("close")}>
                      Cerrar concurso y ver ganador
                    </button>
                  )}
                  {!ended && <p className="hint">Se cierra cuando termine el mes.</p>}
                </div>
              )}

              <h3 className="mt-6 font-semibold">Tabla (con contactos, solo para ti)</h3>
              {detail.leaderboard.length === 0 ? (
                <p className="mt-2 text-ink-soft">Nadie ha jugado este mes.</p>
              ) : (
                <div className="mt-2 max-h-96 overflow-auto rounded-2xl border border-line">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-ground">
                      <tr>
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Apodo</th>
                        <th className="px-3 py-2">Contacto</th>
                        <th className="px-3 py-2 text-right">Puntos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.leaderboard.map((r, i) => (
                        <tr key={r.coin_id} className="border-t border-line">
                          <td className="tnum px-3 py-2">{i + 1}</td>
                          <td className="px-3 py-2">
                            <span className="font-medium">{r.name}</span>
                            <span className="block text-xs text-ink-soft">{r.code}</span>
                          </td>
                          <td className="px-3 py-2">{r.contact}</td>
                          <td className="tnum px-3 py-2 text-right font-semibold">{r.best}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Rifa */}
            <section className="rounded-[var(--radius-toy)] bg-white p-5" aria-labelledby={`${id}-raffle`}>
              <h2 id={`${id}-raffle`} className="flex items-center gap-2 text-xl font-semibold">
                <Ticket weight="fill" size={22} className="text-teal-700" aria-hidden="true" /> Rifa
              </h2>
              {c!.raffleDrawnAt && detail.raffleWinner ? (
                <div className="mt-4 rounded-2xl bg-teal-100 p-4 text-teal-900">
                  <p className="font-semibold">
                    Boleta ganadora #{detail.raffleWinner.ticket}: {detail.raffleWinner.name ?? "sin registrar"}
                  </p>
                  <p>Código {detail.raffleWinner.code}</p>
                  <p>Contacto: {detail.raffleWinner.contact ?? "No se registró: debe presentar su recibo"}</p>
                  <p className="mt-1 text-sm">
                    Sorteada por {c!.raffleDrawnBy} el {fmtDateTime(c!.raffleDrawnAt)} entre {c!.raffleTickets} boletas.
                  </p>
                </div>
              ) : (
                <div className="mt-4">
                  {confirm === "draw" ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-ground p-3">
                      <span>Se sortea una sola vez y queda registrado. ¿Sortear ahora?</span>
                      <button type="button" className="btn btn-sun btn-sm" disabled={busy} onClick={() => run(() => api(`/promo/concurso/${month}/sortear`, { method: "POST" }), "Rifa sorteada.")}>
                        Sí, sortear
                      </button>
                      <button type="button" className="btn btn-soft btn-sm" onClick={() => setConfirm(null)}>
                        No
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="btn btn-sun btn-sm" disabled={Boolean(drawBlock) || detail.tickets === 0} onClick={() => setConfirm("draw")}>
                      {drawBlock ? <Lock size={18} aria-hidden="true" /> : null} Sortear rifa
                    </button>
                  )}
                  {drawBlock && <p className="hint">{drawBlock}</p>}
                </div>
              )}
            </section>
          </div>

          {/* Configuración del mes */}
          <form onSubmit={saveContest} className="rounded-[var(--radius-toy)] bg-white p-5" noValidate>
            <h2 className="text-xl font-semibold">Configuración de {monthLabel(month)}</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <fieldset>
                <legend className="label">Juego del mes</legend>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(GAME_NAME) as GameId[]).map((g) => (
                    <label key={g} className="chip cursor-pointer">
                      <input type="radio" className="sr-only" name={`${id}-g`} checked={form.game === g} onChange={() => setForm({ ...form, game: g })} />
                      {GAME_NAME[g]}
                    </label>
                  ))}
                </div>
                <p className="hint">
                  <a href={`/juega/prueba?juego=${form.game}`} target="_blank" className="font-medium text-teal-700 underline">
                    Probar {GAME_NAME[form.game]}
                  </a>
                </p>
              </fieldset>
              <div>
                <label htmlFor={`${id}-gp`} className="label">
                  Premio del mejor puntaje
                </label>
                <input id={`${id}-gp`} className="field" value={form.gamePrize} onChange={(e) => setForm({ ...form, gamePrize: e.target.value })} maxLength={120} />
              </div>
              <label className="flex min-h-11 cursor-pointer items-center gap-3">
                <input type="checkbox" className="size-5 accent-teal-700" checked={form.raffleEnabled} onChange={(e) => setForm({ ...form, raffleEnabled: e.target.checked })} />
                <span className="font-medium">Rifa activa este mes</span>
              </label>
              <div>
                <label htmlFor={`${id}-rp`} className="label">
                  Premio de la rifa
                </label>
                <input id={`${id}-rp`} className="field" value={form.rafflePrize} onChange={(e) => setForm({ ...form, rafflePrize: e.target.value })} maxLength={120} disabled={Boolean(c?.raffleDrawnAt)} />
              </div>
              <div>
                <label htmlFor={`${id}-n`} className="label">
                  Notas de entrega <span className="font-normal text-ink-soft">(privadas)</span>
                </label>
                <textarea id={`${id}-n`} className="field min-h-20" value={form.prizeNotes} onChange={(e) => setForm({ ...form, prizeNotes: e.target.value })} maxLength={500} />
              </div>
            </div>
            <button className="btn btn-sun mt-5" disabled={busy}>
              Guardar concurso
            </button>
          </form>

          {/* Reglas generales */}
          <form onSubmit={saveSettings} className="rounded-[var(--radius-toy)] bg-white p-5" noValidate>
            <h2 className="text-xl font-semibold">Reglas del COIN</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor={`${id}-min`} className="label">
                  Compra mínima
                </label>
                <input
                  id={`${id}-min`}
                  className="field tnum"
                  inputMode="numeric"
                  value={settings.minPurchase}
                  onChange={(e) => setSettings({ ...settings, minPurchase: Number(e.target.value.replace(/\D/g, "")) || 0 })}
                />
                <p className="hint tnum">{formatCOP(settings.minPurchase)}</p>
              </div>
              <div>
                <label htmlFor={`${id}-att`} className="label">
                  Intentos por COIN
                </label>
                <input
                  id={`${id}-att`}
                  className="field tnum"
                  inputMode="numeric"
                  value={settings.attemptsPerCoin}
                  onChange={(e) => setSettings({ ...settings, attemptsPerCoin: Number(e.target.value.replace(/\D/g, "")) || 1 })}
                />
              </div>
              <div>
                <label htmlFor={`${id}-days`} className="label">
                  Días para usarlo
                </label>
                <input
                  id={`${id}-days`}
                  className="field tnum"
                  inputMode="numeric"
                  value={settings.coinValidDays}
                  onChange={(e) => setSettings({ ...settings, coinValidDays: Number(e.target.value.replace(/\D/g, "")) || 1 })}
                />
              </div>
            </div>
            <p className="hint">Los cambios aplican a los COIN que se entreguen desde ahora.</p>
            <button className="btn btn-soft mt-4" disabled={busy}>
              Guardar reglas
            </button>
          </form>
        </>
      )}
    </div>
  );
}
