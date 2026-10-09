import { ageLabel, dogInput, type DogCardData } from "@maya/api/adoption";
import { ArrowLeft } from "@phosphor-icons/react/dist/csr/ArrowLeft";
import { ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { Camera } from "@phosphor-icons/react/dist/csr/Camera";
import { Trash } from "@phosphor-icons/react/dist/csr/Trash";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { DogCard } from "../../components/shared/DogCard";
import { api, ApiError } from "../../lib/admin-api";
import { uploadImage } from "../../lib/image";

type Tri = "si" | "no" | "por_saber";
interface Photo {
  key: string;
  url: string;
  alt: string;
  width?: number | null;
  height?: number | null;
}
export interface EditorDog {
  id: number;
  slug: string;
  name: string;
  sex: "macho" | "hembra";
  ageMonths: number;
  size: "pequeno" | "mediano" | "grande";
  weightKg: number | null;
  breed: string;
  energy: "baja" | "media" | "alta";
  temperament: string;
  goodWithKids: Tri;
  goodWithDogs: Tri;
  goodWithCats: Tri;
  sterilized: boolean;
  vaccinated: boolean;
  dewormed: boolean;
  story: string;
  specialNeeds: string;
  status: "disponible" | "en_proceso" | "adoptado";
  featured: boolean;
  photos: Photo[];
}

const blank: Omit<EditorDog, "id" | "slug"> = {
  name: "",
  sex: "hembra",
  ageMonths: 12,
  size: "mediano",
  weightKg: null,
  breed: "Criollo",
  energy: "media",
  temperament: "",
  goodWithKids: "por_saber",
  goodWithDogs: "por_saber",
  goodWithCats: "por_saber",
  sterilized: false,
  vaccinated: false,
  dewormed: false,
  story: "",
  specialNeeds: "",
  status: "disponible",
  featured: false,
  photos: [],
};

function Choice<T extends string>({
  name,
  legend,
  value,
  options,
  onChange,
}: {
  name: string;
  legend: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className="label">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, l]) => (
          <label key={v} className="chip cursor-pointer !min-h-10 text-sm">
            <input type="radio" name={name} className="sr-only" checked={value === v} onChange={() => onChange(v)} />
            {l}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const TRI_OPTIONS: [Tri, string][] = [
  ["si", "Sí"],
  ["no", "No"],
  ["por_saber", "Por saber"],
];

export default function DogEditor({ dog }: { dog?: EditorDog }) {
  const id = useId();
  const [f, setF] = useState(() => (dog ? { ...dog } : { ...blank }));
  const [years, setYears] = useState(() => String(Math.floor((dog?.ageMonths ?? 12) / 12)));
  const [months, setMonths] = useState(() => String((dog?.ageMonths ?? 12) % 12));
  const [uploading, setUploading] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setDirty(true);
  };
  const ageMonths = (Number(years) || 0) * 12 + (Number(months) || 0);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const preview: DogCardData = useMemo(
    () => ({
      id: dog?.id ?? 0,
      slug: dog?.slug ?? "vista-previa",
      name: f.name || "Nombre",
      sex: f.sex,
      ageMonths,
      size: f.size,
      energy: f.energy,
      breed: f.breed || "Criollo",
      temperament: f.temperament,
      goodWithKids: f.goodWithKids,
      goodWithDogs: f.goodWithDogs,
      goodWithCats: f.goodWithCats,
      sterilized: f.sterilized,
      vaccinated: f.vaccinated,
      status: f.status,
      photo: f.photos[0] ? { url: f.photos[0].url, alt: f.photos[0].alt || f.name } : null,
    }),
    [f, ageMonths, dog],
  );

  const onFiles = async (files: FileList | null) => {
    const list = Array.from(files ?? []).slice(0, 8 - f.photos.length);
    if (!list.length) return;
    setUploading((n) => n + list.length);
    for (const file of list) {
      try {
        const up = await uploadImage(file, "perritos");
        setF((x) => ({ ...x, photos: [...x.photos, { key: up.key, url: up.url, alt: "", width: up.width, height: up.height }] }));
        setDirty(true);
      } catch (e) {
        setStatus({ kind: "error", text: e instanceof Error ? e.message : "No se pudo subir la foto." });
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const move = (i: number, d: -1 | 1) => {
    setF((x) => {
      const p = [...x.photos];
      const j = i + d;
      if (j < 0 || j >= p.length) return x;
      [p[i], p[j]] = [p[j]!, p[i]!];
      return { ...x, photos: p };
    });
    setDirty(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    const payload = {
      ...f,
      ageMonths,
      weightKg: f.weightKg,
      photos: f.photos.map(({ key, alt, width, height }) => ({ key, alt, width, height })),
    };
    const parsed = dogInput.safeParse(payload);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[i.path.join(".")] ??= i.message;
      setErrors(errs);
      setStatus({ kind: "error", text: "Revisa los campos marcados." });
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const saved = await api<{ id: number; slug: string }>(dog ? `/adopcion/perritos/${dog.id}` : "/adopcion/perritos", {
        method: dog ? "PUT" : "POST",
        json: parsed.data,
      });
      setDirty(false);
      if (!dog) {
        window.location.href = `/admin/adopciones/${saved.id}?creado=1`;
        return;
      }
      setStatus({ kind: "ok", text: "Guardado. Ya se ve así en la página de adopción." });
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof ApiError ? err.message : "No se pudo guardar." });
    } finally {
      setSaving(false);
    }
  };

  const err = (k: string) => errors[k] && <p className="error-text">{errors[k]}</p>;

  return (
    <form onSubmit={save} noValidate className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        <section className="rounded-[var(--radius-toy)] bg-white p-5 sm:p-6" aria-labelledby={`${id}-fotos`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id={`${id}-fotos`} className="text-xl font-semibold">
              Fotos
            </h2>
            <p className="text-sm text-ink-soft">La primera es la portada. Hasta 8. Mejor con luz natural y a su altura.</p>
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {f.photos.map((p, i) => (
              <li key={p.key} className="flex flex-col gap-2">
                <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-sun-100">
                  <img src={p.url} alt="" className="h-full w-full object-cover" />
                  {i === 0 && <span className="absolute left-2 top-2 rounded-full bg-teal-900 px-2 py-0.5 text-xs font-semibold text-white">Portada</span>}
                </div>
                <div className="flex justify-between">
                  <div className="flex">
                    <button type="button" className="grid size-10 place-items-center rounded-full hover:bg-teal-50 disabled:opacity-30" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Mover foto ${i + 1} antes`}>
                      <ArrowLeft size={18} aria-hidden="true" />
                    </button>
                    <button type="button" className="grid size-10 place-items-center rounded-full hover:bg-teal-50 disabled:opacity-30" onClick={() => move(i, 1)} disabled={i === f.photos.length - 1} aria-label={`Mover foto ${i + 1} después`}>
                      <ArrowRight size={18} aria-hidden="true" />
                    </button>
                  </div>
                  <button
                    type="button"
                    className="grid size-10 place-items-center rounded-full text-danger hover:bg-danger-soft"
                    onClick={() => set("photos", f.photos.filter((_, j) => j !== i))}
                    aria-label={`Quitar foto ${i + 1}`}
                  >
                    <Trash size={18} aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
            {Array.from({ length: uploading }, (_, i) => (
              <li key={`u${i}`} className="skeleton aspect-[4/5]" aria-label="Subiendo foto" />
            ))}
            {f.photos.length + uploading < 8 && (
              <li>
                <label className="flex aspect-[4/5] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong text-teal-700 transition-colors hover:bg-teal-50 focus-within:outline focus-within:outline-3 focus-within:outline-teal-700">
                  <Camera size={32} aria-hidden="true" />
                  <span className="text-sm font-medium">Agregar fotos</span>
                  <input ref={fileRef} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => onFiles(e.target.files)} />
                </label>
              </li>
            )}
          </ul>
          {err("photos")}
        </section>

        <section className="rounded-[var(--radius-toy)] bg-white p-5 sm:p-6" aria-labelledby={`${id}-datos`}>
          <h2 id={`${id}-datos`} className="text-xl font-semibold">
            Quién es
          </h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-n`} className="label">
                Nombre
              </label>
              <input id={`${id}-n`} className="field" maxLength={40} value={f.name} onChange={(e) => set("name", e.target.value)} aria-invalid={errors.name ? true : undefined} />
              {err("name")}
            </div>
            <div>
              <label htmlFor={`${id}-r`} className="label">
                Raza
              </label>
              <input id={`${id}-r`} className="field" maxLength={60} value={f.breed} onChange={(e) => set("breed", e.target.value)} placeholder="Criollo" />
            </div>
            <Choice name={`${id}-sex`} legend="Sexo" value={f.sex} options={[["hembra", "Hembra"], ["macho", "Macho"]]} onChange={(v) => set("sex", v)} />
            <fieldset>
              <legend className="label">Edad aproximada</legend>
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`${id}-y`}>
                  Años
                </label>
                <input id={`${id}-y`} className="field tnum w-20" inputMode="numeric" value={years} onChange={(e) => { setYears(e.target.value.replace(/\D/g, "")); setDirty(true); }} />
                <span>años</span>
                <label className="sr-only" htmlFor={`${id}-m`}>
                  Meses
                </label>
                <input id={`${id}-m`} className="field tnum w-20" inputMode="numeric" value={months} onChange={(e) => { setMonths(e.target.value.replace(/\D/g, "").slice(0, 2)); setDirty(true); }} />
                <span>meses</span>
              </div>
              <p className="hint">Se muestra como “{ageLabel(ageMonths)}”.</p>
              {err("ageMonths")}
            </fieldset>
            <Choice name={`${id}-size`} legend="Tamaño" value={f.size} options={[["pequeno", "Pequeño"], ["mediano", "Mediano"], ["grande", "Grande"]]} onChange={(v) => set("size", v)} />
            <div>
              <label htmlFor={`${id}-w`} className="label">
                Peso en kg <span className="font-normal text-ink-soft">(opcional)</span>
              </label>
              <input
                id={`${id}-w`}
                className="field tnum w-28"
                inputMode="numeric"
                value={f.weightKg ?? ""}
                onChange={(e) => set("weightKg", e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null)}
              />
            </div>
            <Choice name={`${id}-en`} legend="Energía" value={f.energy} options={[["baja", "Tranquilo"], ["media", "Juguetón"], ["alta", "Muy activo"]]} onChange={(v) => set("energy", v)} />
            <div className="sm:col-span-2">
              <label htmlFor={`${id}-t`} className="label">
                Temperamento en una frase
              </label>
              <input id={`${id}-t`} className="field" maxLength={160} value={f.temperament} onChange={(e) => set("temperament", e.target.value)} placeholder="Ej.: Cariñosa, curiosa y muy buena compañera de paseo." />
            </div>
          </div>
        </section>

        <section className="rounded-[var(--radius-toy)] bg-white p-5 sm:p-6" aria-labelledby={`${id}-salud`}>
          <h2 id={`${id}-salud`} className="text-xl font-semibold">
            Salud y convivencia
          </h2>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            {(
              [
                ["vaccinated", "Vacunado"],
                ["sterilized", "Esterilizado"],
                ["dewormed", "Desparasitado"],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className="flex min-h-11 cursor-pointer items-center gap-3">
                <input type="checkbox" className="size-5 accent-teal-700" checked={f[k]} onChange={(e) => set(k, e.target.checked)} />
                {l}
              </label>
            ))}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Choice name={`${id}-k`} legend="¿Con niños?" value={f.goodWithKids} options={TRI_OPTIONS} onChange={(v) => set("goodWithKids", v)} />
            <Choice name={`${id}-d`} legend="¿Con perros?" value={f.goodWithDogs} options={TRI_OPTIONS} onChange={(v) => set("goodWithDogs", v)} />
            <Choice name={`${id}-c`} legend="¿Con gatos?" value={f.goodWithCats} options={TRI_OPTIONS} onChange={(v) => set("goodWithCats", v)} />
          </div>
          <p className="hint">Maya usa estas respuestas para sugerirlo a las familias que encajan.</p>
        </section>

        <section className="rounded-[var(--radius-toy)] bg-white p-5 sm:p-6" aria-labelledby={`${id}-hist`}>
          <h2 id={`${id}-hist`} className="text-xl font-semibold">
            Su historia
          </h2>
          <div className="mt-4 space-y-4">
            <div>
              <label htmlFor={`${id}-s`} className="label">
                Historia
              </label>
              <textarea id={`${id}-s`} className="field min-h-32" maxLength={3000} value={f.story} onChange={(e) => set("story", e.target.value)} placeholder="Cómo llegó, qué le gusta, cómo es en casa…" />
            </div>
            <div>
              <label htmlFor={`${id}-sn`} className="label">
                Cuidados especiales <span className="font-normal text-ink-soft">(opcional)</span>
              </label>
              <input id={`${id}-sn`} className="field" maxLength={600} value={f.specialNeeds} onChange={(e) => set("specialNeeds", e.target.value)} placeholder="Ej.: mejor como único perro de la casa" />
            </div>
          </div>
        </section>
      </div>

      <aside className="xl:sticky xl:top-8 xl:self-start" aria-label="Vista previa y estado">
        <div className="rounded-[var(--radius-toy)] bg-white p-5">
          <h2 className="font-semibold">Así se ve en Adopta con Maya</h2>
          <div className="mx-auto mt-4 max-w-[240px]">
            <DogCard dog={preview} asLink={false} />
          </div>
        </div>
        <div className="mt-4 space-y-3 rounded-[var(--radius-toy)] bg-white p-5">
          <Choice
            name={`${id}-st`}
            legend="Estado"
            value={f.status}
            options={[["disponible", "Disponible"], ["en_proceso", "En proceso"], ["adoptado", "Adoptado"]]}
            onChange={(v) => set("status", v)}
          />
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <input type="checkbox" className="size-5 accent-teal-700" checked={f.featured} onChange={(e) => set("featured", e.target.checked)} />
            Mostrar primero
          </label>
        </div>
        <div className="sticky bottom-0 z-10 -mx-4 mt-4 bg-ground/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-[var(--radius-toy)] sm:bg-white sm:p-5 xl:static">
          {status && (
            <p role={status.kind === "error" ? "alert" : "status"} className={`mb-3 font-medium ${status.kind === "error" ? "text-danger" : "text-teal-700"}`}>
              {status.text}
            </p>
          )}
          <button type="submit" className="btn btn-sun w-full text-lg" disabled={saving || uploading > 0}>
            {saving ? "Guardando…" : uploading ? "Esperando fotos…" : dog ? "Guardar cambios" : "Publicar perrito"}
          </button>
          {dog && (
            <a href={`/adopta/${dog.slug}`} target="_blank" rel="noopener" className="mt-3 block text-center font-medium text-teal-700 underline">
              Ver en la página
            </a>
          )}
        </div>
      </aside>
    </form>
  );
}
