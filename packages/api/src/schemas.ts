import { z } from "zod";
import { SEASON_SLUGS, SPECIES, STAFF_ROLES, STOCK_REASONS } from "./db/schema";

/** Esquemas compartidos entre API (validación) y formularios del panel. */

const text = (max: number) => z.string().trim().max(max);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa el formato AAAA-MM-DD");
const pesos = z.coerce
  .number({ invalid_type_error: "Escribe un número" })
  .int("Sin decimales")
  .min(0, "No puede ser negativo")
  .max(50_000_000, "Revisa el valor");

export const categoryInput = z.object({
  name: text(60).min(2, "Escribe un nombre de al menos 2 letras"),
  description: text(280).default(""),
  species: z.enum(SPECIES).default("ambos"),
  imageKey: z.string().max(200).nullable().default(null),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  active: z.boolean().default(true),
});
export type CategoryInput = z.infer<typeof categoryInput>;

export const variantInput = z
  .object({
    /** Ausente = variante nueva. */
    id: z.number().int().positive().optional(),
    name: text(60).min(1, "Ponle un nombre a la presentación (p. ej. 2 kg o Talla M)"),
    sku: text(40).optional(),
    barcode: text(40).nullable().optional(),
    price: pesos.refine((v) => v > 0, "El precio debe ser mayor que cero"),
    compareAtPrice: pesos.nullable().optional(),
    /** Stock que Luisa ve en el formulario al guardar. */
    stock: z.coerce.number().int().min(0, "El stock no puede ser negativo").max(100_000),
    /** Stock que tenía el formulario al abrirse: la diferencia se registra como movimiento. */
    stockBase: z.coerce.number().int().min(0).optional(),
    minStock: z.coerce.number().int().min(0).max(10_000).default(3),
  })
  .refine((v) => v.compareAtPrice == null || v.compareAtPrice > v.price, {
    message: "El precio anterior debe ser mayor que el precio actual",
    path: ["compareAtPrice"],
  });
export type VariantInput = z.infer<typeof variantInput>;

export const imageInput = z.object({
  key: z.string().min(1).max(200),
  alt: text(160).default(""),
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
});

export const productInput = z.object({
  name: text(90).min(2, "Escribe el nombre del producto"),
  description: text(4000).default(""),
  categoryId: z.coerce.number().int().positive("Elige una categoría"),
  species: z.enum(SPECIES).default("ambos"),
  brand: text(60).default(""),
  variantLabel: text(30).default(""),
  featured: z.boolean().default(false),
  active: z.boolean().default(true),
  variants: z.array(variantInput).min(1, "Agrega al menos una presentación con precio").max(30),
  images: z.array(imageInput).max(8, "Máximo 8 fotos por producto").default([]),
});
export type ProductInput = z.infer<typeof productInput>;

export const stockAdjustInput = z.object({
  delta: z.coerce
    .number()
    .int()
    .refine((v) => v !== 0, "La cantidad no puede ser cero"),
  reason: z.enum(STOCK_REASONS).refine((r) => r === "ENTRADA" || r === "AJUSTE" || r === "DEVOLUCION", {
    message: "Motivo no permitido",
  }),
  note: text(200).default(""),
});

export const seasonInput = z
  .object({
    enabled: z.boolean(),
    forceActive: z.boolean().default(false),
    startsAt: isoDate,
    endsAt: isoDate,
    headline: text(70).min(3, "Escribe un titular"),
    message: text(200).default(""),
    ctaLabel: text(30).min(2).default("Ver la colección"),
    categorySlug: z.string().max(80).nullable().default(null),
    discountNote: text(60).default(""),
    ambient: z.boolean().default(true),
    featuredProductIds: z.array(z.number().int().positive()).max(8).default([]),
  })
  .refine((v) => v.endsAt >= v.startsAt, {
    message: "La fecha final debe ser igual o posterior a la inicial",
    path: ["endsAt"],
  });
export type SeasonInput = z.infer<typeof seasonInput>;

export const staffInput = z.object({
  email: z.string().trim().toLowerCase().email("Correo no válido"),
  name: text(60).min(2),
  roles: z.array(z.enum(STAFF_ROLES)).min(1, "Elige al menos un rol"),
  active: z.boolean().default(true),
});

export const catalogQuery = z.object({
  especie: z.enum(["perro", "gato"]).optional(),
  categoria: z.string().max(80).optional(),
  marca: z.string().max(60).optional(),
  min: z.coerce.number().int().min(0).optional(),
  max: z.coerce.number().int().min(0).optional(),
  q: z.string().trim().max(60).optional(),
  orden: z.enum(["destacados", "precio-asc", "precio-desc", "nuevos"]).default("destacados"),
  pagina: z.coerce.number().int().min(1).max(500).default(1),
});
export type CatalogQuery = z.infer<typeof catalogQuery>;

export { SEASON_SLUGS, SPECIES, STAFF_ROLES };
