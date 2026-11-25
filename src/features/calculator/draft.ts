// The calculator form as typed text, and its conversion to the input of the shared formula.
import type { CalcInput, CalcLineInput } from '../../../shared/calculator';
import { parseWhole } from '../../ui/forms';

/** The spool select value for "a material I do not have in stock". */
export const TYPED_MATERIAL = 'otro';

export interface UseDraft {
  key: number;
  spool: string; // a spool id, or TYPED_MATERIAL
  material: string;
  pricePerKg: string;
  grams: string; // per unit
}

export interface LineDraft {
  key: number;
  name: string;
  quantity: string;
  printerId: string; // '' for none
  hours: string; // print time per unit: hours…
  minutes: string; // …and minutes
  prepMinutes: string;
  postMinutes: string;
  packaging: string;
  uses: UseDraft[];
}

export function newUse(key: number, spoolId: number | null): UseDraft {
  return { key, spool: spoolId == null ? TYPED_MATERIAL : String(spoolId), material: '', pricePerKg: '', grams: '' };
}

export function newLine(key: number, defaults: { printerId: number | null; spoolId: number | null; packaging: number }): LineDraft {
  return {
    key, name: '', quantity: '1', printerId: defaults.printerId == null ? '' : String(defaults.printerId),
    hours: '', minutes: '', prepMinutes: '', postMinutes: '', packaging: String(defaults.packaging),
    uses: [newUse(key, defaults.spoolId)],
  };
}

/** A whole number from 0, or null when the text is anything else. */
function whole(text: string): number | null {
  const value = parseWhole(text);
  return typeof value === 'number' && value >= 0 ? value : null;
}

/** Blank or wrong text counts as 0 so the rest of the calculation still shows. */
function wholeOrZero(text: string): number {
  return whole(text) ?? 0;
}

/** True when the field has text that is not a whole number from 0. Empty is fine. */
export function badWhole(text: string): boolean {
  return text.trim() !== '' && whole(text) === null;
}

function toLine(d: LineDraft): CalcLineInput {
  return {
    name: d.name.trim(),
    quantity: wholeOrZero(d.quantity),
    printerId: whole(d.printerId),
    printMinutesPerUnit: wholeOrZero(d.hours) * 60 + wholeOrZero(d.minutes),
    prepMinutes: wholeOrZero(d.prepMinutes),
    postMinutes: wholeOrZero(d.postMinutes),
    packaging: wholeOrZero(d.packaging),
    filaments: d.uses.map((u) => {
      const typed = u.spool === TYPED_MATERIAL;
      return {
        spoolId: typed ? null : whole(u.spool),
        material: typed ? u.material.trim() : '',
        pricePerKg: typed ? wholeOrZero(u.pricePerKg) : 0,
        gramsPerUnit: wholeOrZero(u.grams),
      };
    }),
  };
}

export function toCalcInput(lines: LineDraft[]): CalcInput {
  return { lines: lines.map(toLine) };
}
