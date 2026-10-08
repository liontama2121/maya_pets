import type { ProductCardData } from "@maya/api";
import { PawPrint } from "@phosphor-icons/react/dist/csr/PawPrint";
import { formatCOP, SPECIES_LABEL } from "../../lib/format";

/**
 * Tarjeta de producto. La MISMA se usa en la tienda y en la vista previa del panel,
 * así Luisa ve exactamente cómo quedará su producto.
 */
export function ProductCard({
  product,
  priority = false,
  asLink = true,
}: {
  product: ProductCardData;
  priority?: boolean;
  asLink?: boolean;
}) {
  const soldOut = product.stock <= 0;
  const discount =
    product.compareAt && product.compareAt > product.priceFrom
      ? Math.round((1 - product.priceFrom / product.compareAt) * 100)
      : 0;

  const body = (
    <>
      <div className="relative aspect-square overflow-hidden rounded-[var(--radius-toy)] bg-teal-50 shadow-[inset_0_-5px_0_rgb(4_42_43/0.08)]">
        {product.image ? (
          <img
            src={product.image.url}
            alt={product.image.alt}
            width={600}
            height={600}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:scale-[1.04] group-hover:-rotate-1"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-teal-600">
            <PawPrint weight="fill" size={44} aria-hidden="true" />
            <span className="text-sm font-medium text-ink-soft">Foto pronto</span>
          </div>
        )}
        {soldOut ? (
          <span className="absolute left-3 top-3 rounded-full bg-ink px-3 py-1 text-sm font-semibold text-white">
            Agotado
          </span>
        ) : discount > 0 ? (
          <span className="absolute left-3 top-3 rounded-full bg-[var(--accent)] px-3 py-1 text-sm font-bold text-[var(--on-accent)] shadow-[inset_0_-3px_0_var(--accent-lip)]">
            -{discount}%
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1 px-1 pt-3">
        <p className="text-sm text-ink-soft">
          {product.brand ? `${product.brand} · ` : ""}
          {SPECIES_LABEL[product.species]}
        </p>
        <h3 className="text-[1.0625rem] font-medium leading-snug text-ink [font-variation-settings:'wght'_500] group-hover:text-teal-700">
          {product.name}
        </h3>
        <div className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-1">
          <span className="price text-lg text-teal-900">
            {product.variantCount > 1 && <span className="mr-1 text-sm font-normal text-ink-soft">desde</span>}
            {formatCOP(product.priceFrom)}
          </span>
          {discount > 0 && (
            <span className="text-sm text-ink-soft line-through tnum">{formatCOP(product.compareAt!)}</span>
          )}
        </div>
        {!soldOut && product.lowStock && <p className="text-sm font-medium text-danger">Quedan pocas unidades</p>}
      </div>
    </>
  );

  const cls = "group flex h-full flex-col rounded-[var(--radius-toy)] outline-offset-4";
  return asLink ? (
    <a href={`/tienda/${product.slug}`} className={cls}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}
