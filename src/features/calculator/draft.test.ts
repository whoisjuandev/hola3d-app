import { describe, expect, it } from 'vitest';
import {
  badWhole, CHOOSE_AGAIN, fromCalcInput, hasData, missingNotice, newLine, newProfitDraft, newUse, profitDraftFrom, profitProblem, toCalcInput,
  toProfitChoice, TYPED_MATERIAL, type LineDraft,
} from './draft';

describe('calculator draft', () => {
  it('starts a line with the given printer, spool and packaging, one unit and one filament use', () => {
    expect(newLine(1, { printerId: 3, spoolId: 7, packaging: 900 })).toEqual({
      key: 1, name: '', quantity: '1', printerId: '3', hours: '', minutes: '', prepMinutes: '', postMinutes: '', packaging: '900',
      uses: [{ key: 1, spool: '7', material: '', pricePerKg: '', grams: '' }],
    });
    expect(newUse(2, null)).toEqual({ key: 2, spool: TYPED_MATERIAL, material: '', pricePerKg: '', grams: '' });
  });

  it('turns the typed text into the calculator input', () => {
    const draft: LineDraft = {
      key: 1, name: ' Llavero ', quantity: '12', printerId: '1', hours: '1', minutes: '30', prepMinutes: '20', postMinutes: '', packaging: '$ 1.200',
      uses: [
        { key: 1, spool: '2', material: 'ignorado', pricePerKg: '999', grams: '8' },
        { key: 2, spool: TYPED_MATERIAL, material: ' PETG negro ', pricePerKg: '$ 30.000', grams: '60' },
      ],
    };
    expect(toCalcInput([draft])).toEqual({
      lines: [{
        name: 'Llavero', quantity: 12, printerId: 1, printMinutesPerUnit: 90, prepMinutes: 20, postMinutes: 0, packaging: 1200,
        filaments: [
          { spoolId: 2, material: '', pricePerKg: 0, gramsPerUnit: 8 },
          { spoolId: null, material: 'PETG negro', pricePerKg: 30000, gramsPerUnit: 60 },
        ],
      }],
    });
  });

  it('counts blank or wrong numbers as 0 and no printer as null, so the total still shows', () => {
    const draft = { ...newLine(1, { printerId: null, spoolId: null, packaging: 0 }), quantity: 'muchos', hours: '-1', minutes: '2,5' };
    expect(toCalcInput([draft]).lines[0]).toMatchObject({ quantity: 0, printerId: null, printMinutesPerUnit: 0, packaging: 0 });
  });

  it('flags text that is not a whole number from 0, but not an empty field', () => {
    expect(badWhole('')).toBe(false);
    expect(badWhole('12')).toBe(false);
    expect(badWhole('$ 1.200')).toBe(false);
    expect(badWhole('2,5')).toBe(true);
    expect(badWhole('-1')).toBe(true);
  });
});

describe('profit draft', () => {
  const settings = { marginPercent: 60, profitMode: 'porcentaje' as const, profitMultiplier: 2.5 };

  it('starts from the settings, each mode with its own text', () => {
    expect(newProfitDraft(settings)).toEqual({ mode: 'porcentaje', percent: '60', multiplier: '2,5' });
    expect(newProfitDraft({ ...settings, profitMode: 'multiplicador' })).toEqual({ mode: 'multiplicador', percent: '60', multiplier: '2,5' });
    expect(newProfitDraft({ marginPercent: 12.5 })).toEqual({ mode: 'porcentaje', percent: '12,5', multiplier: '3' });
  });

  it('takes a saved choice into its mode, keeping the other mode from the settings', () => {
    expect(profitDraftFrom({ mode: 'multiplicador', value: 4 }, settings)).toEqual({ mode: 'multiplicador', percent: '60', multiplier: '4' });
    expect(profitDraftFrom({ mode: 'porcentaje', value: 35 }, settings)).toEqual({ mode: 'porcentaje', percent: '35', multiplier: '2,5' });
    expect(profitDraftFrom(undefined, settings)).toEqual(newProfitDraft(settings));
  });

  it('turns the text of the chosen mode into the profit choice, with a comma or a dot', () => {
    expect(toProfitChoice({ mode: 'multiplicador', percent: '60', multiplier: '1,6' }, settings)).toEqual({ mode: 'multiplicador', value: 1.6 });
    expect(toProfitChoice({ mode: 'multiplicador', percent: '60', multiplier: '×4' }, settings)).toEqual({ mode: 'multiplicador', value: 4 });
    expect(toProfitChoice({ mode: 'porcentaje', percent: '45.5 %', multiplier: '' }, settings)).toEqual({ mode: 'porcentaje', value: 45.5 });
  });

  it('flags a value out of range or with more decimals and prices with the starting value meanwhile', () => {
    const bad = { mode: 'multiplicador' as const, percent: '60', multiplier: '12' };
    expect(profitProblem(bad)).toBe('Un número de 1 a 11, con hasta dos decimales.');
    expect(toProfitChoice(bad, settings)).toEqual({ mode: 'multiplicador', value: 2.5 });
    expect(profitProblem({ mode: 'porcentaje', percent: 'mucho', multiplier: '' })).toBe('Un número de 0 a 1000, con hasta dos decimales.');
    expect(toProfitChoice({ mode: 'porcentaje', percent: '', multiplier: '' }, settings)).toEqual({ mode: 'porcentaje', value: 60 });
    expect(profitProblem({ mode: 'porcentaje', percent: '', multiplier: 'x' })).toBeNull();
    expect(profitProblem({ mode: 'multiplicador', percent: 'x', multiplier: '1,25' })).toBeNull();
  });
});

