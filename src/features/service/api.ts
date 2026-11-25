import type { ServiceCost, ServiceLog, ServiceTaskWithState } from '../../../shared/service';
import { request } from '../../ui/api';

/** Active tasks of every printer with where they stand today, due first. */
export async function fetchServiceTasks(): Promise<ServiceTaskWithState[]> {
  return (await request<{ tasks: ServiceTaskWithState[] }>('/api/service/tasks')).tasks;
}

export async function createServiceTask(input: Record<string, unknown>): Promise<ServiceTaskWithState> {
  return (await request<{ task: ServiceTaskWithState }>('/api/service/tasks', { method: 'POST', body: JSON.stringify(input) })).task;
}

/** Send only the fields that changed; the API keeps the rest. */
export async function updateServiceTask(id: number, changes: Record<string, unknown>): Promise<ServiceTaskWithState> {
  return (await request<{ task: ServiceTaskWithState }>(`/api/service/tasks/${id}`, { method: 'PUT', body: JSON.stringify(changes) })).task;
}

/** Take the task out of the plan. Its services stay in the log. */
export async function deactivateServiceTask(id: number): Promise<void> {
  await request(`/api/service/tasks/${id}`, { method: 'DELETE' });
}

/** Add the default plan to a printer without tasks. */
export async function adoptServicePlan(printerId: number): Promise<ServiceTaskWithState[]> {
  return (await request<{ tasks: ServiceTaskWithState[] }>(`/api/printers/${printerId}/service-plan`, { method: 'POST' })).tasks;
}

export async function fetchServiceLogs(): Promise<{ logs: ServiceLog[]; totals: ServiceCost[] }> {
  return request<{ logs: ServiceLog[]; totals: ServiceCost[] }>('/api/service/logs');
}

export async function logService(input: Record<string, unknown>): Promise<{ log: ServiceLog; task: ServiceTaskWithState | null }> {
  return request('/api/service/logs', { method: 'POST', body: JSON.stringify(input) });
}
