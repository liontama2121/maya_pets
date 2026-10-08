import { Trophy } from "@phosphor-icons/react/dist/csr/Trophy";
import { useId, useState } from "react";

export interface BoardRow {
  name: string;
  score: number;
  mine?: boolean;
}

/** Limpia el apodo: sin espacios dobles, sin caracteres raros, máximo 16. */
export function cleanName(raw: string) {
  return raw
    .normalize("NFC")
    .replace(/[^\p{L}\p{N} ._-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 16);
}

/**
 * Tabla local para la versión de prueba (vive solo en este navegador).
 * Con COIN, la tabla real del mes la guarda el servidor.
 */
export function localBoard(gameId: string) {
  const key = `maya-tabla-prueba-${gameId}`;
  const read = (): BoardRow[] => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "[]") as BoardRow[];
    } catch {
      return [];
    }
  };
  return async (name: string, score: number): Promise<BoardRow[]> => {
    const rows = read().map((r) => ({ ...r, mine: false }));
    rows.push({ name, score, mine: true });
    rows.sort((a, b) => b.score - a.score);
    const top = rows.slice(0, 10);
    try {
      localStorage.setItem(key, JSON.stringify(top.map(({ name: n, score: s }) => ({ name: n, score: s }))));
    } catch {
      /* modo privado: la tabla vive solo en esta pantalla */
    }
    return top;
  };
}

/** Al terminar: el jugador deja su nombre y ve la tabla. */
export function ScoreSave({
  score,
  onSave,
  boardTitle = "Mejores puntajes",
}: {
  score: number;
  onSave: (name: string, score: number) => Promise<BoardRow[]>;
  boardTitle?: string;
}) {
  const id = useId();
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem("maya-apodo") ?? "";
    } catch {
      return "";
    }
  });
  const [board, setBoard] = useState<BoardRow[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = cleanName(name);
    if (clean.length < 2) {
      setError("Escribe un nombre o apodo de al menos 2 letras.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setBoard(await onSave(clean, score));
      try {
        localStorage.setItem("maya-apodo", clean);
      } catch {
        /* sin almacenamiento: no pasa nada */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  if (board) {
    return (
      <div className="mt-4 w-full max-w-[280px] rounded-2xl bg-white/12 p-3 text-left">
        <p className="mb-2 flex items-center gap-2 font-semibold">
          <Trophy weight="fill" size={18} className="text-[var(--accent)]" aria-hidden="true" /> {boardTitle}
        </p>
        <ol className="space-y-1 text-sm">
          {board.slice(0, 5).map((r, i) => (
            <li
              key={`${r.name}-${i}`}
              className={`flex justify-between gap-3 rounded-lg px-2 py-1 ${r.mine ? "bg-[var(--accent)] font-semibold text-[var(--on-accent)]" : ""}`}
            >
              <span className="truncate">
                {i + 1}. {r.name}
              </span>
              <span className="tnum">{r.score}</span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <form onSubmit={save} className="mt-4 w-full max-w-[280px]" noValidate>
      <label htmlFor={`${id}-n`} className="mb-1.5 block text-sm font-medium text-white/90">
        Deja tu nombre en la tabla
      </label>
      <div className="flex gap-2">
        <input
          id={`${id}-n`}
          className="field !min-h-11 flex-1 !py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={16}
          placeholder="Tu apodo"
          autoComplete="nickname"
          enterKeyHint="done"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-e` : undefined}
        />
        <button type="submit" className="btn btn-sun btn-sm" disabled={busy}>
          {busy ? "…" : "Guardar"}
        </button>
      </div>
      {error && (
        <p id={`${id}-e`} className="mt-1.5 text-sm font-medium text-[#ffb4ab]" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
