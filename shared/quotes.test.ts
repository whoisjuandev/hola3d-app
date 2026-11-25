import { describe, expect, it } from 'vitest';
import { calculateCost, type CalcInput, type CalcLineInput, type CalcPrinter, type CalcSpool } from './calculator';
import { DEFAULT_COST_SETTINGS } from './cost-settings';
import {
  addDays, canAcceptQuote, isQuoteExpired, canChangeQuoteStatus, defaultValidUntil, formatDay, formatPesos, formatQuoteNumber, missingReferences,
  ordersFromQuote, quoteWhatsappMessage, quoteWhatsappUrl, validateAcceptQuote, validateNewQuote, validateQuoteChanges,
  QUOTE_STATUSES, calculationSummary, type Quote,
} from './quotes';

const a1: CalcPrinter = { id: 1, name: 'La A1', purchasePrice: 720000, lifetimeHours: 5000, powerWatts: 100 };
const white: CalcSpool = { id: 1, material: 'PLA', colorName: 'Blanco', colorHex: '#ffffff', brand: 'Grilon3', netGrams: 1000, remainingGrams: 640, price: 21000 };

function line(overrides: Partial<CalcLineInput> = {}): CalcLineInput {
  return {
    name: 'Llavero con logo', quantity: 12, printerId: 1, printMinutesPerUnit: 30,
    filaments: [{ spoolId: 1, material: '', pricePerKg: 0, gramsPerUnit: 8 }], prepMinutes: 20, postMinutes: 40, packaging: 1200, ...overrides,
  };
}

const input: CalcInput = {
  lines: [line(), line({ name: 'Cartel', quantity: 1, printerId: null, printMinutesPerUnit: 0, prepMinutes: 0, postMinutes: 0, packaging: 0,
    filaments: [{ spoolId: null, material: 'PETG negro', pricePerKg: 30000, gramsPerUnit: 100 }] })],
};

const valid = { clientId: 3, title: 'Llaveros y cartel', validUntil: '2026-12-10', note: 'Seña del 50 %.', input };

describe('quote numbers and dates', () => {
  it('shows the sequential number as P- and four digits, growing past 9999', () => {
    expect(formatQuoteNumber(1)).toBe('P-0001');
    expect(formatQuoteNumber(142)).toBe('P-0142');
    expect(formatQuoteNumber(10000)).toBe('P-10000');
  });

  it('adds calendar days, across months and years', () => {
    expect(addDays('2026-11-25', 15)).toBe('2026-12-10');
    expect(addDays('2026-12-20', 15)).toBe('2027-01-04');
  });

  it('is valid for 15 days from today by default', () => {
    expect(defaultValidUntil('2026-11-25')).toBe('2026-12-10');
  });

  it('writes a date as DD/MM/AAAA and pesos with dots', () => {
    expect(formatDay('2026-12-10')).toBe('10/12/2026');
    expect(formatPesos(26200)).toBe('$26.200');
    expect(formatPesos(1250000)).toBe('$1.250.000');
    expect(formatPesos(900)).toBe('$900');
  });
});

