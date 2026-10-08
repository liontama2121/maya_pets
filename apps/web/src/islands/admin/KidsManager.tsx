import { ArrowSquareOut } from "@phosphor-icons/react/dist/csr/ArrowSquareOut";
import { ArrowsClockwise } from "@phosphor-icons/react/dist/csr/ArrowsClockwise";
import { Crown } from "@phosphor-icons/react/dist/csr/Crown";
import { Heart } from "@phosphor-icons/react/dist/csr/Heart";
import { InstagramLogo } from "@phosphor-icons/react/dist/csr/InstagramLogo";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { useCallback, useEffect, useId, useState } from "react";
import { api, ApiError } from "../../lib/admin-api";

interface Contest {
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
  winnerEntryId: number | null;
  closedAt: string | null;
  closedBy: string | null;
  total: number;
  pending: number;
  published: number;
}

interface Entry {
  id: number;
  childName: string;
  childAge: number;
  drawingTitle: string;
  guardianName: string;
  guardianContact: string;
  imageUrl: string;
  status: "pendiente" | "aprobado" | "publicado" | "rechazado";
  rejectReason: string;
  instagramUrl: string | null;
  likes: number;
  likesUpdatedAt: string | null;
  likesSource: "instagram" | "manual" | null;
}

type Draft = Omit<Contest, "id" | "slug" | "winnerEntryId" | "closedAt" | "closedBy" | "total" | "pending" | "published"> & { id?: number };

const today = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 86400e3).toISOString().slice(0, 10);
const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "short" });

function phase(c: Contest) {
  const t = today();
  if (c.closedAt) return { label: "Cerrado", cls: "bg-ground-2 text-ink-soft" };
  if (t < c.startsAt) return { label: `Abre ${fmt(c.startsAt)}`, cls: "bg-teal-50 text-teal-900" };
  if (t <= c.endsAt) return { label: "Recibiendo dibujos", cls: "bg-sun-400 text-teal-900" };
  if (t <= c.votingEndsAt) return { label: "Votación en Instagram", cls: "bg-teal-700 text-white" };
  return { label: "Listo para cerrar", cls: "bg-danger-soft text-danger" };
}

const STATUS: Record<Entry["status"], { label: string; cls: string }> = {
  pendiente: { label: "Por revisar", cls: "bg-sun-100 text-teal-900" },
  aprobado: { label: "En concurso", cls: "bg-teal-700 text-white" },
  publicado: { label: "En concurso", cls: "bg-teal-700 text-white" },
  rechazado: { label: "Rechazado", cls: "bg-danger-soft text-danger" },
};

const blankDraft = (): Draft => {
  const t = today();
  return {
    title: "",
    theme: "",
    description: "",
    prize: "Regalo sorpresa",
    ageMin: 3,
    ageMax: 12,
    startsAt: t,
    endsAt: addDays(t, 14),
    votingEndsAt: addDays(t, 21),
  };
};

