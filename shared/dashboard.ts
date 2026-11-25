// The home screen: what is due today, what is late, what is running low and how the month is going.
// A pure function of what the other modules store, shared by the Worker API and the React app.
import { isActive, isOrderOverdue, type Order, type Stage } from './orders';
import { isQuoteExpired, type Quote } from './quotes';
import { daysBetween, serviceState, sortByDue, workshopToday, type ServiceState, type ServiceTask } from './service';
import { isLowStock, type Spool } from './spools';

/** How many items each list of the home screen keeps; its count is always the full one. */
export const DASHBOARD_LIST_LIMIT = 5;

/** The first items of a list and how many there are in all. */
export interface DashboardList<T> {
  count: number;
  items: T[];
}

export interface DashboardOrder {
  id: string;
  item: string;
  client: string;
  clientId: number | null;
  project: string | null;
  stage: Stage;
  dueDate: string; // YYYY-MM-DD
  dueTime: string | null;
  price: number;
  daysLate: number; // 0 for an order due today
}

export interface DashboardSpool {
  id: number;
  material: string;
  colorName: string;
  colorHex: string;
  brand: string;
  remainingGrams: number;
  netGrams: number;
  lowStockGrams: number;
  share: number; // remaining ÷ net, 0 to 1
}

export interface DashboardServiceTask {
  id: number;
  name: string;
  printerId: number;
  printer: string;
  state: ServiceState;
}

export interface DashboardQuote {
  id: number;
  number: string;
  clientId: number;
  client: string;
  title: string;
  total: number;
  validUntil: string; // YYYY-MM-DD
  expired: boolean; // its validity date is before today
}

/** The orders delivered this month, on the workshop's clock. */
export interface DashboardMonth {
  month: string; // YYYY-MM
  revenue: number; // sum of their prices
  deliveredCount: number;
  realProfit: number; // sum of the real profit of those that have a real cost
  withoutRealCost: number; // how many have no real cost yet, so the profit above leaves them out
}

export interface DashboardData {
  today: string;
  dueToday: DashboardList<DashboardOrder>;
  overdue: DashboardList<DashboardOrder>;
  lowSpools: DashboardList<DashboardSpool>;
  serviceDue: DashboardList<DashboardServiceTask>;
  quotesWaiting: DashboardList<DashboardQuote>;
  month: DashboardMonth;
}

export interface DashboardSources {
  orders: Pick<Order, 'id' | 'item' | 'client' | 'clientId' | 'project' | 'stage' | 'dueDate' | 'dueTime' | 'price' | 'deliveredAt' | 'realCost' | 'realProfit'>[];
  spools: Pick<Spool, 'id' | 'material' | 'colorName' | 'colorHex' | 'brand' | 'remainingGrams' | 'netGrams' | 'lowStockGrams'>[];
  tasks: Pick<ServiceTask, 'id' | 'name' | 'printerId' | 'printer' | 'printerMinutes' | 'intervalHours' | 'intervalDays' | 'lastDoneMinutes' | 'lastDoneDate' | 'active'>[];
  quotes: Pick<Quote, 'id' | 'number' | 'clientId' | 'client' | 'title' | 'status' | 'total' | 'validUntil'>[];
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function capped<T>(items: T[], limit: number): DashboardList<T> {
  return { count: items.length, items: items.slice(0, limit) };
}

type DatedOrder = DashboardSources['orders'][number] & { dueDate: string };

function toDashboardOrder(o: DatedOrder, today: string): DashboardOrder {
  return {
    id: o.id, item: o.item, client: o.client, clientId: o.clientId, project: o.project, stage: o.stage, dueDate: o.dueDate, dueTime: o.dueTime,
    price: o.price, daysLate: Math.max(0, daysBetween(o.dueDate, today)),
  };
}

/** By due date, then time (untimed last), then number. */
function byDue(a: DashboardOrder, b: DashboardOrder): number {
  return byText(a.dueDate, b.dueDate) || byText(a.dueTime ?? '99', b.dueTime ?? '99') || Number(a.id) - Number(b.id);
}

/** The month (YYYY-MM) of an ISO timestamp on the workshop's clock. */
export function workshopMonth(iso: string): string {
  return workshopToday(new Date(iso)).slice(0, 7);
}

/** What the orders delivered in `today`'s month add up to. */
function monthTotals(orders: DashboardSources['orders'], today: string): DashboardMonth {
  const month = today.slice(0, 7);
  const delivered = orders.filter((o) => o.stage === 'entregado' && o.deliveredAt !== null && workshopMonth(o.deliveredAt) === month);
  const costed = delivered.filter((o) => o.realCost !== null && o.realProfit !== null);
  return {
    month,
    revenue: delivered.reduce((sum, o) => sum + o.price, 0),
    deliveredCount: delivered.length,
    realProfit: costed.reduce((sum, o) => sum + (o.realProfit ?? 0), 0),
    withoutRealCost: delivered.length - costed.length,
  };
}

/**
 * The home screen on `today` (the workshop's date): orders due today and late ones (neither delivered), spools at or
 * below their threshold, active service tasks that are due, sent quotes waiting for an answer, and the month's revenue
 * and real profit. Each list keeps its first `limit` items, most urgent first, next to its full count.
 */
export function dashboardData(sources: DashboardSources, today: string, limit = DASHBOARD_LIST_LIMIT): DashboardData {
  const dated = sources.orders.filter((o): o is DatedOrder => o.dueDate !== null && isActive(o));
  const dueToday = dated.filter((o) => o.dueDate === today).map((o) => toDashboardOrder(o, today)).sort(byDue);
  const overdue = dated.filter((o) => isOrderOverdue(o, today)).map((o) => toDashboardOrder(o, today)).sort(byDue);

  const lowSpools: DashboardSpool[] = sources.spools
    .filter(isLowStock)
    .map((s) => ({
      id: s.id, material: s.material, colorName: s.colorName, colorHex: s.colorHex, brand: s.brand, remainingGrams: s.remainingGrams,
      netGrams: s.netGrams, lowStockGrams: s.lowStockGrams, share: s.netGrams > 0 ? s.remainingGrams / s.netGrams : 0,
    }))
    .sort((a, b) => a.share - b.share || a.id - b.id);

  const serviceDue: DashboardServiceTask[] = sortByDue(
    sources.tasks
      .filter((t) => t.active)
      .map((t) => ({ id: t.id, name: t.name, printerId: t.printerId, printer: t.printer, state: serviceState(t, today) }))
      .filter((t) => t.state.due),
  );

  const quotesWaiting: DashboardQuote[] = sources.quotes
    .filter((q) => q.status === 'enviado')
    .map((q) => ({
      id: q.id, number: q.number, clientId: q.clientId, client: q.client, title: q.title, total: q.total, validUntil: q.validUntil,
      expired: isQuoteExpired(q, today),
    }))
    .sort((a, b) => byText(a.validUntil, b.validUntil) || a.id - b.id);

  return {
    today,
    dueToday: capped(dueToday, limit),
    overdue: capped(overdue, limit),
    lowSpools: capped(lowSpools, limit),
    serviceDue: capped(serviceDue, limit),
    quotesWaiting: capped(quotesWaiting, limit),
    month: monthTotals(sources.orders, today),
  };
}
