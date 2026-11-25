import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFIT_SETTINGS, profitLabel, profitPercent, profitSettingsOf, readProfitChoice, readProfitSettings, resultProfit, startingProfit,
} from './profit';

describe('readProfitChoice', () => {
  it('accepts a percentage from 0 to 1000 and a multiplier from 1 to 11, with up to two decimals', () => {
    expect(readProfitChoice({ mode: 'porcentaje', value: 60 })).toEqual({ mode: 'porcentaje', value: 60 });
    expect(readProfitChoice({ mode: 'porcentaje', value: 0 })).toEqual({ mode: 'porcentaje', value: 0 });
    expect(readProfitChoice({ mode: 'porcentaje', value: 1000 })).toEqual({ mode: 'porcentaje', value: 1000 });
    expect(readProfitChoice({ mode: 'porcentaje', value: 12.5 })).toEqual({ mode: 'porcentaje', value: 12.5 });
    expect(readProfitChoice({ mode: 'multiplicador', value: 1 })).toEqual({ mode: 'multiplicador', value: 1 });
    expect(readProfitChoice({ mode: 'multiplicador', value: 11 })).toEqual({ mode: 'multiplicador', value: 11 });
    expect(readProfitChoice({ mode: 'multiplicador', value: 1.65, extra: 'x' })).toEqual({ mode: 'multiplicador', value: 1.65 });
  });

  it('rejects an unknown mode and values out of range or with more decimals', () => {
    const mode = 'Elegí cómo calcular la ganancia: porcentaje o multiplicador.';
    const percent = 'El margen va de 0 a 1000 %, con hasta dos decimales.';
    const multiplier = 'El multiplicador va de 1 a 11, con hasta dos decimales.';
    expect(readProfitChoice({ mode: 'doble', value: 2 })).toBe(mode);
    expect(readProfitChoice('porcentaje')).toBe(mode);
    expect(readProfitChoice({ mode: 'porcentaje', value: 1000.5 })).toBe(percent);
    expect(readProfitChoice({ mode: 'porcentaje', value: -1 })).toBe(percent);
    expect(readProfitChoice({ mode: 'porcentaje', value: '60' })).toBe(percent);
    expect(readProfitChoice({ mode: 'multiplicador', value: 0.9 })).toBe(multiplier);
    expect(readProfitChoice({ mode: 'multiplicador', value: 11.01 })).toBe(multiplier);
    expect(readProfitChoice({ mode: 'multiplicador', value: 1.555 })).toBe(multiplier);
    expect(readProfitChoice({ mode: 'multiplicador' })).toBe(multiplier);
  });
});

describe('profit as a percentage of the production cost', () => {
  it('is the percentage itself, or (multiplier − 1) × 100', () => {
    expect(profitPercent({ mode: 'porcentaje', value: 60 })).toBe(60);
    expect(profitPercent({ mode: 'porcentaje', value: 12.5 })).toBe(12.5);
    expect(profitPercent({ mode: 'multiplicador', value: 1.6 })).toBe(60);
    expect(profitPercent({ mode: 'multiplicador', value: 4 })).toBe(300);
    expect(profitPercent({ mode: 'multiplicador', value: 1 })).toBe(0);
    expect(profitPercent({ mode: 'multiplicador', value: 1.15 })).toBe(15);
    expect(profitPercent({ mode: 'multiplicador', value: 11 })).toBe(1000);
  });
});

describe('profitLabel', () => {
  it('writes "×4" for a multiplier and "60 %" for a percentage, with a decimal comma', () => {
    expect(profitLabel({ mode: 'multiplicador', value: 4 })).toBe('×4');
    expect(profitLabel({ mode: 'multiplicador', value: 2.5 })).toBe('×2,5');
    expect(profitLabel({ mode: 'porcentaje', value: 60 })).toBe('60 %');
    expect(profitLabel({ mode: 'porcentaje', value: 12.5 })).toBe('12,5 %');
  });
});

