// The quick quote form of the calculator: what it starts with, what it saves and what changed since it was saved.
import type { CalcInput } from '../../../shared/calculator';
import { addDays, type Quote } from '../../../shared/quotes';
import { defaultQuoteTitle } from './format';

export type ValidityChoice = 'none' | '7' | '15' | '30' | 'other';

export const VALIDITY_CHOICES: readonly { key: ValidityChoice; label: string }[] = [
  { key: 'none', label: 'Sin plazo' },
  { key: '7', label: '7 días' },
  { key: '15', label: '15 días' },
  { key: '30', label: '30 días' },
  { key: 'other', label: 'Otro' },
];

export interface QuickQuoteForm {
  recipientName: string;
  title: string;
  validity: ValidityChoice;
  otherDate: string; // YYYY-MM-DD, used with "Otro"
  note: string;
  showBreakdown: boolean;
  phone: string;
}

/** The quote fields the form saves, as the API takes them. */
export type QuickQuoteFields = Pick<Quote, 'recipientName' | 'recipientPhone' | 'title' | 'validUntil' | 'note' | 'showBreakdown'>;

export function newQuickQuoteForm(pieceNames: string[]): QuickQuoteForm {
  return { recipientName: '', title: defaultQuoteTitle(pieceNames), validity: 'none', otherDate: '', note: '', showBreakdown: false, phone: '' };
}

/** The validity date the choice means, its days counted from `today` (the workshop's date); null for "Sin plazo". */
export function quickValidUntil(form: Pick<QuickQuoteForm, 'validity' | 'otherDate'>, today: string): string | null {
  if (form.validity === 'none') return null;
  if (form.validity === 'other') return form.otherDate || null;
  return addDays(today, Number(form.validity));
}

/**
 * What to fix before saving, so an action does not open a tab only to close it: the recipient name and the title are
 * required, and "Otro" without a date would save a quote with no deadline. The server checks the rest.
 */
export function quickQuoteProblem(form: QuickQuoteForm): Record<string, string> | null {
  const errors: Record<string, string> = {};
  if (!form.recipientName.trim()) errors.recipientName = 'Completá este dato.';
  if (!form.title.trim()) errors.title = 'Completá este dato.';
  if (form.validity === 'other' && !form.otherDate) errors.validUntil = 'Elegí la fecha.';
  return Object.keys(errors).length ? errors : null;
}

export function quickQuoteFields(form: QuickQuoteForm, today: string): QuickQuoteFields {
  return {
    recipientName: form.recipientName, recipientPhone: form.phone, title: form.title, validUntil: quickValidUntil(form, today), note: form.note,
    showBreakdown: form.showBreakdown,
  };
}

/** The fields that differ from the saved quote, to update it before the next action. The server trims text, so this does too. */
export function quickQuoteChanges(fields: QuickQuoteFields, saved: QuickQuoteFields): Partial<QuickQuoteFields> {
  const same = (key: keyof QuickQuoteFields) => {
    const value = fields[key];
    return (typeof value === 'string' ? value.trim() : value) === saved[key];
  };
  return Object.fromEntries(Object.entries(fields).filter(([key]) => !same(key as keyof QuickQuoteFields))) as Partial<QuickQuoteFields>;
}

/** The API calls a save makes, passed in so the steps can be tested without a server. */
export interface QuickQuoteApi {
  create(body: Record<string, unknown>): Promise<Quote>;
  update(id: number, changes: Record<string, unknown>): Promise<Quote>;
}

/**
 * The saved quote, for any of the three actions. Until a save has answered, every action saves it as enviado with the
 * same `submissionKey`, made when the dialog opened: when an earlier try was stored but its answer was lost, the API
 * answers that quote instead of storing a second one. Whatever the form changed since the quote was stored is then
 * written with an update, the same as for a quote saved earlier in the dialog.
 */
export async function saveQuickQuote(
  step: { saved: Quote | null; fields: QuickQuoteFields; input: CalcInput; submissionKey: string }, api: QuickQuoteApi,
): Promise<Quote> {
  const { fields, input, submissionKey } = step;
  const quote = step.saved ?? (await api.create({ ...fields, status: 'enviado', input, submissionKey }));
  const changes = quickQuoteChanges(fields, quote);
  return Object.keys(changes).length ? api.update(quote.id, changes) : quote;
}
