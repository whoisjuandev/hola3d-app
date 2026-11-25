import { describe, expect, it } from 'vitest';
import { profileNameKey, validateCalcProfile } from './calc-profiles';
import type { CalcLineInput } from './calculator';

const line: CalcLineInput = {
  name: 'Llavero', quantity: 12, printerId: 7, printMinutesPerUnit: 30,
  filaments: [{ spoolId: 9, material: '', pricePerKg: 0, gramsPerUnit: 8 }], prepMinutes: 20, postMinutes: 40, packaging: 1200,
};

describe('validateCalcProfile', () => {
  it('accepts a trimmed name and a calculator input, with a printer or spool that may not exist any more', () => {
    expect(validateCalcProfile({ name: '  Llaveros por mayor ', input: { lines: [{ ...line, extra: 1 }], profit: { mode: 'multiplicador', value: 3 } } })).toEqual({
      ok: true, value: { name: 'Llaveros por mayor', input: { lines: [line], profit: { mode: 'multiplicador', value: 3 } } },
    });
  });

  it('needs a name of 1 to 60 characters', () => {
    expect(validateCalcProfile({ name: ' ', input: { lines: [line] } })).toEqual({ ok: false, errors: { name: 'Completá este dato.' } });
    expect(validateCalcProfile({ name: 'x'.repeat(61), input: { lines: [line] } })).toEqual({ ok: false, errors: { name: 'Máximo 60 caracteres.' } });
    expect(validateCalcProfile({ name: 'x'.repeat(60), input: { lines: [line] } }).ok).toBe(true);
  });

  it('checks the input with the rules of a quote', () => {
    expect(validateCalcProfile({ name: 'Vacío', input: { lines: [] } })).toEqual({ ok: false, errors: { input: 'Agregá al menos una pieza.' } });
    expect(validateCalcProfile({ name: 'Sin nombre', input: { lines: [{ ...line, name: '' }] } })).toEqual({
      ok: false, errors: { input: 'Pieza 1: ponele un nombre.' },
    });
    expect(validateCalcProfile({ name: 'Ganancia', input: { lines: [line], profit: { mode: 'porcentaje', value: 1001 } } })).toEqual({
      ok: false, errors: { input: 'El margen va de 0 a 1000 %, con hasta dos decimales.' },
    });
    expect(validateCalcProfile({})).toEqual({ ok: false, errors: { name: 'Completá este dato.', input: 'Agregá al menos una pieza.' } });
  });
});

describe('profileNameKey', () => {
  it('folds A to Z as the database compares names', () => {
    expect(profileNameKey('Llaveros POR Mayor')).toBe('llaveros por mayor');
    expect(profileNameKey('Ñandú')).toBe('Ñandú');
  });
});
