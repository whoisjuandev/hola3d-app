// Client domain shared by the Worker API and the React app.
import { asBody, readText, type Body, type Errors } from './fields';
import { normalizeSearch, type Order, type ValidationResult } from './orders';

export interface Client {
  id: number;
  name: string;
  phone: string; // as the owner wrote it; the WhatsApp link uses its digits
  instagram: string; // handle without the leading "@"
  email: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export type ClientInput = Omit<Client, 'id' | 'createdAt' | 'updatedAt'>;

/** A client with what the list and the client page show about its orders. */
export type ClientSummary = Client & { orderCount: number; totalSpent: number; balanceOwed: number };

const PHONE_RE = /^\+?[\d\s().-]+$/;
const HANDLE_RE = /^[A-Za-z0-9._]{1,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * An optional phone as a client's: up to 30 characters of digits, +, spaces, dots, dashes and brackets, with 6 to 15
 * digits. Also the phone of a quick quote's recipient.
 */
export function readPhone(body: Body, errors: Errors, key: string): string {
  const phone = readText(body, errors, key, 30, false);
  const digits = phone.replace(/\D/g, '').length;
  if (phone && !errors[key] && (!PHONE_RE.test(phone) || digits < 6 || digits > 15)) {
    errors[key] = 'Poné el teléfono con números (podés usar +, espacios y guiones).';
  }
  return phone;
}

/** Validate a client for create or update. Error messages are shown to the owners as is. */
export function validateClient(input: unknown): ValidationResult<ClientInput> {
  const errors: Errors = {};
  const body = asBody(input);

  const name = readText(body, errors, 'name', 80, true);
  const phone = readPhone(body, errors, 'phone');
  const instagram = readText(body, errors, 'instagram', 31, false).replace(/^@/, '').trim();
  if (instagram && !errors.instagram && !HANDLE_RE.test(instagram)) {
    errors.instagram = 'El usuario de Instagram lleva letras, números, puntos o guiones bajos.';
  }
  const email = readText(body, errors, 'email', 120, false);
  if (email && !errors.email && !EMAIL_RE.test(email)) errors.email = 'Revisá el email.';
  const note = readText(body, errors, 'note', 1000, false);

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name, phone, instagram, email, note } };
}

/** The form of a name used to match clients: no case, no accents, no surrounding spaces. */
export function clientNameKey(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** The client whose name matches `name` ignoring case, accents and surrounding spaces, or null. */
export function findClientByName<T extends Pick<Client, 'name'>>(clients: T[], name: string): T | null {
  const key = clientNameKey(name);
  if (!key) return null;
  return clients.find((c) => clientNameKey(c.name) === key) ?? null;
}

type Money = Pick<Order, 'stage' | 'price' | 'deposit' | 'paid'>;

/** Sum of the prices of delivered orders. */
export function totalSpent(orders: Money[]): number {
  return orders.reduce((sum, o) => (o.stage === 'entregado' ? sum + o.price : sum), 0);
}

/** For orders not marked paid: price minus deposit, added up. */
export function balanceOwed(orders: Money[]): number {
  return orders.reduce((sum, o) => (o.paid ? sum : sum + o.price - (o.deposit ?? 0)), 0);
}

/** Each client with its order count, total spent and balance owed, in the order given. */
export function summarizeClients<C extends Pick<Client, 'id'>>(
  clients: C[],
  orders: (Money & { clientId: number | null })[],
): (C & { orderCount: number; totalSpent: number; balanceOwed: number })[] {
  return clients.map((c) => {
    const own = orders.filter((o) => o.clientId === c.id);
    return { ...c, orderCount: own.length, totalSpent: totalSpent(own), balanceOwed: balanceOwed(own) };
  });
}

export function matchesClientSearch(client: Pick<Client, 'name' | 'phone' | 'instagram' | 'email'>, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  const ig = client.instagram ? `@${client.instagram}` : '';
  return normalizeSearch(`${client.name} ${client.phone} ${client.phone.replace(/\D/g, '')} ${ig} ${client.email}`).includes(q);
}

/** "https://wa.me/5491155550142" from any way of writing the phone. Null without digits. */
export function whatsappUrl(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}` : null;
}

export function instagramUrl(handle: string): string | null {
  const clean = handle.trim().replace(/^@/, '');
  return clean ? `https://instagram.com/${clean}` : null;
}
