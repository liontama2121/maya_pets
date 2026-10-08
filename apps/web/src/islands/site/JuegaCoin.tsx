import { Ticket } from "@phosphor-icons/react/dist/csr/Ticket";
import { Trophy } from "@phosphor-icons/react/dist/csr/Trophy";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import CasaGame from "./CasaGame";
import LluviaGame from "./LluviaGame";

interface CoinStatus {
  code: string;
  name: string | null;
  claimed: boolean;
  ticket: number;
  raffleMonth: string;
  attemptsLeft: number;
  attemptsTotal: number;
  expired: boolean;
  best: number | null;
  game: "casa" | "lluvia";
  month: string;
}

interface Board {
  month: string;
  game: "casa" | "lluvia";
  gamePrize: string;
  raffleEnabled: boolean;
  rafflePrize: string;
  rows: { name: string; score: number }[];
}

const STORE_KEY = "maya-coin";
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const monthName = (m: string) => MONTHS[Number(m.slice(5, 7)) - 1] ?? m;

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/juega${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Sin conexión. Revisa el internet e intenta de nuevo.");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Algo salió mal. Intenta de nuevo.");
  return data;
}

function remember(code: string | null) {
  try {
    if (code) localStorage.setItem(STORE_KEY, code);
    else localStorage.removeItem(STORE_KEY);
  } catch {
    /* sin almacenamiento: el cliente vuelve a escribir el código */
  }
}

