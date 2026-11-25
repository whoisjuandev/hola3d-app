// The cost calculator: what a set of pieces really costs and what to charge for it. Pure, no storage.
import type { CostSettingsInput } from './cost-settings';
import type { Printer } from './printers';
import type { Spool } from './spools';

export type CalcPrinter = Pick<Printer, 'id' | 'name' | 'purchasePrice' | 'lifetimeHours' | 'powerWatts'>;
export type CalcSpool = Pick<Spool, 'id' | 'material' | 'colorName' | 'colorHex' | 'brand' | 'netGrams' | 'remainingGrams' | 'price'>;

/** One filament in a piece: a stored spool, or (with `spoolId` null) a typed material and its price per kg. */
export interface FilamentUseInput {
  spoolId: number | null;
  material: string; // only read without a spool
  pricePerKg: number; // whole pesos; only read without a spool
  gramsPerUnit: number; // whole grams
}

export interface CalcLineInput {
  name: string;
  quantity: number;
  printerId: number | null;
  printMinutesPerUnit: number;
  filaments: FilamentUseInput[];
  prepMinutes: number; // for the whole line
  postMinutes: number; // for the whole line
  packaging: number; // whole pesos for the whole line
}

export interface CalcInput {
  lines: CalcLineInput[];
}

/** Every term in whole pesos, in the order of the formula. */
export interface CostBreakdown {
  material: number;
  energy: number;
  machineWear: number;
  fixedCosts: number;
  labour: number;
  packaging: number;
  failureAllowance: number;
  productionCost: number;
  profit: number;
  priceBeforeCommission: number;
  commission: number;
  rounding: number;
  finalPrice: number;
}

export type BreakdownKey = keyof CostBreakdown;

/** The breakdown in display order. `total` marks the subtotals. */
export const BREAKDOWN_TERMS: readonly { key: BreakdownKey; label: string; total?: boolean }[] = [
  { key: 'material', label: 'Material' },
  { key: 'energy', label: 'Luz' },
  { key: 'machineWear', label: 'Desgaste de máquina' },
  { key: 'fixedCosts', label: 'Gastos fijos' },
  { key: 'labour', label: 'Mano de obra' },
  { key: 'packaging', label: 'Packaging' },
  { key: 'failureAllowance', label: 'Margen por fallas' },
  { key: 'productionCost', label: 'Costo de producción', total: true },
  { key: 'profit', label: 'Ganancia' },
  { key: 'priceBeforeCommission', label: 'Precio antes de comisión', total: true },
  { key: 'commission', label: 'Comisión' },
  { key: 'rounding', label: 'Redondeo' },
  { key: 'finalPrice', label: 'Precio final', total: true },
];

/** A filament as it was priced: names and prices copied, no reference to the spool. */
export interface FilamentUseResult {
  label: string;
  colorHex: string | null; // null for a typed material
  gramsPerUnit: number;
  grams: number; // for the whole line
  pricePerKg: number; // whole pesos
  cost: number; // whole pesos
}

export interface CalcLineResult {
  name: string;
  quantity: number;
  printerName: string | null;
  printMinutesPerUnit: number;
  printMinutes: number; // for the whole line
  prepMinutes: number;
  postMinutes: number;
  filaments: FilamentUseResult[];
  breakdown: CostBreakdown;
  total: number; // the line's final price
  unitPrice: number; // total ÷ quantity, whole pesos
}

/** Plain JSON: a quote can store it as is and it will not change when settings, spools or printers do. */
export interface CalcResult {
  lines: CalcLineResult[];
  breakdown: CostBreakdown; // each term summed over the lines
  total: number; // the sum of the line totals
  quantity: number; // units over all lines
  unitPrice: number; // total ÷ quantity, whole pesos
  settings: CostSettingsInput; // the settings the prices came from
}

/** "PLA Blanco · Grilon3", or "PLA Blanco" without a brand. */
export function spoolLabel(spool: Pick<CalcSpool, 'material' | 'colorName' | 'brand'>): string {
  const name = `${spool.material} ${spool.colorName}`;
  return spool.brand ? `${name} · ${spool.brand}` : name;
}

/** Pesos per gram of a spool: what was paid ÷ its net weight. Not rounded. */
export function spoolPricePerGram(spool: Pick<CalcSpool, 'price' | 'netGrams'>): number {
  return spool.price / spool.netGrams;
}

// The terms that grow with print time, each in whole pesos. The real cost of print jobs uses them too.

/** Energy: watts ÷ 1000 × hours × kWh price. */
export function energyCost(printer: Pick<CalcPrinter, 'powerWatts'>, hours: number, settings: Pick<CostSettingsInput, 'kwhPrice'>): number {
  return Math.round((printer.powerWatts / 1000) * hours * settings.kwhPrice);
}

/** Machine wear: hours × purchase price ÷ lifetime hours. */
export function machineWearCost(printer: Pick<CalcPrinter, 'purchasePrice' | 'lifetimeHours'>, hours: number): number {
  return Math.round((hours * printer.purchasePrice) / printer.lifetimeHours);
}

/** Fixed costs: hours × monthly fixed costs ÷ monthly print hours. */
export function fixedCostsFor(hours: number, settings: Pick<CostSettingsInput, 'monthlyFixedCosts' | 'monthlyPrintHours'>): number {
  return Math.round((hours * settings.monthlyFixedCosts) / settings.monthlyPrintHours);
}

