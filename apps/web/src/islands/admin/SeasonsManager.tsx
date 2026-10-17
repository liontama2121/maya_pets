import type { SeasonPreset } from "@maya/api/seasons";
import { seasonInput } from "@maya/api/schemas";
import { useId, useState } from "react";
import { SEASON_ICONS, SeasonBanner, seasonVars, type SeasonBannerData } from "../../components/shared/SeasonBanner";
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

const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "short" });

function statusOf(s: AdminSeason) {
  if (s.live) return { label: "En la tienda ahora", cls: "bg-sun-400 text-teal-900" };
  if (!s.enabled) return { label: "Apagada", cls: "bg-ground-2 text-ink-soft" };
  return { label: `Programada ${fmt(s.startsAt)}`, cls: "bg-teal-100 text-teal-900" };
}

export default function SeasonsManager({ initial, banner }: { initial: AdminSeason[]; banner: SeasonBannerData }) {
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
        banner={banner}
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
  banner,
  onSaved,
}: {
  season: AdminSeason;
  banner: SeasonBannerData;
  onSaved: (s: AdminSeason) => void;
}) {
  const id = useId();
  const [f, setF] = useState({ ...season });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof AdminSeason>(k: K, v: AdminSeason[K]) => setF((x) => ({ ...x, [k]: v }));

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
      // Estos campos ya no se editan aquí (el banner vive en "Contenido del sitio"): se conservan tal cual.
      featuredProductIds: f.featuredProductIds,
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

        <p className="rounded-2xl bg-sun-100 px-4 py-3 text-teal-900">
          El título, el botón, la imagen y los productos del banner del inicio se editan en{" "}
          <a href="/admin/contenido?bloque=banner" className="font-semibold underline underline-offset-2">Contenido del sitio</a>.
          Aquí eliges cuándo la tienda se viste de {season.name}.
        </p>

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
            <span className="flex gap-4 text-white/85"><span>Tienda</span><span style={{ color: season.preset.accent }}>MAYA Conecta</span></span>
          </div>
          <div className="p-4">
            <SeasonBanner preview preset={season.preset} data={banner} />
          </div>
        </div>
        <p className="mt-3 text-sm text-ink-soft">
          Durante la temporada todo el sitio toma estos colores: barra superior, botones, precios en oferta y la pelota del inicio.
        </p>
      </div>
    </form>
  );
}
