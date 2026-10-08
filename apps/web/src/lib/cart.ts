import { useSyncExternalStore } from "react";

/** Carrito en el navegador. El servidor revalida precio y stock en el checkout. */
export interface CartItem {
  variantId: number;
  slug: string;
  name: string;
  variantName: string;
  price: number;
  imageUrl: string | null;
  qty: number;
  maxQty: number;
}

const KEY = "maya-cart-v1";
const EVENT = "maya:cart";
const EMPTY: CartItem[] = [];
let cache: CartItem[] | null = null;

function read(): CartItem[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(items: CartItem[]) {
  cache = items;
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* modo privado: el carrito vive solo en esta pestaña */
  }
  window.dispatchEvent(new Event(EVENT));
}

export const cart = {
  items: read,
  add(item: Omit<CartItem, "qty">, qty = 1) {
    const items = [...read()];
    const found = items.find((i) => i.variantId === item.variantId);
    if (found) found.qty = Math.min(found.qty + qty, item.maxQty);
    else items.push({ ...item, qty: Math.min(qty, item.maxQty) });
    write(items.map((i) => ({ ...i })));
  },
  setQty(variantId: number, qty: number) {
    write(
      read()
        .map((i) => (i.variantId === variantId ? { ...i, qty: Math.max(0, Math.min(qty, i.maxQty)) } : i))
        .filter((i) => i.qty > 0),
    );
  },
  remove(variantId: number) {
    write(read().filter((i) => i.variantId !== variantId));
  },
  clear() {
    write([]);
  },
  open() {
    window.dispatchEvent(new Event("maya:cart-open"));
  },
};

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      cb();
    }
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useCart() {
  const items = useSyncExternalStore(subscribe, read, () => EMPTY);
  const count = items.reduce((n, i) => n + i.qty, 0);
  const subtotal = items.reduce((n, i) => n + i.qty * i.price, 0);
  return { items, count, subtotal };
}
