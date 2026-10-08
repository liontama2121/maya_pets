import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, inArray, like, ne, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  categories,
  productImages,
  products,
  productVariants,
  stockMovements,
} from "../db/schema";
import type { AppEnv } from "../env";
import { slugify, uniqueSlug } from "../lib/slug";
import { requireRole } from "../middleware/auth";
import { categoryInput, productInput, stockAdjustInput, type ProductInput } from "../schemas";
import { mediaUrl } from "../storage/driver";
import { z } from "zod";

const onFail = (result: { success: boolean; error?: z.ZodError }, c: { json: (b: unknown, s: 400) => Response }) => {
  if (!result.success) {
    return c.json({ error: "Revisa los campos marcados.", fields: result.error!.flatten().fieldErrors }, 400);
  }
};

export const adminCatalog = new Hono<AppEnv>();

/* ---------------------------- Categorías ---------------------------- */

adminCatalog.get("/categories", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS product_count
     FROM categories c ORDER BY c.sort_order, c.name`,
  ).all<Record<string, unknown>>();
  return c.json(
    rows.results.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      species: r.species,
      imageKey: r.image_key,
      imageUrl: mediaUrl(r.image_key as string | null),
      sortOrder: r.sort_order,
      active: r.active === 1,
      productCount: r.product_count,
    })),
  );
});

adminCatalog.post("/categories", requireRole("admin"), zValidator("json", categoryInput, onFail), async (c) => {
  const input = c.req.valid("json");
  const db = c.get("db");
  const slug = await uniqueSlug(input.name, async (s) =>
    Boolean(await db.query.categories.findFirst({ where: eq(categories.slug, s), columns: { id: true } })),
  );
  const [row] = await db.insert(categories).values({ ...input, slug }).returning();
  return c.json(row, 201);
});

adminCatalog.put(
  "/categories/:id{[0-9]+}",
  requireRole("admin"),
  zValidator("json", categoryInput, onFail),
  async (c) => {
    const id = Number(c.req.param("id"));
    const input = c.req.valid("json");
    const db = c.get("db");
    const current = await db.query.categories.findFirst({ where: eq(categories.id, id) });
    if (!current) throw new HTTPException(404, { message: "Esa categoría ya no existe." });

    // El slug cambia con el nombre, pero solo si queda libre (las URLs viejas dejan de servir).
    let slug = current.slug;
    if (slugify(input.name) !== slugify(current.name)) {
      slug = await uniqueSlug(input.name, async (s) =>
        Boolean(
          await db.query.categories.findFirst({
            where: and(eq(categories.slug, s), ne(categories.id, id)),
            columns: { id: true },
          }),
        ),
      );
    }
    const [row] = await db
      .update(categories)
      .set({ ...input, slug, updatedAt: new Date().toISOString() })
      .where(eq(categories.id, id))
      .returning();
    return c.json(row);
  },
);

adminCatalog.delete("/categories/:id{[0-9]+}", requireRole("admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const db = c.get("db");
  const inUse = await db.query.products.findFirst({ where: eq(products.categoryId, id), columns: { id: true } });
  if (inUse) {
    throw new HTTPException(409, {
      message: "Esta categoría tiene productos. Muévelos a otra categoría o desactívala en lugar de borrarla.",
    });
  }
  await db.delete(categories).where(eq(categories.id, id));
  return c.body(null, 204);
});

/* ----------------------------- Productos ----------------------------- */

const productListQuery = z.object({
  q: z.string().trim().max(60).optional(),
  categoria: z.coerce.number().int().positive().optional(),
  estado: z.enum(["activos", "archivados", "stock-bajo", "todos"]).default("activos"),
});

adminCatalog.get("/products", zValidator("query", productListQuery), async (c) => {
  const { q, categoria, estado } = c.req.valid("query");
  const where: string[] = [];
  const binds: unknown[] = [];
  if (estado === "activos") where.push("p.active = 1");
  if (estado === "archivados") where.push("p.active = 0");
  if (categoria) {
    where.push("p.category_id = ?");
    binds.push(categoria);
  }
  if (q) {
    const term = `%${q.replace(/[%_]/g, "")}%`;
    where.push(
      "(p.name LIKE ? OR p.brand LIKE ? OR EXISTS (SELECT 1 FROM product_variants x WHERE x.product_id = p.id AND (x.sku LIKE ? OR x.barcode = ?)))",
    );
    binds.push(term, term, term, q);
  }
  const having = estado === "stock-bajo" ? "HAVING SUM(CASE WHEN v.stock <= v.min_stock THEN 1 ELSE 0 END) > 0" : "";

  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.name, p.slug, p.brand, p.species, p.active, p.featured, p.updated_at,
            c.name AS category_name,
            MIN(v.price) AS price_from, MAX(v.price) AS price_to,
            COALESCE(SUM(v.stock), 0) AS stock,
            COUNT(v.id) AS variant_count,
            SUM(CASE WHEN v.stock <= v.min_stock THEN 1 ELSE 0 END) AS low_variants,
            (SELECT i.key FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.id LIMIT 1) AS image_key
     FROM products p
     JOIN categories c ON c.id = p.category_id
     LEFT JOIN product_variants v ON v.product_id = p.id AND v.active = 1
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     GROUP BY p.id ${having}
     ORDER BY p.updated_at DESC LIMIT 300`,
  )
    .bind(...binds)
    .all<Record<string, unknown>>();

  return c.json(
    results.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      brand: r.brand,
      species: r.species,
      active: r.active === 1,
      featured: r.featured === 1,
      categoryName: r.category_name,
      priceFrom: r.price_from,
      priceTo: r.price_to,
      stock: r.stock,
      variantCount: r.variant_count,
      lowVariants: r.low_variants ?? 0,
      imageUrl: mediaUrl(r.image_key as string | null),
      updatedAt: r.updated_at,
    })),
  );
});

