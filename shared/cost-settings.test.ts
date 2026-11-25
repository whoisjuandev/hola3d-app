import { describe, expect, it } from 'vitest';
import { DEFAULT_COST_SETTINGS, validateCostSettings } from './cost-settings';

const valid = {
  kwhPrice: 210, labourPerHour: 7000, failurePercent: 12.5, marginPercent: 60, monthlyFixedCosts: 150000,
  monthlyPrintHours: 180, packagingCost: 900, roundingStep: 500, commissionPercent: 14.5,
};

describe('validateCostSettings', () => {
  it('accepts complete settings, with decimals in the percentages', () => {
    expect(validateCostSettings(valid)).toEqual({ ok: true, value: valid });
  });

  it('accepts the defaults, which round to $100 and charge no commission', () => {
    expect(validateCostSettings(DEFAULT_COST_SETTINGS)).toEqual({ ok: true, value: DEFAULT_COST_SETTINGS });
    expect(DEFAULT_COST_SETTINGS.roundingStep).toBe(100);
    expect(DEFAULT_COST_SETTINGS.commissionPercent).toBe(0);
  });

  it('reports every missing field', () => {
    const r = validateCostSettings({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(Object.keys(valid).sort());
  });

  it('keeps money in whole pesos from 0', () => {
    const r = validateCostSettings({ ...valid, kwhPrice: 210.5, labourPerHour: -1, monthlyFixedCosts: '150000', packagingCost: 0.5 });
    expect(r).toEqual({
      ok: false,
      errors: {
        kwhPrice: 'Poné el precio del kWh en pesos, sin centavos.',
        labourPerHour: 'Poné el valor de la hora en pesos, sin centavos.',
        monthlyFixedCosts: 'Poné los gastos fijos en pesos, sin centavos.',
        packagingCost: 'Poné el packaging en pesos, sin centavos.',
      },
    });
    expect(validateCostSettings({ ...valid, kwhPrice: 0, labourPerHour: 0, monthlyFixedCosts: 0, packagingCost: 0 }).ok).toBe(true);
  });

  it('keeps the failure percentage between 0 and 100', () => {
    const message = 'Poné un porcentaje entre 0 y 100, con hasta dos decimales.';
    expect(validateCostSettings({ ...valid, failurePercent: -1 })).toEqual({ ok: false, errors: { failurePercent: message } });
    expect(validateCostSettings({ ...valid, failurePercent: 10.123 })).toEqual({ ok: false, errors: { failurePercent: message } });
    expect(validateCostSettings({ ...valid, failurePercent: 0, marginPercent: 100 }).ok).toBe(true);
  });

  it('accepts a margin above 100 % and stops at 1000 %', () => {
    const message = 'El margen va de 0 a 1000 %, con hasta dos decimales.';
    expect(validateCostSettings({ ...valid, marginPercent: 250 }).ok).toBe(true);
    expect(validateCostSettings({ ...valid, marginPercent: 1000 }).ok).toBe(true);
    expect(validateCostSettings({ ...valid, marginPercent: 1000.5 })).toEqual({ ok: false, errors: { marginPercent: message } });
    expect(validateCostSettings({ ...valid, marginPercent: -1 })).toEqual({ ok: false, errors: { marginPercent: message } });
  });

  it('keeps the commission below 100 %', () => {
    const message = 'La comisión va de 0 a menos de 100 %, con hasta dos decimales.';
    expect(validateCostSettings({ ...valid, commissionPercent: 100 })).toEqual({ ok: false, errors: { commissionPercent: message } });
    expect(validateCostSettings({ ...valid, commissionPercent: -0.5 })).toEqual({ ok: false, errors: { commissionPercent: message } });
    expect(validateCostSettings({ ...valid, commissionPercent: 99.99 }).ok).toBe(true);
    expect(validateCostSettings({ ...valid, commissionPercent: 0 }).ok).toBe(true);
  });

  it('needs more than 0 monthly print hours', () => {
    const message = 'Poné las horas de impresión por mes: un número entero mayor que 0.';
    expect(validateCostSettings({ ...valid, monthlyPrintHours: 0 })).toEqual({ ok: false, errors: { monthlyPrintHours: message } });
    expect(validateCostSettings({ ...valid, monthlyPrintHours: 1 }).ok).toBe(true);
  });

  it('needs a rounding step of at least $1', () => {
    const message = 'El redondeo va en pesos: un número entero desde 1.';
    expect(validateCostSettings({ ...valid, roundingStep: 0 })).toEqual({ ok: false, errors: { roundingStep: message } });
    expect(validateCostSettings({ ...valid, roundingStep: 50.5 })).toEqual({ ok: false, errors: { roundingStep: message } });
    expect(validateCostSettings({ ...valid, roundingStep: 1 }).ok).toBe(true);
  });

  it('ignores fields it does not know', () => {
    expect(validateCostSettings({ ...valid, updatedAt: 'x', extra: 1 })).toEqual({ ok: true, value: valid });
  });
});
