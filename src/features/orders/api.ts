import type { NewOrder, Order, Stage } from '../../../shared/orders';
import type { PrintJob, RealCost } from '../../../shared/print-jobs';
import { request } from '../../ui/api';

export { ApiError } from '../../ui/api';

export async function fetchOrders(): Promise<Order[]> {
  return (await request<{ orders: Order[] }>('/api/orders')).orders;
}

/** A new order as the form sends it: the order fields, and optionally the project it goes in. */
export type NewOrderInput = Partial<NewOrder> & { projectId?: number };

export async function createOrder(input: NewOrderInput): Promise<Order> {
  return (await request<{ order: Order }>('/api/orders', { method: 'POST', body: JSON.stringify(input) })).order;
}

export async function saveStage(id: string, stage: Stage): Promise<Order> {
  return (await request<{ order: Order }>(`/api/orders/${id}/stage`, { method: 'PUT', body: JSON.stringify({ stage }) })).order;
}

export async function fetchPrintJobs(orderId: string): Promise<{ jobs: PrintJob[]; cost: RealCost | null }> {
  return request<{ jobs: PrintJob[]; cost: RealCost | null }>(`/api/orders/${orderId}/jobs`);
}

/** Log a finished job. Answers the job and the order with its new real cost. */
export async function logPrintJob(orderId: string, input: Record<string, unknown>): Promise<{ job: PrintJob; order: Order }> {
  return request<{ job: PrintJob; order: Order }>(`/api/orders/${orderId}/jobs`, { method: 'POST', body: JSON.stringify(input) });
}

/** Delete a planned job; it took nothing, so nothing is given back. Refused (409) once it has been finished. */
export async function deletePlannedJob(orderId: string, jobId: number): Promise<Order> {
  return (await request<{ order: Order }>(`/api/orders/${orderId}/jobs/${jobId}/plan`, { method: 'DELETE' })).order;
}

/** Delete a finished job, giving its minutes and grams back. Answers the order with its new real cost. */
export async function deletePrintJob(orderId: string, jobId: number): Promise<Order> {
  return (await request<{ order: Order }>(`/api/orders/${orderId}/jobs/${jobId}`, { method: 'DELETE' })).order;
}

/** Plan a job for the order: printer, start and estimated minutes. It changes no counter. */
export async function planPrintJob(orderId: string, input: Record<string, unknown>): Promise<PrintJob> {
  return (await request<{ job: PrintJob }>(`/api/orders/${orderId}/jobs/plan`, { method: 'POST', body: JSON.stringify(input) })).job;
}

/** Change a planned job. Send only the fields to change. */
export async function updatePlannedJob(orderId: string, jobId: number, changes: Record<string, unknown>): Promise<PrintJob> {
  return (await request<{ job: PrintJob }>(`/api/orders/${orderId}/jobs/${jobId}`, { method: 'PUT', body: JSON.stringify(changes) })).job;
}

/** Turn a planned job into a finished one, with the same body as logging one. Answers the job and the order. */
export async function finishPrintJob(orderId: string, jobId: number, input: Record<string, unknown>): Promise<{ job: PrintJob; order: Order }> {
  return request<{ job: PrintJob; order: Order }>(`/api/orders/${orderId}/jobs/${jobId}/finish`, { method: 'POST', body: JSON.stringify(input) });
}