describe('profit settings', () => {
  it('start in percentage, with a starting multiplier of 3 and the shortcuts Mayorista ×3, Minorista ×4 and Llaveros ×5', () => {
    expect(DEFAULT_PROFIT_SETTINGS).toEqual({
      profitMode: 'porcentaje',
      profitMultiplier: 3,
      profitShortcuts: [{ name: 'Mayorista', multiplier: 3 }, { name: 'Minorista', multiplier: 4 }, { name: 'Llaveros', multiplier: 5 }],
    });
  });

  it('read as the defaults when a settings record has none of them', () => {
    expect(profitSettingsOf({})).toEqual(DEFAULT_PROFIT_SETTINGS);
    expect(profitSettingsOf({ profitMode: 'multiplicador', profitMultiplier: 2 })).toEqual({
      ...DEFAULT_PROFIT_SETTINGS, profitMode: 'multiplicador', profitMultiplier: 2,
    });
  });

  it('give a new calculation its starting mode and value: the margin for a percentage, the multiplier for a multiplier', () => {
    expect(startingProfit({ marginPercent: 50 })).toEqual({ mode: 'porcentaje', value: 50 });
    expect(startingProfit({ marginPercent: 50, profitMode: 'multiplicador', profitMultiplier: 2.5 })).toEqual({ mode: 'multiplicador', value: 2.5 });
    expect(startingProfit({ marginPercent: 50, profitMode: 'multiplicador' })).toEqual({ mode: 'multiplicador', value: 3 });
  });
});

describe('resultProfit', () => {
  it('reads the profit a result recorded, or a percentage with its stored margin for a result saved before', () => {
    expect(resultProfit({ settings: { marginPercent: 60 }, profit: { mode: 'multiplicador', value: 4 } })).toEqual({ mode: 'multiplicador', value: 4 });
    expect(resultProfit({ settings: { marginPercent: 60 } })).toEqual({ mode: 'porcentaje', value: 60 });
  });
});

describe('readProfitSettings', () => {
  const shortcuts = [{ name: 'Mayorista', multiplier: 3 }, { name: 'Minorista', multiplier: 4 }];

  it('reads only the profit fields present, trimming shortcut names', () => {
    const errors = {};
    expect(readProfitSettings({}, errors)).toEqual({});
    expect(readProfitSettings({ profitMode: 'multiplicador', profitMultiplier: 2.25, profitShortcuts: [{ name: ' Mayorista ', multiplier: 3, extra: 1 }] }, errors))
      .toEqual({ profitMode: 'multiplicador', profitMultiplier: 2.25, profitShortcuts: [{ name: 'Mayorista', multiplier: 3 }] });
    expect(errors).toEqual({});
  });

  it('accepts from 1 to 8 shortcuts with names of 1 to 30 characters', () => {
    const eight = Array.from({ length: 8 }, (_, i) => ({ name: `Atajo ${i + 1}`, multiplier: 2 }));
    const errors = {};
    expect(readProfitSettings({ profitShortcuts: eight }, errors)).toEqual({ profitShortcuts: eight });
    expect(readProfitSettings({ profitShortcuts: [{ name: 'x'.repeat(30), multiplier: 11 }] }, errors)).toEqual({ profitShortcuts: [{ name: 'x'.repeat(30), multiplier: 11 }] });
    expect(errors).toEqual({});
  });

  it('rejects a wrong mode and a multiplier out of range', () => {
    const errors = {};
    readProfitSettings({ profitMode: 'doble', profitMultiplier: 12 }, errors);
    expect(errors).toEqual({
      profitMode: 'Elegí con qué empieza la ganancia: porcentaje o multiplicador.',
      profitMultiplier: 'El multiplicador va de 1 a 11, con hasta dos decimales.',
    });
  });

  it('rejects no shortcuts, more than 8, an empty or long name, a repeated name and a wrong multiplier', () => {
    const check = (profitShortcuts: unknown) => {
      const errors: Record<string, string> = {};
      readProfitSettings({ profitShortcuts }, errors);
      return errors.profitShortcuts;
    };
    expect(check([])).toBe('Poné entre 1 y 8 atajos.');
    expect(check('Mayorista')).toBe('Poné entre 1 y 8 atajos.');
    expect(check(Array.from({ length: 9 }, (_, i) => ({ name: `A${i}`, multiplier: 2 })))).toBe('Poné entre 1 y 8 atajos.');
    expect(check([...shortcuts, { name: '  ', multiplier: 2 }])).toBe('Atajo 3: ponele un nombre de hasta 30 caracteres.');
    expect(check([{ name: 'x'.repeat(31), multiplier: 2 }])).toBe('Atajo 1: ponele un nombre de hasta 30 caracteres.');
    expect(check([...shortcuts, { name: ' mayorista ', multiplier: 2 }])).toBe('Atajo 3: ya hay otro atajo con ese nombre.');
    expect(check([{ name: 'Mayorista', multiplier: 0.5 }])).toBe('Atajo 1: el multiplicador va de 1 a 11, con hasta dos decimales.');
    expect(check([shortcuts[0], 'Minorista'])).toBe('Atajo 2: ponele un nombre de hasta 30 caracteres.');
  });
});