export default function KidsManager() {
  const id = useId();
  const [contests, setContests] = useState<Contest[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [igConnected, setIgConnected] = useState(false);
  const [rejecting, setRejecting] = useState<{ id: number; reason: string } | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const loadContests = useCallback(async () => {
    const list = await api<Contest[]>("/kids/concursos");
    setContests(list);
    setSelected((s) => s ?? list[0]?.id ?? null);
  }, []);

  const loadEntries = useCallback(async (cid: number) => {
    setEntries(null);
    setEntries(await api<Entry[]>(`/kids/concursos/${cid}/dibujos`));
  }, []);

  useEffect(() => {
    void loadContests();
    api<{ connected: boolean }>("/kids/instagram").then((r) => setIgConnected(r.connected)).catch(() => {});
  }, [loadContests]);

  useEffect(() => {
    if (selected) void loadEntries(selected);
  }, [selected, loadEntries]);

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg({ kind: "ok", text: ok });
      await loadContests();
      if (selected) await loadEntries(selected);
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof ApiError ? err.message : "No se pudo completar." });
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    setErrors({});
    try {
      const { id: did, ...body } = draft;
      const saved = await api<Contest>(did ? `/kids/concursos/${did}` : "/kids/concursos", { method: did ? "PUT" : "POST", json: body });
      setDraft(null);
      await loadContests();
      setSelected(saved.id);
      setMsg({ kind: "ok", text: did ? "Concurso actualizado." : "Concurso creado. Ya aparece en MAYA Kids." });
    } catch (err) {
      if (err instanceof ApiError) {
        const f: Record<string, string> = {};
        for (const [k, v] of Object.entries(err.fields)) if (v?.[0]) f[k] = v[0];
        setErrors(f);
        setMsg({ kind: "error", text: err.message });
      }
    } finally {
      setBusy(false);
    }
  };

  const current = contests?.find((c) => c.id === selected) ?? null;
  const winner = current?.winnerEntryId ? entries?.find((e) => e.id === current.winnerEntryId) : null;
  const canClose = current && !current.closedAt && today() > current.votingEndsAt;

  const field = (k: keyof Draft, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label htmlFor={`${id}-${k}`} className="label">
        {label}
      </label>
      <input
        id={`${id}-${k}`}
        className="field"
        value={String(draft?.[k] ?? "")}
        onChange={(e) => setDraft((d) => (d ? { ...d, [k]: props.type === "number" ? Number(e.target.value) : e.target.value } : d))}
        aria-invalid={errors[k] ? true : undefined}
        {...props}
      />
      {errors[k] && <p className="error-text">{errors[k]}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${igConnected ? "bg-teal-100 text-teal-900" : "bg-sun-100 text-teal-900"}`}>
          <InstagramLogo size={18} aria-hidden="true" />
          {igConnected ? "Instagram conectado: los likes se leen solos cada 3 horas" : "Instagram sin conectar: los likes aparecen cuando se conecte la cuenta"}
        </p>
        <button type="button" className="btn btn-sun" onClick={() => { setDraft(blankDraft()); setErrors({}); }}>
          <Plus size={20} weight="bold" aria-hidden="true" /> Nuevo concurso
        </button>
      </div>

      {msg && (
        <p role={msg.kind === "error" ? "alert" : "status"} className={`rounded-2xl px-4 py-3 font-medium ${msg.kind === "error" ? "bg-danger-soft text-danger" : "bg-teal-100 text-teal-900"}`}>
          {msg.text}
        </p>
      )}

      {draft && (
        <form onSubmit={saveDraft} className="rounded-[var(--radius-toy)] bg-white p-5" noValidate>
          <h2 className="text-xl font-semibold">{draft.id ? "Editar concurso" : "Nuevo concurso de dibujo"}</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {field("title", "Nombre del concurso", { placeholder: "Ej.: ¿Cómo es Maya?", maxLength: 80 })}
            {field("theme", "Tema del dibujo", { placeholder: "Ej.: Dibuja a Maya como la imaginas", maxLength: 120 })}
            {field("prize", "Premio", { maxLength: 120 })}
            <div className="grid grid-cols-2 gap-3">
              {field("ageMin", "Edad mínima", { type: "number", min: 1, max: 17 })}
              {field("ageMax", "Edad máxima", { type: "number", min: 1, max: 17 })}
            </div>
            {field("startsAt", "Reciben dibujos desde", { type: "date" })}
            {field("endsAt", "Reciben dibujos hasta", { type: "date" })}
            {field("votingEndsAt", "Los likes cuentan hasta", { type: "date" })}
            <div className="md:col-span-2">
              <label htmlFor={`${id}-desc`} className="label">
                Descripción <span className="font-normal text-ink-soft">(opcional)</span>
              </label>
              <textarea
                id={`${id}-desc`}
                className="field min-h-20"
                maxLength={600}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>
          </div>
          <div className="mt-5 flex gap-3">
            <button className="btn btn-sun" disabled={busy}>
              {busy ? "Guardando…" : "Guardar concurso"}
            </button>
            <button type="button" className="btn btn-soft" onClick={() => setDraft(null)}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {contests === null ? (
        <div className="skeleton h-24" />
      ) : contests.length === 0 ? (
        <p className="rounded-[var(--radius-toy)] bg-white p-6 text-ink-soft">
          Aún no hay concursos. Crea el primero: por ejemplo, “¿Cómo es Maya?”, para que los niños dibujen a la perrita invisible como la imaginan.
        </p>
      ) : (
        <nav aria-label="Concursos" className="flex gap-3 overflow-x-auto pb-2">
          {contests.map((c) => {
            const p = phase(c);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelected(c.id)}
                aria-current={c.id === selected ? "true" : undefined}
                className="min-w-56 shrink-0 rounded-[var(--radius-toy)] bg-white p-4 text-left outline-offset-2 aria-[current=true]:ring-4 aria-[current=true]:ring-sun-400"
              >
                <span className="block font-semibold">{c.title}</span>
                <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${p.cls}`}>{p.label}</span>
                <span className="mt-2 block text-sm text-ink-soft">
                  {c.total} dibujos · {c.pending} por revisar
                </span>
              </button>
            );
          })}
        </nav>
      )}

      {current && (
        <section aria-labelledby={`${id}-cur`} className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius-toy)] bg-white p-5">
            <div>
              <h2 id={`${id}-cur`} className="text-2xl font-bold">
                {current.title}
              </h2>
              <p className="text-ink-soft">
                {current.theme} · {current.ageMin} a {current.ageMax} años · Premio: {current.prize}
              </p>
              <p className="mt-1 text-sm text-ink-soft">
                Dibujos del {fmt(current.startsAt)} al {fmt(current.endsAt)} · likes hasta el {fmt(current.votingEndsAt)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!current.closedAt && (
                <button
                  type="button"
                  className="btn btn-soft btn-sm"
                  onClick={() =>
                    setDraft({
                      id: current.id,
                      title: current.title,
                      theme: current.theme,
                      description: current.description,
                      prize: current.prize,
                      ageMin: current.ageMin,
                      ageMax: current.ageMax,
                      startsAt: current.startsAt,
                      endsAt: current.endsAt,
                      votingEndsAt: current.votingEndsAt,
                    })
                  }
                >
                  Editar
                </button>
              )}
              {igConnected && !current.closedAt && (
                <button
                  type="button"
                  className="btn btn-soft btn-sm"
                  disabled={busy}
                  onClick={() =>
                    act(async () => {
                      const r = await api<{ updated: number; missing: number[] }>(`/kids/concursos/${current.id}/sincronizar`, { method: "POST" });
                      setMsg({
                        kind: "ok",
                        text: `Likes leídos de Instagram en ${r.updated} dibujos.${r.missing.length ? ` ${r.missing.length} no se pudieron leer: puede que la colaboración no esté aceptada o que el post sea privado o se haya borrado.` : ""}`,
                      });
                    })
                  }
                >
                  <ArrowsClockwise size={18} aria-hidden="true" /> Actualizar likes
                </button>
              )}
              <a href="/maya-kids" target="_blank" className="btn btn-soft btn-sm">
                <ArrowSquareOut size={18} aria-hidden="true" /> Ver página
              </a>
            </div>
          </div>

          {winner ? (
            <div className="flex flex-wrap items-center gap-4 rounded-[var(--radius-toy)] bg-sun-100 p-4 text-teal-900">
              <img src={winner.imageUrl} alt="" className="size-20 rounded-2xl object-cover" />
              <div>
                <p className="flex items-center gap-2 text-lg font-bold">
                  <Crown weight="fill" size={20} aria-hidden="true" /> Ganó {winner.childName}, {winner.childAge} años, con {winner.likes} likes
                </p>
                <p>
                  Acudiente: {winner.guardianName} · {winner.guardianContact}
                </p>
              </div>
            </div>
          ) : (
            canClose && (
              <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-toy)] bg-white p-4">
                {confirmClose ? (
                  <>
                    <span>Se leen los likes de Instagram ahora mismo y gana el que tenga más. ¿Cerrar?</span>
                    <button
                      type="button"
                      className="btn btn-teal btn-sm"
                      disabled={busy}
                      onClick={() => act(() => api(`/kids/concursos/${current.id}/cerrar`, { method: "POST" }), "Concurso cerrado.").then(() => setConfirmClose(false))}
                    >
                      Sí, cerrar
                    </button>
                    <button type="button" className="btn btn-soft btn-sm" onClick={() => setConfirmClose(false)}>
                      No
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn btn-teal" onClick={() => setConfirmClose(true)}>
                    <Crown size={20} aria-hidden="true" /> Cerrar concurso y ver ganador
                  </button>
                )}
              </div>
            )
          )}

          {entries === null ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="skeleton h-80" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <p className="rounded-[var(--radius-toy)] bg-white p-6 text-ink-soft">Todavía no llegan dibujos a este concurso.</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {entries.map((e) => (
                <li key={e.id} className={`flex flex-col overflow-hidden rounded-[var(--radius-toy)] bg-white ${e.status === "rechazado" ? "opacity-60" : ""}`}>
                  <a href={e.imageUrl} target="_blank" rel="noopener" className="block bg-ground">
                    <img src={e.imageUrl} alt={`Dibujo de ${e.childName}`} className="aspect-[4/3] w-full object-contain" loading="lazy" />
                  </a>
                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">
                          {e.childName}, {e.childAge} años
                        </p>
                        {e.drawingTitle && <p className="text-sm text-ink-soft">{e.drawingTitle}</p>}
                        <p className="text-sm text-ink-soft">
                          {e.guardianName} · {e.guardianContact}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[e.status].cls}`}>{STATUS[e.status].label}</span>
                    </div>

                    {e.status === "pendiente" && e.instagramUrl && (
                      <p className="rounded-2xl bg-ground p-3 text-sm">
                        1. Abre{" "}
                        <a href={e.instagramUrl} target="_blank" rel="noopener" className="font-semibold text-teal-700 underline">
                          la publicación
                        </a>{" "}
                        y revisa que solo muestre el dibujo. 2. Acepta la invitación de colaborador en la app de Instagram. 3. Aprueba aquí.
                      </p>
                    )}
                    {e.status === "pendiente" &&
                      (rejecting?.id === e.id ? (
                        <div className="space-y-2 rounded-2xl bg-danger-soft p-3">
                          <label htmlFor={`${id}-rj-${e.id}`} className="label text-sm">
                            Motivo
                          </label>
                          <input id={`${id}-rj-${e.id}`} className="field" value={rejecting.reason} onChange={(ev) => setRejecting({ id: e.id, reason: ev.target.value })} placeholder="Ej.: no corresponde al tema" />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              disabled={busy || rejecting.reason.trim().length < 3}
                              onClick={() => act(() => api(`/kids/dibujos/${e.id}/estado`, { method: "POST", json: { status: "rechazado", reason: rejecting.reason } })).then(() => setRejecting(null))}
                            >
                              Rechazar
                            </button>
                            <button type="button" className="btn btn-soft btn-sm" onClick={() => setRejecting(null)}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button type="button" className="btn btn-teal btn-sm" disabled={busy} onClick={() => act(() => api(`/kids/dibujos/${e.id}/estado`, { method: "POST", json: { status: "publicado" } }))}>
                            Aprobar y mostrar
                          </button>
                          <button type="button" className="btn btn-soft btn-sm text-danger" onClick={() => setRejecting({ id: e.id, reason: "" })}>
                            Rechazar
                          </button>
                        </div>
                      ))}

                    {e.status === "rechazado" && <p className="text-sm text-danger">Motivo: {e.rejectReason}</p>}


                    {e.status === "publicado" && (
                      <div className="mt-auto flex items-center justify-between gap-2 rounded-2xl bg-ground px-3 py-2">
                        <span className="inline-flex items-center gap-1.5 font-semibold">
                          <Heart weight="fill" size={18} className="text-danger" aria-hidden="true" />
                          {e.likesSource === "instagram" ? (
                            <>
                              <span className="tnum">{e.likes}</span> likes
                            </>
                          ) : (
                            <span className="text-sm font-normal text-ink-soft">Aún sin leer de Instagram</span>
                          )}
                        </span>
                        {e.instagramUrl && (
                          <a href={e.instagramUrl} target="_blank" rel="noopener" className="text-sm font-semibold text-teal-700 underline">
                            Ver post
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
