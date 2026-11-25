import { describe, expect, it } from 'vitest';
import { ModelError } from './error';
import { asciiStl, binaryStl, cubeTriangles, type Triangle } from './fixtures';
import { stlVolume } from './stl';

const enc = (text: string) => new TextEncoder().encode(text);
const flip = (tris: Triangle[]): Triangle[] => tris.map(([a, b, c]) => [a, c, b]);

describe('STL volume', () => {
  it('reads a binary STL: a 20 mm cube is 8000 mm³', () => {
    expect(stlVolume(binaryStl(cubeTriangles(20)))).toBeCloseTo(8000, 3);
  });

  it('reads an ASCII STL', () => {
    expect(stlVolume(enc(asciiStl(cubeTriangles(20))))).toBeCloseTo(8000, 3);
    expect(stlVolume(enc(asciiStl(cubeTriangles(10)).replace(/\n/g, '\r\n')))).toBeCloseTo(1000, 3);
  });

  it('tells a binary STL by its triangle count and size, even when its header starts with "solid"', () => {
    expect(stlVolume(binaryStl(cubeTriangles(10), 'solid exported by a CAD program'))).toBeCloseTo(1000, 3);
  });

  it('gives a positive volume whatever the winding of the triangles', () => {
    expect(stlVolume(binaryStl(flip(cubeTriangles(20))))).toBeCloseTo(8000, 3);
  });

  it('rejects a file without triangles', () => {
    expect(() => stlVolume(binaryStl([]))).toThrow(new ModelError('El STL no tiene ningún triángulo.'));
    expect(() => stlVolume(enc('solid vacio\nendsolid vacio\n'))).toThrow(new ModelError('El STL no tiene ningún triángulo.'));
  });

  it('rejects a binary STL whose size does not match its triangle count', () => {
    const whole = binaryStl(cubeTriangles(20));
    expect(() => stlVolume(whole.slice(0, whole.length - 10))).toThrow(ModelError);
    expect(() => stlVolume(whole.slice(0, whole.length - 10))).toThrow('No es un STL válido');
  });

  it('rejects a text file renamed to .stl, and a file shorter than the header', () => {
    expect(() => stlVolume(enc('Lista de compras: filamento, tornillos, cinta.\n'.repeat(5)))).toThrow('No es un STL válido');
    expect(() => stlVolume(enc('hola'))).toThrow('No es un STL válido');
  });

  it('rejects an ASCII STL whose numbers cannot be read', () => {
    expect(() => stlVolume(enc(asciiStl(cubeTriangles(20)).replace('vertex', 'vertex x')))).toThrow('No es un STL válido');
  });
});
