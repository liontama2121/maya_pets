import { staffInput } from "@maya/api/schemas";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { useId, useState } from "react";
import { api, ApiError } from "../../lib/admin-api";

type Role = "admin" | "vendedor" | "adopciones";

export interface StaffRow {
  id: number;
  email: string;
  name: string;
  roles: Role[];
  active: boolean;
  lastSeenAt: string | null;
}

const ROLES: [Role, string, string][] = [
  ["admin", "Administración", "Todo: productos, precios, temporadas, equipo y reportes."],
  ["vendedor", "Ventas", "Caja, pedidos y consulta de inventario."],
  ["adopciones", "Adopciones", "Solo el módulo de perritos y solicitudes."],
];

interface Draft {
  id?: number;
  email: string;
  name: string;
  roles: Role[];
  active: boolean;
}

export default function StaffManager({ initial, meId }: { initial: StaffRow[]; meId: number }) {
  const id = useId();
  const [rows, setRows] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const parsed = staffInput.safeParse(draft);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[i.path.join(".")] ??= i.message;
      setErrors(errs);
      return;
    }
    setBusy(true);
    try {
      const saved = await api<StaffRow>(draft.id ? `/staff/${draft.id}` : "/staff", {
        method: draft.id ? "PUT" : "POST",
        json: parsed.data,
      });
      setRows((r) => (draft.id ? r.map((x) => (x.id === saved.id ? saved : x)) : [...r, saved]));
      setMsg({ kind: "ok", text: draft.id ? "Cambios guardados." : `${saved.name} ya puede entrar al panel con ${saved.email}.` });
      setDraft(null);
      setErrors({});
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof ApiError ? err.message : "No se pudo guardar." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section aria-label="Personas con acceso">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-ink-soft">Entran con su correo. Si alguien deja de trabajar en la tienda, desactívalo y pierde el acceso al instante.</p>
          <button type="button" className="btn btn-sun" onClick={() => { setDraft({ email: "", name: "", roles: ["vendedor"], active: true }); setErrors({}); setMsg(null); }}>
            <Plus size={20} weight="bold" aria-hidden="true" /> Agregar persona
          </button>
        </div>
        {msg && (
          <p role={msg.kind === "error" ? "alert" : "status"} className={`mt-4 rounded-2xl px-4 py-3 font-medium ${msg.kind === "error" ? "bg-danger-soft text-danger" : "bg-teal-100 text-teal-900"}`}>
            {msg.text}
          </p>
        )}
        <ul className="mt-5 overflow-hidden rounded-[var(--radius-toy)] bg-white">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-0">
              <div className="min-w-0">
                <p className="font-medium">
                  {r.name} {r.id === meId && <span className="text-sm font-normal text-ink-soft">(tú)</span>}
                  {!r.active && <span className="ml-2 rounded-full bg-ground-2 px-2 py-0.5 text-xs text-ink-soft">Sin acceso</span>}
                </p>
                <p className="truncate text-sm text-ink-soft">{r.email} · {r.roles.map((x) => ROLES.find(([k]) => k === x)?.[1]).join(", ")}</p>
              </div>
              <button type="button" className="btn btn-soft btn-sm" onClick={() => { setDraft({ id: r.id, email: r.email, name: r.name, roles: r.roles, active: r.active }); setErrors({}); setMsg(null); }}>
                Editar
              </button>
            </li>
          ))}
        </ul>
      </section>

      <aside className="xl:sticky xl:top-8 xl:self-start">
        {draft ? (
          <form onSubmit={save} noValidate className="space-y-4 rounded-[var(--radius-toy)] bg-white p-5">
            <h2 className="text-xl font-semibold">{draft.id ? "Editar acceso" : "Nueva persona"}</h2>
            <div>
              <label className="label" htmlFor={`${id}-n`}>Nombre</label>
              <input id={`${id}-n`} className="field" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-invalid={errors.name ? true : undefined} />
              {errors.name && <p className="error-text">{errors.name}</p>}
            </div>
            <div>
              <label className="label" htmlFor={`${id}-e`}>Correo</label>
              <input id={`${id}-e`} type="email" className="field" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} aria-invalid={errors.email ? true : undefined} autoComplete="off" />
              {errors.email ? <p className="error-text">{errors.email}</p> : <p className="hint">Con este correo recibe el código para entrar.</p>}
            </div>
            <fieldset>
              <legend className="label">Qué puede hacer</legend>
              <div className="space-y-2">
                {ROLES.map(([value, label, help]) => (
                  <label key={value} className="flex cursor-pointer items-start gap-3 rounded-2xl p-2 hover:bg-teal-50">
                    <input
                      type="checkbox"
                      className="mt-1 size-5 accent-teal-700"
                      checked={draft.roles.includes(value)}
                      onChange={(e) => setDraft({ ...draft, roles: e.target.checked ? [...draft.roles, value] : draft.roles.filter((x) => x !== value) })}
                    />
                    <span><span className="font-medium">{label}</span><span className="block text-sm text-ink-soft">{help}</span></span>
                  </label>
                ))}
              </div>
              {errors.roles && <p className="error-text">{errors.roles}</p>}
            </fieldset>
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <input type="checkbox" className="size-5 accent-teal-700" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
              Puede entrar al panel
            </label>
            <div className="flex gap-3">
              <button type="submit" className="btn btn-sun flex-1" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button>
              <button type="button" className="btn btn-soft" onClick={() => setDraft(null)}>Cancelar</button>
            </div>
          </form>
        ) : (
          <div className="rounded-[var(--radius-toy)] bg-white p-5 text-ink-soft">
            El acceso tiene dos llaves: Cloudflare Access verifica el correo y esta lista decide qué puede hacer cada persona.
          </div>
        )}
      </aside>
    </div>
  );
}
