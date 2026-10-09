import { z } from "zod";
import { DOG_ENERGY, DOG_SIZES, DOG_STATUS, TRI } from "./db/schema";
import { mediaUrl } from "./storage/driver";

/**
 * Adopción con Maya: perritos con fotos y características, guía de compatibilidad
 * y solicitudes con autorización de datos (Ley 1581 de 2012).
 */

export type DogSize = (typeof DOG_SIZES)[number];
export type DogEnergy = (typeof DOG_ENERGY)[number];
export type DogStatus = (typeof DOG_STATUS)[number];
export type Tri = (typeof TRI)[number];

export const SIZE_LABEL: Record<DogSize, string> = { pequeno: "Pequeño", mediano: "Mediano", grande: "Grande" };
export const ENERGY_LABEL: Record<DogEnergy, string> = { baja: "Tranquilo", media: "Juguetón", alta: "Muy activo" };
export const STATUS_LABEL: Record<DogStatus, string> = { disponible: "Disponible", en_proceso: "En proceso", adoptado: "Adoptado" };

export function ageLabel(months: number) {
  if (months < 12) return `${months} ${months === 1 ? "mes" : "meses"}`;
  const y = Math.floor(months / 12);
  return `${y} ${y === 1 ? "año" : "años"}`;
}

export type AgeGroup = "cachorro" | "joven" | "adulto" | "senior";
export const AGE_GROUPS: Record<AgeGroup, { label: string; min: number; max: number }> = {
  cachorro: { label: "Cachorro (menos de 1 año)", min: 0, max: 11 },
  joven: { label: "Joven (1 a 3 años)", min: 12, max: 35 },
  adulto: { label: "Adulto (3 a 8 años)", min: 36, max: 95 },
  senior: { label: "Abuelito (8 años o más)", min: 96, max: 999 },
};

export interface DogCardData {
  id: number;
  slug: string;
  name: string;
  sex: "macho" | "hembra";
  ageMonths: number;
  size: DogSize;
  energy: DogEnergy;
  breed: string;
  temperament: string;
  goodWithKids: Tri;
  goodWithDogs: Tri;
  goodWithCats: Tri;
  sterilized: boolean;
  vaccinated: boolean;
  status: DogStatus;
  photo: { url: string; alt: string } | null;
}

export interface DogDetail extends DogCardData {
  weightKg: number | null;
  dewormed: boolean;
  story: string;
  specialNeeds: string;
  photos: { url: string; alt: string; width: number | null; height: number | null }[];
}

type Row = Record<string, unknown>;

export const toDogCard = (r: Row): DogCardData => {
  const key = r.photo_key as string | null;
  return {
    id: r.id as number,
    slug: r.slug as string,
    name: r.name as string,
    sex: r.sex as "macho" | "hembra",
    ageMonths: r.age_months as number,
    size: r.size as DogSize,
    energy: r.energy as DogEnergy,
    breed: r.breed as string,
    temperament: r.temperament as string,
    goodWithKids: r.good_with_kids as Tri,
    goodWithDogs: r.good_with_dogs as Tri,
    goodWithCats: r.good_with_cats as Tri,
    sterilized: r.sterilized === 1,
    vaccinated: r.vaccinated === 1,
    status: r.status as DogStatus,
    photo: key ? { url: mediaUrl(key)!, alt: (r.photo_alt as string) || `Foto de ${r.name}` } : null,
  };
};

const CARD_SELECT = `SELECT d.*,
  (SELECT p.key FROM dog_photos p WHERE p.dog_id = d.id ORDER BY p.sort_order, p.id LIMIT 1) AS photo_key,
  (SELECT p.alt FROM dog_photos p WHERE p.dog_id = d.id ORDER BY p.sort_order, p.id LIMIT 1) AS photo_alt
  FROM dogs d`;

