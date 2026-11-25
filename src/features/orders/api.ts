import type { NewOrder, Order, Stage } from '../../../shared/orders';
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
