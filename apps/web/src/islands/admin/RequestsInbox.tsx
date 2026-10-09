import { WhatsappLogo } from "@phosphor-icons/react/dist/csr/WhatsappLogo";
import { useCallback, useEffect, useId, useState } from "react";
import { api, ApiError } from "../../lib/admin-api";

type Status = "nueva" | "en_revision" | "aprobada" | "rechazada";

interface Req {
  id: number;
  dog_id: number | null;
  dog_name: string | null;
  dog_slug: string | null;
  full_name: string;
  phone: string;
  email: string;
  neighborhood: string;
  home_type: string;
  hours_alone: number;
  other_pets: string;
  has_kids: number;
  experience: string;
  message: string;
  status: Status;
  created_at: string;
  notes: number;
}
interface Note {
  id: number;
  text: string;
  author: string;
  created_at: string;
}

const STATUS: Record<Status, { label: string; cls: string }> = {
  nueva: { label: "Nueva", cls: "bg-sun-400 text-teal-900" },
  en_revision: { label: "En revisión", cls: "bg-teal-100 text-teal-900" },
  aprobada: { label: "Aprobada", cls: "bg-teal-700 text-white" },
  rechazada: { label: "Rechazada", cls: "bg-ground-2 text-ink-soft" },
};
const HOME: Record<string, string> = { apartamento: "Apartamento", casa: "Casa sin patio", casa_patio: "Casa con patio", finca: "Finca" };
const fmt = (iso: string) => new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" });
const wa = (phone: string, name: string, dog: string | null) => {
  const digits = phone.replace(/\D/g, "");
  const n = digits.length === 10 ? `57${digits}` : digits;
  return `https://wa.me/${n}?text=${encodeURIComponent(`Hola ${name.split(" ")[0]}, te escribimos de MAYA Pets por tu solicitud de adopción${dog ? ` de ${dog}` : ""}.`)}`;
};

