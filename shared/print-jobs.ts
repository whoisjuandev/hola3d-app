// Print jobs on an order and the order's real cost, shared by the Worker API and the React app.
import { energyCost, fixedCostsFor, machineWearCost, spoolLabel, spoolPricePerGram, spoolShortages, type CalcSpool } from './calculator';
import type { CostSettingsInput } from './cost-settings';
import { asBody, isMissing, readInteger, readText, type Errors } from './fields';
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
  labourMinutes: number; // preparation and post-processing actually spent; 0 when not logged
  extraCost: number; // whole pesos: packaging and other supplies; 0 when not logged
  cost: JobCost; // stored when the job was logged; all 0 for a planned job
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
  labourMinutes: number;
  extraCost: number;
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
  const labourMinutes = readInteger(body, errors, 'labourMinutes', 0, 'Poné los minutos de mano de obra: un número entero desde 0.', 0);
  const extraCost = readInteger(body, errors, 'extraCost', 0, 'Poné el costo extra en pesos, sin centavos.', 0);
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
    value: {
      printerId: printerId as number, actualMinutes: actualMinutes as number, result: result as PrintResult,
      labourMinutes: labourMinutes as number, extraCost: extraCost as number, note, filaments,
    },
  };
}

const SUBMISSION_KEY_RE = /^[A-Za-z0-9-]{8,64}$/;

/**
 * The optional `submissionKey` of a log or finish request: a random value the form makes when it opens and sends with
 * every try of that save, so a retried save is recognised instead of stored twice. Null when the body has none.
 */
export function readSubmissionKey(input: unknown): ValidationResult<string | null> {
  const key = asBody(input).submissionKey;
  if (isMissing(key)) return { ok: true, value: null };
  if (typeof key === 'string' && SUBMISSION_KEY_RE.test(key)) return { ok: true, value: key };
  return { ok: false, errors: { submissionKey: 'La clave de envío tiene que tener de 8 a 64 letras, números o guiones.' } };
}

export const jobNotFoundMessage = (orderId: string, jobId: number | string) => `El pedido #${orderId} no tiene la impresión ${jobId}.`;
export const planLockedMessage = (jobId: number) => `La impresión ${jobId} ya se cargó como terminada: su plan no cambia.`;

/**
 * Why an edit of planned job `jobId` of the order cannot apply to `job`, the job as read now (undefined when it is not
 * found): the same words the API answers a real edit with. Null while it is still a planned job of the order.
 */
export function planEditRefusal(orderId: string, jobId: number, job: Pick<PrintJob, 'orderId' | 'status'> | null | undefined): string | null {
  if (!job || job.orderId !== orderId) return jobNotFoundMessage(orderId, jobId);
  return job.status === 'planeada' ? null : planLockedMessage(jobId);
}

/**
 * What stops a valid job from being logged with the stored printers and spools: a printer or spool that does not
 * exist, or a spool with fewer grams left than the job used. Null when nothing does.
 */
export function printJobProblems(job: Pick<NewPrintJob, 'printerId' | 'filaments'>, printers: Pick<Printer, 'id'>[], spools: CalcSpool[]): Errors | null {
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
export type JobCostSettings = Pick<CostSettingsInput, 'kwhPrice' | 'labourPerHour' | 'monthlyFixedCosts' | 'monthlyPrintHours'>;

/** The cost of one job, term by term in whole pesos, as stored when it was logged. */
export interface JobCost {
  material: number;
  energy: number;
  machineWear: number;
  fixedCosts: number;
  labour: number;
  extra: number;
}

export type JobCostKey = keyof JobCost;

/** The six terms in display order. */
export const REAL_COST_TERMS: readonly { key: JobCostKey; label: string }[] = [
  { key: 'material', label: 'Material' },
  { key: 'energy', label: 'Luz' },
  { key: 'machineWear', label: 'Desgaste de máquina' },
  { key: 'fixedCosts', label: 'Gastos fijos' },
  { key: 'labour', label: 'Mano de obra' },
  { key: 'extra', label: 'Packaging y extras' },
];

export const NO_JOB_COST: JobCost = { material: 0, energy: 0, machineWear: 0, fixedCosts: 0, labour: 0, extra: 0 };

/** What a job's cost is worked out from: its actual numbers, and the spool each filament came from. */
export interface JobCostInput {
  actualMinutes: number;
  labourMinutes: number;
  extraCost: number;
  filaments: { grams: number; spool: CostSpool }[];
}

/**
 * The cost of one finished job with the printer, spool prices and settings of this moment, to be stored with it.
 * Material, energy, machine wear and fixed costs as in the calculator (S5), from the actual grams and minutes;
 * labour = labour minutes ÷ 60 × rate; extra = the extra cost as logged. No failure allowance, margin or default
 * packaging. Each term is rounded to whole pesos.
 */
export function jobCost(job: JobCostInput, printer: CostPrinter, settings: JobCostSettings): JobCost {
  const hours = job.actualMinutes / 60;
  return {
    material: Math.round(job.filaments.reduce((sum, f) => sum + f.grams * spoolPricePerGram(f.spool), 0)),
    energy: energyCost(printer, hours, settings),
    machineWear: machineWearCost(printer, hours),
    fixedCosts: fixedCostsFor(hours, settings),
    labour: Math.round((job.labourMinutes / 60) * settings.labourPerHour),
    extra: job.extraCost,
  };
}

/** The sum of a job's six terms. */
export function jobCostTotal(cost: JobCost): number {
  return REAL_COST_TERMS.reduce((sum, t) => sum + cost[t.key], 0);
}

/** A job as stored, with what the order's real cost needs from it. */
export type CostedJob = Pick<PrintJob, 'status' | 'actualMinutes' | 'cost'> & { filaments: { grams: number }[] };

/** The real cost of an order: the stored terms of its jobs added up, failed ones included. */
export interface RealCost extends JobCost {
  total: number;
  minutes: number; // actual print minutes over the jobs
  grams: number; // grams over the jobs
  jobs: number; // printed jobs, failed ones included
  failedJobs: number;
}

/**
 * Add up the stored cost of every printed job of an order (failed ones included; planned ones skipped). No failure
 * allowance: failures are counted for real. Needs no prices or settings: each job's cost was frozen when logged.
 * Null when no job was printed yet.
 */
export function realCost(jobs: CostedJob[]): RealCost | null {
  const printed = jobs.filter((j) => j.status !== 'planeada' && j.actualMinutes !== null);
  if (printed.length === 0) return null;
  const cost: RealCost = { ...NO_JOB_COST, total: 0, minutes: 0, grams: 0, jobs: 0, failedJobs: 0 };
  for (const job of printed) {
    for (const t of REAL_COST_TERMS) cost[t.key] += job.cost[t.key];
    cost.total += jobCostTotal(job.cost);
    cost.minutes += job.actualMinutes as number;
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
