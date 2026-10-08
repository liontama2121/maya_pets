import type { SeasonEvent, SeasonSlug } from "./db/schema";

/**
 * Presets de cada temporada. El evento re-tiñe toda la superficie, no solo un banner.
 * `onAccent` es el color de texto que pasa AA sobre `accent`.
 */
export interface SeasonPreset {
  slug: SeasonSlug;
  name: string;
  /** Ícono de Phosphor que cae en la decoración ambiental. */
  ambientIcon: "Ghost" | "Snowflake" | "Sparkle" | "Heart";
  /** Fondo del campo principal (sustituye al verde petróleo). */
  field: string;
  /** Labio inferior de los bloques de caucho sobre ese campo. */
  fieldLip: string;
  /** Acento de temporada (sustituye al amarillo en los CTA del evento). */
  accent: string;
  accentLip: string;
  onAccent: string;
  defaultHeadline: string;
  defaultMessage: string;
  /** Mes y día por defecto para proponer fechas al crear el evento del año. */
  defaultRange: [string, string];
}

export const SEASON_PRESETS: Record<SeasonSlug, SeasonPreset> = {
  halloween: {
    slug: "halloween",
    name: "Halloween",
    ambientIcon: "Ghost",
    field: "#062F30",
    fieldLip: "#031C1D",
    accent: "#F28C28",
    accentLip: "#C46A14",
    onAccent: "#1F1305",
    defaultHeadline: "Disfraces, dulces y cero sustos",
    defaultMessage: "Disfraces cómodos y premios para que tu peludo también pida dulce.",
    defaultRange: ["10-01", "10-31"],
  },
  navidad: {
    slug: "navidad",
    name: "Navidad",
    ambientIcon: "Snowflake",
    field: "#042A2B",
    fieldLip: "#021A1B",
    accent: "#E85A4F",
    accentLip: "#B53D33",
    onAccent: "#2A0A07",
    defaultHeadline: "Navidad con toda la familia",
    defaultMessage: "Regalos para quien te recibe en la puerta moviendo la cola.",
    defaultRange: ["12-01", "12-25"],
  },
  "ano-nuevo": {
    slug: "ano-nuevo",
    name: "Año Nuevo",
    ambientIcon: "Sparkle",
    field: "#073F40",
    fieldLip: "#042A2B",
    accent: "#FECA0C",
    accentLip: "#C99D00",
    onAccent: "#073F40",
    defaultHeadline: "Año nuevo, paseos nuevos",
    defaultMessage: "Sin pólvora, por favor: todo para una noche tranquila en casa.",
    defaultRange: ["12-26", "01-06"],
  },
  "amor-amistad": {
    slug: "amor-amistad",
    name: "Amor y Amistad",
    ambientIcon: "Heart",
    field: "#073F40",
    fieldLip: "#042A2B",
    accent: "#F2789F",
    accentLip: "#C9547A",
    onAccent: "#3A0E1D",
    defaultHeadline: "Tu mejor amigo tiene cuatro patas",
    defaultMessage: "Detalles para celebrar a quien te quiere sin condiciones.",
    defaultRange: ["09-01", "09-30"],
  },
};

/** Fecha de hoy en Bogotá (UTC-5, sin horario de verano) como AAAA-MM-DD. */
export function todayInBogota(now = new Date()): string {
  return new Date(now.getTime() - 5 * 3600_000).toISOString().slice(0, 10);
}

export function isSeasonLive(e: SeasonEvent, today = todayInBogota()): boolean {
  if (e.forceActive) return true;
  return e.enabled && e.startsAt <= today && today <= e.endsAt;
}

/** El evento vivo: forzado primero, luego el que empezó más recientemente. */
export function pickLiveSeason(events: SeasonEvent[], today = todayInBogota()): SeasonEvent | null {
  const live = events.filter((e) => isSeasonLive(e, today));
  live.sort(
    (a, b) => Number(b.forceActive) - Number(a.forceActive) || b.startsAt.localeCompare(a.startsAt),
  );
  return live[0] ?? null;
}
