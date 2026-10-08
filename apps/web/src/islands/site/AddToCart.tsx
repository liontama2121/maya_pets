import type { ProductDetail } from "@maya/api";
import { Basket } from "@phosphor-icons/react/dist/csr/Basket";
import { Minus } from "@phosphor-icons/react/dist/csr/Minus";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { useId, useState } from "react";
import { cart } from "../../lib/cart";
import { formatCOP } from "../../lib/format";
import { flyToCart } from "../../motion/maya";

type Props = Pick<ProductDetail, "slug" | "name" | "variantLabel" | "variants"> & { imageUrl: string | null };

/** Selector de presentación + cantidad + agregar. Stock visible por presentación. */
export default function AddToCart({ slug, name, variantLabel, variants, imageUrl }: Props) {
  const firstAvailable = variants.find((v) => v.stock > 0) ?? variants[0];
  const [variantId, setVariantId] = useState(firstAvailable?.id);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const groupId = useId();

  const variant = variants.find((v) => v.id === variantId) ?? firstAvailable;
  if (!variant) return null;
  const soldOut = variant.stock <= 0;
  const discount =
    variant.compareAtPrice && variant.compareAtPrice > variant.price
      ? Math.round((1 - variant.price / variant.compareAtPrice) * 100)
      : 0;

  const choose = (id: number) => {
    setVariantId(id);
    setQty(1);
    setAdded(false);
  };

  const add = () => {
    cart.add({
      variantId: variant.id,
      slug,
      name,
      variantName: variant.name,
      price: variant.price,
      imageUrl,
      maxQty: variant.stock,
    }, qty);
    flyToCart(document.querySelector<HTMLElement>("[data-product-image]"));
    setAdded(true);
  };

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="price text-4xl text-teal-900">{formatCOP(variant.price)}</span>
        {discount > 0 && (
          <>
            <span className="tnum text-lg text-ink-soft line-through">{formatCOP(variant.compareAtPrice!)}</span>
            <span className="rounded-full bg-[var(--accent)] px-3 py-1 text-sm font-bold text-[var(--on-accent)]">
              -{discount}%
            </span>
          </>
        )}
      </div>

      {variants.length > 1 && (
        <fieldset className="mt-6">
          <legend id={groupId} className="label">
            {variantLabel || "Presentación"}
          </legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-labelledby={groupId}>
            {variants.map((v) => (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={v.id === variant.id}
                aria-pressed={v.id === variant.id}
                onClick={() => choose(v.id)}
                className={`chip ${v.stock <= 0 ? "text-ink-soft line-through decoration-1" : ""}`}
              >
                {v.name}
                {v.stock <= 0 && <span className="sr-only"> (agotado)</span>}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <p className="mt-4 font-medium" aria-live="polite">
        {soldOut ? (
          <span className="text-danger">Agotado por ahora. Escríbenos y te avisamos cuando llegue.</span>
        ) : variant.lowStock ? (
          <span className="text-danger">Quedan {variant.stock} unidades</span>
        ) : (
          <span className="text-teal-700">Disponible: {variant.stock} unidades</span>
        )}
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex h-12 items-center rounded-full bg-white shadow-[inset_0_0_0_1.5px_var(--color-line-strong)]">
          <button
            type="button"
            className="grid size-12 place-items-center rounded-full hover:bg-teal-50 disabled:opacity-40"
            onClick={() => setQty((n) => Math.max(1, n - 1))}
            disabled={soldOut || qty <= 1}
            aria-label="Una unidad menos"
          >
            <Minus size={18} weight="bold" aria-hidden="true" />
          </button>
          <span className="tnum w-8 text-center text-lg font-semibold" aria-label={`Cantidad: ${qty}`}>
            {qty}
          </span>
          <button
            type="button"
            className="grid size-12 place-items-center rounded-full hover:bg-teal-50 disabled:opacity-40"
            onClick={() => setQty((n) => Math.min(variant.stock, n + 1))}
            disabled={soldOut || qty >= variant.stock}
            aria-label="Una unidad más"
          >
            <Plus size={18} weight="bold" aria-hidden="true" />
          </button>
        </div>
        <button type="button" className="btn btn-sun flex-1 text-lg sm:flex-none" onClick={add} disabled={soldOut}>
          <Basket size={22} weight="bold" aria-hidden="true" />
          Agregar al carrito
        </button>
      </div>
      {added && (
        <p className="mt-3 text-teal-700" role="status">
          Listo, quedó en tu carrito.{" "}
          <button type="button" className="font-semibold underline" onClick={() => cart.open()}>
            Ver carrito
          </button>
        </p>
      )}
    </div>
  );
}
