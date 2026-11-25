// What a 3MF says about its model: the mesh volume of an unsliced one, and the slicer's numbers of a sliced one.
import { ModelError } from './error';
import { scanTags } from './xml';

const DAMAGED = 'El 3MF tiene una pieza dañada.';
const NO_VOLUME = 'El 3MF no tiene ninguna pieza con volumen.';

/** Millimetres per unit of the `unit` attribute of <model> (3MF Core Specification, 3.4). */
const UNIT_MM: Record<string, number> = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 };

/** Object types made of printed material; "support", "surface" and "other" are left out. */
const PRINTED_TYPES = new Set(['model', 'solidsupport']);

/** A placement of an object: by a build <item> or a <component>, maybe in another model file (production extension's p:path). */
interface ObjectRef {
  objectId: string;
  path: string | null;
  det: number; // determinant of the transform's 3 × 3 part: how much it scales a volume (negative for a mirror)
}

interface ModelObject {
  type: string;
  volume: number; // signed mesh volume, in the file's units cubed
  components: ObjectRef[];
}

export interface ModelFile {
  mmPerUnit: number;
  objects: Record<string, ModelObject>;
  items: ObjectRef[];
}

const normPath = (path: string) => path.replace(/^\/+/, '').toLowerCase();

/** The volume factor of a 3MF transform "m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32"; translation does not count. */
function transformDet(text: string | undefined): number {
  if (text === undefined || text.trim() === '') return 1;
  const m = text.trim().split(/\s+/).map(Number);
  if (m.length !== 12 || !m.every(Number.isFinite)) throw new ModelError(DAMAGED);
  return m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
}

function refOf(attrs: Record<string, string>): ObjectRef {
  if (!attrs.objectid) throw new ModelError(DAMAGED);
  return { objectId: attrs.objectid, path: attrs.path ? attrs.path.replace(/^\/+/, '') : null, det: transformDet(attrs.transform) };
}

/** Reads one model file: its unit, each object's signed mesh volume and components, and the build items. */
export function parseModelFile(xml: string): ModelFile {
  const file: ModelFile = { mmPerUnit: 1, objects: {}, items: [] };
  let object: ModelObject | null = null;
  let vertices: number[] = [];
  scanTags(xml, ({ name, attrs, closing }) => {
    if (closing) {
      if (name === 'object') object = null;
      if (name === 'mesh') vertices = [];
      return;
    }
    switch (name) {
      case 'model':
        file.mmPerUnit = UNIT_MM[attrs.unit ?? 'millimeter'] ?? 1;
        break;
      case 'object':
        object = { type: attrs.type ?? 'model', volume: 0, components: [] };
        if (attrs.id) file.objects[attrs.id] = object;
        break;
      case 'vertex': {
        const xyz = [Number(attrs.x), Number(attrs.y), Number(attrs.z)];
        if (!xyz.every(Number.isFinite)) throw new ModelError(DAMAGED);
        vertices.push(xyz[0], xyz[1], xyz[2]);
        break;
      }
      case 'triangle': {
        if (!object) break;
        const count = vertices.length / 3;
        const [a, b, c] = [attrs.v1, attrs.v2, attrs.v3].map((v) => {
          const i = Number(v);
          if (!Number.isInteger(i) || i < 0 || i >= count) throw new ModelError(DAMAGED);
          return i * 3;
        });
        const p = vertices;
        object.volume += (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
          - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c])
          + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) / 6;
        break;
      }
      case 'component':
        if (object) object.components.push(refOf(attrs));
        break;
      case 'item':
        file.items.push(refOf(attrs));
        break;
    }
  });
  return file;
}

/** The other model files a file's components and items point to (Bambu Studio and OrcaSlicer keep meshes in 3D/Objects/). */
export function referencedPaths(file: ModelFile): string[] {
  const refs = [...file.items, ...Object.values(file.objects).flatMap((o) => o.components)];
  return [...new Set(refs.flatMap((r) => (r.path ? [r.path] : [])))];
}

/**
 * The printed volume in mm³: each build item's object (its mesh plus its components, recursively, each scaled by its
 * transform), in its own file's unit. Without build items, every root object no other object uses.
 */
