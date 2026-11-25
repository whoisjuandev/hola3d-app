// The calculator form as typed text, and its conversion to the input of the shared formula.
import type { CalcInput, CalcLineInput, CalcPrinter, CalcSpool } from '../../../shared/calculator';
import {
  isMultiplier, isTwoDecimals, MAX_PERCENT, profitSettingsOf, startingProfit, type ProfitChoice, type ProfitMode, type ProfitSettings,
} from '../../../shared/profit';
import { parseDecimal, parseWhole } from '../../ui/forms';

/** The spool select value for "a material I do not have in stock". */
export const TYPED_MATERIAL = 'otro';

/** The printer or spool select value for one a loaded profile named that no longer exists: it prices as none. */
export const CHOOSE_AGAIN = 'elegir';

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

// ---- Profit ----

/** The profit block as typed: the chosen mode, and the text of each mode so switching back keeps it. */
export interface ProfitDraft {
  mode: ProfitMode;
  percent: string;
  multiplier: string;
}

type StartSettings = { marginPercent: number } & Partial<ProfitSettings>;

/** "2,5": a number as the owners write it. */
export function decimalText(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 2, useGrouping: false });
}

/** The settings' starting mode, with the starting margin and multiplier as text. */
export function newProfitDraft(settings: StartSettings): ProfitDraft {
  const { profitMode, profitMultiplier } = profitSettingsOf(settings);
  return { mode: profitMode, percent: decimalText(settings.marginPercent), multiplier: decimalText(profitMultiplier) };
}

/** A saved choice in its mode; the other mode starts from the settings. No choice: the settings' start. */
export function profitDraftFrom(choice: ProfitChoice | undefined, settings: StartSettings): ProfitDraft {
  const draft = newProfitDraft(settings);
  if (!choice) return draft;
  return choice.mode === 'porcentaje'
    ? { ...draft, mode: 'porcentaje', percent: decimalText(choice.value) }
    : { ...draft, mode: 'multiplicador', multiplier: decimalText(choice.value) };
}

/** The typed value of the chosen mode when it is a valid one; null otherwise. */
function typedProfit(draft: ProfitDraft): number | null {
  const text = draft.mode === 'porcentaje' ? draft.percent : draft.multiplier.replace(/[×x]/gi, '');
  const value = parseDecimal(text);
  if (draft.mode === 'porcentaje') return isTwoDecimals(value, 0, MAX_PERCENT) ? value : null;
  return isMultiplier(value) ? value : null;
}

/** The message for the chosen mode's text when it is not a valid value; null when it is, or empty. */
export function profitProblem(draft: ProfitDraft): string | null {
  const text = draft.mode === 'porcentaje' ? draft.percent : draft.multiplier;
  if (text.trim() === '' || typedProfit(draft) !== null) return null;
  return draft.mode === 'porcentaje' ? 'Un número de 0 a 1000, con hasta dos decimales.' : 'Un número de 1 a 11, con hasta dos decimales.';
}

/** The profit choice of the calculation. While the text is not valid, the settings' starting value of that mode prices it. */
export function toProfitChoice(draft: ProfitDraft, settings: StartSettings): ProfitChoice {
  const value = typedProfit(draft);
  if (value !== null) return { mode: draft.mode, value };
  return startingProfit({ ...settings, profitMode: draft.mode });
}

// ---- Loading a saved input ----

/** "" for 0, so a loaded field looks like a fresh one; the number as text otherwise. */
function blankZero(n: number): string {
  return n === 0 ? '' : String(n);
}

/**
 * The form text of a saved calculator input (a profile). A printer or spool that is not in the lists any more is left
 * to choose again (CHOOSE_AGAIN), and `missing` names each one, like "la impresora de «Cartel»".
 */
export function fromCalcInput(
  input: CalcInput, printers: Pick<CalcPrinter, 'id'>[], spools: Pick<CalcSpool, 'id'>[], nextKey: () => number,
): { lines: LineDraft[]; missing: string[] } {
  const missing: string[] = [];
  const lines = input.lines.map((line, i): LineDraft => {
    const piece = `«${line.name || `Pieza ${i + 1}`}»`;
    let printerId = line.printerId == null ? '' : String(line.printerId);
    if (line.printerId != null && !printers.some((p) => p.id === line.printerId)) {
      printerId = CHOOSE_AGAIN;
      missing.push(`la impresora de ${piece}`);
    }
    const key = nextKey();
    const uses = line.filaments.map((f): UseDraft => {
      const useKey = nextKey();
      if (f.spoolId == null) return { key: useKey, spool: TYPED_MATERIAL, material: f.material, pricePerKg: blankZero(f.pricePerKg), grams: String(f.gramsPerUnit) };
      const gone = !spools.some((s) => s.id === f.spoolId);
      if (gone) missing.push(`una bobina de ${piece}`);
      return { key: useKey, spool: gone ? CHOOSE_AGAIN : String(f.spoolId), material: '', pricePerKg: '', grams: String(f.gramsPerUnit) };
    });
    return {
      key, name: line.name, quantity: String(line.quantity), printerId,
      hours: blankZero(Math.floor(line.printMinutesPerUnit / 60)), minutes: blankZero(line.printMinutesPerUnit % 60),
      prepMinutes: blankZero(line.prepMinutes), postMinutes: blankZero(line.postMinutes), packaging: String(line.packaging), uses,
    };
  });
  return { lines, missing: [...new Set(missing)] };
}

/** "Ya no existen la impresora de «Cartel» y una bobina de «Cartel»: elegilas de nuevo." */
export function missingNotice(missing: string[]): string {
  const list = missing.length > 1 ? `${missing.slice(0, -1).join(', ')} y ${missing.at(-1)}` : missing[0];
  return missing.length > 1 ? `Ya no existen ${list}: elegilas de nuevo.` : `Ya no existe ${list}: elegila de nuevo.`;
}

/** True once the owner typed something or added a piece: loading a profile over it asks first. */
export function hasData(lines: LineDraft[]): boolean {
  if (lines.length > 1) return true;
  return lines.some((l) => [l.name, l.hours, l.minutes, l.prepMinutes, l.postMinutes].some((t) => t.trim() !== '')
    || l.uses.some((u) => u.grams.trim() !== '' || u.material.trim() !== '' || u.pricePerKg.trim() !== ''));
}
