import type { Project, ProjectTotals } from '../../../shared/projects';
import { dueLabel } from '../orders/format';

/** "33 %" from a progress between 0 and 1. */
export function percentLabel(progress: number): string {
  return `${Math.round(progress * 100)} %`;
}

/** "1 de 3 pedidos entregados", or "Sin pedidos todavía". */
export function progressText(totals: Pick<ProjectTotals, 'orderCount' | 'deliveredCount'>): string {
  if (totals.orderCount === 0) return 'Sin pedidos todavía';
  return totals.orderCount === 1
    ? `${totals.deliveredCount} de 1 pedido entregado`
    : `${totals.deliveredCount} de ${totals.orderCount} pedidos entregados`;
}

/** "Hoy", "Mañana", "5 dic" or "Sin fecha", like an order's due date. */
export function projectDueLabel(project: Pick<Project, 'dueDate'>, today: string): string {
  return dueLabel({ dueDate: project.dueDate, dueTime: null, stage: 'nuevo' }, today);
}

/**
 * The projects an order of this client can go in: the client's active ones, plus the order's current project when it
 * is finished, so the picker can still show it. None without a client.
 */
export function projectChoices<P extends Pick<Project, 'id' | 'clientId' | 'status'>>(projects: P[], clientId: number | null, currentId: number | null): P[] {
  if (clientId === null) return [];
  return projects.filter((p) => p.clientId === clientId && (p.status === 'activo' || p.id === currentId));
}