describe('loading a saved input', () => {
  const printers = [{ id: 1, name: 'La A1' }];
  const spools = [{ id: 2 }];
  const input = {
    lines: [
      { name: 'Llavero', quantity: 12, printerId: 1, printMinutesPerUnit: 90, prepMinutes: 20, postMinutes: 0, packaging: 1200,
        filaments: [{ spoolId: 2, material: '', pricePerKg: 0, gramsPerUnit: 8 }, { spoolId: null, material: 'PETG', pricePerKg: 30000, gramsPerUnit: 60 }] },
      { name: 'Cartel', quantity: 1, printerId: 7, printMinutesPerUnit: 45, prepMinutes: 0, postMinutes: 10, packaging: 0,
        filaments: [{ spoolId: 9, material: '', pricePerKg: 0, gramsPerUnit: 100 }] },
    ],
  };

  it('turns the input back into the form text, and the form back into the same input', () => {
    let key = 10;
    const { lines } = fromCalcInput({ lines: [input.lines[0]] }, printers, spools, () => key++);
    expect(lines).toEqual([{
      key: 10, name: 'Llavero', quantity: '12', printerId: '1', hours: '1', minutes: '30', prepMinutes: '20', postMinutes: '', packaging: '1200',
      uses: [
        { key: 11, spool: '2', material: '', pricePerKg: '', grams: '8' },
        { key: 12, spool: TYPED_MATERIAL, material: 'PETG', pricePerKg: '30000', grams: '60' },
      ],
    }]);
    expect(toCalcInput(lines)).toEqual({ lines: [input.lines[0]] });
  });

  it('leaves a printer or spool that no longer exists to choose again, and names what is missing', () => {
    let key = 1;
    const { lines, missing } = fromCalcInput(input, printers, spools, () => key++);
    expect(lines[1].printerId).toBe(CHOOSE_AGAIN);
    expect(lines[1].uses[0].spool).toBe(CHOOSE_AGAIN);
    expect(missing).toEqual(['la impresora de «Cartel»', 'una bobina de «Cartel»']);
    expect(toCalcInput(lines).lines[1]).toMatchObject({ printerId: null, filaments: [{ spoolId: null, material: '', pricePerKg: 0, gramsPerUnit: 100 }] });
    expect(missingNotice(missing)).toBe('Ya no existen la impresora de «Cartel» y una bobina de «Cartel»: elegilas de nuevo.');
    expect(missingNotice(['la impresora de «A»'])).toBe('Ya no existe la impresora de «A»: elegila de nuevo.');
    expect(missingNotice(['a', 'b', 'c'])).toBe('Ya no existen a, b y c: elegilas de nuevo.');
  });
});

describe('hasData', () => {
  const blank = () => newLine(1, { printerId: 1, spoolId: 2, packaging: 900 });

  it('is false for a fresh calculator and true once something was typed or a piece was added', () => {
    expect(hasData([blank()])).toBe(false);
    expect(hasData([{ ...blank(), name: 'Llavero' }])).toBe(true);
    expect(hasData([{ ...blank(), minutes: '30' }])).toBe(true);
    expect(hasData([{ ...blank(), uses: [{ ...blank().uses[0], grams: '8' }] }])).toBe(true);
    expect(hasData([blank(), blank()])).toBe(true);
  });
});
