import { describe, expect, it } from 'vitest';
import type { CalcInput } from '../../../shared/calculator';
import type { Quote } from '../../../shared/quotes';
import {
  newQuickQuoteForm, quickQuoteChanges, quickQuoteFields, quickQuoteProblem, quickValidUntil, saveQuickQuote, type QuickQuoteForm,
} from './quick';

const today = '2026-11-25';
const form: QuickQuoteForm = {
  recipientName: ' Juan Pérez ', title: 'Llaveros', validity: 'none', otherDate: '', note: 'Entrega en 5 días.', showBreakdown: false,
  phone: '+54 9 11 5555-0199',
};

describe('newQuickQuoteForm', () => {
  it('starts with the title from the piece names, no deadline and the breakdown off', () => {
    expect(newQuickQuoteForm(['Llavero con logo', 'Cartel'])).toEqual({
      recipientName: '', title: 'Llavero con logo y Cartel', validity: 'none', otherDate: '', note: '', showBreakdown: false, phone: '',
    });
  });
});

describe('quickValidUntil', () => {
  it('counts the days from the workshop\'s today, and has no date for "Sin plazo"', () => {
    expect(quickValidUntil({ ...form, validity: 'none' }, today)).toBeNull();
    expect(quickValidUntil({ ...form, validity: '7' }, today)).toBe('2026-12-02');
    expect(quickValidUntil({ ...form, validity: '15' }, today)).toBe('2026-12-10');
    expect(quickValidUntil({ ...form, validity: '30' }, today)).toBe('2026-12-25');
    expect(quickValidUntil({ ...form, validity: 'other', otherDate: '2027-01-15' }, today)).toBe('2027-01-15');
  });
});

describe('quickQuoteProblem', () => {
  it('asks for the recipient name and the title, before anything is saved or any tab opened', () => {
    expect(quickQuoteProblem({ ...form, recipientName: ' ', title: '' })).toEqual({ recipientName: 'Completá este dato.', title: 'Completá este dato.' });
  });

  it('asks for the date when "Otro" has none, before anything is saved', () => {
    expect(quickQuoteProblem({ ...form, validity: 'other', otherDate: '' })).toEqual({ validUntil: 'Elegí la fecha.' });
    expect(quickQuoteProblem({ ...form, validity: 'other', otherDate: '2027-01-15' })).toBeNull();
    expect(quickQuoteProblem(form)).toBeNull();
  });
});

describe('quickQuoteFields', () => {
  it('sends the recipient and phone as text, the validity, the note and the switch', () => {
    expect(quickQuoteFields({ ...form, validity: '7', showBreakdown: true }, today)).toEqual({
      recipientName: ' Juan Pérez ', recipientPhone: '+54 9 11 5555-0199', title: 'Llaveros', validUntil: '2026-12-02', note: 'Entrega en 5 días.',
      showBreakdown: true,
    });
  });
});

describe('quickQuoteChanges', () => {
  const saved = {
    recipientName: 'Juan Pérez', recipientPhone: '+54 9 11 5555-0199', title: 'Llaveros', validUntil: null, note: 'Entrega en 5 días.', showBreakdown: false,
  } as Quote;

  it('is empty when the form still says what was saved (the server trims the text)', () => {
    expect(quickQuoteChanges(quickQuoteFields(form, today), saved)).toEqual({});
  });

  it('lists only what changed since the quote was saved', () => {
    const changed = quickQuoteFields({ ...form, title: 'Llaveros x 20', validity: '15', recipientName: 'Juan P.', phone: '', showBreakdown: true }, today);
    expect(quickQuoteChanges(changed, saved)).toEqual({
      title: 'Llaveros x 20', validUntil: '2026-12-10', recipientName: 'Juan P.', recipientPhone: '', showBreakdown: true,
    });
    expect(quickQuoteChanges(quickQuoteFields(form, today), { ...saved, validUntil: '2026-12-10', note: 'Otra' })).toEqual({
      validUntil: null, note: 'Entrega en 5 días.',
    });
  });
});

describe('saveQuickQuote', () => {
  const input = { lines: [] } as unknown as CalcInput;
  const key = 'f3b0c442-98fc-4c1c-a3e6-6f2d5b8e9a01';
  const stored = {
    id: 7, recipientName: 'Juan Pérez', recipientPhone: '+54 9 11 5555-0199', title: 'Llaveros', validUntil: null, note: 'Entrega en 5 días.',
    showBreakdown: false,
  } as Quote;

  function api(createAnswers: (Quote | Error)[]) {
    const calls: { create: Record<string, unknown>[]; update: [number, Record<string, unknown>][] } = { create: [], update: [] };
    return {
      calls,
      create: async (body: Record<string, unknown>) => {
        calls.create.push(body);
        const answer = createAnswers.shift();
        if (!answer || answer instanceof Error) throw answer ?? new Error('no answer');
        return answer;
      },
      update: async (id: number, changes: Record<string, unknown>) => {
        calls.update.push([id, changes]);
        return { ...stored, ...changes } as Quote;
      },
    };
  }

  it('saves the first time as enviado with the key and the input, and changes nothing more when the form is what was saved', async () => {
    const fake = api([stored]);
    const fields = quickQuoteFields(form, today);
    expect(await saveQuickQuote({ saved: null, fields, input, submissionKey: key }, fake)).toBe(stored);
    expect(fake.calls).toEqual({ create: [{ ...fields, status: 'enviado', input, submissionKey: key }], update: [] });
  });

  it('after a failed save, the next action tries the save again with the same key', async () => {
    const fake = api([new Error('Sin conexión'), stored]);
    const fields = quickQuoteFields(form, today);
    await expect(saveQuickQuote({ saved: null, fields, input, submissionKey: key }, fake)).rejects.toThrow('Sin conexión');
    expect(await saveQuickQuote({ saved: null, fields, input, submissionKey: key }, fake)).toBe(stored);
    expect(fake.calls.create.map((body) => body.submissionKey)).toEqual([key, key]);
    expect(fake.calls.update).toEqual([]);
  });

  it('when the retry answers a quote stored before the form changed, it updates what changed since', async () => {
    const fake = api([stored]);
    const fields = quickQuoteFields({ ...form, title: 'Llaveros x 20', showBreakdown: true }, today);
    expect(await saveQuickQuote({ saved: null, fields, input, submissionKey: key }, fake)).toMatchObject({ title: 'Llaveros x 20', showBreakdown: true });
    expect(fake.calls.update).toEqual([[7, { title: 'Llaveros x 20', showBreakdown: true }]]);
  });

  it('once saved, only updates what changed, never saving it again', async () => {
    const fake = api([]);
    expect(await saveQuickQuote({ saved: stored, fields: quickQuoteFields(form, today), input, submissionKey: key }, fake)).toBe(stored);
    await saveQuickQuote({ saved: stored, fields: quickQuoteFields({ ...form, note: '' }, today), input, submissionKey: key }, fake);
    expect(fake.calls).toEqual({ create: [], update: [[7, { note: '' }]] });
  });
});
