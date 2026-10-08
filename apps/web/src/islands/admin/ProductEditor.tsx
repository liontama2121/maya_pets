import type { ProductCardData } from "@maya/api";
import { productInput, type ProductInput } from "@maya/api/schemas";
import { ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { Camera } from "@phosphor-icons/react/dist/csr/Camera";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { Star } from "@phosphor-icons/react/dist/csr/Star";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ProductCard } from "../../components/shared/ProductCard";
import { api, ApiError } from "../../lib/admin-api";
import { formatCOP } from "../../lib/format";
import { uploadImage } from "../../lib/image";

interface Category {
  id: number;
  name: string;
}

interface VariantRow {
  key: string;
  id?: number;
  name: string;
  price: string;
  compareAtPrice: string;
  stock: string;
  stockBase?: number;
  minStock: string;
  sku: string;
  barcode: string;
}

interface ImageRow {
  key: string;
  url: string;
  alt: string;
  width?: number | null;
  height?: number | null;
}

export interface EditorProduct {
  id: number;
  slug: string;
  name: string;
  description: string;
  categoryId: number;
  species: "perro" | "gato" | "ambos";
  brand: string;
  variantLabel: string;
  featured: boolean;
  active: boolean;
  variants: {
    id: number;
    name: string;
    price: number;
    compareAtPrice: number | null;
    stock: number;
    minStock: number;
    sku: string;
    barcode: string | null;
  }[];
  images: { key: string; url: string; alt: string; width: number | null; height: number | null }[];
}

const VARIANT_LABELS = ["Peso", "Talla", "Sabor", "Color", "Tamaño", "Presentación"];

let seq = 0;
const newKey = () => `n${++seq}`;
const emptyVariant = (): VariantRow => ({
  key: newKey(),
  name: "",
  price: "",
  compareAtPrice: "",
  stock: "0",
  minStock: "3",
  sku: "",
  barcode: "",
});

type Errors = Record<string, string>;