/** Perritos visibles en la página: disponibles y en proceso (los adoptados salen en "Ya tienen hogar"). */
export async function listDogs(db: D1Database, f: { size?: string; age?: string; energy?: string } = {}) {
  const where = ["d.status IN ('disponible', 'en_proceso')"];
  const binds: unknown[] = [];
  if (f.size && (DOG_SIZES as readonly string[]).includes(f.size)) {
    where.push("d.size = ?");
    binds.push(f.size);
  }
  if (f.energy && (DOG_ENERGY as readonly string[]).includes(f.energy)) {
    where.push("d.energy = ?");
    binds.push(f.energy);
  }
  const group = f.age ? AGE_GROUPS[f.age as AgeGroup] : undefined;
  if (group) {
    where.push("d.age_months BETWEEN ? AND ?");
    binds.push(group.min, group.max);
  }
  const { results } = await db
    .prepare(`${CARD_SELECT} WHERE ${where.join(" AND ")} ORDER BY d.status = 'disponible' DESC, d.featured DESC, d.created_at DESC`)
    .bind(...binds)
    .all<Row>();
  return results.map(toDogCard);
}

export async function adoptedDogs(db: D1Database, limit = 6) {
  const { results } = await db
    .prepare(`${CARD_SELECT} WHERE d.status = 'adoptado' ORDER BY d.adopted_at DESC LIMIT ?`)
    .bind(limit)
    .all<Row>();
  return results.map(toDogCard);
}

export async function dogBySlug(db: D1Database, slug: string): Promise<DogDetail | null> {
  const r = await db.prepare(`${CARD_SELECT} WHERE d.slug = ?`).bind(slug).first<Row>();
  if (!r) return null;
  const { results } = await db
    .prepare(`SELECT key, alt, width, height FROM dog_photos WHERE dog_id = ? ORDER BY sort_order, id`)
    .bind(r.id)
    .all<{ key: string; alt: string; width: number | null; height: number | null }>();
  return {
    ...toDogCard(r),
    weightKg: (r.weight_kg as number | null) ?? null,
    dewormed: r.dewormed === 1,
    story: r.story as string,
    specialNeeds: r.special_needs as string,
    photos: results.map((p) => ({ url: mediaUrl(p.key)!, alt: p.alt || `Foto de ${r.name}`, width: p.width, height: p.height })),
  };
}

/* ----------------------------- Guía de Maya ----------------------------- */

export interface GuideAnswers {
  hogar: "apartamento" | "apartamento_grande" | "casa_patio";
  mascotas: "ninguna" | "perros" | "gatos" | "ambos";
  tiempo: "poco" | "medio" | "mucho";
  ritmo: "tranquilo" | "paseos" | "deporte";
  ninos?: boolean;
}

/**
 * Compatibilidad de 0 a 100 entre un hogar y un perrito. Reglas simples y explicables
 * (no es un algoritmo opaco): espacio, tiempo, energía y convivencia.
 */
