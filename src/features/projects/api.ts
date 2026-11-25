import type { Order } from '../../../shared/orders';
import type { ProjectSummary } from '../../../shared/projects';
import { request } from '../../ui/api';

export async function fetchProjects(): Promise<ProjectSummary[]> {
  return (await request<{ projects: ProjectSummary[] }>('/api/projects')).projects;
}

export async function fetchClientProjects(clientId: number): Promise<ProjectSummary[]> {
  return (await request<{ projects: ProjectSummary[] }>(`/api/projects?clientId=${clientId}`)).projects;
}

export async function fetchProject(id: number): Promise<{ project: ProjectSummary; orders: Order[] }> {
  return request<{ project: ProjectSummary; orders: Order[] }>(`/api/projects/${id}`);
}

export async function createProject(input: Record<string, unknown>): Promise<ProjectSummary> {
  return (await request<{ project: ProjectSummary }>('/api/projects', { method: 'POST', body: JSON.stringify(input) })).project;
}

/** Send only the fields that changed; the API keeps the rest. */
export async function updateProject(id: number, changes: Record<string, unknown>): Promise<ProjectSummary> {
  return (await request<{ project: ProjectSummary }>(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify(changes) })).project;
}

/** Put an order in a project, or take it out of any with null. Answers the order. */
export async function setOrderProject(orderId: string, projectId: number | null): Promise<Order> {
  return (await request<{ order: Order }>(`/api/orders/${orderId}/project`, { method: 'PUT', body: JSON.stringify({ projectId }) })).order;
}
