import { Camera } from "@phosphor-icons/react/dist/csr/Camera";
import { CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { useId, useRef, useState } from "react";
import { INSTAGRAM_HANDLE } from "../../lib/format";
import { prepareImage } from "../../lib/image";

/** Inscripción de un dibujo. La llena la madre, el padre o el acudiente. */
export default function KidsForm({
  contestId,
  ageMin,
  ageMax,
}: {
  contestId: number;
  ageMin: number;
  ageMax: number;
}) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const onFile = (f: File | undefined) => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setErrors({});
    const form = new FormData(e.currentTarget);
    const raw = form.get("file");
    if (!(raw instanceof File) || !raw.size) {
      setErrors({ file: "Sube la foto del dibujo." });
      return;
    }
    setBusy(true);
    try {
      // Se reduce en el celular antes de subir: fotos de 8 MB quedan en ~300 KB.
      const { blob, width, height } = await prepareImage(raw, 1800);
      form.set("file", new File([blob], "dibujo.webp", { type: blob.type || "image/webp" }));
      form.set("width", String(width));
      form.set("height", String(height));
      form.set("contestId", String(contestId));
      form.set("consent", form.get("consent") ? "si" : "no");
      const res = await fetch("/api/kids/inscribir", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string>; childName?: string };
      if (!res.ok) {
        if (data.fields) setErrors(data.fields);
        setError(data.error ?? "No se pudo enviar. Intenta de nuevo.");
        return;
      }
      setDone(data.childName ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar. Revisa tu conexión.");
    } finally {
      setBusy(false);
    }
  };

  if (done !== null) {
    return (
      <div className="rounded-[var(--radius-toy)] bg-white p-6 text-center" role="status">
        <CheckCircle weight="fill" size={56} className="mx-auto text-teal-700" aria-hidden="true" />
        <p className="mt-3 text-2xl font-bold">¡Recibimos el dibujo{done ? ` de ${done}` : ""}!</p>
        <p className="mt-2 text-ink-soft">
          Cuando aceptemos tu invitación de colaborador en Instagram, el dibujo aparece en la galería y sus likes empiezan a contar.
          ¡Compártelo para conseguir más!
        </p>
        <button type="button" className="btn btn-soft mt-5" onClick={() => { setDone(null); onFile(undefined); }}>
          Inscribir otro dibujo
        </button>
      </div>
    );
  }

  const err = (k: string) => errors[k] && <p className="error-text">{errors[k]}</p>;
  const ages = Array.from({ length: ageMax - ageMin + 1 }, (_, i) => ageMin + i);

  return (
    <form onSubmit={submit} className="space-y-5 rounded-[var(--radius-toy)] bg-white p-5 sm:p-6" noValidate>
      <div>
        <span className="label">
          Foto del dibujo <span className="font-normal text-ink-soft">(para la galería de esta página)</span>
        </span>
        <label
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed text-teal-700 transition-colors hover:bg-teal-50 focus-within:outline focus-within:outline-3 focus-within:outline-teal-700 ${errors.file ? "border-danger" : "border-line-strong"} ${preview ? "p-2" : "aspect-[4/3] p-6"}`}
        >
          {preview ? (
            <img src={preview} alt="Vista previa del dibujo" className="max-h-80 w-auto rounded-xl object-contain" />
          ) : (
            <>
              <Camera size={40} aria-hidden="true" />
              <span className="font-medium">Toma o elige la foto</span>
              <span className="text-sm text-ink-soft">Con buena luz y el dibujo completo</span>
            </>
          )}
          <input ref={fileRef} name="file" type="file" accept="image/*" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {preview && (
          <button type="button" className="mt-2 text-sm font-semibold text-teal-700 underline" onClick={() => fileRef.current?.click()}>
            Cambiar foto
          </button>
        )}
        {err("file")}
      </div>

      <div>
        <label htmlFor={`${id}-ig`} className="label">
          Enlace de la publicación en Instagram
        </label>
        <input
          id={`${id}-ig`}
          name="instagramUrl"
          type="url"
          inputMode="url"
          className="field"
          placeholder="https://www.instagram.com/p/…"
          aria-invalid={errors.instagramUrl ? true : undefined}
          aria-describedby={`${id}-ig-help`}
        />
        {err("instagramUrl")}
        <div id={`${id}-ig-help`} className="mt-2 rounded-2xl bg-sun-100 p-3 text-sm text-teal-900">
          <p className="font-semibold">Para que cuenten tus likes:</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5">
            <li>Publica el dibujo en tu Instagram (cuenta pública).</li>
            <li>
              Antes de compartir toca <strong>Etiquetar personas → Invitar colaborador</strong> y elige <strong>@{INSTAGRAM_HANDLE}</strong>.
            </li>
            <li>
              En la publicación toca <strong>···</strong> → <strong>Copiar enlace</strong> y pégalo aquí.
            </li>
          </ol>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <div>
          <label htmlFor={`${id}-cn`} className="label">
            Primer nombre del niño o la niña
          </label>
          <input id={`${id}-cn`} name="childName" className="field" maxLength={20} autoComplete="off" aria-invalid={errors.childName ? true : undefined} />
          {err("childName") ?? <p className="hint">Solo el primer nombre. Es lo que se publica.</p>}
        </div>
        <div>
          <label htmlFor={`${id}-age`} className="label">
            Edad
          </label>
          <select id={`${id}-age`} name="childAge" className="field" defaultValue="" aria-invalid={errors.childAge ? true : undefined}>
            <option value="" disabled>
              Años
            </option>
            {ages.map((a) => (
              <option key={a} value={a}>
                {a} años
              </option>
            ))}
          </select>
          {err("childAge")}
        </div>
      </div>

      <div>
        <label htmlFor={`${id}-t`} className="label">
          Nombre del dibujo <span className="font-normal text-ink-soft">(opcional)</span>
        </label>
        <input id={`${id}-t`} name="drawingTitle" className="field" maxLength={60} placeholder="Ej.: Maya en el parque" />
      </div>

      <fieldset className="space-y-4 rounded-2xl bg-ground p-4">
        <legend className="px-1 font-semibold">Datos del acudiente</legend>
        <div>
          <label htmlFor={`${id}-gn`} className="label">
            Tu nombre
          </label>
          <input id={`${id}-gn`} name="guardianName" className="field" maxLength={80} autoComplete="name" aria-invalid={errors.guardianName ? true : undefined} />
          {err("guardianName")}
        </div>
        <div>
          <label htmlFor={`${id}-gc`} className="label">
            WhatsApp o correo
          </label>
          <input id={`${id}-gc`} name="guardianContact" className="field" maxLength={80} autoComplete="tel" aria-invalid={errors.guardianContact ? true : undefined} />
          {err("guardianContact") ?? <p className="hint">Para avisarte cuando se publique y si gana. No se publica.</p>}
        </div>
      </fieldset>

      {/* Trampa para robots: oculta para las personas. */}
      <div className="hidden" aria-hidden="true">
        <label>
          Sitio web
          <input name="sitio_web" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" name="consent" value="si" className="mt-1 size-5 shrink-0 accent-teal-700" />
        <span className="text-sm">
          Soy la madre, el padre o acudiente del niño o la niña. Autorizo a MAYA Pets a mostrar este dibujo con su primer nombre y su
          edad en este sitio y en su Instagram como colaborador, y el tratamiento de mis datos según la{" "}
          <a href="/privacidad" target="_blank" className="font-semibold text-teal-700 underline">
            política de privacidad
          </a>{" "}
          y los{" "}
          <a href="/maya-kids/terminos" target="_blank" className="font-semibold text-teal-700 underline">
            términos del concurso
          </a>
          .
        </span>
      </label>
      {err("consent")}

      {error && !Object.keys(errors).length && (
        <p className="rounded-xl bg-danger-soft px-3 py-2 font-medium text-danger" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn-sun w-full text-lg sm:w-auto" disabled={busy}>
        {busy ? "Enviando…" : "Inscribir dibujo"}
      </button>
    </form>
  );
}
