import { describe, expect, it } from 'vitest';
import { ModelError } from './error';
import { asciiStl, binaryStl, cubeTriangles, makeZip, meshXml, modelXml, sliceInfoXml } from './fixtures';
import { MAX_MODEL_BYTES, modelSizeProblem, readModelFile } from './read';

const cubeModel = (size: number) => modelXml(`<resources><object id="1">${meshXml(cubeTriangles(size))}</object></resources><build><item objectid="1"/></build>`);
const slice = sliceInfoXml([{ prediction: 3476, weight: 14.57, filaments: [{ id: 1, type: 'PLA', usedG: 12.2 }, { id: 2, type: 'PLA', usedG: 2.37 }] }]);

describe('reading a model file', () => {
  it('reads an STL, binary or ASCII, as a volume to estimate from', async () => {
    const binary = await readModelFile('cubo.stl', binaryStl(cubeTriangles(20)));
    expect(binary.source).toBe('estimado');
    expect(binary.volumeCm3).toBeCloseTo(8, 9);
    const ascii = await readModelFile('Cubo.STL', new TextEncoder().encode(asciiStl(cubeTriangles(10))));
    expect(ascii.source).toBe('estimado');
    expect(ascii.volumeCm3).toBeCloseTo(1, 6);
  });

  it('reads the mesh of an unsliced 3MF', async () => {
    const file = makeZip([{ name: '3D/3dmodel.model', data: cubeModel(20) }]);
    const reading = await readModelFile('cubo.3mf', file);
    expect(reading).toMatchObject({ source: 'estimado' });
    expect(reading.volumeCm3).toBeCloseTo(8, 6);
  });

  it('finds the model through _rels/.rels, with its referenced object files', async () => {
    const root = modelXml('<resources><object id="2"><components><component p:path="/3D/Objects/a.model" objectid="1"/></components></object></resources>'
      + '<build><item objectid="2"/></build>');
    const rels = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Target="/3D/pieza.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>';
    const file = makeZip([
      { name: '_rels/.rels', data: rels, stored: true },
      { name: '3D/pieza.model', data: root },
      { name: '3D/Objects/a.model', data: cubeModel(10) },
    ]);
    expect((await readModelFile('pieza.3mf', file)).volumeCm3).toBeCloseTo(1, 6);
  });

  it('takes the slicer numbers of a sliced 3MF over the mesh, rounded to whole grams and minutes', async () => {
    const file = makeZip([{ name: '3D/3dmodel.model', data: cubeModel(20) }, { name: 'Metadata/slice_info.config', data: slice }]);
    const reading = await readModelFile('cubo.gcode.3mf', file);
    expect(reading).toMatchObject({ source: 'laminador', grams: 15, minutes: 58, filaments: 2 });
    expect(reading.volumeCm3).toBeCloseTo(8, 6);
  });

  it('reads a sliced 3MF without a mesh, with no volume', async () => {
    const file = makeZip([{ name: 'Metadata/slice_info.config', data: slice }, { name: 'Metadata/plate_1.gcode', data: 'G28\n' }]);
    expect(await readModelFile('placa.gcode.3mf', file)).toEqual({ source: 'laminador', volumeCm3: null, grams: 15, minutes: 58, filaments: 2 });
  });

  it('estimates from the mesh when the slice info lacks the time or the grams', async () => {
    const partial = sliceInfoXml([{ filaments: [{ id: 1, type: 'PLA', usedG: 3 }] }]);
    const file = makeZip([{ name: '3D/3dmodel.model', data: cubeModel(20) }, { name: 'Metadata/slice_info.config', data: partial }]);
    expect(await readModelFile('cubo.3mf', file)).toMatchObject({ source: 'estimado' });
  });

  it('rejects a file that is neither STL nor 3MF, a text renamed to .3mf, and a 3MF without a model', async () => {
    await expect(readModelFile('cubo.obj', new Uint8Array(10))).rejects.toThrow(new ModelError('Elegí un archivo .stl o .3mf.'));
    await expect(readModelFile('notas.3mf', new TextEncoder().encode('hola, esto es texto'))).rejects.toThrow(
      'No es un 3MF válido: no se pudo abrir como archivo comprimido.',
    );
    await expect(readModelFile('vacio.3mf', makeZip([{ name: 'Metadata/thumbnail.png', data: 'x' }]))).rejects.toThrow(
      new ModelError('El 3MF no tiene el modelo 3D (3D/3dmodel.model).'),
    );
  });

  it('refuses files above 100 MB before reading them', () => {
    expect(MAX_MODEL_BYTES).toBe(100 * 1024 * 1024);
    expect(modelSizeProblem(MAX_MODEL_BYTES)).toBeNull();
    expect(modelSizeProblem(MAX_MODEL_BYTES + 1)).toBe('El archivo pesa más de 100 MB: es demasiado grande para leerlo acá.');
  });
});
