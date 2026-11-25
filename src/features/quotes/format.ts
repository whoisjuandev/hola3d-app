/** "18 h 30 min", "2 h", "45 min". */
export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** A first title for a new quote from its piece names: "Llavero y Cartel", "Llavero y 2 piezas más". */
export function defaultQuoteTitle(names: string[]): string {
  const named = names.map((n) => n.trim()).filter(Boolean);
  if (named.length <= 1) return named[0] ?? '';
  if (named.length === 2) return `${named[0]} y ${named[1]}`;
  return `${named[0]} y ${named.length - 1} piezas más`;
}
