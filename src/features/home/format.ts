// Words of the Inicio screen. What goes in each block is decided in shared/dashboard.ts.

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const capitalize = (text: string) => `${text[0].toUpperCase()}${text.slice(1)}`;

/** "Miércoles 25 de noviembre", from the workshop date YYYY-MM-DD. */
export function greetingDate(today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${capitalize(WEEKDAYS[weekday])} ${d} de ${MONTHS[m - 1]}`;
}

/** "Noviembre", from YYYY-MM. */
export function monthName(month: string): string {
  return capitalize(MONTHS[Number(month.slice(5, 7)) - 1]);
}

/** "1 día de atraso", "5 días de atraso". */
export function lateLabel(days: number): string {
  return `${days} ${days === 1 ? 'día' : 'días'} de atraso`;
}

/** "y 3 más" when a block shows fewer items than it has; null when it shows them all. */
export function moreLabel(count: number, shown: number): string | null {
  return count > shown ? `y ${count - shown} más` : null;
}

/** Why the month's real profit is partial: the delivered orders without a real cost. Null when there are none. */
export function partialProfitNote(withoutRealCost: number): string | null {
  if (withoutRealCost === 0) return null;
  return withoutRealCost === 1
    ? 'Sin contar 1 pedido entregado que todavía no tiene impresiones cargadas.'
    : `Sin contar ${withoutRealCost} pedidos entregados que todavía no tienen impresiones cargadas.`;
}
