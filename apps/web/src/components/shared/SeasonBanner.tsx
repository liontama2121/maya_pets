import type { SeasonPreset } from "@maya/api/seasons";
import { Ghost } from "@phosphor-icons/react/dist/csr/Ghost";
import { Heart } from "@phosphor-icons/react/dist/csr/Heart";
import { PawPrint } from "@phosphor-icons/react/dist/csr/PawPrint";
import { Snowflake } from "@phosphor-icons/react/dist/csr/Snowflake";
import { Sparkle } from "@phosphor-icons/react/dist/csr/Sparkle";
import type { CSSProperties } from "react";

export const SEASON_ICONS = { Ghost, Heart, Snowflake, Sparkle };

export interface SeasonBannerData {
  title: string;
  subtitle: string;
  ctaLabel: string;
  href: string;
  image?: { src: string; alt: string } | null;
}

/** Variables CSS con las que una temporada re-tiñe la superficie. */
export function seasonVars(preset: SeasonPreset): CSSProperties {
  return {
    "--field": preset.field,
    "--field-lip": preset.fieldLip,
    "--accent": preset.accent,
    "--accent-lip": preset.accentLip,
    "--on-accent": preset.onAccent,
  } as CSSProperties;
}

/**
 * Banner de temporada del inicio. El contenido lo edita MAYA en "Contenido del sitio";
 * los colores y el ícono salen de la temporada activa (si no hay, los de la marca y la huella).
 * El mismo componente se usa en la vista previa del panel.
 */
export function SeasonBanner({
  data,
  preset = null,
  preview = false,
}: {
  data: SeasonBannerData;
  preset?: SeasonPreset | null;
  preview?: boolean;
}) {
  const Icon = preset ? SEASON_ICONS[preset.ambientIcon] : PawPrint;
  const image = data.image?.src ? data.image : null;

  return (
    <section
      aria-label={preset ? `Temporada de ${preset.name}` : data.title}
      className="on-field relative isolate overflow-hidden rounded-[var(--radius-toy)] bg-[var(--field)] text-white shadow-[inset_0_-6px_0_var(--field-lip)]"
      style={preset ? seasonVars(preset) : undefined}
    >
      {!image && (
        <Icon
          weight="fill"
          aria-hidden="true"
          className="pointer-events-none absolute -right-6 -top-8 -z-10 size-48 rotate-12 text-[var(--accent)] opacity-25 sm:size-64"
        />
      )}
      <div className={image ? "grid sm:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]" : ""}>
        <div className="grid gap-6 px-6 py-8 sm:grid-cols-[1fr_auto] sm:items-end sm:px-10 sm:py-10">
          <div className="max-w-[38ch]">
            {preset && (
              <p className="mb-2 inline-flex items-center gap-2 font-medium text-white/85">
                <Icon weight="fill" aria-hidden="true" className="size-5 text-[var(--accent)]" />
                {preset.name}
              </p>
            )}
            <h2 className="text-3xl font-bold [font-variation-settings:'wght'_700] sm:text-4xl">{data.title}</h2>
            {data.subtitle && <p className="mt-3 text-lg text-white/90">{data.subtitle}</p>}
          </div>
          <div className={image ? "sm:col-span-2" : ""}>
            {preview ? (
              <span className="btn btn-sun pointer-events-none">{data.ctaLabel}</span>
            ) : (
              <a href={data.href} className="btn btn-sun">
                {data.ctaLabel}
              </a>
            )}
          </div>
        </div>
        {image && (
          <div className="relative min-h-48 sm:min-h-full">
            <img
              src={image.src}
              alt={image.alt}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        )}
      </div>
    </section>
  );
}
