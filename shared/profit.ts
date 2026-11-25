// How a calculation sets its profit: a percentage of the production cost, or a multiplier of it. Shared by the
// calculator, the cost settings and quotes. A multiplier of m is the same as a margin of (m − 1) × 100 %.
import { asBody, type Body, type Errors } from './fields';

export const PROFIT_MODES = ['porcentaje', 'multiplicador'] as const;
export type ProfitMode = (typeof PROFIT_MODES)[number];

/** The profit of one calculation: a percentage (0 to 1000) or a multiplier (1 to 11), each with up to two decimals. */
export interface ProfitChoice {
  mode: ProfitMode;
  value: number;
}

/** A named multiplier the calculator offers as a button, like "Mayorista ×3". */
export interface ProfitShortcut {
  name: string; // 1 to 30 characters, unique among the shortcuts (ignoring case)
  multiplier: number; // 1 to 11, up to two decimals
}

/** What the cost settings store about profit, next to the starting margin (`marginPercent`). */
export interface ProfitSettings {
  profitMode: ProfitMode; // the mode a new calculation starts with
  profitMultiplier: number; // the multiplier a new calculation starts with in multiplier mode
  profitShortcuts: ProfitShortcut[]; // 1 to 8
}

export const DEFAULT_PROFIT_SETTINGS: ProfitSettings = {
  profitMode: 'porcentaje',
  profitMultiplier: 3,
  profitShortcuts: [
    { name: 'Mayorista', multiplier: 3 },
    { name: 'Minorista', multiplier: 4 },
    { name: 'Llaveros', multiplier: 5 },
  ],
};

export const MIN_MULTIPLIER = 1;
export const MAX_MULTIPLIER = 11;
export const MAX_PERCENT = 1000;
export const MAX_SHORTCUTS = 8;
export const MAX_SHORTCUT_NAME = 30;

const MODE_MESSAGE = 'Elegí cómo calcular la ganancia: porcentaje o multiplicador.';
export const PERCENT_MESSAGE = 'El margen va de 0 a 1000 %, con hasta dos decimales.';
export const MULTIPLIER_MESSAGE = 'El multiplicador va de 1 a 11, con hasta dos decimales.';

export function isProfitMode(value: unknown): value is ProfitMode {
  return typeof value === 'string' && (PROFIT_MODES as readonly string[]).includes(value);
}

/** A finite number from `min` to `max`, both included, with at most two decimals. */
export function isTwoDecimals(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max && Number(value.toFixed(2)) === value;
}

export function isMultiplier(value: unknown): value is number {
  return isTwoDecimals(value, MIN_MULTIPLIER, MAX_MULTIPLIER);
}

/** A profit choice with only its known fields, or the message of its problem. */
export function readProfitChoice(raw: unknown): ProfitChoice | string {
  const body = asBody(raw);
  const { mode, value } = body;
  if (!isProfitMode(mode)) return MODE_MESSAGE;
  if (mode === 'porcentaje') return isTwoDecimals(value, 0, MAX_PERCENT) ? { mode, value } : PERCENT_MESSAGE;
  return isMultiplier(value) ? { mode, value } : MULTIPLIER_MESSAGE;
}

/**
 * The profit as a percentage of the production cost. A multiplier has at most two decimals, so (m × 100 − 100) is
 * worked out in whole hundredths: 1.6 gives exactly 60, and the price is the same as with a 60 % margin.
 */
export function profitPercent(choice: ProfitChoice): number {
  return choice.mode === 'porcentaje' ? choice.value : Math.round(choice.value * 100) - 100;
}

function decimal(n: number): string {
  return n.toLocaleString('es-AR', { maximumFractionDigits: 2, useGrouping: false });
}

/** "×4", "×2,5" or "60 %": how the breakdown names the profit it used. */
export function profitLabel(choice: ProfitChoice): string {
  return choice.mode === 'multiplicador' ? `×${decimal(choice.value)}` : `${decimal(choice.value)} %`;
}

/** The profit fields of a settings record; one saved before they existed reads as the defaults. */
export function profitSettingsOf(settings: Partial<ProfitSettings>): ProfitSettings {
  return {
    profitMode: settings.profitMode ?? DEFAULT_PROFIT_SETTINGS.profitMode,
    profitMultiplier: settings.profitMultiplier ?? DEFAULT_PROFIT_SETTINGS.profitMultiplier,
    profitShortcuts: settings.profitShortcuts ?? DEFAULT_PROFIT_SETTINGS.profitShortcuts.map((s) => ({ ...s })),
  };
}

/** The mode and value a new calculation starts with: the margin in percentage mode, the starting multiplier otherwise. */
export function startingProfit(settings: { marginPercent: number } & Partial<ProfitSettings>): ProfitChoice {
  const { profitMode, profitMultiplier } = profitSettingsOf(settings);
  return profitMode === 'porcentaje' ? { mode: 'porcentaje', value: settings.marginPercent } : { mode: 'multiplicador', value: profitMultiplier };
}

/** The profit a result was priced with. A result saved before it was recorded used the percentage of its settings. */
export function resultProfit(result: { settings: { marginPercent: number }; profit?: ProfitChoice }): ProfitChoice {
  return result.profit ?? { mode: 'porcentaje', value: result.settings.marginPercent };
}

/** The shortcuts, trimmed, or the message of their first problem. */
function readShortcuts(raw: unknown): ProfitShortcut[] | string {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_SHORTCUTS) return `Poné entre 1 y ${MAX_SHORTCUTS} atajos.`;
  const out: ProfitShortcut[] = [];
  for (const [i, item] of raw.entries()) {
    const label = `Atajo ${i + 1}`;
    const s = asBody(item);
    const name = typeof s.name === 'string' ? s.name.trim() : '';
    if (!name || name.length > MAX_SHORTCUT_NAME) return `${label}: ponele un nombre de hasta ${MAX_SHORTCUT_NAME} caracteres.`;
    if (out.some((o) => o.name.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))) return `${label}: ya hay otro atajo con ese nombre.`;
    if (!isMultiplier(s.multiplier)) return `${label}: el multiplicador va de 1 a 11, con hasta dos decimales.`;
    out.push({ name, multiplier: s.multiplier });
  }
  return out;
}

/**
 * Read the profit fields of a settings body that are present, recording a message for each wrong one. They came after
 * the other settings, so a record without them is still whole: it reads as the defaults (see profitSettingsOf).
 */
export function readProfitSettings(body: Body, errors: Errors): Partial<ProfitSettings> {
  const out: Partial<ProfitSettings> = {};
  if (body.profitMode !== undefined) {
    if (isProfitMode(body.profitMode)) out.profitMode = body.profitMode;
    else errors.profitMode = 'Elegí con qué empieza la ganancia: porcentaje o multiplicador.';
  }
  if (body.profitMultiplier !== undefined) {
    if (isMultiplier(body.profitMultiplier)) out.profitMultiplier = body.profitMultiplier;
    else errors.profitMultiplier = MULTIPLIER_MESSAGE;
  }
  if (body.profitShortcuts !== undefined) {
    const shortcuts = readShortcuts(body.profitShortcuts);
    if (typeof shortcuts === 'string') errors.profitShortcuts = shortcuts;
    else out.profitShortcuts = shortcuts;
  }
  return out;
}
