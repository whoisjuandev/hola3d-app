// Projects: several orders of one client grouped as one job, like a school's robotics kit. Shared by the Worker API and the React app.
import { balanceOwed } from './clients';
import { asBody, isMissing, readText, type Body, type Errors } from './fields';
import type { Order, ValidationResult } from './orders';
import { isCalendarDate } from './quotes';

export const PROJECT_STATUSES = ['activo', 'terminado'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  activo: 'Activo',
  terminado: 'Terminado',
};

export interface Project {
  id: number;
  name: string;
  clientId: number;
  client: string; // the client's name, read through the client record
  status: ProjectStatus;
  dueDate: string | null; // YYYY-MM-DD
  note: string;
  createdAt: string;
  updatedAt: string;
}

/** What the list and the project page show about a project's orders. */
export interface ProjectTotals {
  orderCount: number;
  deliveredCount: number;
  progress: number; // delivered ÷ all orders, from 0 to 1; 0 without orders
  totalPrice: number; // whole pesos
  totalDeposits: number; // whole pesos, every order's deposit
  balanceOwed: number; // whole pesos, as for a client: price minus deposit of the orders not marked paid
}

export type ProjectSummary = Project & ProjectTotals;

/** A validated create or edit request. Like an order, it names its client by `clientId` or by `client` (a name). */
export interface NewProject {
  name: string;
  client: string;
  clientId: number | null;
  status: ProjectStatus;
  dueDate: string | null;
  note: string;
}

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === 'string' && (PROJECT_STATUSES as readonly string[]).includes(value);
}

function isId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/** Validate a project for create or edit (for an edit, the stored values merged with the request). */
export function validateProject(input: unknown): ValidationResult<NewProject> {
  const errors: Errors = {};
  const body = asBody(input);

  const name = readText(body, errors, 'name', 80, true);
  let clientId: number | null = null;
  if (!isMissing(body.clientId)) {
    if (isId(body.clientId)) clientId = body.clientId;
    else errors.clientId = 'Elegí un cliente de la lista.';
  }
  // A client picked by id needs no name.
  const client = readText(body, errors, 'client', 80, isMissing(body.clientId));
  const status = isMissing(body.status) ? 'activo' : body.status;
  if (!isProjectStatus(status)) errors.status = 'Elegí activo o terminado.';
  const dueDate = isMissing(body.dueDate) ? null : body.dueDate;
  if (dueDate !== null && !isCalendarDate(dueDate)) errors.dueDate = 'La fecha tiene que ser AAAA-MM-DD.';
  const note = readText(body, errors, 'note', 1000, false);

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: { name, client: clientId === null ? client : '', clientId, status: status as ProjectStatus, dueDate: dueDate as string | null, note },
  };
}

/**
 * The project an order goes in: `projectId`, a project id or null for none. When `required`, the key must be sent
 * (assigning); otherwise a missing one means no project (a new order).
 */
export function validateProjectId(input: unknown, required: boolean): ValidationResult<number | null> {
  const body: Body = asBody(input);
  if (!Object.hasOwn(body, 'projectId') || body.projectId === undefined) {
    return required ? { ok: false, errors: { projectId: 'Elegí un proyecto o «Sin proyecto».' } } : { ok: true, value: null };
  }
  const raw = body.projectId;
  if (raw === null || (!required && raw === '')) return { ok: true, value: null };
  if (isId(raw)) return { ok: true, value: raw };
  return { ok: false, errors: { projectId: 'Elegí un proyecto de la lista.' } };
}

/** Delivered orders ÷ all orders, from 0 to 1. A project without orders has made no progress: 0. */
export function projectProgress(orders: Pick<Order, 'stage'>[]): number {
  if (orders.length === 0) return 0;
  return orders.filter((o) => o.stage === 'entregado').length / orders.length;
}

type Money = Pick<Order, 'stage' | 'price' | 'deposit' | 'paid'>;

/** Count, progress, and the sums of prices, deposits and the balance owed (the client rule) of a project's orders. */
export function projectTotals(orders: Money[]): ProjectTotals {
  return {
    orderCount: orders.length,
    deliveredCount: orders.filter((o) => o.stage === 'entregado').length,
    progress: projectProgress(orders),
    totalPrice: orders.reduce((sum, o) => sum + o.price, 0),
    totalDeposits: orders.reduce((sum, o) => sum + (o.deposit ?? 0), 0),
    balanceOwed: balanceOwed(orders),
  };
}

/** Each project with the totals of its own orders, in the order given. */
export function summarizeProjects<P extends Pick<Project, 'id'>>(projects: P[], orders: (Money & { projectId: number | null })[]): (P & ProjectTotals)[] {
  return projects.map((p) => ({ ...p, ...projectTotals(orders.filter((o) => o.projectId === p.id)) }));
}

/** An active project whose due date is before `today`. */
export function isProjectOverdue(project: Pick<Project, 'status' | 'dueDate'>, today: string): boolean {
  return project.status === 'activo' && project.dueDate !== null && project.dueDate < today;
}

/** Why the order cannot go in the project (it is of another client), or null when it can. */
export function projectClientProblem(
  project: Pick<Project, 'name' | 'clientId' | 'client'>, order: Pick<Order, 'clientId' | 'client'>,
): string | null {
  if (order.clientId === project.clientId) return null;
  return `«${project.name}» es de ${project.client} y este pedido es de ${order.client}: un proyecto junta pedidos de un solo cliente.`;
}
