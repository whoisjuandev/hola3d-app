// Print jobs on an order and the order's real cost, shared by the Worker API and the React app.
import { energyCost, fixedCostsFor, machineWearCost, spoolLabel, spoolPricePerGram, spoolShortages, type CalcSpool } from './calculator';
import type { CostSettingsInput } from './cost-settings';
import { asBody, readText, type Errors } from './fields';
import type { ValidationResult } from './orders';
import type { Printer } from './printers';
import type { Spool } from './spools';

/** `planeada` is for planning a job before it prints (the calendar); logging writes `terminada` or `fallida`. */
export const PRINT_JOB_STATUSES = ['planeada', 'terminada', 'fallida'] as const;
export type PrintJobStatus = (typeof PRINT_JOB_STATUSES)[number];

export const PRINT_RESULTS = ['ok', 'fallida'] as const;
export type PrintResult = (typeof PRINT_RESULTS)[number];

export const PRINT_RESULT_LABEL: Record<PrintResult, string> = { ok: 'Salió bien', fallida: 'Fallida' };

/** The status a finished job is stored with. */
export function statusForResult(result: PrintResult): PrintJobStatus {
  return result === 'ok' ? 'terminada' : 'fallida';
}

export interface PrintJobFilament {
  spoolId: number;
  spool: string; // the spool's label, read through the spool: "PLA Blanco · Grilon3"
  colorHex: string;
  grams: number; // whole grams
}

export interface PrintJob {
  id: number;
  orderId: string;
  printerId: number;
  printer: string; // the printer's name, read through the printer
  status: PrintJobStatus;
  result: PrintResult | null; // null while planned
  plannedStart: string | null; // YYYY-MM-DDTHH:MM; only for planned jobs
  estimatedMinutes: number | null; // only for planned jobs
  actualMinutes: number | null; // null while planned
  note: string;
  filaments: PrintJobFilament[];
  createdAt: string;
  updatedAt: string;
}

/** A validated request to log a finished job. */
export interface NewPrintJob {
  printerId: number;
  actualMinutes: number;
  result: PrintResult;
  note: string;
  filaments: { spoolId: number; grams: number }[];
}

const MAX_FILAMENTS = 16;

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/** Validate the body of a log-job request. Error messages are shown to the owners as is. */
export function validateNewPrintJob(input: unknown): ValidationResult<NewPrintJob> {
  const errors: Errors = {};
  const body = asBody(input);

  const printerId = body.printerId;
  if (!isPositiveInteger(printerId)) errors.printerId = 'Elegí una impresora.';
  const actualMinutes = body.actualMinutes;
  if (!isPositiveInteger(actualMinutes)) errors.actualMinutes = 'Poné cuánto tardó: más de 0 minutos.';
  const result = body.result;
  if (typeof result !== 'string' || !(PRINT_RESULTS as readonly string[]).includes(result)) errors.result = 'Elegí cómo salió: bien o fallida.';
  const note = readText(body, errors, 'note', 1000, false);

  const raw = body.filaments;
  const filaments: NewPrintJob['filaments'] = [];
  if (!Array.isArray(raw) || raw.length === 0) {
    errors.filaments = 'Cargá al menos una bobina con los gramos que usó.';
  } else if (raw.length > MAX_FILAMENTS) {
    errors.filaments = `Hasta ${MAX_FILAMENTS} bobinas por impresión.`;
  } else {
    for (const item of raw) {
      const use = asBody(item);
      if (!isPositiveInteger(use.spoolId) || !isPositiveInteger(use.grams)) {
        errors.filaments = 'Elegí cada bobina y poné sus gramos: un número entero mayor que 0.';
        break;
      }
      filaments.push({ spoolId: use.spoolId, grams: use.grams });
    }
    const ids = filaments.map((f) => f.spoolId);
    if (!errors.filaments && new Set(ids).size !== ids.length) errors.filaments = 'Cada bobina va una sola vez: sumá sus gramos en una fila.';
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: { printerId: printerId as number, actualMinutes: actualMinutes as number, result: result as PrintResult, note, filaments },
  };
}

/**
 * What stops a valid job from being logged with the stored printers and spools: a printer or spool that does not
 * exist, or a spool with fewer grams left than the job used. Null when nothing does.
 */
