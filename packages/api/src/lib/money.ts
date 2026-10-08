/** Pesos colombianos enteros. */
const cop = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

export function formatCOP(value: number): string {
  return cop.format(value);
}

/** Wompi trabaja en centavos. Solo se usa en el borde con la pasarela. */
export function toCents(value: number): number {
  return Math.round(value) * 100;
}
