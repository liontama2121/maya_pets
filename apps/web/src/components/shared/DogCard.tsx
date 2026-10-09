import { ageLabel, ENERGY_LABEL, SIZE_LABEL, type DogCardData } from "@maya/api/adoption";
import { GenderFemale } from "@phosphor-icons/react/dist/csr/GenderFemale";
import { GenderMale } from "@phosphor-icons/react/dist/csr/GenderMale";
import { PawPrint } from "@phosphor-icons/react/dist/csr/PawPrint";
import { ShieldCheck } from "@phosphor-icons/react/dist/csr/ShieldCheck";

/**
 * Tarjeta de un perrito en adopción. La misma en la página pública y en la vista previa del panel.
 */
export function DogCard({
  dog,
  asLink = true,
  match,
}: {
  dog: DogCardData;
  asLink?: boolean;
  /** Compatibilidad de la guía de Maya (0-100), si aplica. */
  match?: { score: number; reasons: string[] };
}) {
  const Sex = dog.sex === "hembra" ? GenderFemale : GenderMale;
  const body = (
    <>
      <div className="relative aspect-[4/5] overflow-hidden rounded-[var(--radius-toy)] bg-sun-100 shadow-[inset_0_-5px_0_rgb(4_42_43/0.08)]">
        {dog.photo ? (
          <img
            src={dog.photo.url}
            alt={dog.photo.alt}
            width={480}
            height={600}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-teal-700">
            <PawPrint weight="fill" size={52} aria-hidden="true" />
            <span className="text-sm font-medium text-ink-soft">Foto pronto</span>
          </div>
        )}
        {dog.status === "en_proceso" && (
          <span className="absolute left-3 top-3 rounded-full bg-teal-900 px-3 py-1 text-sm font-semibold text-white">En proceso de adopción</span>
        )}
        {dog.status === "adoptado" && (
          <span className="absolute left-3 top-3 rounded-full bg-[var(--accent)] px-3 py-1 text-sm font-bold text-[var(--on-accent)]">¡Ya tiene hogar!</span>
        )}
        {match && (
          <span className="absolute right-3 top-3 rounded-full bg-white/95 px-3 py-1 text-sm font-bold text-teal-900 shadow-sm">
            <span className="tnum">{match.score}%</span> compatible
          </span>
        )}
      </div>
      <div className="px-1 pt-3">
        <h3 className="flex items-center gap-2 text-2xl font-bold text-ink [font-variation-settings:'wght'_720] group-hover:text-teal-700">
          {dog.name}
          <Sex size={20} weight="bold" className="text-teal-600" aria-label={dog.sex === "hembra" ? "Hembra" : "Macho"} />
        </h3>
        <p className="text-ink-soft">
          {ageLabel(dog.ageMonths)} · {SIZE_LABEL[dog.size]} · {dog.breed}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-teal-50 px-2.5 py-1 text-sm font-medium text-teal-900">{ENERGY_LABEL[dog.energy]}</span>
          {dog.vaccinated && dog.sterilized && (
            <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 text-sm font-medium text-teal-900">
              <ShieldCheck size={15} weight="fill" aria-hidden="true" /> Vacunado y esterilizado
            </span>
          )}
        </div>
        {match?.reasons.length ? (
          <p className="mt-2 text-sm text-teal-700">Maya dice: {match.reasons.join(", ")}.</p>
        ) : dog.temperament ? (
          <p className="mt-2 line-clamp-2 text-sm text-ink-soft">{dog.temperament}</p>
        ) : null}
      </div>
    </>
  );
  const cls = "group block rounded-[var(--radius-toy)] outline-offset-4";
  return asLink ? (
    <a href={`/adopta/${dog.slug}`} className={cls}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}
