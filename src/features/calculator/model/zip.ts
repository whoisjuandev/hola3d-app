// Just enough ZIP reading for a 3MF, without a library: the central directory and one entry at a time.
// Layout from the PKWARE APPNOTE (sections 4.3.7 local header, 4.3.12 central directory, 4.3.16 end record, 4.5.3 Zip64).
import { ModelError } from './error';

const NOT_ZIP = 'No es un 3MF válido: no se pudo abrir como archivo comprimido.';
const BAD_METHOD = 'El 3MF usa una compresión que no se puede leer acá.';

const END_SIG = 0x06054b50;
const END64_LOCATOR_SIG = 0x07064b50;
const END64_SIG = 0x06064b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const MAX32 = 0xffffffff;

export interface ZipEntry {
  name: string;
  method: number; // 0 stored, 8 deflated
  compressedSize: number;
  size: number;
  dataStart: number; // where the entry's (compressed) bytes start
}

export type Inflate = (data: Uint8Array) => Promise<Uint8Array>;

function fail(): never {
  throw new ModelError(NOT_ZIP);
}

/** Finds the end-of-central-directory record, searching back over a comment of up to 64 KiB. */
function findEnd(view: DataView): number {
  const last = view.byteLength - 22;
  for (let at = last; at >= 0 && at >= last - 0xffff; at--) {
    if (view.getUint32(at, true) === END_SIG) return at;
  }
  return fail();
}

/** Every entry of the archive, read from its central directory. Pure: only the bytes are read. */
export function readZipDirectory(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 22) fail();
  const end = findEnd(view);
  let count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  // Zip64: the end record's fields are full and the real values are in the Zip64 end record.
  if ((count === 0xffff || offset === MAX32) && end >= 20 && view.getUint32(end - 20, true) === END64_LOCATOR_SIG) {
    const end64 = Number(view.getBigUint64(end - 12, true));
    if (end64 + 56 > bytes.length || view.getUint32(end64, true) !== END64_SIG) fail();
    count = Number(view.getBigUint64(end64 + 32, true));
    offset = Number(view.getBigUint64(end64 + 48, true));
  }

  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let at = offset;
  for (let i = 0; i < count; i++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== CENTRAL_SIG) fail();
    const method = view.getUint16(at + 10, true);
    let compressedSize = view.getUint32(at + 20, true);
    let size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    let localOffset = view.getUint32(at + 42, true);
    if (at + 46 + nameLength + extraLength > bytes.length) fail();
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));

    // A Zip64 extra field holds, in this order, each of the three values that is full above.
    let extra = at + 46 + nameLength;
    const extraEnd = extra + extraLength;
    while (extra + 4 <= extraEnd) {
      const id = view.getUint16(extra, true);
      const length = view.getUint16(extra + 2, true);
      if (id === 0x0001) {
        let field = extra + 4;
        const next = () => { const v = Number(view.getBigUint64(field, true)); field += 8; return v; };
        if (size === MAX32) size = next();
        if (compressedSize === MAX32) compressedSize = next();
        if (localOffset === MAX32) localOffset = next();
      }
      extra += 4 + length;
    }

    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== LOCAL_SIG) fail();
    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    if (dataStart + compressedSize > bytes.length) fail();
    entries.push({ name, method, compressedSize, size, dataStart });
    at = extraEnd + commentLength;
  }
  return entries;
}

/** The entry with that path, ignoring case and a leading slash (3MF paths start with "/", ZIP names do not). */
export function findZipEntry(entries: ZipEntry[], path: string): ZipEntry | undefined {
  const wanted = path.replace(/^\/+/, '').toLowerCase();
  return entries.find((e) => e.name.replace(/^\/+/, '').toLowerCase() === wanted);
}

/** Inflates raw deflate data with the browser's DecompressionStream (also in Node 18 and later). */
export async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The uncompressed bytes of one entry: a stored entry is copied as it is, a deflated one inflated. */
export async function readZipEntry(bytes: Uint8Array, entry: ZipEntry, inflate: Inflate = inflateRaw): Promise<Uint8Array> {
  const data = bytes.subarray(entry.dataStart, entry.dataStart + entry.compressedSize);
  if (entry.method === 0) return data.slice();
  if (entry.method !== 8) throw new ModelError(BAD_METHOD);
  try {
    return await inflate(data);
  } catch {
    throw new ModelError('El 3MF está dañado: una de sus partes no se pudo descomprimir.');
  }
}
