import { categoryInput } from "@maya/api/schemas";
import { Cat } from "@phosphor-icons/react/dist/csr/Cat";
import { Dog } from "@phosphor-icons/react/dist/csr/Dog";
import { PencilSimple } from "@phosphor-icons/react/dist/csr/PencilSimple";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { useId, useRef, useState } from "react";
import { api, ApiError } from "../../lib/admin-api";

type Species = "perro" | "gato" | "ambos";

export interface AdminCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  species: Species;
  imageKey: string | null;
  sortOrder: number;
  active: boolean;
  productCount: number;
}

interface Draft {
  id?: number;
  name: string;
  description: string;
  species: Species;
  sortOrder: string;
  active: boolean;
}

const blank = (order: number): Draft => ({ name: "", description: "", species: "ambos", sortOrder: String(order), active: true });
const SPECIES: [Species, string][] = [
  ["perro", "Solo perros"],
  ["gato", "Solo gatos"],
  ["ambos", "Perros y gatos"],
];

export default function CategoriesManager({ initial }: { initial: AdminCategory[] }) {
  const id = useId();
  const [items, setItems] = useState(initial);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const open = (d: Draft) => {
    setDraft(d);
    setErrors({});
    setMessage(null);
    requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      formRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    const parsed = categoryInput.safeParse({
      name: draft.name,
      description: draft.description,
      species: draft.species,
      sortOrder: draft.sortOrder || 0,
      active: draft.active,
      imageKey: null,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[i.path.join(".")] ??= i.message;
      setErrors(errs);
      return;
    }
    setBusy(true);
    try {
      const saved = await api<AdminCategory>(draft.id ? `/categories/${draft.id}` : "/categories", {
        method: draft.id ? "PUT" : "POST",
        json: parsed.data,
      });
      setItems((list) => {
        const count = list.find((c) => c.id === saved.id)?.productCount ?? 0;
        const next = draft.id
          ? list.map((c) => (c.id === saved.id ? { ...saved, productCount: count } : c))
          : [...list, { ...saved, productCount: 0 }];
        return next.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      });
      setMessage({ kind: "ok", text: draft.id ? `“${saved.name}” quedó actualizada.` : `“${saved.name}” ya está en la tienda.` });
      setDraft(null);
    } catch (err) {
      if (err instanceof ApiError) {
        const errs: Record<string, string> = {};
        for (const [k, v] of Object.entries(err.fields)) if (v?.[0]) errs[k] = v[0];
        setErrors(errs);
      }
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "No se pudo guardar." });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (cat: AdminCategory) => {
    setBusy(true);
    try {
      await api(`/categories/${cat.id}`, { method: "DELETE" });
      setItems((list) => list.filter((c) => c.id !== cat.id));
      setMessage({ kind: "ok", text: `Borraste “${cat.name}”.` });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "No se pudo borrar." });
    } finally {
      setBusy(false);
      setConfirmDelete(null);
    }
  };

  const nextOrder = items.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 1;

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section aria-label="Lista de categorías">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-ink-soft">
            Aparecen en los filtros de la tienda y en los bloques de Perros y Gatos del inicio, en este orden.
          </p>
          <button type="button" className="btn btn-sun" onClick={() => open(blank(nextOrder))}>
            <Plus size={20} weight="bold" aria-hidden="true" /> Nueva categoría
          </button>
        </div>

        {message && (
          <p role={message.kind === "error" ? "alert" : "status"} className={`mt-4 rounded-2xl px-4 py-3 font-medium ${message.kind === "error" ? "bg-danger-soft text-danger" : "bg-teal-100 text-teal-900"}`}>
            {message.text}
          </p>
        )}

        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {items.map((c) => (
            <li key={c.id} className={`rounded-[var(--radius-toy)] bg-white p-4 ${c.active ? "" : "opacity-70"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-lg font-semibold">
                    {c.name}
                    {!c.active && <span className="rounded-full bg-ground-2 px-2 py-0.5 text-xs font-medium text-ink-soft">Oculta</span>}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-soft">
                    {c.species !== "gato" && <Dog size={16} aria-hidden="true" />}
                    {c.species !== "perro" && <Cat size={16} aria-hidden="true" />}
                    {SPECIES.find(([s]) => s === c.species)?.[1]} · {c.productCount} {c.productCount === 1 ? "producto" : "productos"}
                  </p>
                  {c.description && <p className="mt-2 line-clamp-2 text-sm">{c.description}</p>}
                </div>
                <span className="tnum shrink-0 rounded-full bg-teal-50 px-2.5 py-1 text-sm text-teal-900" title="Orden">
                  #{c.sortOrder}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-soft btn-sm"
                  onClick={() =>
                    open({ id: c.id, name: c.name, description: c.description, species: c.species, sortOrder: String(c.sortOrder), active: c.active })
                  }
                >
                  <PencilSimple size={18} aria-hidden="true" /> Editar
                </button>
                <a className="btn btn-soft btn-sm" href={`/admin/productos?categoria=${c.id}&estado=todos`}>
                  Ver productos
                </a>
                {confirmDelete === c.id ? (
                  <span className="flex items-center gap-2">
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(c)} disabled={busy}>
                      Sí, borrar
                    </button>
                    <button type="button" className="btn btn-soft btn-sm" onClick={() => setConfirmDelete(null)}>
                      No
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-soft btn-sm text-danger"
                    onClick={() => setConfirmDelete(c.id)}
                    disabled={c.productCount > 0}
                    title={c.productCount > 0 ? "Tiene productos: muévelos o desactívala" : undefined}
                    aria-label={`Borrar ${c.name}`}
                  >
                    <Trash size={18} aria-hidden="true" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <aside className="xl:sticky xl:top-8 xl:self-start">
        {draft ? (
          <form ref={formRef} onSubmit={save} noValidate className="rounded-[var(--radius-toy)] bg-white p-5">
            <h2 className="text-xl font-semibold">{draft.id ? "Editar categoría" : "Nueva categoría"}</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="label" htmlFor={`${id}-n`}>Nombre</label>
                <input
                  id={`${id}-n`}
                  className="field"
                  value={draft.name}
                  maxLength={60}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  aria-invalid={errors.name ? true : undefined}
                  aria-describedby={errors.name ? `${id}-n-err` : undefined}
                  placeholder="Ej.: Juguetes"
                />
                {errors.name && <p id={`${id}-n-err`} className="error-text">{errors.name}</p>}
              </div>
              <fieldset>
                <legend className="label">¿Para quién?</legend>
                <div className="flex flex-wrap gap-2">
                  {SPECIES.map(([value, label]) => (
                    <label key={value} className="chip cursor-pointer">
                      <input type="radio" className="sr-only" name={`${id}-sp`} checked={draft.species === value} onChange={() => setDraft({ ...draft, species: value })} />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div>
                <label className="label" htmlFor={`${id}-d`}>Descripción corta <span className="font-normal text-ink-soft">(opcional)</span></label>
                <textarea id={`${id}-d`} className="field min-h-20" maxLength={280} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor={`${id}-o`}>Orden</label>
                  <input id={`${id}-o`} className="field tnum" inputMode="numeric" value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: e.target.value.replace(/\D/g, "") })} />
                </div>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 self-end pb-2">
                  <input type="checkbox" className="size-5 accent-teal-700" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
                  Visible
                </label>
              </div>
            </div>

            <div className="mt-5 rounded-2xl bg-ground p-4" aria-label="Vista previa">
              <p className="text-sm font-medium text-ink-soft">Así se ve en los filtros de la tienda</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="chip" aria-pressed="true">{draft.name || "Nombre"}</span>
                <span className="chip">Otra categoría</span>
              </div>
              <p className="mt-4 text-sm font-medium text-ink-soft">Y en el inicio</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {draft.species !== "gato" && <span className="rounded-full bg-teal-100 px-3 py-1.5 text-sm font-medium text-teal-900">{draft.name || "Nombre"} · Perros</span>}
                {draft.species !== "perro" && <span className="rounded-full bg-sun-100 px-3 py-1.5 text-sm font-medium text-teal-900">{draft.name || "Nombre"} · Gatos</span>}
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <button type="submit" className="btn btn-sun flex-1" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button>
              <button type="button" className="btn btn-soft" onClick={() => setDraft(null)}>Cancelar</button>
            </div>
          </form>
        ) : (
          <div className="rounded-[var(--radius-toy)] bg-white p-5 text-ink-soft">
            Elige <span className="font-medium text-ink">Editar</span> en una categoría o crea una nueva. Si una categoría tiene productos no se puede borrar: ocúltala o mueve sus productos.
          </div>
        )}
      </aside>
    </div>
  );
}