export default function JuegaCoin() {
  const id = useId();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<CoinStatus | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reg, setReg] = useState({ name: "", contact: "", consent: false });
  const play = useRef<number | null>(null);

  const loadBoard = useCallback(async () => {
    try {
      const r = await fetch("/api/juega/tabla");
      if (r.ok) setBoard((await r.json()) as Board);
    } catch {
      /* la tabla es opcional para jugar */
    }
  }, []);

  const lookup = useCallback(async (raw: string) => {
    setBusy(true);
    setError("");
    try {
      const s = await post<CoinStatus>("/coin", { code: raw });
      setStatus(s);
      setCode(s.code);
      remember(s.code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos revisar el código.");
      remember(null);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadBoard();
    const fromUrl = new URLSearchParams(location.search).get("codigo");
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORE_KEY);
    } catch {
      saved = null;
    }
    const initial = fromUrl || saved;
    if (initial) {
      setCode(initial);
      void lookup(initial);
    }
  }, [loadBoard, lookup]);

  const register = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setStatus(await post<CoinStatus>("/registro", { code, ...reg }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo registrar.");
    } finally {
      setBusy(false);
    }
  };

  const startGame = async () => {
    const r = await post<{ playId: number; seed: number; attemptsLeft: number }>("/iniciar", { code });
    play.current = r.playId;
    setStatus((s) => (s ? { ...s, attemptsLeft: r.attemptsLeft } : s));
    return r.seed;
  };

  const onFinish = async (g: { inputs: [number, number][]; score: number }) => {
    if (!play.current) return;
    const r = await post<CoinStatus & { score: number; valid: boolean; rank: number | null }>("/terminar", {
      code,
      playId: play.current,
      inputs: g.inputs,
      clientScore: g.score,
    });
    play.current = null;
    setStatus(r);
    void loadBoard();
    if (!r.valid) return { message: "No pudimos validar esta partida, así que no cuenta para la tabla. Si crees que es un error, escríbenos." };
    const left = r.attemptsLeft;
    return {
      message: `Quedó registrado: ${r.score} puntos. Tu mejor puntaje es ${r.best}${r.rank ? ` y vas de #${r.rank} este mes` : ""}.${left ? "" : " Ya usaste los intentos de este COIN."}`,
    };
  };

  const prizes = board && (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-[var(--radius-toy)] bg-white p-4">
        <p className="flex items-center gap-2 font-semibold">
          <Trophy weight="fill" size={20} className="text-sun-500" aria-hidden="true" /> Mejor puntaje de {monthName(board.month)}
        </p>
        <p className="mt-1 text-ink-soft">{board.gamePrize}</p>
      </div>
      {board.raffleEnabled && (
        <div className="rounded-[var(--radius-toy)] bg-white p-4">
          <p className="flex items-center gap-2 font-semibold">
            <Ticket weight="fill" size={20} className="text-teal-700" aria-hidden="true" /> Rifa de {monthName(board.month)}
          </p>
          <p className="mt-1 text-ink-soft">{board.rafflePrize}</p>
        </div>
      )}
    </div>
  );

  const table = board && (
    <section className="rounded-[var(--radius-toy)] bg-white p-5" aria-labelledby={`${id}-tabla`}>
      <h2 id={`${id}-tabla`} className="flex items-center gap-2 text-xl font-semibold">
        <Trophy weight="fill" size={22} className="text-sun-500" aria-hidden="true" /> Tabla de {monthName(board.month)}
      </h2>
      {board.rows.length === 0 ? (
        <p className="mt-3 text-ink-soft">Nadie ha jugado este mes. El primer puntaje puede ser el tuyo.</p>
      ) : (
        <ol className="mt-3 space-y-1">
          {board.rows.map((r, i) => (
            <li
              key={`${r.name}-${i}`}
              className={`flex justify-between gap-3 rounded-xl px-3 py-2 ${status?.name === r.name && status.best === r.score ? "bg-sun-100 font-semibold" : i < 3 ? "bg-teal-50" : ""}`}
            >
              <span className="truncate">
                <span className="tnum mr-2 text-ink-soft">{i + 1}.</span>
                {r.name}
              </span>
              <span className="tnum font-semibold">{r.score}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );

  /* -------------------------------- Pantallas ------------------------------- */

  if (!status) {
    return (
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void lookup(code);
            }}
            className="rounded-[var(--radius-toy)] bg-white p-5 sm:p-6"
            noValidate
          >
            <label htmlFor={`${id}-code`} className="label text-lg">
              Escribe el código de tu COIN
            </label>
            <p className="mb-3 text-ink-soft">Viene en tu recibo o en la confirmación de tu pedido.</p>
            <div className="flex flex-wrap gap-2">
              <input
                id={`${id}-code`}
                className="field tnum max-w-xs flex-1 uppercase tracking-wider"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="MAYA-XXXX-XXXX"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-err` : undefined}
              />
              <button className="btn btn-sun" disabled={busy || code.trim().length < 8}>
                {busy ? "Revisando…" : "Entrar"}
              </button>
            </div>
            {error && (
              <p id={`${id}-err`} className="error-text" role="alert">
                {error}
              </p>
            )}
          </form>
          {prizes}
          <p className="text-ink-soft">
            ¿Sin COIN todavía? <a href="/juega/prueba" className="font-semibold text-teal-700 underline">Prueba los juegos gratis</a> y{" "}
            <a href="/tienda" className="font-semibold text-teal-700 underline">mira la tienda</a>: cada compra desde el mínimo te da uno.
          </p>
        </div>
        {table}
      </div>
    );
  }

  if (!status.claimed) {
    return (
      <form onSubmit={register} className="mx-auto max-w-lg space-y-5 rounded-[var(--radius-toy)] bg-white p-5 sm:p-6" noValidate>
        <div>
          <p className="text-ink-soft">COIN</p>
          <p className="tnum text-xl font-bold tracking-wider">{status.code}</p>
        </div>
        <div>
          <label htmlFor={`${id}-name`} className="label">
            Tu apodo para la tabla
          </label>
          <input
            id={`${id}-name`}
            className="field"
            maxLength={16}
            value={reg.name}
            onChange={(e) => setReg({ ...reg, name: e.target.value })}
            autoComplete="nickname"
          />
          <p className="hint">Es lo único que se ve en público. No uses tu nombre completo.</p>
        </div>
        <div>
          <label htmlFor={`${id}-contact`} className="label">
            WhatsApp o correo
          </label>
          <input
            id={`${id}-contact`}
            className="field"
            maxLength={80}
            value={reg.contact}
            onChange={(e) => setReg({ ...reg, contact: e.target.value })}
            autoComplete="tel"
            inputMode="email"
          />
          <p className="hint">Solo para avisarte si ganas. No lo publicamos.</p>
        </div>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-5 shrink-0 accent-teal-700"
            checked={reg.consent}
            onChange={(e) => setReg({ ...reg, consent: e.target.checked })}
          />
          <span className="text-sm">
            Acepto los{" "}
            <a href="/juega/terminos" target="_blank" className="font-semibold text-teal-700 underline">
              términos del concurso
            </a>{" "}
            y autorizo el tratamiento de mis datos según la{" "}
            <a href="/privacidad" target="_blank" className="font-semibold text-teal-700 underline">
              política de privacidad
            </a>{" "}
            (Ley 1581 de 2012).
          </span>
        </label>
        {error && (
          <p className="rounded-xl bg-danger-soft px-3 py-2 font-medium text-danger" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <button className="btn btn-sun" disabled={busy}>
            {busy ? "Guardando…" : "Empezar a jugar"}
          </button>
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => {
              remember(null);
              setStatus(null);
              setCode("");
            }}
          >
            Usar otro código
          </button>
        </div>
      </form>
    );
  }

  const Game = status.game === "casa" ? CasaGame : LluviaGame;
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0">
        <Game
          startGame={startGame}
          onFinish={onFinish as never}
          attemptsLeft={status.attemptsLeft}
          playLabel={status.attemptsLeft ? `Jugar (${status.attemptsLeft} ${status.attemptsLeft === 1 ? "intento" : "intentos"})` : "Sin intentos"}
        />
      </div>
      <aside className="space-y-4">
        <div className="rounded-[var(--radius-toy)] bg-white p-5">
          <p className="text-sm text-ink-soft">Jugando como</p>
          <p className="text-xl font-bold">{status.name}</p>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-ground p-3">
              <dt className="text-sm text-ink-soft">Intentos</dt>
              <dd className="tnum text-2xl font-bold text-teal-900">
                {status.attemptsLeft}
                <span className="text-base font-normal text-ink-soft"> / {status.attemptsTotal}</span>
              </dd>
            </div>
            <div className="rounded-2xl bg-ground p-3">
              <dt className="text-sm text-ink-soft">Mejor puntaje</dt>
              <dd className="tnum text-2xl font-bold text-teal-900">{status.best ?? "-"}</dd>
            </div>
          </dl>
          {board?.raffleEnabled && (
            <p className="mt-4 flex items-center gap-2 rounded-2xl bg-sun-100 px-3 py-2 text-teal-900">
              <Ticket weight="fill" size={20} aria-hidden="true" />
              <span>
                Boleta <span className="tnum font-bold">#{status.ticket}</span> para la rifa de {monthName(status.raffleMonth)}
              </span>
            </p>
          )}
          {status.expired && <p className="mt-3 font-medium text-danger">Este COIN venció. Con tu próxima compra recibes uno nuevo.</p>}
          <button
            type="button"
            className="mt-4 text-sm font-semibold text-teal-700 underline"
            onClick={() => {
              remember(null);
              setStatus(null);
              setCode("");
            }}
          >
            Usar otro código
          </button>
        </div>
        {prizes}
        {table}
      </aside>
    </div>
  );
}
