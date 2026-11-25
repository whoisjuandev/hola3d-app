import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { ModelError } from './error';
import { makeZip } from './fixtures';
import { findZipEntry, inflateRaw, readZipDirectory, readZipEntry } from './zip';

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('ZIP reading', () => {
  const zip = makeZip([
    { name: '[Content_Types].xml', data: '<Types/>', stored: true },
    { name: '3D/3dmodel.model', data: '<model>'.padEnd(500, ' ') + '</model>' },
    { name: 'Metadata/slice_info.config', data: '<config/>' },
  ]);

  it('lists the central directory: names, methods and sizes', () => {
    const entries = readZipDirectory(zip);
    expect(entries.map((e) => [e.name, e.method, e.size])).toEqual([
      ['[Content_Types].xml', 0, 8],
      ['3D/3dmodel.model', 8, 508],
      ['Metadata/slice_info.config', 8, 9],
    ]);
    expect(entries[1].compressedSize).toBeLessThan(508);
  });

  it('finds an entry ignoring case and a leading slash', () => {
    const entries = readZipDirectory(zip);
    expect(findZipEntry(entries, '/3D/3DModel.model')?.name).toBe('3D/3dmodel.model');
    expect(findZipEntry(entries, 'Metadata/plate_1.gcode')).toBeUndefined();
  });

  it('copies a stored entry and inflates a deflated one with the browser stream', async () => {
    const entries = readZipDirectory(zip);
    expect(text(await readZipEntry(zip, entries[0]))).toBe('<Types/>');
    expect(text(await readZipEntry(zip, entries[2]))).toBe('<config/>');
  });

  it('inflates with an injected function too', async () => {
    const entries = readZipDirectory(zip);
    const inflate = async (data: Uint8Array) => new Uint8Array(inflateRawSync(data));
    expect(text(await readZipEntry(zip, entries[1], inflate))).toMatch(/^<model> +<\/model>$/);
  });

  it('has the deflate-raw stream in this Node, as in the browser', async () => {
    expect(typeof DecompressionStream).toBe('function');
    const entries = readZipDirectory(zip);
    const raw = zip.slice(entries[2].dataStart, entries[2].dataStart + entries[2].compressedSize);
    expect(text(await inflateRaw(raw))).toBe('<config/>');
  });

  it('rejects bytes that are not a ZIP, or a cut one', () => {
    expect(() => readZipDirectory(new TextEncoder().encode('solid cube\nendsolid cube\n'))).toThrow(
      new ModelError('No es un 3MF válido: no se pudo abrir como archivo comprimido.'),
    );
    expect(() => readZipDirectory(zip.slice(0, 40))).toThrow(ModelError);
    expect(() => readZipDirectory(zip.slice(30))).toThrow(ModelError);
  });

  it('rejects an entry with a compression it cannot read', async () => {
    const odd = makeZip([{ name: 'a.txt', data: 'hola', stored: true }]);
    new DataView(odd.buffer).setUint16(odd.length - 22 - 46 - 5 + 10, 12, true); // central method: bzip2
    const [entry] = readZipDirectory(odd);
    await expect(readZipEntry(odd, entry)).rejects.toThrow('El 3MF usa una compresión que no se puede leer acá.');
  });
});
