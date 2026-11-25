// Reads a picked STL or 3MF in the browser: nothing is uploaded or stored.
import { ModelError } from './error';
import { stlVolume } from './stl';
import { modelVolume, parseModelFile, parseSliceInfo, referencedPaths, type ModelFile } from './threemf';
import { scanTags } from './xml';
import { findZipEntry, inflateRaw, readZipDirectory, readZipEntry, type Inflate, type ZipEntry } from './zip';

export const MAX_MODEL_BYTES = 100 * 1024 * 1024;

/** What a model file gives: a volume to estimate from, or a slicer's real grams and time. */
export type ModelReading =
  | { source: 'estimado'; volumeCm3: number }
  | { source: 'laminador'; volumeCm3: number | null; grams: number; minutes: number; filaments: number };

/** The message for a file too big to read here; null when it is fine. Checked before reading it. */
export function modelSizeProblem(bytes: number): string | null {
  return bytes > MAX_MODEL_BYTES ? 'El archivo pesa más de 100 MB: es demasiado grande para leerlo acá.' : null;
}

const ROOT_MODEL = '3D/3dmodel.model';
const SLICE_INFO = 'Metadata/slice_info.config';
const MODEL_REL = 'http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel';

/** Reads a file by its name's extension: ".stl", or ".3mf" (".gcode.3mf" included). */
export async function readModelFile(fileName: string, bytes: Uint8Array, inflate: Inflate = inflateRaw): Promise<ModelReading> {
  const name = fileName.toLowerCase();
  if (name.endsWith('.stl')) return { source: 'estimado', volumeCm3: stlVolume(bytes) / 1000 };
  if (name.endsWith('.3mf')) return readThreeMf(bytes, inflate);
  throw new ModelError('Elegí un archivo .stl o .3mf.');
}

async function readThreeMf(bytes: Uint8Array, inflate: Inflate): Promise<ModelReading> {
  const entries = readZipDirectory(bytes);
  const text = async (entry: ZipEntry) => new TextDecoder().decode(await readZipEntry(bytes, entry, inflate));

  const sliceEntry = findZipEntry(entries, SLICE_INFO);
  const sliced = sliceEntry ? parseSliceInfo(await text(sliceEntry)) : null;

  let volumeCm3: number | null = null;
  try {
    volumeCm3 = (await meshVolume(entries, text)) / 1000;
  } catch (e) {
    if (!sliced) throw e; // the sliced numbers do not need the mesh
  }
  if (sliced) {
    return {
      source: 'laminador', volumeCm3,
      grams: Math.max(1, Math.round(sliced.grams)), minutes: Math.max(1, Math.round(sliced.seconds / 60)), filaments: sliced.filaments,
    };
  }
  return { source: 'estimado', volumeCm3: volumeCm3 as number };
}

/** The start model's path from _rels/.rels (the 3MF package's start part), or the usual 3D/3dmodel.model. */
async function rootPath(entries: ZipEntry[], text: (e: ZipEntry) => Promise<string>): Promise<string> {
  const rels = findZipEntry(entries, '_rels/.rels');
  let target: string | null = null;
  if (rels) {
    scanTags(await text(rels), ({ name, attrs }) => {
      if (!target && name === 'Relationship' && attrs.Type === MODEL_REL && attrs.Target) target = attrs.Target;
    });
  }
  return (target ?? ROOT_MODEL).replace(/^\/+/, '');
}

/** The mesh volume in mm³ of the start model and the model files it references. */
async function meshVolume(entries: ZipEntry[], text: (e: ZipEntry) => Promise<string>): Promise<number> {
  const root = await rootPath(entries, text);
  const files: Record<string, ModelFile> = {};
  const queue = [root];
  while (queue.length) {
    const path = queue.shift() as string;
    if (path.toLowerCase() in files) continue;
    const entry = findZipEntry(entries, path);
    if (!entry) {
      if (path === root) throw new ModelError('El 3MF no tiene el modelo 3D (3D/3dmodel.model).');
      continue; // modelVolume names the missing piece as damaged
    }
    const file = parseModelFile(await text(entry));
    files[path.toLowerCase()] = file;
    queue.push(...referencedPaths(file));
  }
  return modelVolume(files, root);
}
