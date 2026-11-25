import { describe, expect, it } from 'vitest';
import { filterByMaterial, isLowStock, materialsOf, totalGrams, validateSpool } from './spools';

describe('validateSpool', () => {
  const valid = { material: 'PLA', colorName: 'Blanco', colorHex: '#FFFFFF', brand: 'Grilon3', netGrams: 1000, remainingGrams: 820, price: 21000, lowStockGrams: 200, note: '' };

  it('accepts a complete spool and lowercases the colour hex', () => {
    expect(validateSpool(valid)).toEqual({ ok: true, value: { ...valid, colorHex: '#ffffff' } });
  });

  it('defaults the low-stock threshold to 150 g and remaining grams to the net weight', () => {
    const r = validateSpool({ material: 'PETG', colorName: 'Negro', colorHex: '#000000', netGrams: 1000, price: 24000 });
    expect(r).toEqual({ ok: true, value: { material: 'PETG', colorName: 'Negro', colorHex: '#000000', brand: '', netGrams: 1000, remainingGrams: 1000, price: 24000, lowStockGrams: 150, note: '' } });
  });

  it('reports every missing required field', () => {
    const r = validateSpool({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['colorHex', 'colorName', 'material', 'netGrams', 'price']);
  });

  it('rejects a bad colour, a zero net weight, decimals and a negative threshold', () => {
    const r = validateSpool({ ...valid, colorHex: '#fff', netGrams: 0, price: 10.5, lowStockGrams: -1 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toEqual({
        colorHex: 'Elegí un color (formato #RRGGBB).',
        netGrams: 'Poné el peso neto en gramos: un número entero mayor que 0.',
        price: 'Poné el precio en pesos, sin centavos.',
        lowStockGrams: 'Poné los gramos sin decimales, desde 0.',
      });
    }
  });

  describe('remaining grams', () => {
    it('accepts 0 and the full net weight', () => {
      expect(validateSpool({ ...valid, remainingGrams: 0 }).ok).toBe(true);
      expect(validateSpool({ ...valid, remainingGrams: 1000 }).ok).toBe(true);
    });

    it('cannot go below 0', () => {
      const r = validateSpool({ ...valid, remainingGrams: -1 });
      expect(r).toEqual({ ok: false, errors: { remainingGrams: 'No puede ser menor que 0 g.' } });
    });

    it('cannot go above the net weight', () => {
      const r = validateSpool({ ...valid, remainingGrams: 1001 });
      expect(r).toEqual({ ok: false, errors: { remainingGrams: 'No puede superar el peso neto de la bobina.' } });
    });

    it('must be whole grams', () => {
      const r = validateSpool({ ...valid, remainingGrams: 10.5 });
      expect(r).toEqual({ ok: false, errors: { remainingGrams: 'Poné los gramos sin decimales.' } });
    });
  });
});

describe('low stock', () => {
  it('marks a spool low at or below its threshold', () => {
    expect(isLowStock({ remainingGrams: 149, lowStockGrams: 150 })).toBe(true);
    expect(isLowStock({ remainingGrams: 150, lowStockGrams: 150 })).toBe(true);
    expect(isLowStock({ remainingGrams: 151, lowStockGrams: 150 })).toBe(false);
  });
});

describe('material filter and totals', () => {
  const spools = [
    { material: 'PLA', remainingGrams: 820 },
    { material: 'PETG', remainingGrams: 400 },
    { material: 'pla', remainingGrams: 100 },
    { material: 'Nylon', remainingGrams: 0 },
  ];

  it('lists each material once, ignoring case, sorted', () => {
    expect(materialsOf(spools)).toEqual(['Nylon', 'PETG', 'PLA']);
  });

  it('filters by material ignoring case, and keeps everything for an empty filter', () => {
    expect(filterByMaterial(spools, 'Pla').map((s) => s.remainingGrams)).toEqual([820, 100]);
    expect(filterByMaterial(spools, '')).toHaveLength(4);
  });

  it('adds up the remaining grams', () => {
    expect(totalGrams(spools)).toBe(1320);
    expect(totalGrams([])).toBe(0);
  });
});
