// Order domain shared by the Worker API and the React app.

export const STAGES = ['nuevo', 'disenando', 'imprimiendo', 'listo', 'entregado'] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  nuevo: 'Nuevo',
  disenando: 'Diseñando',
  imprimiendo: 'Imprimiendo',
  listo: 'Listo',
  entregado: 'Entregado',
};

export const CHANNELS = ['Instagram', 'WhatsApp', 'Tienda web', 'Email', 'En persona'] as const;
export type Channel = (typeof CHANNELS)[number];

export interface Order {
  id: string; // order number padded to at least four digits, e.g. "0142"
  item: string;
  client: string; // the client's name, read through the client record
  clientId: number | null; // null only for an old row the migration could not link
  channel: Channel;
  stage: Stage;
  dueDate: string | null; // YYYY-MM-DD
  dueTime: string | null; // HH:MM
  price: number; // whole pesos
  deposit: number | null; // whole pesos; null means no deposit yet
  paid: boolean;
  material: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A validated create-order request. It names its client either by `clientId` (an existing client) or by
 * `client` (a name: an existing client when it matches, otherwise a new one). With `clientId`, `client` is ignored.
 */
export interface NewOrder {
  item: string;
  client: string;
  clientId: number | null;
  channel: Channel;
  dueDate: string | null;
  dueTime: string | null;
  price: number;
  deposit: number | null;
  material: string;
  note: string;
}

export function isStage(value: unknown): value is Stage {
  return typeof value === 'string' && (STAGES as readonly string[]).includes(value);
}

export function stageIndex(stage: Stage): number {
  return STAGES.indexOf(stage);
}

export function nextStage(stage: Stage): Stage | null {
  const i = stageIndex(stage);
  return i < STAGES.length - 1 ? STAGES[i + 1] : null;
}

export function previousStage(stage: Stage): Stage | null {
  const i = stageIndex(stage);
  return i > 0 ? STAGES[i - 1] : null;
}

export function isActive(order: Pick<Order, 'stage'>): boolean {
  return order.stage !== 'entregado';
}

/** Lowercase, strip accents and the leading "#", so "Lucía" matches "lucia" and "#0142" matches "0142". */
export function normalizeSearch(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/#/g, '').trim();
}

export function matchesSearch(order: Pick<Order, 'id' | 'client' | 'item'>, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  return normalizeSearch(`${order.client} ${order.item} ${order.id}`).includes(q);
}

export function formatOrderNumber(n: number): string {
  return String(n).padStart(4, '0');
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string> };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function wholePesos(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  return null;
}

/** Validate the body of a create-order request. Error messages are shown to the owners as is. */
export function validateNewOrder(input: unknown): ValidationResult<NewOrder> {
  const errors: Record<string, string> = {};
  const body = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const text = (key: string, max: number, required: boolean): string => {
    const raw = body[key];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (required && !value) errors[key] = 'Completá este dato.';
    else if (value.length > max) errors[key] = `Máximo ${max} caracteres.`;
    return value;
  };

  const item = text('item', 120, true);
  const rawClientId = body.clientId;
  let clientId: number | null = null;
  if (rawClientId != null && rawClientId !== '') {
    if (typeof rawClientId === 'number' && Number.isInteger(rawClientId) && rawClientId > 0) clientId = rawClientId;
    else errors.clientId = 'Elegí un cliente de la lista.';
  }
  // A client picked by id needs no name.
  const client = text('client', 80, rawClientId == null || rawClientId === '');
  const material = text('material', 80, false);
  const note = text('note', 1000, false);

  const channel = body.channel;
  if (typeof channel !== 'string' || !(CHANNELS as readonly string[]).includes(channel)) {
    errors.channel = 'Elegí por dónde llegó el pedido.';
  }

  const dueDate = body.dueDate == null || body.dueDate === '' ? null : body.dueDate;
  if (dueDate !== null && (typeof dueDate !== 'string' || !DATE_RE.test(dueDate))) {
    errors.dueDate = 'La fecha tiene que ser AAAA-MM-DD.';
  }
  const dueTime = body.dueTime == null || body.dueTime === '' ? null : body.dueTime;
  if (dueTime !== null && (typeof dueTime !== 'string' || !TIME_RE.test(dueTime))) {
    errors.dueTime = 'La hora tiene que ser HH:MM.';
  }

  const price = wholePesos(body.price);
  if (price === null) errors.price = 'Poné el precio en pesos, sin centavos.';
  const deposit = body.deposit == null || body.deposit === '' ? null : wholePesos(body.deposit);
  if (body.deposit != null && body.deposit !== '' && deposit === null) errors.deposit = 'La seña va en pesos, sin centavos.';
  if (price !== null && deposit !== null && deposit > price) errors.deposit = 'La seña no puede ser mayor que el precio.';

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      item, client, clientId, material, note,
      channel: channel as Channel,
      dueDate: dueDate as string | null,
      dueTime: dueTime as string | null,
      price: price as number,
      deposit,
    },
  };
}
