import { sentFields } from '../../shared/fields';
import {
  serviceCostByPrinter, serviceLogProblems, serviceState, sortByDue, validateNewServiceTask, validateServiceLog, validateServiceTask,
  type NewServiceLog, type ServiceTask, type ServiceTaskWithState,
} from '../../shared/service';
import { isJsonObject, json, problem, readJson } from '../http';
import type { PrinterRepository } from '../printers/repository';
import type { ServiceFilter, ServiceRepository } from './repository';

export interface ServiceDeps {
  service: ServiceRepository;
  printers: PrinterRepository;
  /** The workshop's date, YYYY-MM-DD. */
  today: () => string;
}

const TASKS_PATH = '/api/service/tasks';
const TASK_PATH = /^\/api\/service\/tasks\/(\d+)$/;
const LOGS_PATH = '/api/service/logs';
const PLAN_PATH = /^\/api\/printers\/(\d+)\/service-plan$/;
const INVALID_TASK = 'Revisá los datos de la tarea.';
const INVALID_LOG = 'Revisá los datos del servicio.';

const notAllowed = () => problem(405, 'Método no permitido.');
const notJson = () => problem(400, 'El cuerpo tiene que ser JSON.');
const taskNotFound = (id: number) => problem(404, `No existe la tarea ${id}.`);

/** Handle /api/service requests and the service plan of a printer. Returns null when the path is not one of them. */
export async function handleService(request: Request, url: URL, deps: ServiceDeps): Promise<Response | null> {
  const { service } = deps;
  const withState = (task: ServiceTask): ServiceTaskWithState => ({ ...task, state: serviceState(task, deps.today()) });

  if (url.pathname === TASKS_PATH) {
    if (request.method === 'GET') {
      const filter = readFilter(url);
      if (!filter) return badFilter();
      return json({ tasks: sortByDue((await service.listTasks(filter)).map(withState)) });
    }
    if (request.method === 'POST') {
      const body = await readJson(request);
      if (body === undefined) return notJson();
      const result = validateNewServiceTask(body, deps.today());
      if (!result.ok) return json({ error: INVALID_TASK, fields: result.errors }, 422);
      const task = (await deps.printers.get(result.value.printerId)) && (await service.createTask(result.value));
      if (!task) return json({ error: INVALID_TASK, fields: { printerId: 'Esa impresora no existe.' } }, 422);
      return json({ task: withState(task) }, 201);
    }
    return notAllowed();
  }

  const taskMatch = TASK_PATH.exec(url.pathname);
  if (taskMatch) {
    const id = Number(taskMatch[1]);
    if (request.method === 'PUT') {
      const body = await readJson(request);
      if (!isJsonObject(body)) return notJson();
      const current = await service.getTask(id);
      if (!current?.active) return taskNotFound(id);
      // Fields left out of the body keep their stored value; only the name and intervals can change.
      const result = validateServiceTask({ ...current, ...body });
      if (!result.ok) return json({ error: INVALID_TASK, fields: result.errors }, 422);
      const task = await service.updateTask(id, sentFields(result.value, body));
      return task ? json({ task: withState(task) }) : taskNotFound(id);
    }
    if (request.method === 'DELETE') {
      const task = await service.deactivateTask(id);
      return task ? json({ task: withState(task) }) : taskNotFound(id);
    }
    return notAllowed();
  }

  if (url.pathname === LOGS_PATH) {
    if (request.method === 'GET') {
      const filter = readFilter(url);
      if (!filter) return badFilter();
      const logs = await service.listLogs(filter);
      return json({ logs, totals: serviceCostByPrinter(logs) });
    }
    if (request.method === 'POST') return logService(request, deps, withState);
    return notAllowed();
  }

  const planMatch = PLAN_PATH.exec(url.pathname);
  if (planMatch) {
    if (request.method !== 'POST') return notAllowed();
    const printerId = Number(planMatch[1]);
    const hasTasks = async () => (await service.listTasks({ printerId })).length > 0;
    const printer = await deps.printers.get(printerId);
    if (!printer) return problem(404, `No existe la impresora ${printerId}.`);
    const conflict = () => problem(409, `${printer.name} ya tiene tareas de servicio.`);
    if (await hasTasks()) return conflict();
    // The write checks again, so two adoptions at once never make two plans.
    const tasks = await service.adoptPlan(printerId, deps.today());
    if (tasks.length === 0) return (await deps.printers.get(printerId)) ? conflict() : problem(404, `No existe la impresora ${printerId}.`);
    return json({ tasks: tasks.map(withState) }, 201);
  }

  return null;
}

/** `?printerId=` as a filter: no parameter is every printer; null when it is not an id. */
function readFilter(url: URL): ServiceFilter | null {
  const raw = url.searchParams.get('printerId');
  if (raw === null) return {};
  return /^\d+$/.test(raw) ? { printerId: Number(raw) } : null;
}

function badFilter(): Response {
  return json({ error: 'Revisá el filtro.', fields: { printerId: 'Elegí una impresora de la lista.' } }, 422);
}

async function problemsNow(entry: NewServiceLog, deps: ServiceDeps) {
  const [printer, task] = await Promise.all([
    deps.printers.get(entry.printerId),
    entry.taskId === null ? null : deps.service.getTask(entry.taskId),
  ]);
  return serviceLogProblems(entry, printer ? [printer] : [], task ? [task] : []);
}

/** Log a service and, against a task, reset that task's counters, all or nothing. */
async function logService(request: Request, deps: ServiceDeps, withState: (task: ServiceTask) => ServiceTaskWithState): Promise<Response> {
  const body = await readJson(request);
  if (body === undefined) return notJson();
  const result = validateServiceLog(body, deps.today());
  if (!result.ok) return json({ error: INVALID_LOG, fields: result.errors }, 422);
  const problems = await problemsNow(result.value, deps);
  if (problems) return json({ error: INVALID_LOG, fields: problems }, 422);

  const logged = await deps.service.log(result.value);
  if (!logged) {
    // The task or the printer changed after the check above and the guarded write refused: nothing was written.
    const now = await problemsNow(result.value, deps);
    return json({ error: INVALID_LOG, fields: now ?? { taskId: 'La tarea cambió mientras guardabas: probá de nuevo.' } }, 422);
  }
  return json({ log: logged.log, task: logged.task ? withState(logged.task) : null }, 201);
}
