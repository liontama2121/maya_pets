import { CheckCircle } from "@phosphor-icons/react/dist/csr/CheckCircle";
import { useId, useState } from "react";
import { whatsappLink } from "../../lib/format";

/** Solicitud de adopción con autorización de datos (Ley 1581 de 2012). */
export default function AdoptionForm({ dogId, dogName }: { dogId: number | null; dogName?: string }) {
  const id = useId();
  const [f, setF] = useState({
    fullName: "",
    phone: "",
    email: "",
    neighborhood: "",
    homeType: "",
    hoursAlone: "",
    otherPets: "",
    hasKids: false,
    experience: "",
    message: "",
    consent: false,
    website: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setErrors({});
    try {
      const res = await fetch("/api/adopcion/solicitud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...f,
          dogId,
          hoursAlone: f.hoursAlone === "" ? -1 : Number(f.hoursAlone),
          homeType: f.homeType || "x",
          website: f.website || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string[]> };
      if (!res.ok) {
        const errs: Record<string, string> = {};
        for (const [k, v] of Object.entries(data.fields ?? {})) if (v?.[0]) errs[k] = v[0];
        if (errs.homeType) errs.homeType = "Elige el tipo de vivienda";
        if (errs.hoursAlone) errs.hoursAlone = "Escoge cuántas horas";
        setErrors(errs);
        setError(data.error ?? "No se pudo enviar.");
        return;
      }
      setDone(true);
    } catch {
      setError("Sin conexión. Revisa el internet e intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-[var(--radius-toy)] bg-white p-6 text-center" role="status">
        <CheckCircle weight="fill" size={56} className="mx-auto text-teal-700" aria-hidden="true" />
        <p className="mt-3 text-2xl font-bold">¡Recibimos tu solicitud!</p>
        <p className="mt-2 text-ink-soft">
          Te escribimos por WhatsApp en los próximos días para conocernos{dogName ? ` y contarte más de ${dogName}` : ""}.
        </p>
      </div>
    );
  }

  const err = (k: string) =>
    errors[k] ? (
      <p className="error-text" id={`${id}-${k}-e`}>
        {errors[k]}
      </p>
    ) : null;
  const inv = (k: string) => (errors[k] ? { "aria-invalid": true as const, "aria-describedby": `${id}-${k}-e` } : {});

  return (
    <form onSubmit={submit} className="space-y-5 rounded-[var(--radius-toy)] bg-white p-5 sm:p-6" noValidate>
      <h2 className="text-2xl font-bold [font-variation-settings:'wght'_720]">{dogName ? `Quiero adoptar a ${dogName}` : "Quiero adoptar"}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-n`} className="label">
            Nombre completo
          </label>
          <input id={`${id}-n`} className="field" autoComplete="name" value={f.fullName} onChange={(e) => set("fullName", e.target.value)} {...inv("fullName")} />
          {err("fullName")}
        </div>
        <div>
          <label htmlFor={`${id}-p`} className="label">
            Celular (WhatsApp)
          </label>
          <input id={`${id}-p`} className="field" type="tel" autoComplete="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} {...inv("phone")} />
          {err("phone")}
        </div>
        <div>
          <label htmlFor={`${id}-e`} className="label">
            Correo <span className="font-normal text-ink-soft">(opcional)</span>
          </label>
          <input id={`${id}-e`} className="field" type="email" autoComplete="email" value={f.email} onChange={(e) => set("email", e.target.value)} {...inv("email")} />
          {err("email")}
        </div>
        <div>
          <label htmlFor={`${id}-b`} className="label">
            Barrio o municipio
          </label>
          <input id={`${id}-b`} className="field" value={f.neighborhood} onChange={(e) => set("neighborhood", e.target.value)} {...inv("neighborhood")} />
          {err("neighborhood")}
        </div>
        <div>
          <label htmlFor={`${id}-h`} className="label">
            Vives en
          </label>
          <select id={`${id}-h`} className="field" value={f.homeType} onChange={(e) => set("homeType", e.target.value)} {...inv("homeType")}>
            <option value="">Elige…</option>
            <option value="apartamento">Apartamento</option>
            <option value="casa">Casa sin patio</option>
            <option value="casa_patio">Casa con patio</option>
            <option value="finca">Finca</option>
          </select>
          {err("homeType")}
        </div>
        <div>
          <label htmlFor={`${id}-t`} className="label">
            Horas que estaría solo al día
          </label>
          <select id={`${id}-t`} className="field" value={f.hoursAlone} onChange={(e) => set("hoursAlone", e.target.value)} {...inv("hoursAlone")}>
            <option value="">Elige…</option>
            <option value="0">Casi nunca está solo</option>
            <option value="3">Hasta 3 horas</option>
            <option value="6">De 4 a 6 horas</option>
            <option value="9">De 7 a 9 horas</option>
            <option value="12">Más de 9 horas</option>
          </select>
          {err("hoursAlone")}
        </div>
        <div>
          <label htmlFor={`${id}-o`} className="label">
            Otras mascotas <span className="font-normal text-ink-soft">(opcional)</span>
          </label>
          <input id={`${id}-o`} className="field" placeholder="Ej.: una gata de 3 años" value={f.otherPets} onChange={(e) => set("otherPets", e.target.value)} />
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3 self-end">
          <input type="checkbox" className="size-5 accent-teal-700" checked={f.hasKids} onChange={(e) => set("hasKids", e.target.checked)} />
          Hay niños en la casa
        </label>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-x`} className="label">
            ¿Has tenido perros antes? <span className="font-normal text-ink-soft">(opcional)</span>
          </label>
          <textarea id={`${id}-x`} className="field min-h-20" maxLength={500} value={f.experience} onChange={(e) => set("experience", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-m`} className="label">
            ¿Por qué quieres adoptar? <span className="font-normal text-ink-soft">(opcional)</span>
          </label>
          <textarea id={`${id}-m`} className="field min-h-24" maxLength={1000} value={f.message} onChange={(e) => set("message", e.target.value)} />
        </div>
      </div>

      <div className="hidden" aria-hidden="true">
        <label>
          Sitio web
          <input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set("website", e.target.value)} />
        </label>
      </div>

      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" className="mt-1 size-5 shrink-0 accent-teal-700" checked={f.consent} onChange={(e) => set("consent", e.target.checked)} />
        <span className="text-sm">
          Autorizo a MAYA Pets a tratar mis datos para evaluar esta solicitud de adopción y contactarme, según la{" "}
          <a href="/privacidad" target="_blank" className="font-semibold text-teal-700 underline">
            política de privacidad
          </a>{" "}
          (Ley 1581 de 2012).
        </span>
      </label>
      {err("consent")}

      {error && !Object.keys(errors).length && (
        <p className="rounded-xl bg-danger-soft px-3 py-2 font-medium text-danger" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-sun text-lg" disabled={busy}>
          {busy ? "Enviando…" : "Enviar solicitud"}
        </button>
        <a href={whatsappLink(`Hola, quiero saber más sobre la adopción${dogName ? ` de ${dogName}` : ""}.`)} target="_blank" rel="noopener" className="font-semibold text-teal-700 underline">
          Prefiero escribir por WhatsApp
        </a>
      </div>
    </form>
  );
}
