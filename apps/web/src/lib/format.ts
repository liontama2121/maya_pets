export { formatCOP } from "@maya/api/money";

export const SPECIES_LABEL = { perro: "Perros", gato: "Gatos", ambos: "Perros y gatos" } as const;

/** WhatsApp de MAYA Pets. Único lugar donde vive el número: cámbialo solo aquí. */
export const CONTACT_WHATSAPP = {
  /** Formato internacional sin "+" ni espacios, para wa.me y schema.org. */
  number: "573175378079",
  /** Como se muestra a las personas. */
  display: "+57 317 537 8079",
  url: "https://wa.me/573175378079",
} as const;

/** Cuenta de Instagram de MAYA Pets (sin @): https://www.instagram.com/mypetshop.co/ */
export const INSTAGRAM_HANDLE = "mypetshop.co";

export function whatsappLink(message = "Hola MAYA Pets, tengo una pregunta.") {
  return `${CONTACT_WHATSAPP.url}?text=${encodeURIComponent(message)}`;
}
