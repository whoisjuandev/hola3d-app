import { describe, expect, it } from 'vitest';
import { newLine, newUse, TYPED_MATERIAL, type LineDraft } from '../draft';
import { followEdit, loadModel, modelFromReading, nameFromFile, parseInfill, parseRate, retune, volumeText, type LineModel } from './line';

const spools = [{ id: 1, material: 'PLA' }, { id: 2, material: 'ABS' }];
const blank = (): LineDraft => ({ ...newLine(1, { printerId: 1, spoolId: 1, packaging: 800 }), uses: [newUse(1, 1), { ...newUse(2, 2), grams: '7' }] });
const estimate = (over: Partial<LineModel> = {}): LineModel => ({
  ...modelFromReading('cubo.stl', { source: 'estimado', volumeCm3: 8 }, { infill: '15', rate: '25' }), ...over,
});

describe('a model in a calculator line', () => {
  it('fills the first filament grams, the time and the empty name; the rest stays', () => {
    const line = loadModel(blank(), estimate(), spools);
    expect(line).toEqual({ ...blank(), name: 'cubo', hours: '0', minutes: '10', uses: [{ ...newUse(1, 1), grams: '4' }, { ...newUse(2, 2), grams: '7' }] });
  });

  it('keeps a name the owner already typed', () => {
    expect(loadModel({ ...blank(), name: 'Llavero' }, estimate(), spools).name).toBe('Llavero');
  });

  it('uses the slicer numbers as they are, whatever the material', () => {
    const sliced = modelFromReading('placa_1.gcode.3mf', { source: 'laminador', volumeCm3: null, grams: 130, minutes: 125, filaments: 2 }, { infill: '15', rate: '25' });
    const line = loadModel(blank(), sliced, spools);
    expect(line).toMatchObject({ name: 'placa 1', hours: '2', minutes: '5' });
    expect(line.uses[0].grams).toBe('130');
    const abs = followEdit(line, { ...line, uses: [{ ...line.uses[0], spool: '2' }, line.uses[1]] }, sliced, spools);
    expect(abs.line.uses[0].grams).toBe('130');
    expect(abs.model).toBe(sliced);
  });

  it('estimates again when the first filament changes material, by spool or typed', () => {
    const model = estimate();
    const line = loadModel(blank(), model, spools);
    const abs = followEdit(line, { ...line, uses: [{ ...line.uses[0], spool: '2' }, line.uses[1]] }, model, spools);
    expect(abs.line).toMatchObject({ hours: '0', minutes: '7', uses: [{ spool: '2', grams: '3' }, { grams: '7' }] }); // 8 × 1.04 × 0.3625 = 3.0
    const typed = followEdit(abs.line, { ...abs.line, uses: [{ ...abs.line.uses[0], spool: TYPED_MATERIAL, material: 'PETG negro' }, line.uses[1]] }, model, spools);
    expect(typed.line.uses[0].grams).toBe('4'); // 8 × 1.27 × 0.3625 = 3.7
    expect(typed.model).toBe(model);
  });

  it('estimates again with a new infill or rate, and keeps the numbers while those are not valid', () => {
    const line = loadModel(blank(), estimate(), spools);
    expect(retune(line, estimate({ infill: '100', rate: '50' }), spools)).toMatchObject({ hours: '0', minutes: '12', uses: [{ grams: '10' }, { grams: '7' }] });
    expect(retune(line, estimate({ infill: '120' }), spools)).toBe(line);
    expect(retune(line, estimate({ rate: '0' }), spools)).toBe(line);
  });

  it('lets go of the model once the owner types grams or time by hand', () => {
    const model = estimate();
    const line = loadModel(blank(), model, spools);
    for (const typed of [
      { ...line, minutes: '20' },
      { ...line, hours: '1' },
      { ...line, uses: [{ ...line.uses[0], grams: '6' }, line.uses[1]] },
    ]) {
      const next = followEdit(line, typed, model, spools);
      expect(next.line).toBe(typed);
      expect(next.model).toEqual({ ...model, linked: false });
    }
    const loose = { ...model, linked: false };
    const abs = { ...line, uses: [{ ...line.uses[0], spool: '2' }, line.uses[1]] };
    expect(followEdit(line, abs, loose, spools)).toEqual({ line: abs, model: loose });
    expect(retune(line, { ...loose, infill: '50' }, spools)).toBe(line);
  });

  it('does not touch other edits, nor a line without a model', () => {
    const model = estimate();
    const line = loadModel(blank(), model, spools);
    const renamed = { ...line, name: 'Cubo grande', quantity: '3', uses: [line.uses[0], { ...line.uses[1], grams: '9' }] };
    expect(followEdit(line, renamed, model, spools)).toEqual({ line: renamed, model });
    const plain = blank();
    const edited = { ...plain, minutes: '30' };
    expect(followEdit(plain, edited, null, spools)).toEqual({ line: edited, model: null });
  });

  it('names a piece after its file', () => {
    expect(nameFromFile('soporte_celular.gcode.3mf')).toBe('soporte celular');
    expect(nameFromFile('Cubo-20mm.STL')).toBe('Cubo-20mm');
    expect(nameFromFile(`${'a'.repeat(120)}.stl`)).toHaveLength(100);
  });

  it('writes the volume in cm³, with decimals only for small models', () => {
    expect(volumeText(8)).toBe('8 cm³');
    expect(volumeText(1234.56)).toBe('1.235 cm³');
    expect(volumeText(2.345)).toBe('2,35 cm³');
    expect(volumeText(0.004)).toBe('0,01 cm³');
  });

  it('reads infill from 0 to 100 and a rate above 0, as the owners write them', () => {
    expect(parseInfill('15')).toBe(15);
    expect(parseInfill('12,5 %')).toBe(12.5);
    expect(parseInfill('101')).toBeNull();
    expect(parseInfill('')).toBeNull();
    expect(parseRate('25')).toBe(25);
    expect(parseRate('0')).toBeNull();
    expect(parseRate('mucho')).toBeNull();
  });
});
