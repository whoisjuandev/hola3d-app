import { planProblems, validatePlannedJob, type PlannedJobInput } from '../../shared/calendar';
import type { CostSettingsInput } from '../../shared/cost-settings';
import { sentFields } from '../../shared/fields';
import {
  jobCost, jobNotFoundMessage, planLockedMessage, printJobProblems, readSubmissionKey, realCost, validateNewPrintJob, type JobCost, type NewPrintJob, type PrintJob,
} from '../../shared/print-jobs';
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
const JOB_PLAN_PATH = /^\/api\/orders\/(\d{4,})\/jobs\/(\d+)\/plan$/;
const INVALID = 'Revisá los datos de la impresión.';

const orderNotFound = (id: string) => problem(404, `No existe el pedido #${id}.`);
const jobNotFound = (orderId: string, jobId: number | string) => problem(404, jobNotFoundMessage(orderId, jobId));
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
      // One read: the totals are added up from the very rows the answer lists, so they always agree.
      const jobs = await deps.jobs.listByOrder(orderId);
      return json({ jobs, cost: realCost(jobs) });
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

  const jobPlanMatch = JOB_PLAN_PATH.exec(url.pathname);
  if (jobPlanMatch) {
    if (request.method !== 'DELETE') return notAllowed();
    return removePlan(jobPlanMatch[1], Number(jobPlanMatch[2]), deps);
  }

  const jobMatch = JOB_PATH.exec(url.pathname);
  if (jobMatch) {
    const [, orderId, jobId] = jobMatch;
    if (request.method === 'PUT') return updatePlan(request, orderId, Number(jobId), deps);
    if (request.method !== 'DELETE') return notAllowed();
    return removeJob(orderId, Number(jobId), deps);
  }

  return null;
}

const CHANGED_WHILE_DELETING = (jobId: number) => `La impresión ${jobId} cambió mientras la borrabas: revisá y probá de nuevo.`;
const FINISHED_NOT_DELETED = (jobId: number) => `La impresión ${jobId} ya se cargó como terminada: no se borró.`;

/**
 * Delete a job of the order. The status read here picks the guarded delete: a planned job is deleted as a plan and
 * gives nothing back; a printed one gives its minutes and grams back in one atomic write. If the status changed
 * before the delete ran (finished meanwhile), nothing is deleted and the answer is 409, never 404 for a job that exists.
 */
async function removeJob(orderId: string, jobId: number, deps: PrintJobDeps): Promise<Response> {
  if (!(await deps.orders.get(orderId))) return orderNotFound(orderId);
  const job = await deps.jobs.get(jobId);
  if (!job || job.orderId !== orderId) return jobNotFound(orderId, jobId);
  const removed = job.status === 'planeada'
    ? await deps.jobs.removePlanned(orderId, jobId)
    : await deps.jobs.remove(orderId, jobId);
  if (removed) return json({ order: await deps.orders.get(orderId) });
  // The guarded delete did not apply. Gone: another request deleted it. Still there: its status changed meanwhile.
  const now = await deps.jobs.get(jobId);
  if (!now || now.orderId !== orderId) return jobNotFound(orderId, jobId);
  return problem(409, CHANGED_WHILE_DELETING(jobId));
}