/** Up to the next multiple of `step`. The small tolerance keeps 10000.000000001 at 10000. */
function roundUpTo(value: number, step: number): number {
  return Math.ceil(value / step - 1e-9) * step;
}

function perUnit(total: number, quantity: number): number {
  return quantity > 0 ? Math.round(total / quantity) : 0;
}

function priceLine(line: CalcLineInput, printers: CalcPrinter[], spools: CalcSpool[], s: CostSettingsInput): CalcLineResult {
  const printer = line.printerId == null ? undefined : printers.find((p) => p.id === line.printerId);
  const printMinutes = line.printMinutesPerUnit * line.quantity;
  const hours = printMinutes / 60;

  const filaments = line.filaments.map((use): FilamentUseResult & { exact: number } => {
    const spool = use.spoolId == null ? undefined : spools.find((x) => x.id === use.spoolId);
    const pricePerGram = spool ? spoolPricePerGram(spool) : use.pricePerKg / 1000;
    const grams = use.gramsPerUnit * line.quantity;
    const exact = grams * pricePerGram;
    return {
      label: spool ? spoolLabel(spool) : use.material || 'Material sin bobina',
      colorHex: spool ? spool.colorHex : null,
      gramsPerUnit: use.gramsPerUnit,
      grams,
      pricePerKg: Math.round(pricePerGram * 1000),
      cost: Math.round(exact),
      exact,
    };
  });

  // Each term is rounded to whole pesos, and later terms build on the rounded ones, so the breakdown adds up.
  const material = Math.round(filaments.reduce((sum, f) => sum + f.exact, 0));
  const energy = printer ? energyCost(printer, hours, s) : 0;
  const machineWear = printer ? machineWearCost(printer, hours) : 0;
  const fixedCosts = fixedCostsFor(hours, s);
  const labour = Math.round(((line.prepMinutes + line.postMinutes) / 60) * s.labourPerHour);
  const packaging = line.packaging;
  const failureAllowance = Math.round(((material + energy + machineWear) * s.failurePercent) / 100);
  const productionCost = material + energy + machineWear + fixedCosts + labour + packaging + failureAllowance;
  const profit = Math.round((productionCost * s.marginPercent) / 100);
  const priceBeforeCommission = productionCost + profit;
  // ÷ (1 − c %) written as × 100 ÷ (100 − c) keeps whole results exact in floating point.
  const withCommission = (priceBeforeCommission * 100) / (100 - s.commissionPercent);
  const finalPrice = roundUpTo(withCommission, s.roundingStep);
  const commission = Math.round(withCommission - priceBeforeCommission);
  const rounding = finalPrice - priceBeforeCommission - commission;

  return {
    name: line.name,
    quantity: line.quantity,
    printerName: printer ? printer.name : null,
    printMinutesPerUnit: line.printMinutesPerUnit,
    printMinutes,
    prepMinutes: line.prepMinutes,
    postMinutes: line.postMinutes,
    filaments: filaments.map(({ exact: _exact, ...f }) => f),
    breakdown: {
      material, energy, machineWear, fixedCosts, labour, packaging, failureAllowance,
      productionCost, profit, priceBeforeCommission, commission, rounding, finalPrice,
    },
    total: finalPrice,
    unitPrice: perUnit(finalPrice, line.quantity),
  };
}

function emptyBreakdown(): CostBreakdown {
  return Object.fromEntries(BREAKDOWN_TERMS.map((t) => [t.key, 0])) as unknown as CostBreakdown;
}

/**
 * Price every line with the formula of S5 and add the lines up. Each line is rounded up to the rounding step
 * on its own, so the total is the sum of what each line charges. A printer or spool that is not in the lists
 * counts as missing: no energy or wear without a printer; a missing spool falls back to the typed price per kg.
 */
export function calculateCost(input: CalcInput, printers: CalcPrinter[], spools: CalcSpool[], settings: CostSettingsInput): CalcResult {
  const lines = input.lines.map((line) => priceLine(line, printers, spools, settings));
  const breakdown = emptyBreakdown();
  for (const line of lines) for (const t of BREAKDOWN_TERMS) breakdown[t.key] += line.breakdown[t.key];
  const total = breakdown.finalPrice;
  const quantity = lines.reduce((sum, l) => sum + l.quantity, 0);
  return { lines, breakdown, total, quantity, unitPrice: perUnit(total, quantity), settings: { ...settings } };
}

export interface SpoolShortage {
  spoolId: number;
  needed: number; // grams over every use of the spool in the calculation
  remaining: number;
}

/** Spools the calculation needs more grams of than they have left. A warning only: the price still shows. */
export function spoolShortages(input: CalcInput, spools: CalcSpool[]): SpoolShortage[] {
  const needed = new Map<number, number>();
  for (const line of input.lines) {
    for (const use of line.filaments) {
      if (use.spoolId == null) continue;
      needed.set(use.spoolId, (needed.get(use.spoolId) ?? 0) + use.gramsPerUnit * line.quantity);
    }
  }
  const out: SpoolShortage[] = [];
  for (const [spoolId, grams] of needed) {
    const spool = spools.find((s) => s.id === spoolId);
    if (spool && grams > spool.remainingGrams) out.push({ spoolId, needed: grams, remaining: spool.remainingGrams });
  }
  return out;
}
