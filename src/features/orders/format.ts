import type { Order } from '../../../shared/orders';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function money(pesos: number): string {
  return '$' + pesos.toLocaleString('es-AR', { maximumFractionDigits: 0 });
}

/** Local calendar date as YYYY-MM-DD. */
export function isoDate(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDate(new Date(y, m - 1, d + days));
}

/** "Hoy, 10:00", "Mañana", "23 nov"; delivered orders read "Entregado 17 nov". */
export function dueLabel(order: Pick<Order, 'dueDate' | 'dueTime' | 'stage'>, today: string): string {
  if (!order.dueDate) return 'Sin fecha';
  const [, m, d] = order.dueDate.split('-').map(Number);
  const short = `${d} ${MONTHS[m - 1]}`;
  if (order.stage === 'entregado') return `Entregado ${short}`;
  let label = short;
  if (order.dueDate === today) label = 'Hoy';
  else if (order.dueDate === addDays(today, 1)) label = 'Mañana';
  return order.dueTime ? `${label}, ${order.dueTime}` : label;
}

export function isOverdue(order: Pick<Order, 'dueDate' | 'stage'>, today: string): boolean {
  return !!order.dueDate && order.stage !== 'entregado' && order.dueDate < today;
}

export function depositLabel(order: Pick<Order, 'deposit' | 'paid'>): string {
  if (order.paid) return 'Pagado';
  if (order.deposit == null) return 'Sin seña';
  return money(order.deposit);
}
