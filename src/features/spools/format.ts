/** "1.000 g" */
export function grams(n: number): string {
  return `${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })} g`;
}
