import type { CatalogQuery } from "./schemas";
import { mediaUrl } from "./storage/driver";
import { pickLiveSeason, SEASON_PRESETS, type SeasonPreset } from "./seasons";
import type { SeasonEvent, Species } from "./db/schema";

/**
 * Lecturas del catálogo público. SQL directo sobre D1: los agregados (precio desde,
 * stock total, primera foto) son más claros así que con el query builder.
 */

export const PAGE_SIZE = 24;

export interface ProductCardData {
  id: number;
  slug: string;
  name: string;
  brand: string;
  species: Species;
  categoryName: string;
  categorySlug: string;
  priceFrom: number;
  compareAt: number | null;
  variantCount: number;
  stock: number;
  lowStock: boolean;
  featured: boolean;
  image: { url: string; alt: string } | null;
}

interface CardRow {
  id: number;
  slug: string;
  name: string;
  brand: string;
  species: Species;
  featured: number;
  category_name: string;
  category_slug: string;
  price_from: number | null;
  compare_at: number | null;
  variant_count: number;
  stock: number | null;
  low_stock: number;
  image_key: string | null;
  image_alt: string | null;
}

const CARD_SELECT = `
  SELECT p.id, p.slug, p.name, p.brand, p.species, p.featured,
         c.name AS category_name, c.slug AS category_slug,
         MIN(v.price) AS price_from,
         (SELECT v2.compare_at_price FROM product_variants v2
            WHERE v2.product_id = p.id AND v2.active = 1
            ORDER BY v2.price ASC LIMIT 1) AS compare_at,
         COUNT(v.id) AS variant_count,
         SUM(v.stock) AS stock,
         MAX(CASE WHEN v.stock > 0 AND v.stock <= v.min_stock THEN 1 ELSE 0 END) AS low_stock,
         (SELECT i.key FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.id LIMIT 1) AS image_key,
         (SELECT i.alt FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.id LIMIT 1) AS image_alt
  FROM products p
  JOIN categories c ON c.id = p.category_id
  JOIN product_variants v ON v.product_id = p.id AND v.active = 1`;

function toCard(r: CardRow): ProductCardData {
  const url = mediaUrl(r.image_key);
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    brand: r.brand,
    species: r.species,
    categoryName: r.category_name,
    categorySlug: r.category_slug,
    priceFrom: r.price_from ?? 0,
    compareAt: r.compare_at,
    variantCount: r.variant_count,
    stock: r.stock ?? 0,
    lowStock: r.low_stock === 1,
    featured: r.featured === 1,
    image: url ? { url, alt: r.image_alt || r.name } : null,
  };
}

export async function listProducts(db: D1Database, q: CatalogQuery) {
  const where: string[] = ["p.active = 1", "c.active = 1"];
  const binds: unknown[] = [];

  if (q.especie) {
    where.push("(p.species = ? OR p.species = 'ambos')");
    binds.push(q.especie);
  }
  if (q.categoria) {
    where.push("c.slug = ?");
    binds.push(q.categoria);
  }
  if (q.marca) {
    where.push("p.brand = ?");
    binds.push(q.marca);
  }
  if (q.q) {
    where.push("(p.name LIKE ? OR p.brand LIKE ? OR c.name LIKE ?)");
    const like = `%${q.q.replace(/[%_]/g, "")}%`;
    binds.push(like, like, like);
  }

  const having: string[] = [];
  if (q.min != null) {
    having.push("MIN(v.price) >= ?");
    binds.push(q.min);
  }
  if (q.max != null) {
    having.push("MIN(v.price) <= ?");
    binds.push(q.max);
  }

  const order = {
    destacados: "p.featured DESC, (SUM(v.stock) > 0) DESC, p.id DESC",
    "precio-asc": "price_from ASC",
    "precio-desc": "price_from DESC",
    nuevos: "p.created_at DESC",
  }[q.orden];

  const base = `${CARD_SELECT}
    WHERE ${where.join(" AND ")}
    GROUP BY p.id
    ${having.length ? `HAVING ${having.join(" AND ")}` : ""}`;

  const offset = (q.pagina - 1) * PAGE_SIZE;
  const [rows, count] = await db.batch<CardRow | { total: number }>([
    db.prepare(`${base} ORDER BY ${order} LIMIT ${PAGE_SIZE} OFFSET ${offset}`).bind(...binds),
    db.prepare(`SELECT COUNT(*) AS total FROM (${base})`).bind(...binds),
  ]);

  const total = (count!.results[0] as { total: number } | undefined)?.total ?? 0;
  return {
    items: (rows!.results as CardRow[]).map(toCard),
    total,
    page: q.pagina,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function productCardsByIds(db: D1Database, ids: number[]) {
  if (!ids.length) return [];
  const marks = ids.map(() => "?").join(",");
  const { results } = await db
    .prepare(`${CARD_SELECT} WHERE p.active = 1 AND p.id IN (${marks}) GROUP BY p.id`)
    .bind(...ids)
    .all<CardRow>();
  const byId = new Map(results.map((r) => [r.id, toCard(r)]));
  return ids.map((id) => byId.get(id)).filter((p): p is ProductCardData => Boolean(p));
}

export async function featuredProducts(db: D1Database, limit = 8) {
  const { results } = await db
    .prepare(
      `${CARD_SELECT} WHERE p.active = 1 AND c.active = 1 GROUP BY p.id
       ORDER BY p.featured DESC, (SUM(v.stock) > 0) DESC, p.id DESC LIMIT ?`,
    )
    .bind(limit)
    .all<CardRow>();
  return results.map(toCard);
}

export interface CategorySummary {
  id: number;
  name: string;
  slug: string;
  description: string;
  species: Species;
  imageUrl: string | null;
  productCount: number;
}

export async function listCategories(db: D1Database): Promise<CategorySummary[]> {
  const { results } = await db
    .prepare(
      `SELECT c.id, c.name, c.slug, c.description, c.species, c.image_key,
              (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.active = 1) AS product_count
       FROM categories c WHERE c.active = 1 ORDER BY c.sort_order, c.name`,
    )
    .all<{
      id: number;
      name: string;
      slug: string;
      description: string;
      species: Species;
      image_key: string | null;
      product_count: number;
    }>();
  return results.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    description: r.description,
    species: r.species,
    imageUrl: mediaUrl(r.image_key),
    productCount: r.product_count,
  }));
}

