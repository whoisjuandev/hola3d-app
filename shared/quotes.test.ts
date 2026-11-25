import { describe, expect, it } from 'vitest';
import { calculateCost, type CalcInput, type CalcLineInput, type CalcPrinter, type CalcSpool } from './calculator';
import { DEFAULT_COST_SETTINGS } from './cost-settings';
import {
  addDays, canAcceptQuote, isQuoteExpired, canChangeQuoteStatus, defaultValidUntil, formatDay, formatPesos, formatQuoteNumber, missingReferences,
  ordersFromQuote, quoteContact, quoteWhatsappMessage, quoteWhatsappUrl, validateAcceptQuote, validateNewQuote, validateQuoteChanges,
  validateQuoteClient, QUOTE_STATUSES, calculationSummary, isSameQuoteSave, recipientFieldErrors, type NewQuote, type Quote,
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
    expect(r).toEqual({ ok: true, value: {
      client: '', clientId: 3, recipientName: '', recipientPhone: '', title: 'Llaveros y cartel', validUntil: '2026-12-10', note: 'Seña del 50 %.',
      showBreakdown: false, status: 'borrador', input: { lines: [line()] },
    } });
  });

  it('accepts a client name instead of an id, and an empty note', () => {
    const r = validateNewQuote({ ...valid, clientId: undefined, client: ' Bruno A. ', note: undefined });
    expect(r).toMatchObject({ ok: true, value: { client: 'Bruno A.', clientId: null, note: '' } });
  });

  it('keeps only the calculator fields of the input and ignores a total sent by the browser', () => {
    const r = validateNewQuote({ ...valid, total: 1, result: { total: 1 }, input: { lines: [{ ...line(), extra: 'x', filaments: [{ spoolId: 1, gramsPerUnit: 8, material: '', pricePerKg: 0, cost: 1 }] }] } });
    expect(r.ok && r.value).toEqual({
      client: '', clientId: 3, recipientName: '', recipientPhone: '', title: 'Llaveros y cartel', validUntil: '2026-12-10', note: 'Seña del 50 %.',
      showBreakdown: false, status: 'borrador', input: { lines: [line()] },
    });
  });

  it('asks for a client and a title, and a validity date when one is given', () => {
    expect(validateNewQuote({ input })).toEqual({ ok: false, errors: { client: 'Completá este dato.', title: 'Completá este dato.' } });
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

describe('validateNewQuote without a client (quick quote)', () => {
  const quickBody = { recipientName: ' Juan Pérez ', recipientPhone: ' +54 9 11 5555-0199 ', title: 'Llaveros', input };

  it('takes a recipient name instead of a client, with an optional phone, no validity, the breakdown off and borrador', () => {
    expect(validateNewQuote(quickBody)).toEqual({
      ok: true,
      value: {
        client: '', clientId: null, recipientName: 'Juan Pérez', recipientPhone: '+54 9 11 5555-0199', title: 'Llaveros', validUntil: null, note: '',
        showBreakdown: false, status: 'borrador', input,
      },
    });
    expect(validateNewQuote({ ...quickBody, recipientPhone: undefined })).toMatchObject({ ok: true, value: { recipientPhone: '' } });
  });

  it('takes a validity date or none, the breakdown switch and enviado', () => {
    expect(validateNewQuote({ ...quickBody, validUntil: '2026-12-10', showBreakdown: true, status: 'enviado' })).toMatchObject({
      ok: true, value: { validUntil: '2026-12-10', showBreakdown: true, status: 'enviado' },
    });
    for (const validUntil of [null, '']) expect(validateNewQuote({ ...quickBody, validUntil })).toMatchObject({ ok: true, value: { validUntil: null } });
    expect(validateNewQuote({ ...quickBody, validUntil: '2026-02-30' })).toEqual({ ok: false, errors: { validUntil: 'La fecha tiene que ser AAAA-MM-DD.' } });
  });

  it('asks for the recipient name, up to 80 characters, and checks the phone like a client\'s', () => {
    expect(validateNewQuote({ ...quickBody, recipientName: ' ' })).toEqual({ ok: false, errors: { recipientName: 'Completá este dato.' } });
    expect(validateNewQuote({ ...quickBody, recipientName: 'x'.repeat(81) })).toEqual({ ok: false, errors: { recipientName: 'Máximo 80 caracteres.' } });
    expect(validateNewQuote({ ...quickBody, recipientName: 'x'.repeat(80) })).toMatchObject({ ok: true });
    for (const recipientPhone of ['llamame', '12345', '1'.repeat(16)]) {
      expect(validateNewQuote({ ...quickBody, recipientPhone })).toEqual({
        ok: false, errors: { recipientPhone: 'Poné el teléfono con números (podés usar +, espacios y guiones).' },
      });
    }
  });

  it('starts only as borrador or enviado, and the switch is true or false', () => {
    for (const status of ['aceptado', 'rechazado', 'perdido']) {
      expect(validateNewQuote({ ...quickBody, status })).toEqual({ ok: false, errors: { status: 'Un presupuesto nuevo empieza como borrador o enviado.' } });
    }
    expect(validateNewQuote({ ...quickBody, showBreakdown: 'sí' })).toEqual({ ok: false, errors: { showBreakdown: 'Elegí si se incluye el desglose de costos.' } });
    expect(validateNewQuote({ ...valid, status: 'enviado', showBreakdown: true })).toMatchObject({ ok: true, value: { clientId: 3, status: 'enviado', showBreakdown: true } });
  });

  it('with a client, does not read the recipient fields', () => {
    expect(validateNewQuote({ ...valid, recipientName: 'Juan', recipientPhone: 'llamame' })).toMatchObject({
      ok: true, value: { clientId: 3, recipientName: '', recipientPhone: '' },
    });
  });
});

describe('validateQuoteClient', () => {
  it('takes the client a quick quote is accepted for, by id or by name', () => {
    expect(validateQuoteClient({ clientId: 2 })).toEqual({ ok: true, value: { client: '', clientId: 2 } });
    expect(validateQuoteClient({ client: ' Bruno A. ' })).toEqual({ ok: true, value: { client: 'Bruno A.', clientId: null } });
  });

  it('asks for one, and a client id from the list', () => {
    const ask = { ok: false, errors: { client: 'Elegí el cliente o escribí uno nuevo: los pedidos se crean a su nombre.' } };
    expect(validateQuoteClient({})).toEqual(ask);
    expect(validateQuoteClient(undefined)).toEqual(ask);
    expect(validateQuoteClient({ client: ' ' })).toEqual(ask);
    expect(validateQuoteClient({ clientId: 'dos' })).toEqual({ ok: false, errors: { clientId: 'Elegí un cliente de la lista.' } });
    expect(validateQuoteClient({ client: 'x'.repeat(81) })).toEqual({ ok: false, errors: { client: 'Máximo 80 caracteres.' } });
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
    expect(validateQuoteChanges({ title: ' Nuevo título ', validUntil: '2026-12-31', note: '', status: 'enviado' }, false)).toEqual({
      ok: true,
      value: { title: 'Nuevo título', validUntil: '2026-12-31', note: '', status: 'enviado', recipientName: '', recipientPhone: '', showBreakdown: false },
    });
  });

  it('accepts no validity, the recipient and the breakdown switch', () => {
    const quick = { title: 'Llaveros', validUntil: null, note: '', status: 'enviado', recipientName: ' Juan ', recipientPhone: '11 5555-0199', showBreakdown: true };
    expect(validateQuoteChanges(quick, true)).toEqual({ ok: true, value: { ...quick, recipientName: 'Juan' } });
  });

  it('asks for the recipient name only of a quote without a client, and checks the phone and the switch', () => {
    const quick = { title: 'Llaveros', validUntil: null, note: '', status: 'enviado', recipientName: '', recipientPhone: 'llamame', showBreakdown: 1 };
    expect(validateQuoteChanges(quick, true)).toEqual({
      ok: false,
      errors: {
        recipientName: 'Completá este dato.', recipientPhone: 'Poné el teléfono con números (podés usar +, espacios y guiones).',
        showBreakdown: 'Elegí si se incluye el desglose de costos.',
      },
    });
    expect(validateQuoteChanges({ ...quick, recipientPhone: '', showBreakdown: false }, false)).toMatchObject({ ok: true, value: { recipientName: '' } });
  });

  it('rejects an empty title, a wrong date and an unknown status', () => {
    expect(validateQuoteChanges({ title: '', validUntil: '10/12/2026', note: '', status: 'perdido' }, false)).toEqual({
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

  it('never marks a quote without a validity date', () => {
    expect(isQuoteExpired({ status: 'enviado', validUntil: null }, '2099-01-01')).toBe(false);
    expect(isQuoteExpired({ status: 'borrador', validUntil: null }, '2099-01-01')).toBe(false);
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
  id: 3, number: 'P-0003', clientId: 3, client: 'Café Nube', recipientName: '', recipientPhone: '', title: 'Llaveros y cartel', status: 'enviado',
  validUntil: '2026-12-10', showBreakdown: false, input, result, total: result.total, note: '', createdAt: '2026-11-25T12:00:00.000Z',
  updatedAt: '2026-11-25T12:00:00.000Z',
};
const quickQuote: Quote = { ...quote, clientId: null, client: null, recipientName: 'Juan Pérez', recipientPhone: '+54 9 11 5555-0199', validUntil: null };

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

  it('greets the recipient of a quote without a client, and leaves the validity out when there is none', () => {
    expect(quoteWhatsappMessage({ ...quickQuote, note: 'Entrega en 5 días.' })).toBe([
      '¡Hola, Juan Pérez! Te paso el presupuesto de Hola3D.',
      '',
      '*P-0003 · Llaveros y cartel*',
      '• Llavero con logo × 12: $21.200 ($1.767 c/u)',
      '• Cartel: $5.000',
      '',
      '*Total: $26.200*',
      '',
      'Entrega en 5 días.',
    ].join('\n'));
    expect(quoteWhatsappMessage({ ...quote, validUntil: null })).toMatch(/\*Total: \$26\.200\*$/);
  });

  it('writes to the client, or to the recipient of a quote without a client', () => {
    expect(quoteContact(quote, { phone: '+54 9 11 5555-0142' })).toEqual({ name: 'Café Nube', phone: '+54 9 11 5555-0142' });
    expect(quoteContact(quickQuote, null)).toEqual({ name: 'Juan Pérez', phone: '+54 9 11 5555-0199' });
    // Accepted for a client without a phone: the recipient fields belong to quotes without a client, so they are never used.
    expect(quoteContact({ ...quickQuote, client: 'Juan P.' }, { phone: '' })).toEqual({ name: 'Juan P.', phone: '' });
    expect(quoteContact({ ...quickQuote, client: 'Juan P.' }, null)).toEqual({ name: 'Juan P.', phone: '' });
    expect(quoteContact({ ...quickQuote, client: 'Juan P.' }, { phone: '11 4444-0000' })).toEqual({ name: 'Juan P.', phone: '11 4444-0000' });
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

describe('names and titles stored as one line of text', () => {
  const quickBody = { recipientName: 'Juan Pérez', title: 'Llaveros', input };
  const message = 'Escribilo en una línea, sin caracteres invisibles.';

  it('rejects a recipient name or title with control characters, like a NUL the table CHECK would refuse', () => {
    for (const bad of ['\u0000', 'Juan\u0000', 'Ju\nan', 'Juan\tPérez', '\u001b[1m', 'Juan\u007f', 'Juan\u0085']) {
      expect(validateNewQuote({ ...quickBody, recipientName: bad })).toEqual({ ok: false, errors: { recipientName: message } });
      expect(validateNewQuote({ ...quickBody, title: bad })).toEqual({ ok: false, errors: { title: message } });
      expect(validateNewQuote({ ...valid, title: bad })).toEqual({ ok: false, errors: { title: message } });
    }
  });

  it('asks for a name that is only spaces, as SQLite trims it, and keeps accents and symbols', () => {
    for (const blank of [' ', '\u00a0 ', '  \u2003']) {
      expect(validateNewQuote({ ...quickBody, recipientName: blank })).toEqual({ ok: false, errors: { recipientName: 'Completá este dato.' } });
    }
    expect(validateNewQuote({ ...quickBody, recipientName: 'Ñandú & Cía. (Córdoba) 😀' })).toMatchObject({ ok: true, value: { recipientName: 'Ñandú & Cía. (Córdoba) 😀' } });
  });

  it('checks the same on an edit', () => {
    const changes = { title: 'Llaveros', validUntil: null, note: '', status: 'enviado', recipientName: 'Juan', recipientPhone: '', showBreakdown: false };
    expect(validateQuoteChanges({ ...changes, recipientName: '\u0000' }, true)).toEqual({ ok: false, errors: { recipientName: message } });
    expect(validateQuoteChanges({ ...changes, title: 'Llave\u0000ros' }, true)).toEqual({ ok: false, errors: { title: message } });
    // The note is free text over several lines.
    expect(validateQuoteChanges({ ...changes, note: 'Seña.\nRetira el lunes.' }, true)).toMatchObject({ ok: true });
  });
});

describe('recipientFieldErrors', () => {
  const message = 'Este presupuesto tiene cliente: se usan su nombre y su teléfono.';

  it('refuses the recipient fields sent for a quote that has a client, whatever their value', () => {
    expect(recipientFieldErrors({ recipientName: 'Juan', title: 'x' }, true)).toEqual({ recipientName: message });
    expect(recipientFieldErrors({ recipientPhone: '' }, true)).toEqual({ recipientPhone: message });
    expect(recipientFieldErrors({ recipientName: null, recipientPhone: '11 5555-0199' }, true)).toEqual({ recipientName: message, recipientPhone: message });
  });

  it('lets them through for a quote without a client, and lets any other field through', () => {
    expect(recipientFieldErrors({ recipientName: 'Juan', recipientPhone: '11 5555-0199' }, false)).toEqual({});
    expect(recipientFieldErrors({ title: 'x', note: '' }, true)).toEqual({});
    expect(recipientFieldErrors(undefined, true)).toEqual({});
  });
});

describe('isSameQuoteSave', () => {
  const sentQuick: NewQuote = {
    client: '', clientId: null, recipientName: 'Juan Pérez', recipientPhone: '+54 9 11 5555-0199', title: 'Llaveros y cartel', validUntil: null, note: '',
    showBreakdown: false, status: 'enviado', input,
  };
  const sentForClient: NewQuote = { ...sentQuick, recipientName: '', recipientPhone: '', clientId: 3 };

  it('is the same save for the same recipient or client and the same calculator input, whatever the other fields', () => {
    expect(isSameQuoteSave(quickQuote, sentQuick)).toBe(true);
    expect(isSameQuoteSave(quickQuote, { ...sentQuick, recipientPhone: '', title: 'Otro', note: 'x', validUntil: '2026-12-31', showBreakdown: true })).toBe(true);
    // Accepted since it was saved: it is still the quote that recipient's save stored.
    expect(isSameQuoteSave({ ...quickQuote, clientId: 4, client: 'Juan P.' }, sentQuick)).toBe(true);
    expect(isSameQuoteSave(quote, sentForClient)).toBe(true);
    expect(isSameQuoteSave(quote, { ...sentForClient, clientId: null, client: ' café nube ' })).toBe(true);
  });

  it('is another save for another recipient, another client or another input', () => {
    expect(isSameQuoteSave(quickQuote, { ...sentQuick, recipientName: 'Juan P.' })).toBe(false);
    expect(isSameQuoteSave(quickQuote, sentForClient)).toBe(false);
    expect(isSameQuoteSave(quote, sentQuick)).toBe(false);
    expect(isSameQuoteSave(quote, { ...sentForClient, clientId: 4 })).toBe(false);
    expect(isSameQuoteSave(quote, { ...sentForClient, clientId: null, client: 'Lucía M.' })).toBe(false);
    expect(isSameQuoteSave(quickQuote, { ...sentQuick, input: { lines: [input.lines[0]] } })).toBe(false);
    expect(isSameQuoteSave(quickQuote, { ...sentQuick, input: { ...input, profit: { mode: 'multiplicador', value: 4 } } })).toBe(false);
  });
});
