import { planProblems, validatePlannedJob, type PlannedJobInput } from '../../shared/calendar';
import type { CostSettingsInput } from '../../shared/cost-settings';
import { jobCost, printJobProblems, validateNewPrintJob, type JobCost, type NewPrintJob } from '../../shared/print-jobs';
import type { Printer } from '../../shared/printers';
import type { Spool } from '../../shared/spools';
import { isJsonObject, json, problem, readJson } from '../http';
import type { OrderRepository } from '../orders/repository';
import type { PrinterRepository } from '../printers/repository';
import type { CostSettingsRepository } from '../settings/repository';
import { currentCostSettings } from '../settings/routes';
import type { SpoolRepository } from '../spools/repository';
import type { PrintJobRepository } from './repository';

export interface PrintJobDeps {
  jobs: PrintJobRepository;
  orders: OrderRepository;
  printers: PrinterRepository;
  spools: SpoolRepository;
  settings: CostSettingsRepository;
}

const JOBS_PATH = /^\/api\/orders\/(\d{4,})\/jobs$/;
const JOB_PATH = /^\/api\/orders\/(\d{4,})\/jobs\/(\d+)$/;
const PLAN_PATH = /^\/api\/orders\/(\d{4,})\/jobs\/plan$/;
const FINISH_PATH = /^\/api\/orders\/(\d{4,})\/jobs\/(\d+)\/finish$/;
const INVALID = 'Revisá los datos de la impresión.';

const orderNotFound = (id: string) => problem(404, `No existe el pedido #${id}.`);
const jobNotFound = (orderId: string, jobId: number | string) => problem(404, `El pedido #${orderId} no tiene la impresión ${jobId}.`);
const notAllowed = () => problem(405, 'Método no permitido.');
const notJson = () => problem(400, 'El cuerpo tiene que ser JSON.');
const invalid = (fields: Record<string, string>) => json({ error: INVALID, fields }, 422);

/** Handle /api/orders/:id/jobs requests. Returns null when the path is not a print job route. */
export async function handlePrintJobs(request: Request, url: URL, deps: PrintJobDeps): Promise<Response | null> {
  const jobsMatch = JOBS_PATH.exec(url.pathname);
  if (jobsMatch) {
    const orderId = jobsMatch[1];
    if (request.method === 'GET') {
      if (!(await deps.orders.get(orderId))) return orderNotFound(orderId);
      const [jobs, cost] = await Promise.all([deps.jobs.listByOrder(orderId), deps.jobs.costOf(orderId)]);
      return json({ jobs, cost });
    }
    if (request.method === 'POST') return log(request, orderId, deps);
    return problem(405, 'Método no permitido.');
  }

  const planMatch = PLAN_PATH.exec(url.pathname);
  if (planMatch) {
    if (request.method !== 'POST') return notAllowed();
    return plan(request, planMatch[1], deps);
  }

  const finishMatch = FINISH_PATH.exec(url.pathname);
  if (finishMatch) {
    if (request.method !== 'POST') return notAllowed();
    return finish(request, finishMatch[1], Number(finishMatch[2]), deps);
  }

  const jobMatch = JOB_PATH.exec(url.pathname);
  if (jobMatch) {
    const [, orderId, jobId] = jobMatch;
    if (request.method === 'PUT') return updatePlan(request, orderId, Number(jobId), deps);
    if (request.method !== 'DELETE') return notAllowed();
    if (!(await deps.orders.get(orderId))) return orderNotFound(orderId);
    // Deleting a printed job gives its minutes and grams back, in the same atomic write; a planned one took nothing.
    const removed = (await deps.jobs.remove(orderId, Number(jobId))) || (await deps.jobs.removePlanned(orderId, Number(jobId)));
    if (!removed) return jobNotFound(orderId, jobId);
    return json({ order: await deps.orders.get(orderId) });
  }

  return null;
}

async function problemsNow(job: NewPrintJob, deps: PrintJobDeps) {
  const [printers, spools] = await Promise.all([deps.printers.list(), deps.spools.list()]);
  return printJobProblems(job, printers, spools);
}

/** The job's cost with the printer, spool prices and settings of now. The printer and spools were checked to exist. */
function costNow(job: NewPrintJob, printers: Printer[], spools: Spool[], settings: CostSettingsInput): JobCost {
  const printer = printers.find((p) => p.id === job.printerId) as Printer;
  const filaments = job.filaments.map((f) => ({ grams: f.grams, spool: spools.find((s) => s.id === f.spoolId) as Spool }));
  return jobCost({ ...job, filaments }, printer, settings);
}

/**
 * Log a finished job: store it with its cost, add its minutes to the printer and take its grams off each spool, all
 * or nothing. The cost is worked out here, once, and stored: later price or settings changes never change it.
 */
async function log(request: Request, orderId: string, deps: PrintJobDeps): Promise<Response> {
  const body = await readJson(request);
  if (body === undefined) return problem(400, 'El cuerpo tiene que ser JSON.');
  if (!(await deps.orders.get(orderId))) return orderNotFound(orderId);
  const result = validateNewPrintJob(body);
  if (!result.ok) return invalid(result.errors);

  const [printers, spools, settings] = await Promise.all([deps.printers.list(), deps.spools.list(), currentCostSettings(deps.settings)]);
  const problems = printJobProblems(result.value, printers, spools);
  if (problems) return invalid(problems);

  const job = await deps.jobs.log(orderId, result.value, costNow(result.value, printers, spools, settings));
  if (!job) {
    // Another write (a log, a delete, an edit) landed after the check above and the guarded write refused: nothing
    // was written. Read again to say why.
    const now = await problemsNow(result.value, deps);
    return invalid(now ?? { filaments: 'Las bobinas cambiaron mientras guardabas: revisá los gramos y probá de nuevo.' });
  }
  return json({ job, order: await deps.orders.get(orderId) }, 201);
}

