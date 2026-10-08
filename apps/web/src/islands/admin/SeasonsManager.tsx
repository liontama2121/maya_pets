import type { SeasonPreset } from "@maya/api/seasons";
import { seasonInput } from "@maya/api/schemas";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { X } from "@phosphor-icons/react/dist/csr/X";
import { useEffect, useId, useState } from "react";
import { SEASON_ICONS, SeasonBanner, seasonVars } from "../../components/shared/SeasonBanner";
import { api, ApiError } from "../../lib/admin-api";

export interface AdminSeason {
  slug: "halloween" | "navidad" | "ano-nuevo" | "amor-amistad";
  name: string;
  enabled: boolean;
  forceActive: boolean;
  startsAt: string;
  endsAt: string;
  headline: string;
  message: string;
  ctaLabel: string;
  categorySlug: string | null;
  discountNote: string;
  ambient: boolean;
  featuredProductIds: number[];
  live: boolean;
  preset: SeasonPreset;
}

interface Pick {
  id: number;
  name: string;
}

const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "short" });

function statusOf(s: AdminSeason) {
  if (s.live) return { label: "En la tienda ahora", cls: "bg-sun-400 text-teal-900" };
  if (!s.enabled) return { label: "Apagada", cls: "bg-ground-2 text-ink-soft" };
  return { label: `Programada ${fmt(s.startsAt)}`, cls: "bg-teal-100 text-teal-900" };
}

export default function SeasonsManager({
  initial,
  categories,
}: {
  initial: AdminSeason[];
  categories: { slug: string; name: string }[];
}) {
  const [seasons, setSeasons] = useState(initial);
  const [selected, setSelected] = useState<AdminSeason["slug"]>(
    (initial.find((s) => s.live) ?? initial[0])?.slug ?? "halloween",
  );
  const current = seasons.find((s) => s.slug === selected)!;

  return (
    <div className="space-y-6">
      <nav aria-label="Temporadas" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {seasons.map((s) => {
          const Icon = SEASON_ICONS[s.preset.ambientIcon];
          const st = statusOf(s);
          return (
            <button
              key={s.slug}
              type="button"
              onClick={() => setSelected(s.slug)}
              aria-current={s.slug === selected ? "true" : undefined}
              data-squish
              className="on-field flex flex-col items-start gap-3 rounded-[var(--radius-toy)] p-4 text-left text-white outline-offset-4 transition-transform aria-[current=true]:-translate-y-1 aria-[current=true]:ring-4 aria-[current=true]:ring-sun-400"
              style={{ background: s.preset.field, boxShadow: `inset 0 -5px 0 ${s.preset.fieldLip}` }}
            >
              <Icon weight="fill" size={32} style={{ color: s.preset.accent }} aria-hidden="true" />
              <span className="text-lg font-semibold">{s.name}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>
            </button>
          );
        })}
      </nav>

      <SeasonForm
        key={current.slug}
        season={current}
        categories={categories}
        onSaved={(saved) => {
          setSeasons((list) => list.map((s) => (s.slug === saved.slug ? saved : s)));
          // Forzar una temporada cambia el estado de las demás: se recarga la lista del servidor.
          api<AdminSeason[]>("/seasons").then(setSeasons).catch(() => {});
        }}
      />
    </div>
  );
}

