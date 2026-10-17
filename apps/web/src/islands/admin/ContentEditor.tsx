import type { SiteContent } from "@maya/api";
import { ArrowCounterClockwise } from "@phosphor-icons/react/dist/csr/ArrowCounterClockwise";
import { ArrowSquareOut } from "@phosphor-icons/react/dist/csr/ArrowSquareOut";
import { ClockCounterClockwise } from "@phosphor-icons/react/dist/csr/ClockCounterClockwise";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/csr/MagnifyingGlass";
import { X } from "@phosphor-icons/react/dist/csr/X";
import { useEffect, useId, useState, type ReactNode } from "react";
import { api, ApiError } from "../../lib/admin-api";
import { ImageField } from "./ImageField";

type Key = keyof SiteContent;

export interface Block<K extends Key = Key> {
  key: K;
  draft: SiteContent[K];
  published: SiteContent[K];
  pending: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
}

interface Version {
  id: number;
  note: string;
  createdAt: string;
  createdBy: string;
}

const AFICHE = {
  perro: { src: "/brand/afiche/perro.svg", alt: "Perrito del afiche de MAYA Pets", label: "Perrito del afiche" },
  gato: { src: "/brand/afiche/gato.svg", alt: "Gatico del afiche de MAYA Pets", label: "Gatico del afiche" },
};

const SECTIONS: { title: string; items: { key: Key; name: string; preview: string }[] }[] = [
  {
    title: "Inicio",
    items: [
      { key: "hero", name: "Hola, soy Maya (portada)", preview: "/?borrador=1" },
      { key: "banner", name: "Banner de temporada", preview: "/?borrador=1#temporada" },
      { key: "especies", name: "¿Quién te espera en casa?", preview: "/?borrador=1#especies" },
      { key: "destacados", name: "Lo que más se llevan", preview: "/?borrador=1#destacados" },
    ],
  },
  {
    title: "Otras páginas",
    items: [
      { key: "footer", name: "Textos del footer", preview: "/?borrador=1#pie" },
      { key: "nosotros", name: "Página de Nosotros", preview: "/nosotros?borrador=1" },
    ],
  },
];
const ALL = SECTIONS.flatMap((s) => s.items);

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
    : "";