/** Delete a planned job, only while it is planned: one that was finished meanwhile keeps its counters (409). */
async function removePlan(orderId: string, jobId: number, deps: PrintJobDeps): Promise<Response> {
  if (!(await deps.orders.get(orderId))) return orderNotFound(orderId);
  if (await deps.jobs.removePlanned(orderId, jobId)) return json({ order: await deps.orders.get(orderId) });
  const now = await deps.jobs.get(jobId);
  if (!now || now.orderId !== orderId) return jobNotFound(orderId, jobId);
  return problem(409, now.status === 'planeada' ? CHANGED_WHILE_DELETING(jobId) : FINISHED_NOT_DELETED(jobId));
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

const KEY_USED = 'Esa clave de envío ya se usó para una impresión de otro pedido.';

/**
 * The answer to a save whose submission key a job already carries, so a retried save is not stored twice: that job and
 * its order (200), or 409 when the job is another order's. Null when no job carries the key.
 */
async function savedBefore(orderId: string, submissionKey: string | null, deps: PrintJobDeps): Promise<Response | null> {
  if (submissionKey === null) return null;
  const job = await deps.jobs.bySubmission(submissionKey);
  if (!job) return null;
  if (job.orderId !== orderId) return problem(409, KEY_USED);
  return json({ job, order: await deps.orders.get(orderId) });
}

/**
 * Log a finished job: store it with its cost, add its minutes to the printer and take its grams off each spool, all
 * or nothing. The cost is worked out here, once, and stored: later price or settings changes never change it. A key a
 * job of the order already carries answers that job: the save was stored before.
 */
async function log(request: Request, orderId: string, deps: PrintJobDeps): Promise<Response> {
  const body = await readJson(request);
  if (body === undefined) return problem(400, 'El cuerpo tiene que ser JSON.');
  if (!(await deps.orders.get(orderId))) return orderNotFound(orderId);
  const result = validateNewPrintJob(body);
  const key = readSubmissionKey(body);
  if (!result.ok || !key.ok) return invalid({ ...(result.ok ? {} : result.errors), ...(key.ok ? {} : key.errors) });
  // Before the grams check: a retry comes after its first try took the grams.
  const saved = await savedBefore(orderId, key.value, deps);
  if (saved) return saved;

  const [printers, spools, settings] = await Promise.all([deps.printers.list(), deps.spools.list(), currentCostSettings(deps.settings)]);
  const problems = printJobProblems(result.value, printers, spools);
  if (problems) return invalid(problems);

  const job = await deps.jobs.log(orderId, result.value, costNow(result.value, printers, spools, settings), key.value);
  if (!job) {
    // Another try of this save got there between the check above and the write.
    const savedNow = await savedBefore(orderId, key.value, deps);
    if (savedNow) return savedNow;
    // Another write (a log, a delete, an edit) landed after the check above and the guarded write refused: nothing
    // was written. Read again to say why.
    const now = await problemsNow(result.value, deps);
    return invalid(now ?? { filaments: 'Las bobinas cambiaron mientras guardabas: revisá los gramos y probá de nuevo.' });
  }
  return json({ job, order: await deps.orders.get(orderId) }, 201);
}

const ALREADY_FINISHED = (jobId: number) => `La impresión ${jobId} ya se cargó como terminada.`;
const PLAN_LOCKED = planLockedMessage;
const TIME_TAKEN = 'Esa impresora se ocupó mientras guardabas: revisá el horario y probá de nuevo.';
const PRINTER_CHANGED = (jobId: number) => `La impresión ${jobId} cambió de impresora mientras la terminabas: revisá y probá de nuevo.`;

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

/** A stored planned job's plan, the base an edit's sent fields are laid on. */
function storedPlan(job: PrintJob) {
  return { printerId: job.printerId, plannedStart: job.plannedStart, estimatedMinutes: job.estimatedMinutes, note: job.note };
}

/**
 * Change the printer, start, duration or note of a planned job. Only the fields sent are written, in one guarded
 * statement; the others keep the value the row has then, so two edits of different fields both stay.
 */
async function updatePlan(request: Request, orderId: string, jobId: number, deps: PrintJobDeps): Promise<Response> {
  const body = await readJson(request);
  if (!isJsonObject(body)) return notJson();
  if (!(await deps.orders.get(orderId))) return orderNotFound(orderId);
  const current = await deps.jobs.get(jobId);
  if (!current || current.orderId !== orderId) return jobNotFound(orderId, jobId);
  if (current.status !== 'planeada') return problem(409, PLAN_LOCKED(jobId));

  // The stored plan fills in what the body leaves out only to validate the shape of the sent fields; the write takes
  // the sent fields alone. Whether the printer is active and free is not judged here from the plan read above (another
  // request may have moved the job since): the guarded statement checks it on the job as it is when it runs.
  const result = validatePlannedJob({ ...storedPlan(current), ...body });
  if (!result.ok) return invalid(result.errors);
  const changes = sentFields(result.value, body);

  const job = await deps.jobs.updatePlan(orderId, jobId, changes);
  if (!job) {
    // The guarded statement refused, or another write changed the job meanwhile; nothing was written. Read again to say why.
    const now = await deps.jobs.get(jobId);
    if (!now || now.orderId !== orderId) return jobNotFound(orderId, jobId);
    if (now.status !== 'planeada') return problem(409, PLAN_LOCKED(jobId));
    const after = validatePlannedJob({ ...storedPlan(now), ...changes });
    const problemsAfter = after.ok ? await planProblemsNow(after.value, deps, jobId) : after.errors;
    return invalid(problemsAfter ?? { plannedStart: TIME_TAKEN });
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
  const key = readSubmissionKey(body);
  if (!key.ok) return invalid(key.errors);
  // Before the status check: a retry finds the job its first try finished.
  const saved = await savedBefore(orderId, key.value, deps);
  if (saved) return saved;
  if (current.status !== 'planeada') return problem(409, ALREADY_FINISHED(jobId));

  // The printer the job is planned on as read here. The batch writes only while the job is still planned on it, so a
  // finish never lands on a plan another request moved meanwhile.
  const plannedPrinterId = current.printerId;
  const result = validateNewPrintJob({ printerId: plannedPrinterId, note: current.note, ...(isJsonObject(body) ? body : {}) });
  if (!result.ok) return invalid(result.errors);
  const [printers, spools, settings] = await Promise.all([deps.printers.list(), deps.spools.list(), currentCostSettings(deps.settings)]);
  const problems = printJobProblems(result.value, printers, spools);
  if (problems) return invalid(problems);

  const job = await deps.jobs.finish(orderId, jobId, plannedPrinterId, result.value, costNow(result.value, printers, spools, settings), key.value);
  if (!job) {
    // Another write landed after the checks above and the guarded batch wrote nothing. Read again to say why.
    const savedNow = await savedBefore(orderId, key.value, deps);
    if (savedNow) return savedNow;
    const now = await deps.jobs.get(jobId);
    if (!now || now.orderId !== orderId) return jobNotFound(orderId, jobId);
    if (now.status !== 'planeada') return problem(409, ALREADY_FINISHED(jobId));
    if (now.printerId !== plannedPrinterId) return problem(409, PRINTER_CHANGED(jobId));
    return invalid((await problemsNow(result.value, deps)) ?? { filaments: 'Las bobinas cambiaron mientras guardabas: revisá los gramos y probá de nuevo.' });
  }
  return json({ job, order: await deps.orders.get(orderId) });
}