export function printJobProblems(job: NewPrintJob, printers: Pick<Printer, 'id'>[], spools: CalcSpool[]): Errors | null {
  const errors: Errors = {};
  if (!printers.some((p) => p.id === job.printerId)) errors.printerId = 'Esa impresora no existe.';
  const missing = job.filaments.find((f) => !spools.some((s) => s.id === f.spoolId));
  if (missing) {
    errors.filaments = `La bobina ${missing.spoolId} no existe.`;
  } else {
    // The calculator's shortage check, with the job as one piece.
    const uses = job.filaments.map((f) => ({ spoolId: f.spoolId, material: '', pricePerKg: 0, gramsPerUnit: f.grams }));
    const line = { name: '', quantity: 1, printerId: null, printMinutesPerUnit: 0, filaments: uses, prepMinutes: 0, postMinutes: 0, packaging: 0 };
    const [short] = spoolShortages({ lines: [line] }, spools);
    if (short) {
      const spool = spools.find((s) => s.id === short.spoolId) as CalcSpool;
      errors.filaments = `A ${spoolLabel(spool)} le quedan ${short.remaining} g y cargaste ${short.needed} g.`;
    }
  }
  return Object.keys(errors).length ? errors : null;
}

export type CostPrinter = Pick<Printer, 'powerWatts' | 'purchasePrice' | 'lifetimeHours'>;
export type CostSpool = Pick<Spool, 'price' | 'netGrams'>;

/** A job with the printer and spool values its cost comes from. */
export interface RealCostJob {
  status: PrintJobStatus;
  actualMinutes: number | null;
  printer: CostPrinter;
  filaments: { grams: number; spool: CostSpool }[];
}

/**
 * The real cost of an order, from what its jobs actually used. Same terms as the calculator (S5), each in whole
 * pesos. No failure allowance: failed jobs are counted for real. Labour and packaging are not known per job, so
 * they are left out.
 */
export interface RealCost {
  material: number;
  energy: number;
  machineWear: number;
  fixedCosts: number;
  total: number;
  minutes: number; // actual print minutes over the jobs
  grams: number; // grams over the jobs
  jobs: number; // printed jobs, failed ones included
  failedJobs: number;
}

export const REAL_COST_TERMS: readonly { key: 'material' | 'energy' | 'machineWear' | 'fixedCosts'; label: string }[] = [
  { key: 'material', label: 'Material' },
  { key: 'energy', label: 'Luz' },
  { key: 'machineWear', label: 'Desgaste de máquina' },
  { key: 'fixedCosts', label: 'Gastos fijos' },
];

type RealCostSettings = Pick<CostSettingsInput, 'kwhPrice' | 'monthlyFixedCosts' | 'monthlyPrintHours'>;

/**
 * Apply the calculator's formula to the actual minutes and grams of every printed job (failed ones included;
 * planned ones skipped). Each job is rounded term by term, like a calculator line, and the jobs are added up.
 * Null when no job was printed yet.
 */
export function realCost(jobs: RealCostJob[], settings: RealCostSettings): RealCost | null {
  const printed = jobs.filter((j) => j.status !== 'planeada' && j.actualMinutes !== null);
  if (printed.length === 0) return null;
  const cost: RealCost = { material: 0, energy: 0, machineWear: 0, fixedCosts: 0, total: 0, minutes: 0, grams: 0, jobs: 0, failedJobs: 0 };
  for (const job of printed) {
    const minutes = job.actualMinutes as number;
    const hours = minutes / 60;
    const material = Math.round(job.filaments.reduce((sum, f) => sum + f.grams * spoolPricePerGram(f.spool), 0));
    const energy = energyCost(job.printer, hours, settings);
    const machineWear = machineWearCost(job.printer, hours);
    const fixedCosts = fixedCostsFor(hours, settings);
    cost.material += material;
    cost.energy += energy;
    cost.machineWear += machineWear;
    cost.fixedCosts += fixedCosts;
    cost.total += material + energy + machineWear + fixedCosts;
    cost.minutes += minutes;
    cost.grams += job.filaments.reduce((sum, f) => sum + f.grams, 0);
    cost.jobs += 1;
    if (job.status === 'fallida') cost.failedJobs += 1;
  }
  return cost;
}

/** The order price minus its real cost. Null while the order has no real cost. */
export function realProfit(price: number, cost: Pick<RealCost, 'total'> | null): number | null {
  return cost === null ? null : price - cost.total;
}
