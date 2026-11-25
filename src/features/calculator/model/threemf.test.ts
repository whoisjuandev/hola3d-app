import { describe, expect, it } from 'vitest';
import { ModelError } from './error';
import { cubeTriangles, meshXml, modelXml, sliceInfoXml } from './fixtures';
import { modelVolume, parseModelFile, parseSliceInfo, referencedPaths } from './threemf';

const cube = (size: number) => meshXml(cubeTriangles(size));
const ROOT = '3D/3dmodel.model';

/** The volume in mm³ of a root model file plus the files it references, all given as XML. */
function volume(root: string, others: Record<string, string> = {}): number {
  const files = Object.fromEntries([[ROOT, root], ...Object.entries(others)].map(([p, xml]) => [p, parseModelFile(xml)]));
  return modelVolume(files, ROOT);
}

describe('3MF model volume', () => {
  it('adds up the meshes of the build items, in millimetres by default', () => {
    const xml = modelXml(`<resources><object id="1" type="model">${cube(20)}</object><object id="2">${cube(10)}</object></resources>`
      + '<build><item objectid="1"/><item objectid="2"/></build>');
    expect(volume(xml)).toBeCloseTo(9000, 3);
  });

  it('counts an object as many times as the build places it, and skips objects not placed', () => {
    const xml = modelXml(`<resources><object id="1">${cube(10)}</object><object id="2">${cube(20)}</object></resources>`
      + '<build><item objectid="1"/><item objectid="1" transform="1 0 0 0 1 0 0 0 1 30 0 0"/></build>');
    expect(volume(xml)).toBeCloseTo(2000, 3);
  });

  it('applies the file unit', () => {
    const body = `<resources><object id="1">${cube(2)}</object></resources><build><item objectid="1"/></build>`;
    expect(volume(modelXml(body, 'centimeter'))).toBeCloseTo(8000, 3);
    expect(volume(modelXml(body, 'inch'))).toBeCloseTo(8 * 25.4 ** 3, 1);
    expect(volume(modelXml(body, 'micron'))).toBeCloseTo(8e-9, 12);
  });

  it('applies the scale of item and component transforms, and a mirror keeps it positive', () => {
    const xml = modelXml(`<resources><object id="1">${cube(10)}</object>`
      + '<object id="2"><components><component objectid="1" transform="0.5 0 0 0 0.5 0 0 0 0.5 0 0 0"/></components></object></resources>'
      + '<build><item objectid="2" transform="2 0 0 0 2 0 0 0 2 5 5 5"/><item objectid="1" transform="-1 0 0 0 1 0 0 0 1 0 0 0"/></build>');
    expect(volume(xml)).toBeCloseTo(1000 + 1000, 3);
  });

  it('reads objects from the model files in 3D/Objects that components point to, as Bambu Studio writes them', () => {
    const root = modelXml('<resources><object id="3" type="model"><components>'
      + '<component p:path="/3D/Objects/object_1.model" objectid="1" transform="1 0 0 0 1 0 0 0 3 0 0 0"/>'
      + '<component p:path="/3D/Objects/object_1.model" objectid="2"/>'
      + '</components></object></resources><build><item objectid="3" p:printable="1"/></build>');
    const part = modelXml(`<resources><object id="1" type="model">${cube(10)}</object><object id="2" type="model">${cube(5)}</object></resources><build/>`);
    expect(referencedPaths(parseModelFile(root))).toEqual(['3D/Objects/object_1.model']);
    expect(volume(root, { '3D/Objects/object_1.model': part })).toBeCloseTo(3000 + 125, 3);
  });

  it('leaves out support objects', () => {
    const xml = modelXml(`<resources><object id="1">${cube(10)}</object><object id="2" type="support">${cube(10)}</object></resources>`
      + '<build><item objectid="1"/><item objectid="2"/></build>');
    expect(volume(xml)).toBeCloseTo(1000, 3);
  });

  it('rejects a model without any mesh volume', () => {
    expect(() => volume(modelXml('<resources/><build/>'))).toThrow(new ModelError('El 3MF no tiene ninguna pieza con volumen.'));
  });

  it('rejects a mesh whose triangles point to vertices that do not exist, and a missing referenced file', () => {
    const broken = modelXml('<resources><object id="1"><mesh><vertices><vertex x="0" y="0" z="0"/></vertices>'
      + '<triangles><triangle v1="0" v2="1" v3="2"/></triangles></mesh></object></resources><build><item objectid="1"/></build>');
    expect(() => volume(broken)).toThrow(new ModelError('El 3MF tiene una pieza dañada.'));
    const root = modelXml('<resources><object id="3"><components><component p:path="/3D/Objects/x.model" objectid="1"/></components></object></resources>'
      + '<build><item objectid="3"/></build>');
    expect(() => volume(root)).toThrow(new ModelError('El 3MF tiene una pieza dañada.'));
  });
});

describe('sliced 3MF info (Metadata/slice_info.config)', () => {
  it('adds up time and grams of every plate and counts the filaments used', () => {
    const xml = sliceInfoXml([
      { prediction: 2876, weight: 11.47, filaments: [{ id: 1, type: 'PLA', usedG: 9.12 }, { id: 3, type: 'PETG', usedG: 2.35 }] },
      { prediction: 600, weight: 3.1, filaments: [{ id: 1, type: 'PLA', usedG: 3.1 }] },
    ]);
    expect(parseSliceInfo(xml)).toEqual({ seconds: 3476, grams: 14.57, filaments: 2 });
  });

  it('uses the plate weight when the filaments carry no grams', () => {
    expect(parseSliceInfo(sliceInfoXml([{ prediction: 120, weight: 4.5, filaments: [{ id: 1, type: 'PLA' }] }])))
      .toEqual({ seconds: 120, grams: 4.5, filaments: 1 });
  });

  it('is not sliced when the time or the grams are missing, or there are no plates', () => {
    expect(parseSliceInfo(sliceInfoXml([{ weight: 4.5, filaments: [{ id: 1, type: 'PLA', usedG: 4.5 }] }]))).toBeNull();
    expect(parseSliceInfo(sliceInfoXml([{ prediction: 120, filaments: [] }]))).toBeNull();
    expect(parseSliceInfo(sliceInfoXml([]))).toBeNull();
    expect(parseSliceInfo('esto no es XML')).toBeNull();
  });
});