export default function ContentEditor({
  initial,
  initialKey,
  categories,
}: {
  initial: Block[];
  initialKey: string | null;
  categories: { slug: string; name: string }[];
}) {
  const [blocks, setBlocks] = useState(initial);
  const [selected, setSelected] = useState<Key>(ALL.some((i) => i.key === initialKey) ? (initialKey as Key) : "hero");
  const block = blocks.find((b) => b.key === selected)!;
  const meta = ALL.find((i) => i.key === selected)!;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <nav aria-label="Bloques de contenido" className="space-y-5 lg:sticky lg:top-8 lg:self-start">
        {SECTIONS.map((s) => (
          <div key={s.title}>
            <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-ink-soft">{s.title}</h2>
            <ul className="mt-2 space-y-1.5">
              {s.items.map((it) => {
                const b = blocks.find((x) => x.key === it.key)!;
                return (
                  <li key={it.key}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(it.key);
                        history.replaceState(null, "", `?bloque=${it.key}`);
                      }}
                      aria-current={selected === it.key ? "true" : undefined}
                      className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl bg-white px-4 py-2 text-left font-medium transition-colors hover:bg-teal-50 aria-[current=true]:bg-teal-700 aria-[current=true]:text-white aria-[current=true]:shadow-[inset_0_-4px_0_var(--color-teal-900)]"
                    >
                      <span>{it.name}</span>
                      {b.pending && (
                        <span className="shrink-0 rounded-full bg-sun-400 px-2 py-0.5 text-xs font-semibold text-teal-900">
                          Sin publicar
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <BlockEditor
        key={selected}
        block={block}
        name={meta.name}
        previewUrl={meta.preview}
        categories={categories}
        onChange={(b) => setBlocks((list) => list.map((x) => (x.key === b.key ? b : x)))}
      />
    </div>
  );
}

function BlockEditor({
  block,
  name,
  previewUrl,
  categories,
  onChange,
}: {
  block: Block;
  name: string;
  previewUrl: string;
  categories: { slug: string; name: string }[];
  onChange: (b: Block) => void;
}) {
  const [data, setData] = useState<Record<string, unknown>>(structuredClone(block.draft) as Record<string, unknown>);
  const [saved, setSaved] = useState(JSON.stringify(block.draft));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState<null | "save" | "preview" | "publish" | "discard">(null);
  const [versions, setVersions] = useState<Version[] | null>(null);

  const dirty = JSON.stringify(data) !== saved;

  // Avisar antes de salir con cambios sin guardar.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener("beforeunload", warn);
    return () => removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = (path: string, value: unknown) =>
    setData((d) => {
      const next = structuredClone(d);
      const parts = path.split(".");
      let o = next as Record<string, unknown>;
      for (const p of parts.slice(0, -1)) o = o[p] as Record<string, unknown>;
      o[parts.at(-1)!] = value;
      return next;
    });
  const get = <T,>(path: string) => path.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], data) as T;

  const apply = (b: Block, text: string) => {
    onChange(b);
    setData(structuredClone(b.draft) as Record<string, unknown>);
    setSaved(JSON.stringify(b.draft));
    setErrors({});
    setMsg({ kind: "ok", text });
  };

  /** Guarda el borrador si cambió. Devuelve false si hay errores. */
  const save = async () => {
    if (!dirty) return true;
    try {
      const b = await api<Block>(`/content/${block.key}`, { method: "PUT", json: data });
      apply(b, "Borrador guardado. El público todavía no lo ve.");
      return true;
    } catch (err) {
      if (err instanceof ApiError) {
        const fields: Record<string, string> = {};
        for (const [k, v] of Object.entries(err.fields)) fields[k] = Array.isArray(v) ? v[0] ?? "" : String(v);
        setErrors(fields);
        setMsg({ kind: "error", text: err.message });
      } else setMsg({ kind: "error", text: "No se pudo guardar." });
      return false;
    }
  };

  const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    setBusy(kind);
    setMsg(null);
    try {
      await fn();
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof ApiError ? err.message : "Algo falló. Intenta de nuevo." });
    } finally {
      setBusy(null);
    }
  };

  const loadVersions = () => api<Version[]>(`/content/${block.key}/versions`).then(setVersions).catch(() => setVersions([]));

  const err = (path: string) => errors[path];
  const fieldProps = { get, set, err };

  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius-toy)] bg-white p-5 sm:p-6">
        <div>
          <h2 className="text-2xl font-bold [font-variation-settings:'wght'_700]">{name}</h2>
          <p className="mt-1 text-sm text-ink-soft">
            {block.publishedAt ? `Publicado el ${when(block.publishedAt)} por ${block.publishedBy}` : "Con el contenido inicial del sitio."}
            {block.pending && " · Hay cambios guardados sin publicar."}
          </p>
        </div>
        <a
          href={previewUrl}
          target="_blank"
          rel="noopener"
          className="btn btn-soft btn-sm"
          onClick={async (e) => {
            if (!dirty) return;
            // Guardar primero para que la vista previa muestre lo último.
            e.preventDefault();
            const w = window.open("about:blank", "_blank");
            await run("preview", async () => {
              if (await save()) {
                if (w) w.location.href = previewUrl;
              } else w?.close();
            });
          }}
        >
          <ArrowSquareOut size={18} aria-hidden="true" />
          {busy === "preview" ? "Guardando…" : "Vista previa"}
        </a>
      </div>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          run("save", async () => void (await save()));
        }}
        className="space-y-5 rounded-[var(--radius-toy)] bg-white p-5 sm:p-6"
      >
        {block.key === "hero" && <HeroForm {...fieldProps} />}
        {block.key === "banner" && <BannerForm {...fieldProps} categories={categories} />}
        {block.key === "especies" && <EspeciesForm {...fieldProps} />}
        {block.key === "destacados" && <DestacadosForm {...fieldProps} />}
        {block.key === "footer" && <FooterForm {...fieldProps} />}
        {block.key === "nosotros" && <NosotrosForm {...fieldProps} />}

        {msg && (
          <p
            role={msg.kind === "error" ? "alert" : "status"}
            className={`rounded-2xl px-4 py-3 font-medium ${msg.kind === "error" ? "bg-danger-soft text-danger" : "bg-teal-100 text-teal-900"}`}
          >
            {msg.text}
          </p>
        )}

        <div className="flex flex-wrap gap-3 border-t border-line pt-5">
          <button type="submit" className="btn btn-soft" disabled={!dirty || busy !== null}>
            {busy === "save" ? "Guardando…" : dirty ? "Guardar borrador" : "Borrador guardado"}
          </button>
          <button
            type="button"
            className="btn btn-sun"
            disabled={(!dirty && !block.pending) || busy !== null}
            onClick={() =>
              run("publish", async () => {
                if (!(await save())) return;
                const b = await api<Block>(`/content/${block.key}/publish`, { method: "POST" });
                apply(b, "Publicado. El sitio ya muestra los cambios.");
                if (versions) loadVersions();
              })
            }
          >
            {busy === "publish" ? "Publicando…" : "Publicar"}
          </button>
          {(block.pending || dirty) && (
            <button
              type="button"
              className="btn btn-soft ml-auto"
              disabled={busy !== null}
              onClick={() =>
                run("discard", async () => {
                  const b = await api<Block>(`/content/${block.key}/discard`, { method: "POST" });
                  apply(b, "Listo: volviste a lo que está publicado.");
                })
              }
            >
              <ArrowCounterClockwise size={18} aria-hidden="true" />
              Descartar cambios
            </button>
          )}
        </div>
      </form>

      <details
        className="rounded-[var(--radius-toy)] bg-white p-5 sm:p-6"
        onToggle={(e) => {
          if ((e.currentTarget as HTMLDetailsElement).open && !versions) loadVersions();
        }}
      >
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold">
          <ClockCounterClockwise size={20} aria-hidden="true" /> Historial de versiones
        </summary>
        {versions === null ? (
          <p className="mt-3 text-ink-soft">Cargando…</p>
        ) : versions.length === 0 ? (
          <p className="mt-3 text-ink-soft">Todavía no se ha publicado ninguna versión de este bloque.</p>
        ) : (
          <ol className="mt-3 divide-y divide-line">
            {versions.map((v, i) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span>
                  <span className="font-medium">{when(v.createdAt)}</span>
                  <span className="text-ink-soft"> · {v.createdBy} · {v.note}</span>
                  {i === 0 && <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-900">En el sitio</span>}
                </span>
                {i > 0 && (
                  <button
                    type="button"
                    className="btn btn-soft btn-sm"
                    disabled={busy !== null}
                    onClick={() =>
                      run("publish", async () => {
                        const b = await api<Block>(`/content/${block.key}/versions/${v.id}/restore`, { method: "POST" });
                        apply(b, "Versión restaurada y publicada.");
                        loadVersions();
                      })
                    }
                  >
                    Restaurar
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
      </details>
    </div>
  );
}

/* --------------------------------- Campos --------------------------------- */

interface FieldProps {
  get: <T>(path: string) => T;
  set: (path: string, v: unknown) => void;
  err: (path: string) => string | undefined;
}

function Text({
  path,
  label,
  max,
  multiline = false,
  rows = 3,
  hint,
  get,
  set,
  err,
}: FieldProps & { path: string; label: string; max: number; multiline?: boolean; rows?: number; hint?: ReactNode }) {
  const id = useId();
  const value = get<string>(path) ?? "";
  const e = err(path);
  const common = {
    id,
    className: `field ${multiline ? "py-3" : ""}`,
    maxLength: max,
    value,
    "aria-invalid": e ? true : undefined,
    "aria-describedby": `${id}-n${e ? ` ${id}-e` : ""}`,
  } as const;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label className="label" htmlFor={id}>{label}</label>
        <span id={`${id}-n`} className="tnum text-xs text-ink-soft">{value.length}/{max}</span>
      </div>
      {multiline ? (
        <textarea {...common} rows={rows} onChange={(ev) => set(path, ev.target.value)} />
      ) : (
        <input {...common} onChange={(ev) => set(path, ev.target.value)} />
      )}
      {hint && <p className="hint">{hint}</p>}
      {e && <p id={`${id}-e`} className="error-text">{e}</p>}
    </div>
  );
}

function Toggle({ path, label, hint, get, set }: FieldProps & { path: string; label: string; hint?: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3">
      <input type="checkbox" className="size-5 accent-teal-700" checked={get<boolean>(path)} onChange={(e) => set(path, e.target.checked)} />
      <span>
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-sm text-ink-soft">{hint}</span>}
      </span>
    </label>
  );
}

function Img({ path, label, presets, hint, decorative, get, set, err }: FieldProps & {
  path: string;
  label: string;
  presets?: (typeof AFICHE)[keyof typeof AFICHE][];
  hint?: string;
  decorative?: boolean;
}) {
  return (
    <ImageField
      label={label}
      value={get(path)}
      onChange={(v) => set(path, v)}
      presets={presets}
      hint={hint}
      decorative={decorative}
      error={err(`${path}.src`) ?? err(`${path}.alt`)}
    />
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}

/* --------------------------------- Bloques -------------------------------- */

function HeroForm(p: FieldProps) {
  return (
    <>
      <Text {...p} path="title" label="Título" max={60} />
      <Text {...p} path="text" label="Texto (Maya habla en primera persona)" max={420} multiline rows={5} />
      <Row>
        <Text {...p} path="ctaLabel" label="Texto del botón" max={30} />
        <Text {...p} path="ctaHref" label="El botón lleva a" max={300} hint="Ej.: /tienda" />
      </Row>
      <Row>
        <Text {...p} path="storyLabel" label="Texto del enlace a la historia" max={40} />
        <Text {...p} path="storyHref" label="El enlace lleva a" max={300} hint="Ej.: /nosotros" />
      </Row>
      <Row>
        <Img {...p} path="imageLeft" label="Imagen izquierda" presets={[AFICHE.perro, AFICHE.gato]} />
        <Img {...p} path="imageRight" label="Imagen derecha" presets={[AFICHE.gato, AFICHE.perro]} />
      </Row>
    </>
  );
}

function BannerForm(p: FieldProps & { categories: { slug: string; name: string }[] }) {
  const id = useId();
  const href = p.get<string>("ctaHref");
  return (
    <>
      <div className="space-y-3 rounded-2xl bg-ground p-4">
        <Toggle {...p} path="enabled" label="Mostrar el banner en el inicio" hint="Solo se ve entre las fechas de abajo." />
        <Row>
          <DateField {...p} path="startsAt" label="Desde" />
          <DateField {...p} path="endsAt" label="Hasta" />
        </Row>
      </div>
      <Text {...p} path="title" label="Título" max={70} />
      <Text {...p} path="subtitle" label="Subtítulo" max={200} multiline rows={2} />
      <Row>
        <Text {...p} path="ctaLabel" label="Texto del botón" max={30} hint="Ej.: Ver productos" />
        <div>
          <label className="label" htmlFor={`${id}-to`}>El botón lleva a</label>
          <select
            id={`${id}-to`}
            className="field"
            value={href}
            onChange={(e) => p.set("ctaHref", e.target.value)}
          >
            <option value="/tienda">Toda la tienda</option>
            {p.categories.map((c) => (
              <option key={c.slug} value={`/tienda?categoria=${c.slug}`}>Categoría: {c.name}</option>
            ))}
            {href !== "/tienda" && !p.categories.some((c) => href === `/tienda?categoria=${c.slug}`) && (
              <option value={href}>{href}</option>
            )}
          </select>
          {p.err("ctaHref") && <p className="error-text">{p.err("ctaHref")}</p>}
        </div>
      </Row>
      <Img {...p} path="image" label="Imagen del banner (opcional)" hint="Sale al lado del texto. Si no subes una, el banner usa la decoración de la temporada." />
      <fieldset className="space-y-3 rounded-2xl bg-ground p-4">
        <legend className="sr-only">Productos del banner</legend>
        <p className="font-semibold">Productos debajo del banner</p>
        <Toggle {...p} path="showPrices" label="Mostrar precios" hint="Apágalo para mostrar los productos sin precio." />
        <ProductPicker ids={p.get<number[]>("productIds")} onChange={(ids) => p.set("productIds", ids)} />
      </fieldset>
    </>
  );
}

function DateField({ path, label, get, set, err }: FieldProps & { path: string; label: string }) {
  const id = useId();
  const e = err(path);
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <input
        id={id}
        type="date"
        className="field"
        value={get<string>(path)}
        onChange={(ev) => set(path, ev.target.value)}
        aria-invalid={e ? true : undefined}
      />
      {e && <p className="error-text">{e}</p>}
    </div>
  );
}

function EspeciesForm(p: FieldProps) {
  return (
    <>
      <Text {...p} path="title" label="Título de la sección" max={60} />
      <div className="grid gap-5 xl:grid-cols-2">
        {(["dog", "cat"] as const).map((k) => (
          <fieldset key={k} className="space-y-4 rounded-2xl border border-line p-4">
            <legend className="px-1 font-semibold">{k === "dog" ? "Tarjeta de perros" : "Tarjeta de gatos"}</legend>
            <Text {...p} path={`${k}.title`} label="Título" max={30} />
            <Text {...p} path={`${k}.text`} label="Texto" max={140} multiline rows={2} />
            <Text {...p} path={`${k}.linkLabel`} label="Texto del enlace" max={40} />
            <Img
              {...p}
              path={`${k}.image`}
              label="Ilustración"
              decorative
              presets={k === "dog" ? [AFICHE.perro] : [AFICHE.gato]}
            />
          </fieldset>
        ))}
      </div>
    </>
  );
}

function DestacadosForm(p: FieldProps) {
  return (
    <>
      <p className="rounded-2xl bg-sun-100 px-4 py-3 font-medium text-teal-900">
        Se llena solo con lo más vendido. Fija productos si quieres mostrar otros.
      </p>
      <Text {...p} path="title" label="Título de la sección" max={60} />
      <fieldset className="space-y-2">
        <legend className="label">Productos fijados</legend>
        <p className="hint !mt-0">
          Salen primero, en este orden. El resto se completa con lo más vendido de los últimos 30 días (online y en
          tienda) y, si faltan, con los productos destacados.
        </p>
        <ProductPicker ids={p.get<number[]>("pinnedIds")} onChange={(ids) => p.set("pinnedIds", ids)} />
      </fieldset>
    </>
  );
}

function FooterForm(p: FieldProps) {
  return (
    <>
      <Text {...p} path="tagline" label="Texto bajo el logo" max={200} multiline rows={2} />
      <Text {...p} path="contactNote" label="Texto de contacto" max={200} multiline rows={2} />
      <p className="hint">El número de WhatsApp y “Hecho con amor por JuanCode” no se editan aquí.</p>
    </>
  );
}

function NosotrosForm(p: FieldProps) {
  return (
    <>
      <Text {...p} path="title" label="Título" max={80} />
      <Text
        {...p}
        path="body"
        label="Historia"
        max={4000}
        multiline
        rows={12}
        hint={<>Deja una línea en blanco entre párrafos. Para resaltar, escribe entre dobles asteriscos: **Mi mascota, mi familia**.</>}
      />
      <Text {...p} path="visitTitle" label="Título de “Visítanos”" max={60} />
      <Text {...p} path="visitText" label="Texto de “Visítanos”" max={240} multiline rows={2} />
    </>
  );
}

/* ---------------------------- Selector de productos ---------------------------- */

interface Pick {
  id: number;
  name: string;
}

function ProductPicker({ ids, onChange }: { ids: number[]; onChange: (ids: number[]) => void }) {
  const id = useId();
  const [names, setNames] = useState<Map<number, string>>(new Map());
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Pick[]>([]);

  useEffect(() => {
    const missing = ids.filter((i) => !names.has(i));
    if (!missing.length) return;
    api<Pick[]>(`/products/by-ids?ids=${missing.join(",")}`)
      .then((rows) => {
        const found = new Map(rows.map((r) => [r.id, r.name] as const));
        // Los que no aparecen (archivados) quedan con un nombre genérico para no volver a pedirlos.
        setNames((m) => new Map([...m, ...missing.map((i) => [i, found.get(i) ?? "Producto archivado"] as const)]));
      })
      .catch(() => {});
  }, [ids, names]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const rows = await api<{ productId: number; productName: string }[]>(`/variants/search?q=${encodeURIComponent(query.trim())}`);
        const seen = new Set<number>();
        setResults(rows.filter((r) => !seen.has(r.productId) && seen.add(r.productId)).map((r) => ({ id: r.productId, name: r.productName })));
      } catch {
        setResults([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="space-y-3">
      {ids.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <ol className="flex flex-wrap gap-2">
            {ids.map((pid) => (
              <li key={pid} className="flex items-center gap-1 rounded-full bg-teal-100 py-1 pl-3 pr-1 text-sm font-medium text-teal-900">
                {names.get(pid) ?? `Producto ${pid}`}
                <button
                  type="button"
                  className="grid size-8 place-items-center rounded-full hover:bg-teal-200"
                  onClick={() => onChange(ids.filter((x) => x !== pid))}
                  aria-label={`Quitar ${names.get(pid) ?? "producto"}`}
                >
                  <X size={14} weight="bold" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
          <button type="button" className="text-sm font-semibold text-danger underline-offset-2 hover:underline" onClick={() => onChange([])}>
            Quitar todos
          </button>
        </div>
      ) : (
        <p className="text-sm text-ink-soft">Ningún producto elegido.</p>
      )}
      {ids.length < 8 && (
        <div className="relative">
          <label htmlFor={`${id}-q`} className="sr-only">Buscar producto para agregar</label>
          <MagnifyingGlass size={18} className="pointer-events-none absolute left-4 top-3.5 text-ink-soft" aria-hidden="true" />
          <input
            id={`${id}-q`}
            className="field pl-11"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Busca un producto por nombre (hasta 8)"
            autoComplete="off"
          />
          {results.length > 0 && (
            <ul className="mt-2 max-h-60 overflow-y-auto rounded-2xl border border-line bg-white p-1">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center rounded-xl px-3 text-left hover:bg-teal-50 disabled:opacity-40"
                    disabled={ids.includes(r.id)}
                    onClick={() => {
                      setNames((m) => new Map(m).set(r.id, r.name));
                      onChange([...ids, r.id]);
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
    </div>
  );
}
