/** "1.235 h", "1,5 h": accumulated minutes as hours, at most one decimal. */
export function hoursLabel(minutes: number): string {
  return `${(minutes / 60).toLocaleString('es-AR', { maximumFractionDigits: 1 })} h`;
}

/** Minutes as an hours value for a form field: "1235", "1,02". Two decimals keep the minutes exact. */
export function hoursText(minutes: number): string {
  return (minutes / 60).toLocaleString('es-AR', { maximumFractionDigits: 2, useGrouping: false });
}

/**
 * Hours typed by the owner back to whole minutes. A dot before three digits groups thousands ("1.235,5");
 * any other dot is a decimal point ("1.5"). Empty is null; other text is returned as is.
 */
export function hoursTextToMinutes(text: string): number | string | null {
  const compact = text.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (!compact) return null;
  return /^\d+(\.\d+)?$/.test(compact) ? Math.round(Number(compact) * 60) : text;
}
