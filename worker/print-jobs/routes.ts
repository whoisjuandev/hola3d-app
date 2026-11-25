import { printJobProblems, validateNewPrintJob, type NewPrintJob } from '../../shared/print-jobs';
import { json, problem, readJson } from '../http';
import type { OrderRepository } from '../orders/repository';
import type { PrinterRepository } from '../printers/repository';
import type { SpoolRepository } from '../spools/repository';
import type { PrintJobRepository } from './repository';

export interface PrintJobDeps {
  jobs: PrintJobRepository;
  orders: OrderRepository;
  printers: PrinterRepository;
  spools: SpoolRepository;
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

/** Log a finished job: store it, add its minutes to the printer and take its grams off each spool, all or nothing. */
async function log(request: Request, orderId: string, deps: PrintJobDeps): Promise<Response> {
  const body = await readJson(request);
  if (body === undefined) return problem(400, 'El cuerpo tiene que ser JSON.');
  if (!(await deps.orders.get(orderId))) return orderNotFound(orderId);
  const result = validateNewPrintJob(body);
  if (!result.ok) return invalid(result.errors);

  const problems = await problemsNow(result.value, deps);
  if (problems) return invalid(problems);

  const job = await deps.jobs.log(orderId, result.value);
  if (!job) {
    // Another write (a log, a delete, an edit) landed after the check above and the guarded write refused: nothing
    // was written. Read again to say why.
    const now = await problemsNow(result.value, deps);
    return invalid(now ?? { filaments: 'Las bobinas cambiaron mientras guardabas: revisá los gramos y probá de nuevo.' });
  }
  return json({ job, order: await deps.orders.get(orderId) }, 201);
}
