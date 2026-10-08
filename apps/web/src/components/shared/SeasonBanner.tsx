import type { SeasonPreset } from "@maya/api/seasons";
import { Ghost } from "@phosphor-icons/react/dist/csr/Ghost";
import { Heart } from "@phosphor-icons/react/dist/csr/Heart";
import { Snowflake } from "@phosphor-icons/react/dist/csr/Snowflake";
import { Sparkle } from "@phosphor-icons/react/dist/csr/Sparkle";
import type { CSSProperties } from "react";

export const SEASON_ICONS = { Ghost, Heart, Snowflake, Sparkle };

export interface SeasonBannerData {
  headline: string;
  message: string;
  ctaLabel: string;
  categorySlug: string | null;
  discountNote: string;
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
 * Franja de temporada. La misma en el inicio y en la vista previa del panel.
 */
export function SeasonBanner({
  data,
  preset,
  preview = false,
}: {
  data: SeasonBannerData;
  preset: SeasonPreset;
  preview?: boolean;
}) {
  const Icon = SEASON_ICONS[preset.ambientIcon];
  const href = data.categorySlug ? `/tienda?categoria=${encodeURIComponent(data.categorySlug)}` : "/tienda";

  return (
    <section
      aria-label={`Temporada de ${preset.name}`}
      className="on-field relative isolate overflow-hidden rounded-[var(--radius-toy)] bg-[var(--field)] px-6 py-8 text-white shadow-[inset_0_-6px_0_var(--field-lip)] sm:px-10 sm:py-10"
      style={seasonVars(preset)}
    >
      <Icon
        weight="fill"
        aria-hidden="true"
        className="pointer-events-none absolute -right-6 -top-8 -z-10 size-48 rotate-12 text-[var(--accent)] opacity-25 sm:size-64"
      />
      <div className="grid gap-6 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="max-w-[38ch]">
          <p className="mb-2 inline-flex items-center gap-2 font-medium text-white/85">
            <Icon weight="fill" aria-hidden="true" className="size-5 text-[var(--accent)]" />
            {preset.name}
          </p>
          <h2 className="text-3xl font-bold [font-variation-settings:'wght'_700] sm:text-4xl">
            {data.headline || preset.defaultHeadline}
          </h2>
          {data.message && <p className="mt-3 text-lg text-white/90">{data.message}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {data.discountNote && (
            <span className="rounded-full bg-white/15 px-4 py-2 font-semibold text-white">{data.discountNote}</span>
          )}
          {preview ? (
            <span className="btn btn-sun pointer-events-none">{data.ctaLabel}</span>
          ) : (
            <a href={href} className="btn btn-sun">
              {data.ctaLabel}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