export function matchScore(dog: DogCardData, a: GuideAnswers): { score: number; reasons: string[] } {
  let score = 60;
  const reasons: string[] = [];

  // Espacio.
  if (a.hogar === "apartamento") {
    if (dog.size === "pequeno") (score += 15), reasons.push("cabe perfecto en apartamento");
    if (dog.size === "grande") score -= 25;
  } else if (a.hogar === "apartamento_grande") {
    if (dog.size !== "grande") score += 8;
    else score -= 8;
  } else {
    if (dog.size === "grande") (score += 10), reasons.push("va a disfrutar el patio");
    else score += 5;
  }

  // Energía frente al ritmo de la familia.
  const energy = { baja: 0, media: 1, alta: 2 }[dog.energy];
  const rhythm = { tranquilo: 0, paseos: 1, deporte: 2 }[a.ritmo];
  const gap = Math.abs(energy - rhythm);
  if (gap === 0) (score += 18), reasons.push(`tiene tu mismo ritmo (${ENERGY_LABEL[dog.energy].toLowerCase()})`);
  else if (gap === 1) score += 5;
  else score -= 20;

  // Tiempo en casa.
  if (a.tiempo === "poco") {
    if (dog.ageMonths < 12) score -= 18;
    if (dog.energy === "alta") score -= 10;
    if (dog.energy === "baja" && dog.ageMonths >= 36) (score += 10), reasons.push("lleva bien estar solo un rato");
  } else if (a.tiempo === "mucho" && dog.ageMonths < 12) {
    (score += 10), reasons.push("un cachorro necesita compañía y tú la tienes");
  }

  // Convivencia (sus razones van primero: es lo que más pesa para la familia).
  const withDogs = a.mascotas === "perros" || a.mascotas === "ambos";
  const withCats = a.mascotas === "gatos" || a.mascotas === "ambos";
  if (withDogs) {
    if (dog.goodWithDogs === "si") (score += 10), reasons.unshift("se lleva bien con otros perros");
    if (dog.goodWithDogs === "no") score -= 40;
  }
  if (withCats) {
    if (dog.goodWithCats === "si") (score += 10), reasons.unshift("convive con gatos");
    if (dog.goodWithCats === "no") score -= 40;
  }
  if (a.ninos) {
    if (dog.goodWithKids === "si") (score += 8), reasons.unshift("le encantan los niños");
    if (dog.goodWithKids === "no") score -= 35;
  }

  if (dog.status !== "disponible") score -= 15;
  return { score: Math.max(0, Math.min(100, score)), reasons: reasons.slice(0, 3) };
}

/* ------------------------------ Validaciones ------------------------------ */

const text = (max: number) => z.string().trim().max(max);

export const dogInput = z.object({
  name: text(40).min(2, "Escribe el nombre"),
  sex: z.enum(["macho", "hembra"]),
  ageMonths: z.coerce.number({ invalid_type_error: "Escribe la edad" }).int().min(0, "Edad inválida").max(300, "Edad inválida"),
  size: z.enum(DOG_SIZES),
  weightKg: z.coerce.number().int().min(0).max(120).nullable().default(null),
  breed: text(60).default("Criollo"),
  energy: z.enum(DOG_ENERGY),
  temperament: text(160).default(""),
  goodWithKids: z.enum(TRI),
  goodWithDogs: z.enum(TRI),
  goodWithCats: z.enum(TRI),
  sterilized: z.boolean(),
  vaccinated: z.boolean(),
  dewormed: z.boolean(),
  story: text(3000).default(""),
  specialNeeds: text(600).default(""),
  status: z.enum(DOG_STATUS),
  featured: z.boolean().default(false),
  photos: z
    .array(
      z.object({
        key: z.string().regex(/^perritos\/[0-9a-f-]{36}\.(webp|jpg|png|avif)$/, "Foto inválida"),
        alt: text(160).default(""),
        width: z.number().int().positive().nullable().optional(),
        height: z.number().int().positive().nullable().optional(),
      }),
    )
    .max(8, "Máximo 8 fotos")
    .default([]),
});
export type DogInput = z.infer<typeof dogInput>;

export const requestInput = z.object({
  dogId: z.number().int().positive().nullable(),
  fullName: text(80).min(3, "Escribe tu nombre completo"),
  phone: text(30).refine((v) => v.replace(/\D/g, "").length >= 7, "Escribe un celular válido"),
  email: z.union([z.literal(""), z.string().trim().email("Correo no válido").max(120)]).default(""),
  neighborhood: text(80).min(2, "Escribe tu barrio o municipio"),
  homeType: z.enum(["apartamento", "casa", "casa_patio", "finca"]),
  hoursAlone: z.coerce.number().int().min(0).max(24),
  otherPets: text(200).default(""),
  hasKids: z.boolean(),
  experience: text(500).default(""),
  message: text(1000).default(""),
  consent: z.literal(true, { errorMap: () => ({ message: "Necesitamos tu autorización para tratar tus datos" }) }),
  /** Trampa para robots: debe llegar vacío. */
  website: z.string().max(0).optional(),
});