describe('validateNewQuote', () => {
  it('accepts a client id, title, validity, note and calculator input, trimmed', () => {
    const r = validateNewQuote({ ...valid, title: '  Llaveros y cartel ', input: { lines: [{ ...line(), name: ' Llavero con logo ' }] } });
    expect(r).toEqual({ ok: true, value: { client: '', clientId: 3, title: 'Llaveros y cartel', validUntil: '2026-12-10', note: 'Seña del 50 %.', input: { lines: [line()] } } });
  });

  it('accepts a client name instead of an id, and an empty note', () => {
    const r = validateNewQuote({ ...valid, clientId: undefined, client: ' Bruno A. ', note: undefined });
    expect(r).toMatchObject({ ok: true, value: { client: 'Bruno A.', clientId: null, note: '' } });
  });

  it('keeps only the calculator fields of the input and ignores a total sent by the browser', () => {
    const r = validateNewQuote({ ...valid, total: 1, result: { total: 1 }, input: { lines: [{ ...line(), extra: 'x', filaments: [{ spoolId: 1, gramsPerUnit: 8, material: '', pricePerKg: 0, cost: 1 }] }] } });
    expect(r.ok && r.value).toEqual({ client: '', clientId: 3, title: 'Llaveros y cartel', validUntil: '2026-12-10', note: 'Seña del 50 %.', input: { lines: [line()] } });
  });

  it('asks for a client, a title and a real validity date', () => {
    expect(validateNewQuote({ input })).toEqual({
      ok: false,
      errors: { client: 'Completá este dato.', title: 'Completá este dato.', validUntil: 'Poné hasta qué fecha vale el presupuesto.' },
    });
    expect(validateNewQuote({ ...valid, clientId: 'tres', validUntil: '2026-02-30' })).toEqual({
      ok: false, errors: { clientId: 'Elegí un cliente de la lista.', validUntil: 'La fecha tiene que ser AAAA-MM-DD.' },
    });
  });

  it('reports the first problem in the pieces on input', () => {
    const bad = (l: Record<string, unknown>) => validateNewQuote({ ...valid, input: { lines: [line(), { ...line(), ...l }] } });
    const error = (l: Record<string, unknown>) => { const r = bad(l); return r.ok ? null : r.errors.input; };
    expect(error({ name: ' ' })).toBe('Pieza 2: ponele un nombre.');
    expect(error({ name: 'x'.repeat(101) })).toBe('Pieza 2: el nombre va hasta 100 caracteres.');
    expect(error({ quantity: 0 })).toBe('Pieza 2: la cantidad tiene que ser un número entero desde 1.');
    expect(error({ printerId: 'A1' })).toBe('Pieza 2: elegí una impresora de la lista.');
    expect(error({ printMinutesPerUnit: 1.5 })).toBe('Pieza 2: los tiempos van en minutos enteros.');
    expect(error({ postMinutes: -1 })).toBe('Pieza 2: los tiempos van en minutos enteros.');
    expect(error({ packaging: 10.5 })).toBe('Pieza 2: el packaging va en pesos, sin centavos.');
    expect(error({ filaments: 'PLA' })).toBe('Pieza 2: revisá los filamentos.');
    expect(error({ filaments: [{ spoolId: 0, material: '', pricePerKg: 0, gramsPerUnit: 8 }] })).toBe('Pieza 2: elegí una bobina de la lista.');
    expect(error({ filaments: [{ spoolId: null, material: 'PLA', pricePerKg: 1.5, gramsPerUnit: 8 }] })).toBe('Pieza 2: el precio por kg va en pesos, sin centavos.');
    expect(error({ filaments: [{ spoolId: 1, material: '', pricePerKg: 0, gramsPerUnit: -8 }] })).toBe('Pieza 2: los gramos van en números enteros.');
    expect(validateNewQuote({ ...valid, input: { lines: [] } })).toEqual({ ok: false, errors: { input: 'Agregá al menos una pieza.' } });
    expect(validateNewQuote({ ...valid, input: undefined })).toEqual({ ok: false, errors: { input: 'Agregá al menos una pieza.' } });
    expect(validateNewQuote({ ...valid, input: { lines: Array.from({ length: 31 }, () => line()) } })).toEqual({ ok: false, errors: { input: 'Máximo 30 piezas por presupuesto.' } });
  });
});

describe('missingReferences', () => {
  it('names the first piece whose printer or spool is not stored', () => {
    expect(missingReferences(input, [a1], [white])).toBeNull();
    expect(missingReferences({ lines: [line(), line({ printerId: 9 })] }, [a1], [white])).toBe('Pieza 2: esa impresora ya no existe.');
    expect(missingReferences({ lines: [line({ filaments: [{ spoolId: 9, material: '', pricePerKg: 0, gramsPerUnit: 1 }] })] }, [a1], [white]))
      .toBe('Pieza 1: esa bobina ya no existe.');
  });
});

