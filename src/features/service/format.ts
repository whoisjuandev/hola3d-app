import { DEFAULT_SERVICE_PLAN, type ServiceState, type ServiceTask } from '../../../shared/service';
import { hoursLabel } from '../printers/format';

function days(n: number): string {
  return `${n.toLocaleString('es-AR')} ${n === 1 ? 'día' : 'días'}`;
}

/** "Cada 100 h de impresión", "Cada 30 días", "Cada 200 h de impresión o 90 días". */
export function intervalLabel(task: Pick<ServiceTask, 'intervalHours' | 'intervalDays'>): string {
  const parts: string[] = [];
  if (task.intervalHours !== null) parts.push(`${task.intervalHours.toLocaleString('es-AR')} h de impresión`);
  if (task.intervalDays !== null) parts.push(days(task.intervalDays));
  return `Cada ${parts.join(' o ')}`;
}

/** The default plan in one sentence: "Limpiar boquilla cada 100 h, lubricar varillas cada 200 h y revisar correas cada 300 h." */
export function planText(): string {
  const items = DEFAULT_SERVICE_PLAN.map((t, i) => {
    const name = i === 0 ? t.name : t.name.charAt(0).toLowerCase() + t.name.slice(1);
    return `${name} ${intervalLabel(t).replace(' de impresión', '').toLowerCase()}`;
  });
  return `${items.slice(0, -1).join(', ')} y ${items.at(-1)}.`;
}

/** "Faltan 59,2 h o 30 días", "Falta 1 día"; once due, "Vencida hace 15 h", "Vence hoy". */
export function stateLabel(state: ServiceState): string {
  if (state.due) {
    const over: string[] = [];
    if (state.dueByHours && state.minutesLeft !== null && state.minutesLeft < 0) over.push(hoursLabel(-state.minutesLeft));
    if (state.dueByDays && state.daysLeft !== null && state.daysLeft < 0) over.push(days(-state.daysLeft));
    if (over.length) return `Vencida hace ${over.join(' y ')}`;
    return state.dueByDays ? 'Vence hoy' : 'Vence ahora';
  }
  const left: { text: string; one: boolean }[] = [];
  if (state.minutesLeft !== null) left.push({ text: hoursLabel(state.minutesLeft), one: state.minutesLeft === 60 });
  if (state.daysLeft !== null) left.push({ text: days(state.daysLeft), one: state.daysLeft === 1 });
  return `${left[0]?.one ? 'Falta' : 'Faltan'} ${left.map((l) => l.text).join(' o ')}`;
}