export function modelVolume(files: Record<string, ModelFile>, rootPath: string): number {
  const byPath = new Map(Object.entries(files).map(([p, f]) => [normPath(p), f]));
  const root = normPath(rootPath);
  const rootFile = byPath.get(root);
  if (!rootFile) throw new ModelError(DAMAGED);

  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const volumeOf = (path: string, id: string): number => {
    const key = `${path}#${id}`;
    const known = memo.get(key);
    if (known !== undefined) return known;
    const file = byPath.get(path);
    const object = file?.objects[id];
    if (!file || !object || visiting.has(key)) throw new ModelError(DAMAGED);
    if (!PRINTED_TYPES.has(object.type)) return 0;
    visiting.add(key);
    let volume = object.volume * file.mmPerUnit ** 3;
    for (const c of object.components) volume += c.det * volumeOf(c.path ? normPath(c.path) : path, c.objectId);
    visiting.delete(key);
    memo.set(key, volume);
    return volume;
  };

  let items = rootFile.items;
  if (!items.length) {
    const used = new Set(Object.values(rootFile.objects).flatMap((o) => o.components.filter((c) => !c.path).map((c) => c.objectId)));
    items = Object.keys(rootFile.objects).filter((id) => !used.has(id)).map((objectId) => ({ objectId, path: null, det: 1 }));
  }
  const total = items.reduce((sum, item) => sum + Math.abs(item.det * volumeOf(item.path ? normPath(item.path) : root, item.objectId)), 0);
  if (!(total > 0) || !Number.isFinite(total)) throw new ModelError(NO_VOLUME);
  return total;
}

export interface SliceInfo {
  seconds: number;
  grams: number;
  filaments: number; // how many filaments the slicer used, over all plates
}

/**
 * The slicer's numbers in a sliced 3MF (Bambu Studio or OrcaSlicer ".gcode.3mf"), from Metadata/slice_info.config.
 *
 * Format relied on: BambuStudio src/libslic3r/Format/bbs_3mf.cpp, `_add_slice_info_config_file_to_archive` (OrcaSlicer
 * keeps the same writer and tag names in its copy of that file). It writes `<config>` with one `<plate>` per sliced
 * plate; each plate has `<metadata key="prediction" value="…"/>` (the print time: PartPlate.cpp stores the normal-mode
 * estimate as whole seconds), `<metadata key="weight" value="…"/>` (the plate's grams) and one
 * `<filament id type color used_m used_g …/>` per filament it uses (`used_g` in grams).
 *
 * Plates are added up. A plate's grams are the sum of its filaments' `used_g`, or its `weight` when none has one.
 * Tolerant by design: missing time or grams (or no plate at all, or not XML) means "not sliced", so null.
 */
export function parseSliceInfo(xml: string): SliceInfo | null {
  let seconds = 0;
  let grams = 0;
  const filamentIds = new Set<string>();
  let plate: { seconds: number; weight: number; usedG: number; hasUsedG: boolean } | null = null;
  scanTags(xml, ({ name, attrs, closing, selfClosing }) => {
    if (name !== 'plate' && !plate) return;
    if (name === 'plate') {
      if (!closing) plate = { seconds: 0, weight: 0, usedG: 0, hasUsedG: false };
      if ((closing || selfClosing) && plate) {
        seconds += plate.seconds;
        grams += plate.hasUsedG ? plate.usedG : plate.weight;
        plate = null;
      }
      return;
    }
    if (closing || !plate) return;
    const number = (text: string | undefined) => {
      const n = Number(text);
      return text !== undefined && text.trim() !== '' && Number.isFinite(n) && n > 0 ? n : 0;
    };
    if (name === 'metadata' && attrs.key === 'prediction') plate.seconds = number(attrs.value);
    if (name === 'metadata' && attrs.key === 'weight') plate.weight = number(attrs.value);
    if (name === 'filament') {
      const used = attrs.used_g === undefined ? null : number(attrs.used_g);
      if (used !== null) {
        plate.usedG += used;
        plate.hasUsedG = true;
      }
      if ((used === null || used > 0) && attrs.id) filamentIds.add(attrs.id);
    }
  });
  if (!(seconds > 0) || !(grams > 0)) return null;
  return { seconds, grams: Math.round(grams * 100) / 100, filaments: Math.max(1, filamentIds.size) };
}