describe('validateQuoteChanges', () => {
  it('accepts a title, validity, note and a known status', () => {
    expect(validateQuoteChanges({ title: ' Nuevo título ', validUntil: '2026-12-31', note: '', status: 'enviado' })).toEqual({
      ok: true, value: { title: 'Nuevo título', validUntil: '2026-12-31', note: '', status: 'enviado' },
    });
  });

  it('rejects an empty title, a wrong date and an unknown status', () => {
    expect(validateQuoteChanges({ title: '', validUntil: '10/12/2026', note: '', status: 'perdido' })).toEqual({
      ok: false,
      errors: { title: 'Completá este dato.', validUntil: 'La fecha tiene que ser AAAA-MM-DD.', status: 'Ese estado no existe.' },
    });
  });
});

describe('status transitions', () => {
  it('moves freely between borrador, enviado and rechazado', () => {
    for (const from of ['borrador', 'enviado', 'rechazado'] as const) {
      for (const to of ['borrador', 'enviado', 'rechazado'] as const) expect(canChangeQuoteStatus(from, to)).toBe(true);
    }
  });

  it('never reaches aceptado by a status change, and an accepted quote stays accepted', () => {
    for (const from of QUOTE_STATUSES) {
      expect(canChangeQuoteStatus(from, 'aceptado')).toBe(from === 'aceptado');
      for (const to of QUOTE_STATUSES) if (from === 'aceptado') expect(canChangeQuoteStatus(from, to)).toBe(to === 'aceptado');
    }
  });

  it('accepts only a borrador or enviado quote', () => {
    expect(QUOTE_STATUSES.filter(canAcceptQuote)).toEqual(['borrador', 'enviado']);
  });
});

describe('isQuoteExpired', () => {
  it('marks a quote still waiting for an answer whose validity date has passed', () => {
    expect(isQuoteExpired({ status: 'enviado', validUntil: '2026-11-24' }, '2026-11-25')).toBe(true);
    expect(isQuoteExpired({ status: 'borrador', validUntil: '2026-11-24' }, '2026-11-25')).toBe(true);
    expect(isQuoteExpired({ status: 'enviado', validUntil: '2026-11-25' }, '2026-11-25')).toBe(false);
    expect(isQuoteExpired({ status: 'aceptado', validUntil: '2026-11-01' }, '2026-11-25')).toBe(false);
    expect(isQuoteExpired({ status: 'rechazado', validUntil: '2026-11-01' }, '2026-11-25')).toBe(false);
  });
});

describe('validateAcceptQuote', () => {
  it('takes the channel of the new orders, WhatsApp when not given', () => {
    expect(validateAcceptQuote({ channel: 'Instagram' })).toEqual({ ok: true, value: { channel: 'Instagram' } });
    expect(validateAcceptQuote({})).toEqual({ ok: true, value: { channel: 'WhatsApp' } });
    expect(validateAcceptQuote(undefined)).toEqual({ ok: true, value: { channel: 'WhatsApp' } });
    expect(validateAcceptQuote({ channel: 'Paloma' })).toEqual({ ok: false, errors: { channel: 'Elegí por dónde llegó el pedido.' } });
  });
});

const result = calculateCost(input, [a1], [white], DEFAULT_COST_SETTINGS);
const quote: Quote = {
  id: 3, number: 'P-0003', clientId: 3, client: 'Café Nube', title: 'Llaveros y cartel', status: 'enviado', validUntil: '2026-12-10',
  input, result, total: result.total, note: '', createdAt: '2026-11-25T12:00:00.000Z', updatedAt: '2026-11-25T12:00:00.000Z',
};

