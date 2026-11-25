import { describe, expect, it } from 'vitest';
import {
  balanceOwed, clientNameKey, findClientByName, instagramUrl, matchesClientSearch, summarizeClients, totalSpent,
  validateClient, whatsappUrl,
} from './clients';

describe('validateClient', () => {
  const valid = { name: ' Café Nube ', phone: '+54 9 11 5555-0142', instagram: 'cafe.nube', email: 'hola@cafenube.com.ar', note: 'Paga por transferencia.' };

  it('accepts a complete client and trims text', () => {
    expect(validateClient(valid)).toEqual({ ok: true, value: { ...valid, name: 'Café Nube' } });
  });

  it('needs only a name; the rest default to empty', () => {
    expect(validateClient({ name: 'Lucía M.' })).toEqual({ ok: true, value: { name: 'Lucía M.', phone: '', instagram: '', email: '', note: '' } });
  });

  it('stores the Instagram handle without the leading @', () => {
    const r = validateClient({ name: 'Café Nube', instagram: ' @cafe_nube ' });
    expect(r.ok && r.value.instagram).toBe('cafe_nube');
  });

  it('reports a missing name', () => {
    expect(validateClient({})).toEqual({ ok: false, errors: { name: 'Completá este dato.' } });
  });

  it('rejects a bad phone, handle, email and long text with a message per field', () => {
    const r = validateClient({ name: 'x'.repeat(81), phone: 'llamar', instagram: 'cafe nube!', email: 'hola@', note: 'x'.repeat(1001) });
    expect(r).toEqual({
      ok: false,
      errors: {
        name: 'Máximo 80 caracteres.',
        phone: 'Poné el teléfono con números (podés usar +, espacios y guiones).',
        instagram: 'El usuario de Instagram lleva letras, números, puntos o guiones bajos.',
        email: 'Revisá el email.',
        note: 'Máximo 1000 caracteres.',
      },
    });
  });

  it('rejects a phone with too few digits', () => {
    const r = validateClient({ name: 'Ana', phone: '12-34' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.phone).toBe('Poné el teléfono con números (podés usar +, espacios y guiones).');
  });
});

describe('client name matching', () => {
  const clients = [{ id: 1, name: 'Lucía M.' }, { id: 2, name: 'Café Nube' }];

  it('ignores case, accents and surrounding spaces', () => {
    expect(clientNameKey('  LUCIA m. ')).toBe(clientNameKey('Lucía M.'));
    expect(findClientByName(clients, '  cafe NUBE ')).toEqual({ id: 2, name: 'Café Nube' });
    expect(findClientByName(clients, 'lucía m.')).toEqual({ id: 1, name: 'Lucía M.' });
  });

  it('does not match a different name or an empty one', () => {
    expect(findClientByName(clients, 'Lucía')).toBeNull();
    expect(findClientByName(clients, 'Café  Nube')).toBeNull();
    expect(findClientByName(clients, '   ')).toBeNull();
  });
});

describe('client totals', () => {
  const orders = [
    { clientId: 1, stage: 'entregado' as const, price: 18000, deposit: null, paid: true },
    { clientId: 1, stage: 'entregado' as const, price: 10000, deposit: 4000, paid: false },
    { clientId: 1, stage: 'listo' as const, price: 22000, deposit: 11000, paid: false },
    { clientId: 1, stage: 'nuevo' as const, price: 9000, deposit: null, paid: false },
    { clientId: 1, stage: 'listo' as const, price: 5000, deposit: 1000, paid: true },
  ];

  it('total spent sums the prices of delivered orders only', () => {
    expect(totalSpent(orders)).toBe(28000);
    expect(totalSpent([])).toBe(0);
  });

  it('balance owed sums price minus deposit of the orders not marked paid', () => {
    // 10000-4000 + 22000-11000 + 9000-0
    expect(balanceOwed(orders)).toBe(26000);
    expect(balanceOwed([{ stage: 'nuevo', price: 5000, deposit: null, paid: true }])).toBe(0);
  });

  it('summarizes each client with its order count, total spent and balance owed', () => {
    const clients = [
      { id: 1, name: 'Florencia D.' },
      { id: 2, name: 'Sin pedidos' },
    ];
    const all = [...orders, { clientId: 3, stage: 'nuevo' as const, price: 1000, deposit: null, paid: false }];
    expect(summarizeClients(clients, all)).toEqual([
      { id: 1, name: 'Florencia D.', orderCount: 5, totalSpent: 28000, balanceOwed: 26000 },
      { id: 2, name: 'Sin pedidos', orderCount: 0, totalSpent: 0, balanceOwed: 0 },
    ]);
  });
});

describe('client search', () => {
  const client = { name: 'Lucía M.', phone: '11 5555-0143', instagram: 'lu.macetas', email: 'lucia@example.com' };

  it('finds a client by name without accents or case, phone, handle or email', () => {
    expect(matchesClientSearch(client, 'LUCIA')).toBe(true);
    expect(matchesClientSearch(client, '5555')).toBe(true);
    expect(matchesClientSearch(client, '@lu.mac')).toBe(true);
    expect(matchesClientSearch(client, 'example.com')).toBe(true);
  });

  it('returns no match for unrelated text and everything for an empty query', () => {
    expect(matchesClientSearch(client, 'tomás')).toBe(false);
    expect(matchesClientSearch(client, '  ')).toBe(true);
  });
});

describe('contact links', () => {
  it('turns a phone into a WhatsApp link with its digits only', () => {
    expect(whatsappUrl('+54 9 (11) 5555-0142')).toBe('https://wa.me/5491155550142');
    expect(whatsappUrl('')).toBeNull();
  });

  it('turns a handle into an Instagram link', () => {
    expect(instagramUrl('cafe.nube')).toBe('https://instagram.com/cafe.nube');
    expect(instagramUrl('@cafe.nube')).toBe('https://instagram.com/cafe.nube');
    expect(instagramUrl('')).toBeNull();
  });
});