async function loadProduct(c: { get: (k: "db") => AppEnv["Variables"]["db"] }, id: number) {
  const db = c.get("db");
  const product = await db.query.products.findFirst({ where: eq(products.id, id) });
  if (!product) return null;
  const [variants, images] = await Promise.all([
    db.query.productVariants.findMany({
      where: and(eq(productVariants.productId, id), eq(productVariants.active, true)),
      orderBy: [asc(productVariants.sortOrder), asc(productVariants.id)],
    }),
    db.query.productImages.findMany({
      where: eq(productImages.productId, id),
      orderBy: [asc(productImages.sortOrder), asc(productImages.id)],
    }),
  ]);
  return {
    ...product,
    variants,
    images: images.map((i) => ({ ...i, url: mediaUrl(i.key)! })),
  };
}

adminCatalog.get("/products/:id{[0-9]+}", async (c) => {
  const product = await loadProduct(c, Number(c.req.param("id")));
  if (!product) throw new HTTPException(404, { message: "Ese producto ya no existe." });
  return c.json(product);
});

/**
 * Guarda variantes con stock compartido. Nunca sobrescribe el stock:
 * aplica la diferencia que Luisa hizo en el formulario (stock - stockBase)
 * sobre el valor actual, así no se pierden ventas hechas mientras editaba.
 */