describe('ordersFromQuote', () => {
  it('makes one order per line: name and quantity as the item, the frozen line price, the channel', () => {
    expect(result.lines.map((l) => l.total)).toEqual([21200, 5000]);
    expect(ordersFromQuote(quote, 'Instagram')).toEqual([
      { item: 'Llavero con logo × 12', channel: 'Instagram', price: 21200, dueDate: null, dueTime: null, deposit: null, material: '', note: '' },
      { item: 'Cartel', channel: 'Instagram', price: 5000, dueDate: null, dueTime: null, deposit: null, material: '', note: '' },
    ]);
  });
});

describe('WhatsApp message', () => {
  it('lists the items, the total and the validity date', () => {
    expect(quoteWhatsappMessage(quote)).toBe([
      '¡Hola, Café Nube! Te paso el presupuesto de Hola3D.',
      '',
      '*P-0003 · Llaveros y cartel*',
      '• Llavero con logo × 12: $21.200 ($1.767 c/u)',
      '• Cartel: $5.000',
      '',
      '*Total: $26.200*',
      'Válido hasta el 10/12/2026.',
    ].join('\n'));
  });

  it('adds the note for the client at the end', () => {
    expect(quoteWhatsappMessage({ ...quote, note: 'Seña del 50 % para empezar.' })).toMatch(/Válido hasta el 10\/12\/2026\.\n\nSeña del 50 % para empezar\.$/);
  });

  it('opens the client chat with the message, or WhatsApp without a number when the client has no phone', () => {
    const text = encodeURIComponent(quoteWhatsappMessage(quote));
    expect(quoteWhatsappUrl(quote, '+54 9 11 5555-0142')).toBe(`https://wa.me/5491155550142?text=${text}`);
    expect(quoteWhatsappUrl(quote, '')).toBe(`https://wa.me/?text=${text}`);
  });
});

describe('validateNewQuote profit choice', () => {
  it('keeps a profit choice with only its known fields, and leaves it out when not sent', () => {
    const r = validateNewQuote({ ...valid, input: { ...input, profit: { mode: 'multiplicador', value: 4, extra: 1 } } });
    expect(r).toMatchObject({ ok: true, value: { input: { lines: input.lines, profit: { mode: 'multiplicador', value: 4 } } } });
    if (r.ok) expect(r.value.input.profit).toEqual({ mode: 'multiplicador', value: 4 });
    const plain = validateNewQuote(valid);
    expect(plain.ok && 'profit' in plain.value.input).toBe(false);
    expect(validateNewQuote({ ...valid, input: { ...input, profit: null } })).toMatchObject({ ok: true });
  });

  it('rejects a wrong profit choice on input', () => {
    expect(validateNewQuote({ ...valid, input: { ...input, profit: { mode: 'multiplicador', value: 12 } } })).toEqual({
      ok: false, errors: { input: 'El multiplicador va de 1 a 11, con hasta dos decimales.' },
    });
    expect(validateNewQuote({ ...valid, input: { ...input, profit: { mode: 'doble', value: 2 } } })).toEqual({
      ok: false, errors: { input: 'Elegí cómo calcular la ganancia: porcentaje o multiplicador.' },
    });
  });
});

describe('calculationSummary', () => {
  it('lists each piece with its quantity and price, then the total, and nothing about costs or margin', () => {
    const text = calculationSummary(result);
    expect(text).toBe([
      'Presupuesto Hola3D',
      '• Llavero con logo × 12: $21.200 ($1.767 c/u)',
      '• Cartel × 1: $5.000',
      'Total: $26.200',
    ].join('\n'));
    expect(text).not.toMatch(/costo|margen|ganancia|material|comisi|%/i);
  });

  it('names a piece without a name by its place', () => {
    const r = calculateCost({ lines: [{ ...input.lines[1], name: '', quantity: 2 }] }, [a1], [white], DEFAULT_COST_SETTINGS);
    expect(calculationSummary(r)).toBe(['Presupuesto Hola3D', `• Pieza 1 × 2: ${formatPesos(r.total)} (${formatPesos(r.unitPrice)} c/u)`, `Total: ${formatPesos(r.total)}`].join('\n'));
  });
});