const ALREADY_FINISHED = (jobId: number) => `La impresión ${jobId} ya se cargó como terminada.`;
const PLAN_LOCKED = (jobId: number) => `La impresión ${jobId} ya se cargó como terminada: su plan no cambia.`;
const TIME_TAKEN = 'Esa impresora se ocupó mientras guardabas: revisá el horario y probá de nuevo.';

/** Why the plan cannot be stored with the printers and planned jobs of now (`exceptJobId`: the job being edited). */
async function planProblemsNow(input: PlannedJobInput, deps: PrintJobDeps, exceptJobId?: number) {
  const [printers, planned] = await Promise.all([deps.printers.list(), deps.jobs.listPlanned()]);
  return planProblems(input, printers, planned, exceptJobId);
}

/** Plan a job for the order on an active, free printer. It changes no counter and has no cost. */
async function plan(request: Request, orderId: string, deps: PrintJobDeps): Promise<Response> {
  const body = await readJson(request);
  if (body === undefined) return notJson();
  if (!(await deps.orders.get(orderId))) return orderNotFound(orderId);
  const result = validatePlannedJob(body);
  if (!result.ok) return invalid(result.errors);
  const problems = await planProblemsNow(result.value, deps);
  if (problems) return invalid(problems);

  const job = await deps.jobs.plan(orderId, result.value);
  if (!job) {
    // Another write took the time or changed the printer after the check above; the guarded insert stored nothing.
    return invalid((await planProblemsNow(result.value, deps)) ?? { plannedStart: TIME_TAKEN });
  }
  return json({ job }, 201);
}

/** Change the printer, start, duration or note of a planned job. Fields left out keep their value. */
async function updatePlan(request: Request, orderId: string, jobId: number, deps: PrintJobDeps): Promise<Response> {
  const body = await readJson(request);
  if (!isJsonObject(body)) return notJson();
  if (!(await deps.orders.get(orderId))) return orderNotFound(orderId);
  const current = await deps.jobs.get(jobId);
  if (!current || current.orderId !== orderId) return jobNotFound(orderId, jobId);
  if (current.status !== 'planeada') return problem(409, PLAN_LOCKED(jobId));

  const stored = { printerId: current.printerId, plannedStart: current.plannedStart, estimatedMinutes: current.estimatedMinutes, note: current.note };
  const result = validatePlannedJob({ ...stored, ...body });
  if (!result.ok) return invalid(result.errors);
  const problems = await planProblemsNow(result.value, deps, jobId);
  if (problems) return invalid(problems);

  const job = await deps.jobs.updatePlan(orderId, jobId, result.value);
  if (!job) {
    const now = await deps.jobs.get(jobId);
    if (!now) return jobNotFound(orderId, jobId);
    if (now.status !== 'planeada') return problem(409, PLAN_LOCKED(jobId));
    return invalid((await planProblemsNow(result.value, deps, jobId)) ?? { plannedStart: TIME_TAKEN });
  }
  return json({ job });
}

/**
 * Turn a planned job into a finished one with the body of a log: its cost frozen now, its minutes added to the printer
 * and its grams taken off each spool, all or nothing. The printer defaults to the planned one, the note to the plan's.
 */
async function finish(request: Request, orderId: string, jobId: number, deps: PrintJobDeps): Promise<Response> {
  const body = await readJson(request);
  if (body === undefined) return notJson();
  if (!(await deps.orders.get(orderId))) return orderNotFound(orderId);
  const current = await deps.jobs.get(jobId);
  if (!current || current.orderId !== orderId) return jobNotFound(orderId, jobId);
  if (current.status !== 'planeada') return problem(409, ALREADY_FINISHED(jobId));

  const result = validateNewPrintJob({ printerId: current.printerId, note: current.note, ...(isJsonObject(body) ? body : {}) });
  if (!result.ok) return invalid(result.errors);
  const [printers, spools, settings] = await Promise.all([deps.printers.list(), deps.spools.list(), currentCostSettings(deps.settings)]);
  const problems = printJobProblems(result.value, printers, spools);
  if (problems) return invalid(problems);

  const job = await deps.jobs.finish(orderId, jobId, result.value, costNow(result.value, printers, spools, settings));
  if (!job) {
    // Another write landed after the checks above and the guarded batch wrote nothing. Read again to say why.
    const now = await deps.jobs.get(jobId);
    if (!now || now.orderId !== orderId) return jobNotFound(orderId, jobId);
    if (now.status !== 'planeada') return problem(409, ALREADY_FINISHED(jobId));
    return invalid((await problemsNow(result.value, deps)) ?? { filaments: 'Las bobinas cambiaron mientras guardabas: revisá los gramos y probá de nuevo.' });
  }
  return json({ job, order: await deps.orders.get(orderId) });
}