async function saveVariants(
  env: AppEnv["Bindings"],
  productId: number,
  variants: ProductInput["variants"],
  staff: AppEnv["Variables"]["staff"],
) {
  const DB = env.DB;
  const existing = await DB.prepare(`SELECT id, sku FROM product_variants WHERE product_id = ?`)
    .bind(productId)
    .all<{ id: number; sku: string }>();
  const existingIds = new Set(existing.results.map((v) => v.id));
  const keepIds = new Set(variants.filter((v) => v.id && existingIds.has(v.id)).map((v) => v.id!));

  // SKU único: si no viene, se genera.
  const usedSkus = new Set(
    (await DB.prepare(`SELECT sku FROM product_variants WHERE product_id != ?`).bind(productId).all<{ sku: string }>())
      .results.map((r) => r.sku.toUpperCase()),
  );
  for (const v of variants) {
    if (v.sku && usedSkus.has(v.sku.toUpperCase())) {
      throw new HTTPException(409, { message: `El código ${v.sku} ya lo usa otro producto.` });
    }
  }

  const stmts: D1PreparedStatement[] = [];
  const who = [staff.email, staff.name] as const;

  variants.forEach((v, index) => {
    const sku = (v.sku || `MAYA-${String(productId).padStart(3, "0")}-${index + 1}-${crypto.randomUUID().slice(0, 4)}`).toUpperCase();
    if (v.id && keepIds.has(v.id)) {
      const delta = v.stock - (v.stockBase ?? v.stock);
      stmts.push(
        DB.prepare(
          `UPDATE product_variants SET name = ?, sku = ?, barcode = ?, price = ?, compare_at_price = ?,
             min_stock = ?, sort_order = ?, active = 1, stock = MAX(0, stock + ?) WHERE id = ?`,
        ).bind(v.name, sku, v.barcode || null, v.price, v.compareAtPrice ?? null, v.minStock, index, delta, v.id),
      );
      if (delta !== 0) {
        stmts.push(
          DB.prepare(
            `INSERT INTO stock_movements (variant_id, delta, stock_after, reason, note, user_email, user_name)
             SELECT id, ?, stock, 'AJUSTE', 'Editado desde la ficha del producto', ?, ? FROM product_variants WHERE id = ?`,
          ).bind(delta, ...who, v.id),
        );
      }
    } else {
      stmts.push(
        DB.prepare(
          `INSERT INTO product_variants (product_id, name, sku, barcode, price, compare_at_price, stock, min_stock, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(productId, v.name, sku, v.barcode || null, v.price, v.compareAtPrice ?? null, v.stock, v.minStock, index),
      );
      stmts.push(
        DB.prepare(
          `INSERT INTO stock_movements (variant_id, delta, stock_after, reason, note, user_email, user_name)
           SELECT id, stock, stock, 'CREACION', 'Presentación creada', ?, ? FROM product_variants WHERE sku = ?`,
        ).bind(...who, sku),
      );
    }
  });

  // Variantes quitadas: se archivan (su historial de ventas se conserva).
  for (const old of existing.results) {
    if (!keepIds.has(old.id)) {
      stmts.push(DB.prepare(`UPDATE product_variants SET active = 0 WHERE id = ?`).bind(old.id));
    }
  }
  return stmts;
}

function imageStatements(DB: D1Database, productId: number, images: ProductInput["images"]) {
  return [
    DB.prepare(`DELETE FROM product_images WHERE product_id = ?`).bind(productId),
    ...images.map((img, i) =>
      DB.prepare(
        `INSERT INTO product_images (product_id, key, alt, width, height, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(productId, img.key, img.alt, img.width ?? null, img.height ?? null, i),
    ),
  ];
}

adminCatalog.post("/products", requireRole("admin"), zValidator("json", productInput, onFail), async (c) => {
  const input = c.req.valid("json");
  const db = c.get("db");
  const category = await db.query.categories.findFirst({ where: eq(categories.id, input.categoryId) });
  if (!category) throw new HTTPException(400, { message: "Elige una categoría que exista." });

  const slug = await uniqueSlug(input.name, async (s) =>
    Boolean(await db.query.products.findFirst({ where: eq(products.slug, s), columns: { id: true } })),
  );
  const { variants, images, ...fields } = input;
  const [created] = await db.insert(products).values({ ...fields, slug }).returning({ id: products.id });
  const id = created!.id;

  try {
    const stmts = [
      ...(await saveVariants(c.env, id, variants, c.get("staff"))),
      ...imageStatements(c.env.DB, id, images),
    ];
    await c.env.DB.batch(stmts);
  } catch (err) {
    // Sin variantes el producto queda inservible: se revierte.
    await db.delete(products).where(eq(products.id, id));
    throw err;
  }
  return c.json(await loadProduct(c, id), 201);
});

adminCatalog.put(
  "/products/:id{[0-9]+}",
  requireRole("admin"),
  zValidator("json", productInput, onFail),
  async (c) => {
    const id = Number(c.req.param("id"));
    const input = c.req.valid("json");
    const db = c.get("db");
    const current = await db.query.products.findFirst({ where: eq(products.id, id) });
    if (!current) throw new HTTPException(404, { message: "Ese producto ya no existe." });

    let slug = current.slug;
    if (slugify(input.name) !== slugify(current.name)) {
      slug = await uniqueSlug(input.name, async (s) =>
        Boolean(
          await db.query.products.findFirst({
            where: and(eq(products.slug, s), ne(products.id, id)),
            columns: { id: true },
          }),
        ),
      );
    }

    const { variants, images, ...fields } = input;
    const DB = c.env.DB;
    await DB.batch([
      DB.prepare(
        `UPDATE products SET name = ?, slug = ?, description = ?, category_id = ?, species = ?, brand = ?,
           variant_label = ?, featured = ?, active = ?, updated_at = ? WHERE id = ?`,
      ).bind(
        fields.name,
        slug,
        fields.description,
        fields.categoryId,
        fields.species,
        fields.brand,
        fields.variantLabel,
        fields.featured ? 1 : 0,
        fields.active ? 1 : 0,
        new Date().toISOString(),
        id,
      ),
      ...(await saveVariants(c.env, id, variants, c.get("staff"))),
      ...imageStatements(DB, id, images),
    ]);
    return c.json(await loadProduct(c, id));
  },
);

/** Archivar (no borrar): las ventas pasadas siguen apuntando al producto. */
adminCatalog.post("/products/:id{[0-9]+}/archive", requireRole("admin"), async (c) => {
  const id = Number(c.req.param("id"));
  const active = c.req.query("restaurar") === "1";
  await c.get("db").update(products).set({ active, updatedAt: new Date().toISOString() }).where(eq(products.id, id));
  return c.json({ id, active });
});

/* ------------------------------- Stock ------------------------------- */

adminCatalog.post(
  "/variants/:id{[0-9]+}/stock",
  requireRole("admin"),
  zValidator("json", stockAdjustInput, onFail),
  async (c) => {
    const id = Number(c.req.param("id"));
    const { delta, reason, note } = c.req.valid("json");
    const staff = c.get("staff");
    const DB = c.env.DB;
    // Atómico: si la salida deja el stock negativo, ninguna fila cambia.
    const [update] = await DB.batch([
      DB.prepare(`UPDATE product_variants SET stock = stock + ? WHERE id = ? AND stock + ? >= 0`).bind(delta, id, delta),
      DB.prepare(
        `INSERT INTO stock_movements (variant_id, delta, stock_after, reason, note, user_email, user_name)
         SELECT id, ?, stock, ?, ?, ?, ? FROM product_variants WHERE id = ? AND changes() > 0`,
      ).bind(delta, reason, note, staff.email, staff.name, id),
    ]);
    if (!update!.meta.changes) {
      throw new HTTPException(409, { message: "No hay suficiente stock para descontar esa cantidad." });
    }
    const row = await DB.prepare(`SELECT stock FROM product_variants WHERE id = ?`).bind(id).first<{ stock: number }>();
    return c.json({ id, stock: row?.stock ?? 0 });
  },
);

adminCatalog.get("/variants/:id{[0-9]+}/movements", async (c) => {
  const id = Number(c.req.param("id"));
  const rows = await c
    .get("db")
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.variantId, id))
    .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
    .limit(100);
  return c.json(rows);
});

/** Búsqueda rápida de variantes (POS y selector de destacados). */
adminCatalog.get("/variants/search", async (c) => {
  const q = (c.req.query("q") ?? "").trim().slice(0, 60);
  if (!q) return c.json([]);
  const db = c.get("db");
  const term = `%${q}%`;
  const rows = await db
    .select({
      id: productVariants.id,
      productId: products.id,
      productName: products.name,
      name: productVariants.name,
      sku: productVariants.sku,
      barcode: productVariants.barcode,
      price: productVariants.price,
      stock: productVariants.stock,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(
      and(
        eq(productVariants.active, true),
        eq(products.active, true),
        or(eq(productVariants.barcode, q), like(productVariants.sku, term), like(products.name, term)),
      ),
    )
    .orderBy(sql`${productVariants.barcode} = ${q} DESC`, asc(products.name))
    .limit(20);
  return c.json(rows);
});

/** Para el selector de productos destacados de un evento. */
adminCatalog.get("/products/by-ids", async (c) => {
  const ids = (c.req.query("ids") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, 20);
  if (!ids.length) return c.json([]);
  const rows = await c
    .get("db")
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(inArray(products.id, ids));
  return c.json(rows);
});