export async function listBrands(db: D1Database): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT brand FROM products WHERE active = 1 AND brand != '' ORDER BY brand COLLATE NOCASE`,
    )
    .all<{ brand: string }>();
  return results.map((r) => r.brand);
}

export interface ProductDetail {
  id: number;
  slug: string;
  name: string;
  description: string;
  brand: string;
  species: Species;
  variantLabel: string;
  category: { name: string; slug: string };
  variants: {
    id: number;
    name: string;
    price: number;
    compareAtPrice: number | null;
    stock: number;
    lowStock: boolean;
  }[];
  images: { url: string; alt: string; width: number | null; height: number | null }[];
}

export async function productBySlug(db: D1Database, slug: string): Promise<ProductDetail | null> {
  const product = await db
    .prepare(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug
       FROM products p JOIN categories c ON c.id = p.category_id
       WHERE p.slug = ? AND p.active = 1 AND c.active = 1`,
    )
    .bind(slug)
    .first<{
      id: number;
      slug: string;
      name: string;
      description: string;
      brand: string;
      species: Species;
      variant_label: string;
      category_name: string;
      category_slug: string;
    }>();
  if (!product) return null;

  const [variants, images] = await db.batch([
    db
      .prepare(
        `SELECT id, name, price, compare_at_price, stock, min_stock FROM product_variants
         WHERE product_id = ? AND active = 1 ORDER BY sort_order, price`,
      )
      .bind(product.id),
    db
      .prepare(
        `SELECT key, alt, width, height FROM product_images WHERE product_id = ? ORDER BY sort_order, id`,
      )
      .bind(product.id),
  ]);

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    brand: product.brand,
    species: product.species,
    variantLabel: product.variant_label,
    category: { name: product.category_name, slug: product.category_slug },
    variants: (
      variants!.results as {
        id: number;
        name: string;
        price: number;
        compare_at_price: number | null;
        stock: number;
        min_stock: number;
      }[]
    ).map((v) => ({
      id: v.id,
      name: v.name,
      price: v.price,
      compareAtPrice: v.compare_at_price,
      stock: v.stock,
      lowStock: v.stock > 0 && v.stock <= v.min_stock,
    })),
    images: (
      images!.results as { key: string; alt: string; width: number | null; height: number | null }[]
    ).map((i) => ({
      url: mediaUrl(i.key)!,
      alt: i.alt || product.name,
      width: i.width,
      height: i.height,
    })),
  };
}

export interface LiveSeason {
  event: SeasonEvent;
  preset: SeasonPreset;
  products: ProductCardData[];
}

export async function liveSeason(db: D1Database): Promise<LiveSeason | null> {
  const { results } = await db.prepare(`SELECT * FROM season_events`).all<Record<string, unknown>>();
  const events = results.map(rowToSeason);
  const event = pickLiveSeason(events);
  if (!event) return null;
  return {
    event,
    preset: SEASON_PRESETS[event.slug],
    products: await productCardsByIds(db, event.featuredProductIds),
  };
}

export function rowToSeason(r: Record<string, unknown>): SeasonEvent {
  return {
    id: r.id as number,
    slug: r.slug as SeasonEvent["slug"],
    name: r.name as string,
    enabled: r.enabled === 1,
    forceActive: r.force_active === 1,
    startsAt: r.starts_at as string,
    endsAt: r.ends_at as string,
    headline: r.headline as string,
    message: r.message as string,
    ctaLabel: r.cta_label as string,
    categorySlug: (r.category_slug as string | null) ?? null,
    discountNote: r.discount_note as string,
    ambient: r.ambient === 1,
    featuredProductIds: JSON.parse((r.featured_product_ids as string) || "[]") as number[],
    updatedAt: r.updated_at as string,
    updatedBy: (r.updated_by as string | null) ?? null,
  };
}