/** Convierte "45.900" o "$ 45 900" en 45900. */
const toInt = (v: string) => {
  const n = Number(String(v).replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

export default function ProductEditor({
  categories,
  product,
}: {
  categories: Category[];
  product?: EditorProduct;
}) {
  const formId = useId();
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [categoryId, setCategoryId] = useState<string>(product ? String(product.categoryId) : "");
  const [species, setSpecies] = useState<EditorProduct["species"]>(product?.species ?? "perro");
  const [brand, setBrand] = useState(product?.brand ?? "");
  const [variantLabel, setVariantLabel] = useState(product?.variantLabel ?? "");
  const [featured, setFeatured] = useState(product?.featured ?? false);
  const [active, setActive] = useState(product?.active ?? true);
  const [variants, setVariants] = useState<VariantRow[]>(
    product?.variants.length
      ? product.variants.map((v) => ({
          key: `v${v.id}`,
          id: v.id,
          name: v.name,
          price: String(v.price),
          compareAtPrice: v.compareAtPrice ? String(v.compareAtPrice) : "",
          stock: String(v.stock),
          stockBase: v.stock,
          minStock: String(v.minStock),
          sku: v.sku,
          barcode: v.barcode ?? "",
        }))
      : [{ ...emptyVariant(), name: "Única" }],
  );
  const [images, setImages] = useState<ImageRow[]>(product?.images ?? []);
  const [uploading, setUploading] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showCodes, setShowCodes] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
  };

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const multi = variants.length > 1;

  /* ------------------------- Vista previa en vivo ------------------------ */
  const preview: ProductCardData = useMemo(() => {
    const priced = variants
      .map((v) => ({ price: toInt(v.price), before: toInt(v.compareAtPrice), stock: toInt(v.stock), min: toInt(v.minStock) }))
      .filter((v) => v.price > 0);
    const cheapest = [...priced].sort((a, b) => a.price - b.price)[0];
    const stock = priced.reduce((n, v) => n + (Number.isFinite(v.stock) ? v.stock : 0), 0);
    return {
      id: product?.id ?? 0,
      slug: product?.slug ?? "vista-previa",
      name: name || "Nombre del producto",
      brand,
      species,
      categoryName: categories.find((c) => String(c.id) === categoryId)?.name ?? "",
      categorySlug: "",
      priceFrom: cheapest?.price ?? 0,
      compareAt: cheapest && cheapest.before > cheapest.price ? cheapest.before : null,
      variantCount: priced.length,
      stock,
      lowStock: priced.some((v) => v.stock > 0 && v.stock <= v.min),
      featured,
      image: images[0] ? { url: images[0].url, alt: images[0].alt || name } : null,
    };
  }, [variants, name, brand, species, categoryId, featured, images, categories, product]);

  /* ------------------------------ Variantes ------------------------------ */
  const setVariant = (key: string, patch: Partial<VariantRow>) => {
    setVariants((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const addVariant = () => {
    setVariants((rows) => [...rows, emptyVariant()]);
    if (!variantLabel) setVariantLabel("Presentación");
    setDirty(true);
  };
  const removeVariant = (key: string) => {
    setVariants((rows) => (rows.length > 1 ? rows.filter((r) => r.key !== key) : rows));
    setDirty(true);
  };

  /* -------------------------------- Fotos -------------------------------- */
  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, 8 - images.length);
    if (!list.length) {
      setStatus({ kind: "error", text: "Ya tienes 8 fotos. Borra una para subir otra." });
      return;
    }
    setUploading((n) => n + list.length);
    for (const file of list) {
      try {
        const up = await uploadImage(file, "productos");
        setImages((imgs) => [...imgs, { key: up.key, url: up.url, alt: "", width: up.width, height: up.height }]);
        setDirty(true);
      } catch (e) {
        setStatus({ kind: "error", text: e instanceof Error ? e.message : "No se pudo subir la foto." });
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  };
  const moveImage = (i: number, dir: -1 | 1) => {
    setImages((imgs) => {
      const next = [...imgs];
      const j = i + dir;
      if (j < 0 || j >= next.length) return imgs;
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
    setDirty(true);
  };

  /* -------------------------------- Guardar ------------------------------- */
  const buildPayload = (): ProductInput | null => {
    const raw = {
      name,
      description,
      categoryId: categoryId ? Number(categoryId) : 0,
      species,
      brand,
      variantLabel: multi ? variantLabel || "Presentación" : "",
      featured,
      active,
      variants: variants.map((v) => ({
        id: v.id,
        name: multi ? v.name : v.name || "Única",
        sku: v.sku || undefined,
        barcode: v.barcode || null,
        price: toInt(v.price),
        compareAtPrice: v.compareAtPrice ? toInt(v.compareAtPrice) : null,
        stock: toInt(v.stock),
        stockBase: v.stockBase,
        minStock: toInt(v.minStock),
      })),
      images: images.map(({ key, alt, width, height }) => ({ key, alt, width, height })),
    };
    const parsed = productInput.safeParse(raw);
    if (parsed.success) {
      setErrors({});
      return parsed.data;
    }
    const errs: Errors = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!errs[path]) errs[path] = issue.message;
    }
    setErrors(errs);
    return null;
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    const payload = buildPayload();
    if (!payload) {
      setStatus({ kind: "error", text: "Revisa los campos marcados en rojo." });
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }
    setSaving(true);
    try {
      const saved = await api<EditorProduct>(product ? `/products/${product.id}` : "/products", {
        method: product ? "PUT" : "POST",
        json: payload,
      });
      setDirty(false);
      if (!product) {
        window.location.href = `/admin/productos/${saved.id}?creado=1`;
        return;
      }
      // Actualiza stockBase con el valor real tras guardar (otras ventas pudieron moverlo).
      setVariants(
        saved.variants.map((v) => ({
          key: `v${v.id}`,
          id: v.id,
          name: v.name,
          price: String(v.price),
          compareAtPrice: v.compareAtPrice ? String(v.compareAtPrice) : "",
          stock: String(v.stock),
          stockBase: v.stock,
          minStock: String(v.minStock),
          sku: v.sku,
          barcode: v.barcode ?? "",
        })),
      );
      setStatus({ kind: "ok", text: "Guardado. Ya se ve así en la tienda." });
    } catch (err) {
      if (err instanceof ApiError) {
        const fieldErrs: Errors = {};
        for (const [k, v] of Object.entries(err.fields)) if (v?.[0]) fieldErrs[k] = v[0];
        setErrors(fieldErrs);
        setStatus({ kind: "error", text: err.message });
      } else {
        setStatus({ kind: "error", text: "No se pudo guardar. Intenta de nuevo." });
      }
    } finally {
      setSaving(false);
    }
  };

  const err = (path: string) =>
    errors[path] ? (
      <p className="error-text" id={`${formId}-${path}-err`}>
        {errors[path]}
      </p>
    ) : null;
  const invalid = (path: string) => (errors[path] ? { "aria-invalid": true as const, "aria-describedby": `${formId}-${path}-err` } : {});

  return (
    <form onSubmit={save} noValidate className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-6">
        {/* Lo básico */}
        <section className="rounded-[var(--radius-toy)] bg-white p-5 sm:p-6" aria-labelledby={`${formId}-basico`}>
          <h2 id={`${formId}-basico`} className="text-xl font-semibold">
            Lo básico
          </h2>
          <div className="mt-5 grid gap-5">
            <div>
              <label className="label" htmlFor={`${formId}-name`}>
                Nombre
              </label>
              <input
                id={`${formId}-name`}
                className="field"
                value={name}
                onChange={(e) => touch(setName)(e.target.value)}
                placeholder="Ej.: Collar acolchado ajustable"
                maxLength={90}
                {...invalid("name")}
              />
              {err("name")}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor={`${formId}-cat`}>
                  Categoría
                </label>
                <select
                  id={`${formId}-cat`}
                  className="field"
                  value={categoryId}
                  onChange={(e) => touch(setCategoryId)(e.target.value)}
                  {...invalid("categoryId")}
                >
                  <option value="">Elige una…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {err("categoryId") ?? (
                  <p className="hint">
                    ¿No está? <a className="font-medium text-teal-700 underline" href="/admin/categorias">Crea una categoría</a>
                  </p>
                )}
              </div>
              <div>
                <label className="label" htmlFor={`${formId}-brand`}>
                  Marca <span className="font-normal text-ink-soft">(opcional)</span>
                </label>
                <input
                  id={`${formId}-brand`}
                  className="field"
                  value={brand}
                  onChange={(e) => touch(setBrand)(e.target.value)}
                  maxLength={60}
                />
              </div>
            </div>

            <fieldset>
              <legend className="label">¿Para quién es?</legend>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["perro", "Perros"],
                    ["gato", "Gatos"],
                    ["ambos", "Perros y gatos"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="chip cursor-pointer">
                    <input
                      type="radio"
                      name={`${formId}-species`}
                      className="sr-only"
                      checked={species === value}
                      onChange={() => touch(setSpecies)(value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <label className="label" htmlFor={`${formId}-desc`}>
                Descripción
              </label>
              <textarea
                id={`${formId}-desc`}
                className="field min-h-32"
                value={description}
                onChange={(e) => touch(setDescription)(e.target.value)}
                placeholder="Para qué sirve, de qué está hecho, para qué tamaño de mascota…"
                maxLength={4000}
              />
              <p className="hint">Escribe como se lo explicarías a un cliente en la tienda.</p>
            </div>
          </div>
        </section>

        {/* Fotos */}
        <section className="rounded-[var(--radius-toy)] bg-white p-5 sm:p-6" aria-labelledby={`${formId}-fotos`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id={`${formId}-fotos`} className="text-xl font-semibold">
              Fotos
            </h2>
            <p className="text-sm text-ink-soft">La primera es la portada. Hasta 8.</p>
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {images.map((img, i) => (
              <li key={img.key} className="flex flex-col gap-2">
                <div className="relative aspect-square overflow-hidden rounded-2xl bg-teal-50">
                  <img src={img.url} alt="" className="h-full w-full object-cover" />
                  {i === 0 && (
                    <span className="absolute left-2 top-2 rounded-full bg-teal-900 px-2 py-0.5 text-xs font-semibold text-white">
                      Portada
                    </span>
                  )}
                </div>
                <label className="sr-only" htmlFor={`${formId}-alt-${i}`}>
                  Descripción de la foto {i + 1}
                </label>
                <input
                  id={`${formId}-alt-${i}`}
                  className="field !min-h-10 !py-1.5 text-sm"
                  placeholder="Qué se ve (opcional)"
                  value={img.alt}
                  onChange={(e) => {
                    const alt = e.target.value;
                    setImages((imgs) => imgs.map((x, j) => (j === i ? { ...x, alt } : x)));
                    setDirty(true);
                  }}
                />
                <div className="flex justify-between">
                  <div className="flex">
                    <button type="button" className="grid size-10 place-items-center rounded-full hover:bg-teal-50 disabled:opacity-30" onClick={() => moveImage(i, -1)} disabled={i === 0} aria-label={`Mover foto ${i + 1} antes`}>
                      <ArrowLeft size={18} aria-hidden="true" />
                    </button>
                    <button type="button" className="grid size-10 place-items-center rounded-full hover:bg-teal-50 disabled:opacity-30" onClick={() => moveImage(i, 1)} disabled={i === images.length - 1} aria-label={`Mover foto ${i + 1} después`}>
                      <ArrowRight size={18} aria-hidden="true" />
                    </button>
                  </div>
                  <button
                    type="button"
                    className="grid size-10 place-items-center rounded-full text-danger hover:bg-danger-soft"
                    onClick={() => {
                      setImages((imgs) => imgs.filter((_, j) => j !== i));
                      setDirty(true);
                    }}
                    aria-label={`Quitar foto ${i + 1}`}
                  >
                    <Trash size={18} aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
            {Array.from({ length: uploading }, (_, i) => (
              <li key={`up${i}`} className="skeleton aspect-square" aria-label="Subiendo foto" />
            ))}
            {images.length + uploading < 8 && (
              <li>
                <label
                  className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong text-teal-700 transition-colors hover:bg-teal-50 focus-within:outline focus-within:outline-3 focus-within:outline-teal-700"
                >
                  <Camera size={32} aria-hidden="true" />
                  <span className="text-sm font-medium">Agregar fotos</span>
                  <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => onFiles(e.target.files)} />
                </label>
              </li>
            )}
          </ul>
        </section>

        {/* Precios y stock */}
        <section className="rounded-[var(--radius-toy)] bg-white p-5 sm:p-6" aria-labelledby={`${formId}-precios`}>
          <h2 id={`${formId}-precios`} className="text-xl font-semibold">
            Precio y stock
          </h2>
          <p className="mt-1 text-ink-soft">
            El stock es el mismo para la tienda en línea y el mostrador. Cada venta lo descuenta sola.
          </p>

          {multi && (
            <div className="mt-5 max-w-xs">
              <label className="label" htmlFor={`${formId}-vlabel`}>
                ¿En qué cambian las presentaciones?
              </label>
              <input
                id={`${formId}-vlabel`}
                className="field"
                list={`${formId}-vlabels`}
                value={variantLabel}
                onChange={(e) => touch(setVariantLabel)(e.target.value)}
                placeholder="Peso, Talla, Sabor…"
              />
              <datalist id={`${formId}-vlabels`}>
                {VARIANT_LABELS.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </div>
          )}

          {err("variants")}

          <ul className="mt-5 space-y-4">
            {variants.map((v, i) => {
              const p = `variants.${i}`;
              return (
                <li key={v.key} className="rounded-2xl bg-ground p-4">
                  <div className="grid gap-4 sm:grid-cols-[1.2fr_1fr_1fr_0.8fr]">
                    {multi && (
                      <div className="sm:col-span-4 flex items-end gap-3">
                        <div className="flex-1">
                          <label className="label" htmlFor={`${formId}-vn-${v.key}`}>
                            {variantLabel || "Presentación"}
                          </label>
                          <input
                            id={`${formId}-vn-${v.key}`}
                            className="field"
                            value={v.name}
                            onChange={(e) => setVariant(v.key, { name: e.target.value })}
                            placeholder={variantLabel === "Talla" ? "S, M, L…" : variantLabel === "Peso" ? "2 kg" : ""}
                            {...invalid(`${p}.name`)}
                          />
                          {err(`${p}.name`)}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeVariant(v.key)}
                          className="btn btn-soft btn-sm mb-1"
                          aria-label={`Quitar presentación ${v.name || i + 1}`}
                        >
                          <Trash size={18} aria-hidden="true" /> Quitar
                        </button>
                      </div>
                    )}
                    <div>
                      <label className="label" htmlFor={`${formId}-vp-${v.key}`}>
                        Precio
                      </label>
                      <input
                        id={`${formId}-vp-${v.key}`}
                        className="field tnum"
                        inputMode="numeric"
                        value={v.price}
                        onChange={(e) => setVariant(v.key, { price: e.target.value })}
                        placeholder="45900"
                        {...invalid(`${p}.price`)}
                      />
                      {err(`${p}.price`) ?? (toInt(v.price) > 0 && <p className="hint tnum">{formatCOP(toInt(v.price))}</p>)}
                    </div>
                    <div>
                      <label className="label" htmlFor={`${formId}-vc-${v.key}`}>
                        Precio antes
                      </label>
                      <input
                        id={`${formId}-vc-${v.key}`}
                        className="field tnum"
                        inputMode="numeric"
                        value={v.compareAtPrice}
                        onChange={(e) => setVariant(v.key, { compareAtPrice: e.target.value })}
                        placeholder="Opcional"
                        {...invalid(`${p}.compareAtPrice`)}
                      />
                      {err(`${p}.compareAtPrice`) ?? <p className="hint">Para mostrar oferta</p>}
                    </div>
                    <div>
                      <label className="label" htmlFor={`${formId}-vs-${v.key}`}>
                        Unidades
                      </label>
                      <input
                        id={`${formId}-vs-${v.key}`}
                        className="field tnum"
                        inputMode="numeric"
                        value={v.stock}
                        onChange={(e) => setVariant(v.key, { stock: e.target.value })}
                        {...invalid(`${p}.stock`)}
                      />
                      {err(`${p}.stock`)}
                    </div>
                    <div>
                      <label className="label" htmlFor={`${formId}-vm-${v.key}`}>
                        Avisar con
                      </label>
                      <input
                        id={`${formId}-vm-${v.key}`}
                        className="field tnum"
                        inputMode="numeric"
                        value={v.minStock}
                        onChange={(e) => setVariant(v.key, { minStock: e.target.value })}
                        aria-describedby={`${formId}-vm-hint-${v.key}`}
                      />
                      <p className="hint" id={`${formId}-vm-hint-${v.key}`}>
                        o menos
                      </p>
                    </div>
                    {showCodes && (
                      <>
                        <div className="sm:col-span-2">
                          <label className="label" htmlFor={`${formId}-vb-${v.key}`}>
                            Código de barras
                          </label>
                          <input
                            id={`${formId}-vb-${v.key}`}
                            className="field tnum"
                            inputMode="numeric"
                            value={v.barcode}
                            onChange={(e) => setVariant(v.key, { barcode: e.target.value })}
                            placeholder="Escanéalo o escríbelo"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="label" htmlFor={`${formId}-vk-${v.key}`}>
                            Código interno (SKU)
                          </label>
                          <input
                            id={`${formId}-vk-${v.key}`}
                            className="field"
                            value={v.sku}
                            onChange={(e) => setVariant(v.key, { sku: e.target.value })}
                            placeholder="Se crea solo si lo dejas vacío"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className="btn btn-soft btn-sm" onClick={addVariant}>
              <Plus size={18} weight="bold" aria-hidden="true" />
              {multi ? "Otra presentación" : "Tiene tallas, pesos o sabores"}
            </button>
            <button type="button" className="btn btn-soft btn-sm" onClick={() => setShowCodes((s) => !s)} aria-expanded={showCodes}>
              {showCodes ? "Ocultar códigos" : "Códigos de barras"}
            </button>
          </div>
        </section>

        {/* Visibilidad */}
        <section className="rounded-[var(--radius-toy)] bg-white p-5 sm:p-6" aria-labelledby={`${formId}-vis`}>
          <h2 id={`${formId}-vis`} className="text-xl font-semibold">
            En la tienda
          </h2>
          <div className="mt-4 space-y-3">
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <input type="checkbox" className="size-5 accent-teal-700" checked={active} onChange={(e) => touch(setActive)(e.target.checked)} />
              <span>
                <span className="font-medium">Visible en la tienda</span>
                <span className="block text-sm text-ink-soft">Si lo apagas, nadie lo ve pero no se pierde nada.</span>
              </span>
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <input type="checkbox" className="size-5 accent-teal-700" checked={featured} onChange={(e) => touch(setFeatured)(e.target.checked)} />
              <span>
                <span className="inline-flex items-center gap-1 font-medium">
                  <Star size={16} weight="fill" className="text-sun-500" aria-hidden="true" /> Destacado
                </span>
                <span className="block text-sm text-ink-soft">Aparece en “Lo que más se llevan” en el inicio.</span>
              </span>
            </label>
          </div>
        </section>
      </div>

      {/* Vista previa y guardar */}
      <aside className="xl:sticky xl:top-8 xl:self-start" aria-label="Vista previa">
        <div className="rounded-[var(--radius-toy)] bg-white p-5">
          <h2 className="font-semibold">Así se ve en la tienda</h2>
          <div className="mx-auto mt-4 max-w-[260px]">
            <ProductCard product={preview} asLink={false} />
          </div>
          {!active && <p className="mt-4 rounded-xl bg-sun-100 px-3 py-2 text-sm text-teal-900">Oculto: la tienda no lo muestra.</p>}
        </div>

        <div className="sticky bottom-0 z-10 -mx-4 mt-4 bg-ground/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-[var(--radius-toy)] sm:bg-white sm:p-5 xl:static">
          {status && (
            <p role={status.kind === "error" ? "alert" : "status"} className={`mb-3 font-medium ${status.kind === "error" ? "text-danger" : "text-teal-700"}`}>
              {status.text}
            </p>
          )}
          <button type="submit" className="btn btn-sun w-full text-lg" disabled={saving || uploading > 0}>
            {saving ? "Guardando…" : uploading ? "Esperando fotos…" : product ? "Guardar cambios" : "Crear producto"}
          </button>
          {product && (
            <a href={`/tienda/${product.slug}`} target="_blank" rel="noopener" className="mt-3 block text-center font-medium text-teal-700 underline">
              Ver en la tienda
            </a>
          )}
        </div>
      </aside>
    </form>
  );
}
