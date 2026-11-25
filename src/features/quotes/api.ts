import type { Client } from '../../../shared/clients';
import type { Channel, Order } from '../../../shared/orders';
import type { Quote } from '../../../shared/quotes';
import { request } from '../../ui/api';
import type { ClientReference } from '../clients/picker';

/** One quote with its client (for the phone) and the orders made from it once accepted. */
export interface QuoteDetail {
  quote: Quote;
  client: Client | null;
  orders: Order[];
}

export async function fetchQuotes(): Promise<Quote[]> {
  return (await request<{ quotes: Quote[] }>('/api/quotes')).quotes;
}

export async function fetchClientQuotes(clientId: number): Promise<Quote[]> {
  return (await request<{ quotes: Quote[] }>(`/api/quotes?clientId=${clientId}`)).quotes;
}

export async function fetchQuote(id: number): Promise<QuoteDetail> {
  return request<QuoteDetail>(`/api/quotes/${id}`);
}

/** The server prices `input` again with today's costs; the total is never sent. */
export async function createQuote(input: Record<string, unknown>): Promise<Quote> {
  return (await request<{ quote: Quote }>('/api/quotes', { method: 'POST', body: JSON.stringify(input) })).quote;
}

/** Send only the fields that changed: title, validUntil, note, status, showBreakdown, recipientName or recipientPhone. */
export async function updateQuote(id: number, changes: Record<string, unknown>): Promise<Quote> {
  return (await request<{ quote: Quote }>(`/api/quotes/${id}`, { method: 'PUT', body: JSON.stringify(changes) })).quote;
}

/** `client` is needed only for a quote without a client: the one the orders are made for. */
export async function acceptQuote(id: number, channel: Channel, client?: ClientReference): Promise<{ quote: Quote; orders: Order[] }> {
  return request<{ quote: Quote; orders: Order[] }>(`/api/quotes/${id}/accept`, { method: 'POST', body: JSON.stringify({ channel, ...client }) });
}
