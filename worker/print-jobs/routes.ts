import type { CostSettingsInput } from '../../shared/cost-settings';
import { jobCost, printJobProblems, validateNewPrintJob, type JobCost, type NewPrintJob } from '../../shared/print-jobs';
import type { Printer } from '../../shared/printers';
import type { Spool } from '../../shared/spools';
import { json, problem, readJson } from '../http';
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
const INVALID = 'Revisá los datos de la impresión.';

const orderNotFound = (id: string) => problem(404, `No existe el pedido #${id}.`);
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

  const jobMatch = JOB_PATH.exec(url.pathname);
  if (jobMatch) {
    if (request.method !== 'DELETE') return problem(405, 'Método no permitido.');
    const [, orderId, jobId] = jobMatch;
    if (!(await deps.orders.get(orderId))) return orderNotFound(orderId);
    // Deleting gives the job's minutes and grams back, in the same atomic write.
    if (!(await deps.jobs.remove(orderId, Number(jobId)))) return problem(404, `El pedido #${orderId} no tiene la impresión ${jobId}.`);
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
