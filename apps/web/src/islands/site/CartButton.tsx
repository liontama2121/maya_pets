import { Basket } from "@phosphor-icons/react/dist/csr/Basket";
import { cart, useCart } from "../../lib/cart";

export default function CartButton() {
  const { count } = useCart();
  return (
    <button
      type="button"
      onClick={() => cart.open()}
      data-cart-target
      data-squish
      className="relative inline-flex size-11 items-center justify-center rounded-full bg-white/12 text-white transition-colors hover:bg-white/20"
      aria-label={count ? `Carrito, ${count} ${count === 1 ? "producto" : "productos"}` : "Carrito vacío"}
    >
      <Basket weight="bold" size={24} aria-hidden="true" />
      {count > 0 && (
        <span className="tnum absolute -right-1 -top-1 grid min-w-6 place-items-center rounded-full bg-[var(--accent)] px-1.5 text-xs font-bold leading-6 text-[var(--on-accent)] shadow-[inset_0_-2px_0_var(--accent-lip)]">
          {count}
        </span>
      )}
    </button>
  );
}
