import { Minus } from "@phosphor-icons/react/dist/csr/Minus";
import { PawPrint } from "@phosphor-icons/react/dist/csr/PawPrint";
import { Plus } from "@phosphor-icons/react/dist/csr/Plus";
import { X } from "@phosphor-icons/react/dist/csr/X";
import { useEffect, useRef } from "react";
import { cart, useCart } from "../../lib/cart";
import { formatCOP, whatsappLink } from "../../lib/format";

/** Carrito lateral. <dialog> nativo: foco atrapado y Escape sin código extra. */
export default function CartDrawer() {
  const ref = useRef<HTMLDialogElement>(null);
  const { items, subtotal, count } = useCart();

  useEffect(() => {
    const open = () => ref.current?.showModal();
    window.addEventListener("maya:cart-open", open);
    return () => window.removeEventListener("maya:cart-open", open);
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label="Tu carrito"
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-md bg-ground p-0 text-ink backdrop:bg-teal-950/50 open:flex open:flex-col"
    >
      <div className="flex items-center justify-between px-5 pb-3 pt-5">
        <h2 className="text-2xl font-bold [font-variation-settings:'wght'_700]">
          Tu carrito {count > 0 && <span className="tnum text-ink-soft">({count})</span>}
        </h2>
        <button
          type="button"
          onClick={() => ref.current?.close()}
          className="grid size-11 place-items-center rounded-full hover:bg-teal-100"
          aria-label="Cerrar carrito"
        >
          <X size={22} weight="bold" aria-hidden="true" />
        </button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
          <PawPrint weight="fill" size={56} className="text-teal-400" aria-hidden="true" />
          <p className="text-lg font-medium">Tu carrito está vacío.</p>
          <p className="text-ink-soft">Maya ya está olfateando la tienda por si encuentras algo.</p>
          <a href="/tienda" className="btn btn-teal mt-2">
            Ver la tienda
          </a>
        </div>
      ) : (
        <>
          <ul className="flex-1 space-y-3 overflow-y-auto px-5 py-2">
            {items.map((item) => (
              <li key={item.variantId} className="flex gap-3 rounded-[var(--radius-toy)] bg-white p-3">
                <div className="size-20 shrink-0 overflow-hidden rounded-2xl bg-teal-50">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" className="h-full w-full object-cover" width={80} height={80} />
                  ) : (
                    <div className="grid h-full place-items-center text-teal-400">
                      <PawPrint weight="fill" size={28} aria-hidden="true" />
                    </div>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <a href={`/tienda/${item.slug}`} className="font-medium leading-snug hover:text-teal-700">
                    {item.name}
                  </a>
                  <p className="text-sm text-ink-soft">{item.variantName}</p>
                  <div className="mt-auto flex items-center justify-between pt-2">
                    <div className="flex items-center rounded-full bg-teal-50">
                      <button
                        type="button"
                        className="grid size-10 place-items-center rounded-full hover:bg-teal-100"
                        onClick={() => cart.setQty(item.variantId, item.qty - 1)}
                        aria-label={`Quitar una unidad de ${item.name}`}
                      >
                        <Minus size={16} weight="bold" aria-hidden="true" />
                      </button>
                      <span className="tnum w-7 text-center font-semibold" aria-live="polite">
                        {item.qty}
                      </span>
                      <button
                        type="button"
                        className="grid size-10 place-items-center rounded-full hover:bg-teal-100 disabled:opacity-40"
                        onClick={() => cart.setQty(item.variantId, item.qty + 1)}
                        disabled={item.qty >= item.maxQty}
                        aria-label={`Agregar una unidad de ${item.name}`}
                      >
                        <Plus size={16} weight="bold" aria-hidden="true" />
                      </button>
                    </div>
                    <span className="price text-teal-900">{formatCOP(item.price * item.qty)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="border-t border-line bg-white px-5 pb-6 pt-4">
            <div className="flex items-baseline justify-between">
              <span className="text-ink-soft">Subtotal</span>
              <span className="price text-2xl text-teal-900">{formatCOP(subtotal)}</span>
            </div>
            <p className="mt-1 text-sm text-ink-soft">
              Mientras activamos el pago en línea, confirma tu pedido por WhatsApp: envío a domicilio o recogida en tienda.
            </p>
            <a
              href={whatsappLink(
                [
                  "Hola MAYA Pets, quiero hacer este pedido:",
                  ...items.map((i) => `- ${i.qty} x ${i.name} (${i.variantName}): ${formatCOP(i.price * i.qty)}`),
                  `Subtotal: ${formatCOP(subtotal)}`,
                ].join("\n"),
              )}
              target="_blank"
              rel="noopener"
              className="btn btn-sun mt-4 w-full"
            >
              Pedir por WhatsApp
            </a>
          </div>
        </>
      )}
    </dialog>
  );
}
