// Filament spool domain shared by the Worker API and the React app.
import { asBody, isMissing, readInteger, readText, type Errors } from './fields';
import { normalizeSearch, type ValidationResult } from './orders';

export const DEFAULT_LOW_STOCK_GRAMS = 150;

/** Suggestions for the material field. Any other text is allowed. */
export const COMMON_MATERIALS = ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'Nylon'] as const;

export interface Spool {
  id: number;
  material: string;
  colorName: string;
  colorHex: string; // "#rrggbb", lowercase
  brand: string;
  netGrams: number; // filament weight when new, without the spool
  remainingGrams: number; // 0 to netGrams; finished print jobs subtract from it
  price: number; // whole pesos paid for the spool
  lowStockGrams: number; // marked low at or below this
  note: string;
  createdAt: string;
  updatedAt: string;
}

export type SpoolInput = Omit<Spool, 'id' | 'createdAt' | 'updatedAt'>;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Validate a spool for create or update. Error messages are shown to the owners as is. */
export function validateSpool(input: unknown): ValidationResult<SpoolInput> {
  const errors: Errors = {};
  const body = asBody(input);

  const material = readText(body, errors, 'material', 40, true);
  const colorName = readText(body, errors, 'colorName', 40, true);
  const colorHex = typeof body.colorHex === 'string' && HEX_RE.test(body.colorHex) ? body.colorHex.toLowerCase() : '';
  if (!colorHex) errors.colorHex = 'Elegí un color (formato #RRGGBB).';
  const brand = readText(body, errors, 'brand', 60, false);
  const netGrams = readInteger(body, errors, 'netGrams', 1, 'Poné el peso neto en gramos: un número entero mayor que 0.');
  const price = readInteger(body, errors, 'price', 0, 'Poné el precio en pesos, sin centavos.');
  const lowStockGrams = readInteger(body, errors, 'lowStockGrams', 0, 'Poné los gramos sin decimales, desde 0.', DEFAULT_LOW_STOCK_GRAMS);
  const note = readText(body, errors, 'note', 1000, false);

  // A new spool is full unless told otherwise.
  const rawRemaining = isMissing(body.remainingGrams) ? netGrams : body.remainingGrams;
  let remainingGrams: number | null = null;
  if (typeof rawRemaining !== 'number' || !Number.isInteger(rawRemaining)) {
    if (!isMissing(body.remainingGrams)) errors.remainingGrams = 'Poné los gramos sin decimales.';
  } else if (rawRemaining < 0) {
    errors.remainingGrams = 'No puede ser menor que 0 g.';
  } else if (netGrams !== null && rawRemaining > netGrams) {
    errors.remainingGrams = 'No puede superar el peso neto de la bobina.';
  } else {
    remainingGrams = rawRemaining;
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      material, colorName, colorHex, brand, note,
      netGrams: netGrams as number,
      remainingGrams: remainingGrams as number,
      price: price as number,
      lowStockGrams: lowStockGrams as number,
    },
  };
}

export function isLowStock(spool: Pick<Spool, 'remainingGrams' | 'lowStockGrams'>): boolean {
  return spool.remainingGrams <= spool.lowStockGrams;
}

/** Each material once, compared without case or accents, keeping the first spelling seen. Sorted. */
export function materialsOf(spools: Pick<Spool, 'material'>[]): string[] {
  const seen = new Map<string, string>();
  for (const s of spools) {
    const key = normalizeSearch(s.material);
    if (key && !seen.has(key)) seen.set(key, s.material);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'es'));
}

/** Spools of one material, compared without case or accents. An empty material keeps them all. */
export function filterByMaterial<T extends Pick<Spool, 'material'>>(spools: T[], material: string): T[] {
  const key = normalizeSearch(material);
  return key ? spools.filter((s) => normalizeSearch(s.material) === key) : spools;
}

export function totalGrams(spools: Pick<Spool, 'remainingGrams'>[]): number {
  return spools.reduce((sum, s) => sum + s.remainingGrams, 0);
}
