import { describe, expect, it } from 'vitest';
import { badWhole, newLine, newUse, toCalcInput, TYPED_MATERIAL, type LineDraft } from './draft';

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
