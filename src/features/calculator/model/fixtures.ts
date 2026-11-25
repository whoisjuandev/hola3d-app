// Test-only builders of small STL, 3MF and ZIP files. Never imported by the app.
import { crc32, deflateRawSync } from 'node:zlib';

export type Vec = [number, number, number];
export type Triangle = [Vec, Vec, Vec];

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The 12 triangles of a cube from the origin to `size` on each axis, each facing outwards. */
export function cubeTriangles(size: number): Triangle[] {
  const centre: Vec = [size / 2, size / 2, size / 2];
  const tris: Triangle[] = [];
  for (let axis = 0; axis < 3; axis++) {
    for (const side of [0, size]) {
      const [u, v] = [0, 1, 2].filter((a) => a !== axis);
      const corner = (a: number, b: number): Vec => {
        const p: Vec = [0, 0, 0];
        p[axis] = side; p[u] = a; p[v] = b;
        return p;
      };
      const quad = [corner(0, 0), corner(size, 0), corner(size, size), corner(0, size)];
      for (const t of [[quad[0], quad[1], quad[2]], [quad[0], quad[2], quad[3]]] as Triangle[]) {
        const normal = cross(sub(t[1], t[0]), sub(t[2], t[0]));
        tris.push(dot(normal, sub(t[0], centre)) >= 0 ? t : [t[0], t[2], t[1]]);
      }
    }
  }
  return tris;
}

/** A binary STL: 80-byte header, triangle count, 50 bytes per triangle. */
export function binaryStl(tris: Triangle[], header = 'binary stl'): Uint8Array {
  const bytes = new Uint8Array(84 + tris.length * 50);
  bytes.set(new TextEncoder().encode(header.slice(0, 80)));
  const view = new DataView(bytes.buffer);
  view.setUint32(80, tris.length, true);
  tris.forEach((t, i) => {
    const at = 84 + i * 50 + 12; // after the normal, left at 0
    t.flat().forEach((n, j) => view.setFloat32(at + j * 4, n, true));
  });
  return bytes;
}

export function asciiStl(tris: Triangle[], name = 'cube'): string {
  const facets = tris.map((t) => [
    '  facet normal 0 0 0', '    outer loop', ...t.map((p) => `      vertex ${p.map((n) => n.toExponential(6)).join(' ')}`),
    '    endloop', '  endfacet',
  ].join('\n'));
  return `solid ${name}\n${facets.join('\n')}\nendsolid ${name}\n`;
}

/** The <mesh> of a list of triangles, with each corner as its own vertex. */
export function meshXml(tris: Triangle[]): string {
  const vertices = tris.flat().map(([x, y, z]) => `<vertex x="${x}" y="${y}" z="${z}"/>`).join('');
  const triangles = tris.map((_, i) => `<triangle v1="${i * 3}" v2="${i * 3 + 1}" v3="${i * 3 + 2}"/>`).join('');
  return `<mesh><vertices>${vertices}</vertices><triangles>${triangles}</triangles></mesh>`;
}

export function modelXml(body: string, unit?: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<model ${unit ? `unit="${unit}" ` : ''}xml:lang="en-US" `
    + 'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" '
    + `xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06">${body}</model>`;
}

export interface ZipFile {
  name: string;
  data: string | Uint8Array;
  stored?: boolean; // method 0; deflated otherwise
}

/** A ZIP archive with local headers, the central directory and its end record. */
export function makeZip(files: ZipFile[]): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const raw = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const data = f.stored ? raw : new Uint8Array(deflateRawSync(raw));
    const name = enc.encode(f.name);
    const method = f.stored ? 0 : 8;
    const crc = crc32(raw) >>> 0;

    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, method, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(data, 30 + name.length);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, method, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);

    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const out = new Uint8Array(offset + centralSize + end.length);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** A Bambu Studio style Metadata/slice_info.config with one <plate> per entry. */
export function sliceInfoXml(plates: { prediction?: number; weight?: number; filaments: { id: number; type: string; usedG?: number }[] }[]): string {
  const body = plates.map((p, i) => [
    '  <plate>',
    `    <metadata key="index" value="${i + 1}"/>`,
    ...(p.prediction === undefined ? [] : [`    <metadata key="prediction" value="${p.prediction}"/>`]),
    ...(p.weight === undefined ? [] : [`    <metadata key="weight" value="${p.weight.toFixed(2)}"/>`]),
    '    <metadata key="outside" value="false"/>',
    '    <object identify_id="139" name="Cubo &amp; tapa" skipped="false" />',
    ...p.filaments.map((f) => `    <filament id="${f.id}" tray_info_idx="GFA00" type="${f.type}" color="#FFFFFF" used_m="1.20"`
      + `${f.usedG === undefined ? '' : ` used_g="${f.usedG.toFixed(2)}"`} />`),
    '  </plate>',
  ].join('\n')).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<config>\n  <header>\n    <header_item key="X-BBL-Client-Type" value="slicer"/>\n`
    + `    <header_item key="X-BBL-Client-Version" value="02.04.00.70"/>\n  </header>\n${body}\n</config>\n`;
}
