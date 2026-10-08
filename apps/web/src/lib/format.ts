export { formatCOP } from "@maya/api/money";

export const SPECIES_LABEL = { perro: "Perros", gato: "Gatos", ambos: "Perros y gatos" } as const;

export const WHATSAPP_NUMBER = "573046585424";
/** Cuenta de Instagram de MAYA (sin @). TODO: confirmar con el cliente. */
export const INSTAGRAM_HANDLE = "mayapets";
export const WHATSAPP_DISPLAY = "+57 304 658 5424";

export function whatsappLink(message = "Hola MAYA Pets, tengo una pregunta.") {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
