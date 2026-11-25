import type { Printer } from '../../../shared/printers';
import { request } from '../../ui/api';

export async function fetchPrinters(): Promise<Printer[]> {
  return (await request<{ printers: Printer[] }>('/api/printers')).printers;
}

export async function createPrinter(input: Record<string, unknown>): Promise<Printer> {
  return (await request<{ printer: Printer }>('/api/printers', { method: 'POST', body: JSON.stringify(input) })).printer;
}

/** Send only the fields that changed; the API keeps the rest. */
export async function updatePrinter(id: number, changes: Record<string, unknown>): Promise<Printer> {
  return (await request<{ printer: Printer }>(`/api/printers/${id}`, { method: 'PUT', body: JSON.stringify(changes) })).printer;
}
