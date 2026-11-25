import { describe, expect, it } from 'vitest';
import { matchesSearch, nextStage, previousStage, validateNewOrder, formatOrderNumber, isActive, isOrderOverdue } from './orders';

const order = { id: '0143', client: 'Lucía M.', item: 'Maceta geométrica' };

describe('stage moves', () => {
  it('goes forward and back one stage at a time', () => {
    expect(nextStage('imprimiendo')).toBe('listo');
    expect(previousStage('imprimiendo')).toBe('disenando');
  });

  it('stops at both ends', () => {
    expect(nextStage('entregado')).toBeNull();
    expect(previousStage('nuevo')).toBeNull();
  });

  it('counts every stage but entregado as active', () => {
    expect(isActive({ stage: 'listo' })).toBe(true);
    expect(isActive({ stage: 'entregado' })).toBe(false);
  });
});

describe('isOrderOverdue', () => {
  it('is an order not delivered whose due date is before today', () => {
    expect(isOrderOverdue({ dueDate: '2026-11-24', stage: 'listo' }, '2026-11-25')).toBe(true);
    expect(isOrderOverdue({ dueDate: '2026-11-25', stage: 'listo' }, '2026-11-25')).toBe(false);
    expect(isOrderOverdue({ dueDate: '2026-11-24', stage: 'entregado' }, '2026-11-25')).toBe(false);
    expect(isOrderOverdue({ dueDate: null, stage: 'nuevo' }, '2026-11-25')).toBe(false);
  });
});

describe('search', () => {
  it('ignores accents and case', () => {
    expect(matchesSearch(order, 'lucia')).toBe(true);
    expect(matchesSearch(order, 'MACETA')).toBe(true);
  });

  it('finds an order by number with or without #', () => {
    expect(matchesSearch(order, '#0143')).toBe(true);
    expect(matchesSearch(order, '0143')).toBe(true);
  });

  it('returns no match for unrelated text and everything for an empty query', () => {
    expect(matchesSearch(order, 'xyz')).toBe(false);
    expect(matchesSearch(order, '   ')).toBe(true);
  });
});

describe('validateNewOrder', () => {
  const valid = { item: 'Llaveros × 12', client: 'Café Nube', channel: 'Instagram', price: 36000, deposit: 18000, dueDate: '2026-11-23', dueTime: '', material: 'PLA', note: '' };

  it('accepts a complete order and normalizes empty optional fields', () => {
    const r = validateNewOrder(valid);
    expect(r).toEqual({ ok: true, value: { ...valid, dueTime: null, clientId: null } });
  });

  it('takes an existing client by id instead of a name', () => {
    const r = validateNewOrder({ ...valid, client: '', clientId: 3 });
    expect(r).toEqual({ ok: true, value: { ...valid, client: '', clientId: 3, dueTime: null } });
  });

  it('rejects a client id that is not a whole number above 0', () => {
    for (const clientId of [0, -1, 1.5, 'tres']) {
      const r = validateNewOrder({ ...valid, clientId });
      expect(r).toEqual({ ok: false, errors: { clientId: 'Elegí un cliente de la lista.' } });
    }
  });

  it('reports every missing required field', () => {
    const r = validateNewOrder({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['channel', 'client', 'item', 'price']);
  });

  it('rejects a deposit bigger than the price and malformed dates', () => {
    const r = validateNewOrder({ ...valid, deposit: 50000, dueDate: '23/11/2026' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.deposit).toBe('La seña no puede ser mayor que el precio.');
      expect(r.errors.dueDate).toBe('La fecha tiene que ser AAAA-MM-DD.');
    }
  });
});

it('pads order numbers to four digits', () => {
  expect(formatOrderNumber(147)).toBe('0147');
});
