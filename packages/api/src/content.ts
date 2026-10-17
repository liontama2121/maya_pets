import { z } from "zod";
import { featuredProducts, productCardsByIds, type ProductCardData } from "./catalog";
import { CONTENT_KEYS, type ContentKey } from "./db/schema";
import { todayInBogota } from "./seasons";

/**
 * Contenido editable del sitio (módulo "Contenido del sitio" del panel).
 * Cada bloque se valida con su esquema; si una fila de D1 no existe o no pasa la validación,
 * se usa el contenido inicial de aquí abajo, que son los textos con los que salió el sitio.
 */

const text = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres`);
const required = (max: number, msg = "Este campo no puede quedar vacío") => text(max).min(1, msg);

/** Rutas propias (/tienda?...) o enlaces https. */
const href = z
  .string()
  .trim()
  .max(300)
  .regex(/^(\/(?!\/)[^\s]*|https:\/\/[^\s]+)$/, "Usa una dirección del sitio (empieza por /) o un enlace https://");

/** Imágenes del propio sitio: ilustraciones de /brand o fotos subidas a /media. Vacío = sin imagen. */
const image = z.object({
  src: z
    .string()
    .trim()
    .max(200)
    .regex(/^$|^\/(brand|media)\/[A-Za-z0-9/_.-]+$/, "Imagen no válida"),
  alt: text(160).default(""),
});
export type ContentImage = z.infer<typeof image>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD");
const productIds = z.array(z.number().int().positive()).max(8, "Máximo 8 productos").default([]);

export const heroContent = z.object({
  title: required(60),
  text: required(420),
  ctaLabel: required(30),
  ctaHref: href,
  storyLabel: required(40),
  storyHref: href,
  imageLeft: image,
  imageRight: image,
});

export const bannerContent = z
  .object({
    enabled: z.boolean(),
    title: required(70),
    subtitle: text(200).default(""),
    ctaLabel: required(30),
    ctaHref: href,
    image,
    startsAt: isoDate,
    endsAt: isoDate,
    showPrices: z.boolean().default(true),
    productIds,
  })
  .refine((v) => v.endsAt >= v.startsAt, {
    message: "La fecha final debe ser igual o posterior a la inicial",
    path: ["endsAt"],
  });

const speciesCard = z.object({
  title: required(30),
  text: required(140),
  linkLabel: required(40),
  image,
});

export const especiesContent = z.object({
  title: required(60),
  dog: speciesCard,
  cat: speciesCard,
});

export const destacadosContent = z.object({
  title: required(60),
  pinnedIds: productIds,
});

export const footerContent = z.object({
  tagline: required(200),
  contactNote: required(200),
});

export const nosotrosContent = z.object({
  title: required(80),
  /** Párrafos separados por una línea en blanco. **así** se escribe en negrita. */
  body: required(4000),
  visitTitle: required(60),
  visitText: required(240),
});

export const CONTENT_SCHEMAS = {
  hero: heroContent,
  banner: bannerContent,
  especies: especiesContent,
  destacados: destacadosContent,
  footer: footerContent,
  nosotros: nosotrosContent,
} satisfies Record<ContentKey, z.ZodTypeAny>;

export interface SiteContent {
  hero: z.infer<typeof heroContent>;
  banner: z.infer<typeof bannerContent>;
  especies: z.infer<typeof especiesContent>;
  destacados: z.infer<typeof destacadosContent>;
  footer: z.infer<typeof footerContent>;
  nosotros: z.infer<typeof nosotrosContent>;
}

/** Contenido inicial: los textos actuales del sitio. */
export const DEFAULT_CONTENT: SiteContent = {
  hero: {
    title: "Hola, soy Maya",
    text: "Soy una perrita imaginaria. Nací en la imaginación de la hija de los fundadores: nadie más me veía, pero todos sabían cuándo había pasado por ahí. Así nació la tienda, para que cada mascota tenga lo que necesita y cada perrito, una familia.",
    ctaLabel: "Ver la tienda",
    ctaHref: "/tienda",
    storyLabel: "Conoce mi historia",
    storyHref: "/nosotros",
    imageLeft: { src: "/brand/afiche/perro.svg", alt: "Perrito del afiche de MAYA Pets" },
    imageRight: { src: "/brand/afiche/gato.svg", alt: "Gatico del afiche de MAYA Pets" },
  },
  banner: {
    enabled: false,
    title: "Disfraces, dulces y cero sustos",
    subtitle: "Disfraces cómodos y premios para que tu peludo también pida dulce.",
    ctaLabel: "Ver productos",
    ctaHref: "/tienda",
    image: { src: "", alt: "" },
    startsAt: "2026-10-01",
    endsAt: "2026-10-31",
    showPrices: true,
    productIds: [],
  },
  especies: {
    title: "¿Quién te espera en casa?",
    dog: {
      title: "Perros",
      text: "Del cachorro inquieto al abuelo que ya solo quiere sofá.",
      linkLabel: "Ver todo para perros",
      image: { src: "/brand/afiche/perro.svg", alt: "" },
    },
    cat: {
      title: "Gatos",
      text: "Para los que mandan en la casa y lo saben.",
      linkLabel: "Ver todo para gatos",
      image: { src: "/brand/afiche/gato.svg", alt: "" },
    },
  },
  destacados: {
    title: "Lo que más se llevan",
    pinnedIds: [],
  },
  footer: {
    tagline: "Tienda para perros y gatos en Bogotá, con una perrita imaginaria que guía a toda la familia.",
    contactNote: "Respondemos por WhatsApp. Dirección y horario de la tienda: muy pronto.",
  },
  nosotros: {
    title: "La perrita que nadie más podía ver",
    body: [
      "En casa había una perrita llamada Maya. Comía en un plato que nadie servía, dormía al pie de una cama y salía a pasear todas las tardes. Solo la veía la hija de los fundadores, pero toda la familia sabía cuándo Maya había pasado por ahí.",
      "De esa perrita imaginaria salió una idea muy real: una tienda donde cada mascota tenga lo que necesita, atendida como se atiende a alguien de la familia. Por eso nuestro lema es **“Mi mascota, mi familia”**.",
      "Maya sigue aquí. No la vas a ver, pero vas a encontrar sus huellas por toda la tienda. Y cuando busques un perrito para adoptar, ella te acompaña a encontrar el que encaja con tu casa.",
    ].join("\n\n"),
    visitTitle: "Visítanos o escríbenos",
    visitText: "Estamos en Bogotá. Muy pronto publicamos la dirección y el horario de la tienda.",
  },
};

export function parseBlock<K extends ContentKey>(key: K, raw: unknown): SiteContent[K] | null {
  const r = CONTENT_SCHEMAS[key].safeParse(raw);
  return r.success ? (r.data as SiteContent[K]) : null;
}

/**
 * Todo el contenido en una sola consulta. `draft` = vista previa del panel (borradores).
 * Sin caché en el módulo: cada request lee D1 (ver CLAUDE.md, nada de promesas compartidas).
 */
export async function loadContent(db: D1Database, draft = false): Promise<SiteContent> {
  const { results } = await db
    .prepare(`SELECT key, ${draft ? "draft" : "published"} AS data FROM content_blocks`)
    .all<{ key: ContentKey; data: string }>();
  const content: SiteContent = structuredClone(DEFAULT_CONTENT);
  for (const row of results) {
    if (!(CONTENT_KEYS as readonly string[]).includes(row.key)) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(row.data);
    } catch {
      continue;
    }
    const parsed = parseBlock(row.key, raw);
    if (parsed) (content as Record<ContentKey, unknown>)[row.key] = parsed;
  }
  return content;
}

export function isBannerLive(b: SiteContent["banner"], today = todayInBogota()): boolean {
  return b.enabled && b.startsAt <= today && today <= b.endsAt;
}

/** Productos del banner, en el orden en que MAYA los eligió. */
export function bannerProducts(db: D1Database, b: SiteContent["banner"]) {
  return productCardsByIds(db, b.productIds);
}

export const BESTSELLER_DAYS = 30;

/**
 * Lo que más se llevan: primero los fijados por MAYA, luego lo más vendido de los últimos 30 días
 * (ventas online y en tienda, según los movimientos de inventario) y, si falta, los destacados.
 */
export async function bestSellers(db: D1Database, pinnedIds: number[], limit = 8): Promise<ProductCardData[]> {
  const since = new Date(Date.now() - BESTSELLER_DAYS * 86_400_000).toISOString();
  const { results } = await db
    .prepare(
      `SELECT v.product_id AS id, SUM(-m.delta) AS sold
       FROM stock_movements m JOIN product_variants v ON v.id = m.variant_id
       WHERE m.reason IN ('VENTA_ONLINE', 'VENTA_POS') AND m.created_at >= ?
       GROUP BY v.product_id HAVING sold > 0
       ORDER BY sold DESC LIMIT ?`,
    )
    .bind(since, limit * 2)
    .all<{ id: number; sold: number }>();

  const ids = [...new Set([...pinnedIds, ...results.map((r) => r.id)])];
  const ranked = (await productCardsByIds(db, ids)).slice(0, limit);
  if (ranked.length >= limit) return ranked;

  const taken = new Set(ranked.map((p) => p.id));
  const fill = (await featuredProducts(db, limit + taken.size)).filter((p) => !taken.has(p.id));
  return [...ranked, ...fill].slice(0, limit);
}

/** Texto de Nosotros → párrafos con **negritas**, sin HTML del usuario. */
export function paragraphs(body: string): { text: string; bold: boolean }[][] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean)
    .map((p) => p.split(/\*\*(.+?)\*\*/g).map((part, i) => ({ text: part, bold: i % 2 === 1 })).filter((s) => s.text));
}