function SeasonForm({
  season,
  categories,
  onSaved,
}: {
  season: AdminSeason;
  categories: { slug: string; name: string }[];
  onSaved: (s: AdminSeason) => void;
}) {
  const id = useId();
  const [f, setF] = useState({ ...season });
  const [picks, setPicks] = useState<Pick[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Pick[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof AdminSeason>(k: K, v: AdminSeason[K]) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    if (!season.featuredProductIds.length) return;
    api<Pick[]>(`/products/by-ids?ids=${season.featuredProductIds.join(",")}`).then(setPicks).catch(() => {});
  }, [season.featuredProductIds]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const rows = await api<{ productId: number; productName: string }[]>(`/variants/search?q=${encodeURIComponent(query.trim())}`);
        const seen = new Set<number>();
        setResults(
          rows
            .filter((r) => !seen.has(r.productId) && seen.add(r.productId))
            .map((r) => ({ id: r.productId, name: r.productName })),
        );
      } catch {
        setResults([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      enabled: f.enabled,
      forceActive: f.forceActive,
      startsAt: f.startsAt,
      endsAt: f.endsAt,
      headline: f.headline,
      message: f.message,
      ctaLabel: f.ctaLabel,
      categorySlug: f.categorySlug || null,
      discountNote: f.discountNote,
      ambient: f.ambient,
      featuredProductIds: picks.map((p) => p.id),
    };
    const parsed = seasonInput.safeParse(payload);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[i.path.join(".")] ??= i.message;
      setErrors(errs);
      setMsg({ kind: "error", text: "Revisa los campos marcados." });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const saved = await api<AdminSeason>(`/seasons/${season.slug}`, { method: "PUT", json: parsed.data });
      onSaved(saved);
      setF({ ...saved });
      setMsg({
        kind: "ok",
        text: saved.live
          ? `Listo: la tienda ya se ve de ${saved.name}.`
          : saved.enabled
            ? `Guardado. Se activa sola el ${fmt(saved.startsAt)}.`
            : "Guardado. Está apagada.",
      });
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof ApiError ? err.message : "No se pudo guardar." });
    } finally {
      setBusy(false);
    }
  };

  const Icon = SEASON_ICONS[season.preset.ambientIcon];

  return (
    <form onSubmit={save} noValidate className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="space-y-5 rounded-[var(--radius-toy)] bg-white p-5 sm:p-6">
        <h2 className="text-2xl font-bold [font-variation-settings:'wght'_700]">{season.name}</h2>

        <div className="space-y-3 rounded-2xl bg-ground p-4">
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <input type="checkbox" className="size-5 accent-teal-700" checked={f.enabled} onChange={(e) => set("enabled", e.target.checked)} />
            <span>
              <span className="font-medium">Encender en las fechas</span>
              <span className="block text-sm text-ink-soft">Se activa y se apaga sola.</span>
            </span>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={`${id}-s`}>Desde</label>
              <input id={`${id}-s`} type="date" className="field" value={f.startsAt} onChange={(e) => set("startsAt", e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor={`${id}-e`}>Hasta</label>
              <input
                id={`${id}-e`}
                type="date"
                className="field"
                value={f.endsAt}
                onChange={(e) => set("endsAt", e.target.value)}
                aria-invalid={errors.endsAt ? true : undefined}
                aria-describedby={errors.endsAt ? `${id}-e-err` : undefined}
              />
              {errors.endsAt && <p id={`${id}-e-err`} className="error-text">{errors.endsAt}</p>}
            </div>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <input type="checkbox" className="size-5 accent-teal-700" checked={f.forceActive} onChange={(e) => set("forceActive", e.target.checked)} />
            <span>
              <span className="font-medium">Mostrar ya, sin esperar la fecha</span>
              <span className="block text-sm text-ink-soft">Apaga el “mostrar ya” de las otras temporadas.</span>
            </span>
          </label>
        </div>

        <div>
          <label className="label" htmlFor={`${id}-h`}>Titular</label>
          <input
            id={`${id}-h`}
            className="field"
            maxLength={70}
            value={f.headline}
            onChange={(e) => set("headline", e.target.value)}
            placeholder={season.preset.defaultHeadline}
            aria-invalid={errors.headline ? true : undefined}
          />
          {errors.headline && <p className="error-text">{errors.headline}</p>}
        </div>
        <div>
          <label className="label" htmlFor={`${id}-m`}>Mensaje</label>
          <textarea id={`${id}-m`} className="field min-h-20" maxLength={200} value={f.message} onChange={(e) => set("message", e.target.value)} placeholder={season.preset.defaultMessage} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={`${id}-c`}>Texto del botón</label>
            <input id={`${id}-c`} className="field" maxLength={30} value={f.ctaLabel} onChange={(e) => set("ctaLabel", e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor={`${id}-k`}>El botón lleva a</label>
            <select id={`${id}-k`} className="field" value={f.categorySlug ?? ""} onChange={(e) => set("categorySlug", e.target.value || null)}>
              <option value="">Toda la tienda</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor={`${id}-d`}>Etiqueta de oferta <span className="font-normal text-ink-soft">(opcional)</span></label>
          <input id={`${id}-d`} className="field" maxLength={60} value={f.discountNote} onChange={(e) => set("discountNote", e.target.value)} placeholder="Ej.: 15% en disfraces" />
        </div>

        <fieldset>
          <legend className="label">Productos de la temporada</legend>
          <p className="hint !mt-0 mb-2">Salen debajo del banner en el inicio. Hasta 8.</p>
          {picks.length > 0 && (
            <ul className="mb-3 flex flex-wrap gap-2">
              {picks.map((p) => (
                <li key={p.id} className="flex items-center gap-1 rounded-full bg-teal-100 py-1 pl-3 pr-1 text-sm font-medium text-teal-900">
                  {p.name}
                  <button type="button" className="grid size-8 place-items-center rounded-full hover:bg-teal-200" onClick={() => setPicks((x) => x.filter((y) => y.id !== p.id))} aria-label={`Quitar ${p.name}`}>
                    <X size={14} weight="bold" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {picks.length < 8 && (
            <div className="relative">
              <label htmlFor={`${id}-q`} className="sr-only">Buscar producto para agregar</label>
              <MagnifyingGlass size={18} className="pointer-events-none absolute left-4 top-3.5 text-ink-soft" aria-hidden="true" />
              <input id={`${id}-q`} className="field pl-11" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Busca un producto por nombre" autoComplete="off" />
              {results.length > 0 && (
                <ul className="mt-2 max-h-60 overflow-y-auto rounded-2xl border border-line bg-white p-1">
                  {results.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        className="flex min-h-11 w-full items-center rounded-xl px-3 text-left hover:bg-teal-50 disabled:opacity-40"
                        disabled={picks.some((p) => p.id === r.id)}
                        onClick={() => {
                          setPicks((x) => [...x, r]);
                          setQuery("");
                        }}
                      >
                        {r.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </fieldset>

        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input type="checkbox" className="size-5 accent-teal-700" checked={f.ambient} onChange={(e) => set("ambient", e.target.checked)} />
          <span className="inline-flex items-center gap-2">
            <span className="font-medium">Decoración animada</span>
            <Icon weight="fill" size={18} className="text-teal-700" aria-hidden="true" />
            <span className="text-sm text-ink-soft">caen por la pantalla</span>
          </span>
        </label>

        {msg && (
          <p role={msg.kind === "error" ? "alert" : "status"} className={`rounded-2xl px-4 py-3 font-medium ${msg.kind === "error" ? "bg-danger-soft text-danger" : "bg-teal-100 text-teal-900"}`}>
            {msg.text}
          </p>
        )}
        <button type="submit" className="btn btn-sun w-full text-lg" disabled={busy}>
          {busy ? "Guardando…" : "Guardar temporada"}
        </button>
      </div>

      <div className="xl:sticky xl:top-8 xl:self-start" aria-label="Vista previa">
        <p className="mb-3 font-semibold">Así se ve en el inicio</p>
        <div className="overflow-hidden rounded-[var(--radius-toy)] bg-ground shadow-[0_20px_40px_-24px_rgb(4_42_43/0.5)]" style={seasonVars(season.preset)}>
          <div className="flex h-12 items-center justify-between bg-[var(--field)] px-4 text-sm font-medium text-white shadow-[inset_0_-4px_0_var(--field-lip)]" aria-hidden="true">
            <span className="font-bold">MAYA Pets</span>
            <span className="flex gap-4 text-white/85"><span>Tienda</span><span style={{ color: season.preset.accent }}>Adopta con Maya</span></span>
          </div>
          <div className="p-4">
            <SeasonBanner
              preview
              preset={season.preset}
              data={{
                headline: f.headline,
                message: f.message,
                ctaLabel: f.ctaLabel || "Ver la colección",
                categorySlug: f.categorySlug,
                discountNote: f.discountNote,
              }}
            />
          </div>
        </div>
        <p className="mt-3 text-sm text-ink-soft">
          Durante la temporada todo el sitio toma estos colores: barra superior, botones, precios en oferta y la pelota del inicio.
        </p>
      </div>
    </form>
  );
}
