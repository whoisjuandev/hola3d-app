// A model loaded in a calculator line: which fields it fills and when it lets go of them. Pure; the screen keeps the state.
import { parseDecimal } from '../../../ui/forms';
import { TYPED_MATERIAL, type LineDraft } from '../draft';
import { estimateFromVolume } from './estimate';
import type { ModelReading } from './read';

/** The model of one line. The line's draft keeps its usual fields: the model only fills them. */
export interface LineModel {
  fileName: string;
  volumeCm3: number | null;
  source: 'estimado' | 'laminador';
  sliced: { grams: number; minutes: number; filaments: number } | null; // the slicer's numbers
  infill: string; // as typed, for an estimate
  rate: string; // grams per hour, as typed, for an estimate
  linked: boolean; // the line's grams and time still come from the model; off once the owner types them
}

export function modelFromReading(fileName: string, reading: ModelReading, inputs: { infill: string; rate: string }): LineModel {
  return {
    fileName, volumeCm3: reading.volumeCm3, source: reading.source, ...inputs, linked: true,
    sliced: reading.source === 'laminador' ? { grams: reading.grams, minutes: reading.minutes, filaments: reading.filaments } : null,
  };
}

/** Infill from 0 to 100 %, as the owners write it ("12,5 %"); null for anything else. */
export function parseInfill(text: string): number | null {
  const n = parseDecimal(text);
  return typeof n === 'number' && n >= 0 && n <= 100 ? n : null;
}

/** Grams per hour above 0 and up to 1000; null for anything else. */
export function parseRate(text: string): number | null {
  const n = parseDecimal(text);
  return typeof n === 'number' && n > 0 && n <= 1000 ? n : null;
}

/** The material of the line's first filament: its spool's, or the typed one. Empty when unknown. */
export function firstMaterial(line: LineDraft, spools: { id: number; material: string }[]): string {
  const use = line.uses[0];
  if (!use) return '';
  if (use.spool === TYPED_MATERIAL) return use.material;
  return spools.find((s) => String(s.id) === use.spool)?.material ?? '';
}

/** The grams and minutes the model gives for this material; null while the infill or rate text is not valid. */
function modelNumbers(model: LineModel, material: string): { grams: number; minutes: number } | null {
  if (model.sliced) return model.sliced;
  const infillPercent = parseInfill(model.infill);
  const gramsPerHour = parseRate(model.rate);
  if (model.volumeCm3 === null || infillPercent === null || gramsPerHour === null) return null;
  return estimateFromVolume({ volumeCm3: model.volumeCm3, material, infillPercent, gramsPerHour });
}

function withNumbers(line: LineDraft, n: { grams: number; minutes: number }): LineDraft {
  return {
    ...line, hours: String(Math.floor(n.minutes / 60)), minutes: String(n.minutes % 60),
    uses: line.uses.map((u, i) => (i === 0 ? { ...u, grams: String(n.grams) } : u)),
  };
}

/** "8 cm³", "1.235 cm³", "2,35 cm³": whole above 10 cm³, two decimals below, never "0". */
export function volumeText(cm3: number): string {
  const shown = cm3 >= 10 ? cm3 : Math.max(0.01, cm3);
  return `${shown.toLocaleString('es-AR', { maximumFractionDigits: cm3 >= 10 ? 0 : 2 })} cm³`;
}

/** "soporte_celular.gcode.3mf" → "soporte celular": the name of a piece from its file, up to 100 characters. */
export function nameFromFile(fileName: string): string {
  return fileName.replace(/(\.gcode)?\.(stl|3mf)$/i, '').replace(/_+/g, ' ').trim().slice(0, 100);
}

/** The line once a model is loaded: first filament grams and print time, and the name when it is empty. */
export function loadModel(line: LineDraft, model: LineModel, spools: { id: number; material: string }[]): LineDraft {
  const numbers = modelNumbers(model, firstMaterial(line, spools));
  const filled = numbers ? withNumbers(line, numbers) : line;
  return line.name.trim() ? filled : { ...filled, name: nameFromFile(model.fileName) };
}

/** The line after the infill or rate changed: estimated again while the model is linked and they are valid. */
export function retune(line: LineDraft, model: LineModel, spools: { id: number; material: string }[]): LineDraft {
  if (!model.linked || model.sliced) return line;
  const numbers = modelNumbers(model, firstMaterial(line, spools));
  return numbers ? withNumbers(line, numbers) : line;
}

/** True when the owner changed the first filament's grams (or removed it) or the print time. */
function handEdited(prev: LineDraft, next: LineDraft): boolean {
  return prev.hours !== next.hours || prev.minutes !== next.minutes
    || prev.uses[0]?.key !== next.uses[0]?.key || prev.uses[0]?.grams !== next.uses[0]?.grams;
}

/**
 * An edit of a line with a model: typing grams or time by hand lets go of the model (its badge goes off); changing the
 * first filament's material estimates again. Anything else, or a line without a linked model, passes as it is.
 */
export function followEdit(
  prev: LineDraft, next: LineDraft, model: LineModel | null, spools: { id: number; material: string }[],
): { line: LineDraft; model: LineModel | null } {
  if (!model?.linked) return { line: next, model };
  if (handEdited(prev, next)) return { line: next, model: { ...model, linked: false } };
  if (!model.sliced && firstMaterial(prev, spools) !== firstMaterial(next, spools)) return { line: retune(next, model, spools), model };
  return { line: next, model };
}
