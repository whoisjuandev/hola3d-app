import type { NewOrder, Order, Stage } from '../../../shared/orders';
import type { PrintJob, RealCost } from '../../../shared/print-jobs';
import { request } from '../../ui/api';

export { ApiError } from '../../ui/api';

export async function fetchOrders(): Promise<Order[]> {
  return (await request<{ orders: Order[] }>('/api/orders')).orders;
}

export async function createOrder(input: Partial<NewOrder>): Promise<Order> {
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

/** Delete a job, giving its minutes and grams back. Answers the order with its new real cost. */
export async function deletePrintJob(orderId: string, jobId: number): Promise<Order> {
  return (await request<{ order: Order }>(`/api/orders/${orderId}/jobs/${jobId}`, { method: 'DELETE' })).order;
}