export default function RequestsInbox() {
  const id = useId();
  const [filter, setFilter] = useState<Status | "">("");
  const [rows, setRows] = useState<Req[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setRows(null);
    try {
      setRows(await api<Req[]>(`/adopcion/solicitudes${filter ? `?estado=${filter}` : ""}`));
    } catch {
      setRows([]);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const openReq = async (rid: number) => {
    if (open === rid) return setOpen(null);
    setOpen(rid);
    setNotes([]);
    setNotes(await api<Note[]>(`/adopcion/solicitudes/${rid}/notas`));
  };

  const setStatus = async (rid: number, status: Status) => {
    try {
      await api(`/adopcion/solicitudes/${rid}/estado`, { method: "PUT", json: { status } });
      setRows((r) => r?.map((x) => (x.id === rid ? { ...x, status } : x)) ?? r);
      setNotes(await api<Note[]>(`/adopcion/solicitudes/${rid}/notas`));
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "No se pudo cambiar.");
    }
  };

  const addNote = async (rid: number) => {
    if (draft.trim().length < 2) return;
    try {
      const n = await api<Note>(`/adopcion/solicitudes/${rid}/notas`, { method: "POST", json: { text: draft } });
      setNotes((x) => [...x, n]);
      setDraft("");
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : "No se pudo guardar la nota.");
    }
  };

  return (
    <div className="space-y-4">
      <nav aria-label="Filtrar solicitudes" className="flex flex-wrap gap-2">
        {([["", "Todas"], ["nueva", "Nuevas"], ["en_revision", "En revisión"], ["aprobada", "Aprobadas"], ["rechazada", "Rechazadas"]] as const).map(([v, l]) => (
          <button key={v} type="button" className="chip !min-h-10 text-sm" aria-pressed={filter === v} onClick={() => setFilter(v)}>
            {l}
          </button>
        ))}
      </nav>
      {msg && (
        <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 font-medium text-danger">
          {msg}
        </p>
      )}
      {rows === null ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="skeleton h-20" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-[var(--radius-toy)] bg-white p-6 text-ink-soft">No hay solicitudes {filter ? "con ese estado" : "todavía"}.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="overflow-hidden rounded-[var(--radius-toy)] bg-white">
              <button type="button" onClick={() => openReq(r.id)} aria-expanded={open === r.id} className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left hover:bg-teal-50">
                <span>
                  <span className="block font-semibold">
                    {r.full_name} <span className="font-normal text-ink-soft">quiere adoptar a</span> {r.dog_name ?? "cualquier perrito"}
                  </span>
                  <span className="block text-sm text-ink-soft">
                    {r.neighborhood} · {HOME[r.home_type] ?? r.home_type} · {fmt(r.created_at)}
                  </span>
                </span>
                <span className={`rounded-full px-3 py-1 text-sm font-semibold ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
              </button>
              {open === r.id && (
                <div className="grid gap-6 border-t border-line p-4 lg:grid-cols-2">
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-ink-soft">Celular</dt>
                      <dd className="font-medium">{r.phone}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-soft">Correo</dt>
                      <dd className="font-medium break-all">{r.email || "-"}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-soft">Solo al día</dt>
                      <dd className="font-medium">{r.hours_alone === 0 ? "Casi nunca" : `Hasta ${r.hours_alone} h`}</dd>
                    </div>
                    <div>
                      <dt className="text-ink-soft">Niños</dt>
                      <dd className="font-medium">{r.has_kids ? "Sí" : "No"}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-ink-soft">Otras mascotas</dt>
                      <dd className="font-medium">{r.other_pets || "Ninguna"}</dd>
                    </div>
                    {r.experience && (
                      <div className="col-span-2">
                        <dt className="text-ink-soft">Experiencia</dt>
                        <dd>{r.experience}</dd>
                      </div>
                    )}
                    {r.message && (
                      <div className="col-span-2">
                        <dt className="text-ink-soft">Por qué quiere adoptar</dt>
                        <dd>{r.message}</dd>
                      </div>
                    )}
                    <div className="col-span-2 flex flex-wrap gap-2 pt-2">
                      <a href={wa(r.phone, r.full_name, r.dog_name)} target="_blank" rel="noopener" className="btn btn-teal btn-sm">
                        <WhatsappLogo size={18} weight="fill" aria-hidden="true" /> Escribir
                      </a>
                      {r.dog_slug && (
                        <a href={`/adopta/${r.dog_slug}`} target="_blank" className="btn btn-soft btn-sm">
                          Ver a {r.dog_name}
                        </a>
                      )}
                    </div>
                  </dl>
                  <div>
                    <p className="label">Estado</p>
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(STATUS) as Status[]).map((s) => (
                        <button key={s} type="button" className="chip !min-h-10 text-sm" aria-pressed={r.status === s} onClick={() => setStatus(r.id, s)}>
                          {STATUS[s].label}
                        </button>
                      ))}
                    </div>
                    <p className="label mt-5">Notas</p>
                    {notes.length === 0 ? (
                      <p className="text-sm text-ink-soft">Sin notas todavía.</p>
                    ) : (
                      <ol className="max-h-48 space-y-2 overflow-y-auto">
                        {notes.map((n) => (
                          <li key={n.id} className="rounded-xl bg-ground px-3 py-2 text-sm">
                            {n.text}
                            <span className="block text-xs text-ink-soft">
                              {n.author} · {fmt(n.created_at)}
                            </span>
                          </li>
                        ))}
                      </ol>
                    )}
                    <div className="mt-3 flex gap-2">
                      <label htmlFor={`${id}-n-${r.id}`} className="sr-only">
                        Nueva nota
                      </label>
                      <input
                        id={`${id}-n-${r.id}`}
                        className="field !min-h-10 flex-1 !py-1.5"
                        placeholder="Ej.: llamada hecha, visita el sábado"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void addNote(r.id))}
                      />
                      <button type="button" className="btn btn-soft btn-sm" onClick={() => addNote(r.id)}>
                        Agregar
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
