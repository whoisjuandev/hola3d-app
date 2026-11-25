import { describe, expect, it } from 'vitest';
import { printHours, validatePrinter, wearCostPerHour } from './printers';

describe('validatePrinter', () => {
  const valid = { name: ' La A1 ', model: 'Bambu Lab A1', purchasePrice: 650000, lifetimeHours: 5000, powerWatts: 95, printMinutes: 7200, status: 'en_servicio', note: 'Cambiar boquilla.' };

  it('accepts a complete printer and trims text', () => {
    expect(validatePrinter(valid)).toEqual({ ok: true, value: { ...valid, name: 'La A1' } });
  });

  it('defaults print minutes to 0, status to activa, model and note to empty', () => {
    const r = validatePrinter({ name: 'La Ender', purchasePrice: 380000, lifetimeHours: 4000, powerWatts: 110 });
    expect(r).toEqual({ ok: true, value: { name: 'La Ender', model: '', purchasePrice: 380000, lifetimeHours: 4000, powerWatts: 110, printMinutes: 0, status: 'activa', note: '' } });
  });

  it('reports every missing required field', () => {
    const r = validatePrinter({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['lifetimeHours', 'name', 'powerWatts', 'purchasePrice']);
  });

  it('rejects non-integer, negative and zero values with a message per field', () => {
    const r = validatePrinter({ ...valid, purchasePrice: 1000.5, lifetimeHours: 0, powerWatts: -1, printMinutes: 12.5, status: 'rota', name: 'x'.repeat(81) });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toEqual({
        name: 'Máximo 80 caracteres.',
        purchasePrice: 'Poné el precio en pesos, sin centavos.',
        lifetimeHours: 'Poné las horas de vida útil: un número entero mayor que 0.',
        powerWatts: 'Poné el consumo en watts, sin decimales.',
        printMinutes: 'Los minutos impresos van sin decimales, desde 0.',
        status: 'Elegí un estado.',
      });
    }
  });

  it('accepts every status', () => {
    for (const status of ['activa', 'en_servicio', 'fuera_de_uso']) expect(validatePrinter({ ...valid, status }).ok).toBe(true);
  });
});

describe('printer hours and wear', () => {
  it('turns accumulated minutes into hours', () => {
    expect(printHours({ printMinutes: 90 })).toBe(1.5);
    expect(printHours({ printMinutes: 0 })).toBe(0);
  });

  it('divides the purchase price by the lifetime hours', () => {
    expect(wearCostPerHour({ purchasePrice: 650000, lifetimeHours: 5000 })).toBe(130);
    expect(wearCostPerHour({ purchasePrice: 100000, lifetimeHours: 3000 })).toBeCloseTo(33.333, 3);
  });
});
