// The volume of an STL mesh, binary or ASCII.
import { ModelError } from './error';

const INVALID = 'No es un STL válido: el archivo está incompleto o no es un modelo 3D.';
const EMPTY = 'El STL no tiene ningún triángulo.';

/** Signed volume of the tetrahedron from the origin to one triangle: a · (b × c) ÷ 6. */
function signedVolume(
  ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number,
): number {
  return (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
}

/**
 * The mesh volume in the file's units (millimetres for every common slicer): the sum of the signed volumes of its
 * triangles, positive whatever their winding. A binary file is told by its header's triangle count matching the file
 * size (84 + 50 bytes per triangle), never by the word "solid", which many binary exporters write in the header too.
 */
export function stlVolume(bytes: Uint8Array): number {
  if (bytes.length >= 84) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = view.getUint32(80, true);
    if (84 + count * 50 === bytes.length) return binaryVolume(view, count);
  }
  return asciiVolume(bytes);
}

function binaryVolume(view: DataView, count: number): number {
  if (count === 0) throw new ModelError(EMPTY);
  let total = 0;
  const p = new Float64Array(9);
  for (let t = 0; t < count; t++) {
    const at = 84 + t * 50 + 12; // skip the normal
    for (let j = 0; j < 9; j++) p[j] = view.getFloat32(at + j * 4, true);
    total += signedVolume(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8]);
  }
  if (!Number.isFinite(total)) throw new ModelError(INVALID);
  return Math.abs(total);
}

const VERTEX_RE = /\bvertex\s+(\S+)\s+(\S+)\s+(\S+)/g;

function asciiVolume(bytes: Uint8Array): number {
  const text = new TextDecoder().decode(bytes);
  if (!/^\s*solid\b/.test(text) || !/\bendsolid\b/.test(text)) throw new ModelError(INVALID);
  const p: number[] = [];
  let total = 0;
  let triangles = 0;
  for (const m of text.matchAll(VERTEX_RE)) {
    const xyz = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (!xyz.every(Number.isFinite)) throw new ModelError(INVALID);
    p.push(...xyz);
    if (p.length === 9) {
      total += signedVolume(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8]);
      p.length = 0;
      triangles++;
    }
  }
  if (p.length) throw new ModelError(INVALID); // a facet with fewer than three vertices
  if (triangles === 0) throw new ModelError(EMPTY);
  return Math.abs(total);
}
