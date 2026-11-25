import { describe, expect, it } from 'vitest';
import type { Printer } from '../../shared/printers';
import { memoryTables, type StoredServiceLog, type StoredServiceTask } from '../memory';
import { memoryPrinterRepository, type PrinterRepository } from '../printers/repository';
import { handlePrinters } from '../printers/routes';
import { memoryServiceRepository, type ServiceRepository } from './repository';
import { handleService } from './routes';

const stamp = '2026-11-01T00:00:00.000Z';
const TODAY = '2026-11-25';

const a1: Printer = {
  id: 1, name: 'La A1', model: '', purchasePrice: 720000, lifetimeHours: 5000, powerWatts: 95, printMinutes: 74100, status: 'activa',
  note: '', createdAt: stamp, updatedAt: stamp,
};
const ender: Printer = { ...a1, id: 2, name: 'La Ender', printMinutes: 108450, status: 'en_servicio' };
const old: Printer = { ...a1, id: 3, name: 'La vieja', printMinutes: 121800, status: 'fuera_de_uso' };

const taskRow = (overrides: Partial<StoredServiceTask>): StoredServiceTask => ({
  id: 1, printerId: 1, name: 'Limpiar boquilla', intervalHours: 100, intervalDays: null, lastDoneMinutes: 68400, lastDoneDate: '2026-11-10',
  active: true, createdAt: stamp, updatedAt: stamp, ...overrides,
});
// A1: nozzle 95 h of 100 (5 h left), rods 215 h of 200 (due by hours), bed 36 days of 30 (due by days), PTFE deactivated.
// Ender: rods 140,8 h of 200 but 116 days of 90 (due by days).
const tasks: StoredServiceTask[] = [
  taskRow({ id: 1 }),
  taskRow({ id: 2, name: 'Lubricar varillas', intervalHours: 200, lastDoneMinutes: 61200, lastDoneDate: '2026-09-15' }),
  taskRow({ id: 3, name: 'Limpiar cama', intervalHours: null, intervalDays: 30, lastDoneMinutes: 70000, lastDoneDate: '2026-10-20' }),
  taskRow({ id: 4, printerId: 2, name: 'Lubricar varillas', intervalHours: 200, intervalDays: 90, lastDoneMinutes: 100000, lastDoneDate: '2026-08-01' }),
  taskRow({ id: 5, name: 'Cambiar PTFE', intervalHours: 500, lastDoneMinutes: 0, active: false }),
];
const logs: StoredServiceLog[] = [
  { id: 1, printerId: 1, taskId: 1, date: '2026-11-10', done: 'Limpiar boquilla', parts: 'Aguja de limpieza 0,4 mm', cost: 1500, note: '', createdAt: stamp, updatedAt: stamp },
  { id: 2, printerId: 2, taskId: null, date: '2026-09-02', done: 'Cambio de ventilador de capa', parts: 'Ventilador 4010', cost: 4800, note: 'Hacía ruido.', createdAt: stamp, updatedAt: stamp },
];

interface Options {
  service?: (repo: ServiceRepository) => ServiceRepository;
  printers?: (repo: PrinterRepository) => PrinterRepository;
}

function setup(options: Options = {}) {
  const tables = memoryTables([], [], [], { printers: [a1, ender, old], serviceTasks: tasks, serviceLogs: logs });
  const printerRepo = memoryPrinterRepository(tables);
  const serviceRepo = memoryServiceRepository(tables);
  const deps = {
    service: options.service ? options.service(serviceRepo) : serviceRepo,
    printers: options.printers ? options.printers(printerRepo) : printerRepo,
    today: () => TODAY,
  };
  const send = async (handler: (request: Request, url: URL) => Promise<Response | null>, method: string, path: string, body?: unknown) => {
    const url = new URL(`https://app.test${path}`);
    const payload = body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
    const res = await handler(new Request(url, { method, body: payload, headers: { 'Content-Type': 'application/json' } }), url);
    if (!res) throw new Error('route not handled');
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  const call = (method: string, path: string, body?: unknown) => send((request, url) => handleService(request, url, deps), method, path, body);
  const callPrinters = (method: string, path: string, body?: unknown) =>
    send((request, url) => handlePrinters(request, url, printerRepo, { service: serviceRepo, today: () => TODAY }), method, path, body);
  /** Everything a service write may change, read through the API. */
  const snapshot = async () => ({
    tasks: (await call('GET', '/api/service/tasks')).body,
    logs: (await call('GET', '/api/service/logs')).body,
    printers: await printerRepo.list(),
  });
  return { call, callPrinters, snapshot, serviceRepo, printerRepo };
}

const ids = (body: Record<string, unknown>, key = 'tasks') => (body[key] as { id: number }[]).map((t) => t.id);

describe('GET /api/service/tasks', () => {
  it('lists the active tasks of every printer with their state, due first, then the closest to due', async () => {
    const { call } = setup();
    const { status, body } = await call('GET', '/api/service/tasks');
    expect(status).toBe(200);
    expect(ids(body)).toEqual([4, 3, 2, 1]);
    const listed = body.tasks as Record<string, unknown>[];
    expect(listed[0]).toEqual({
      ...tasks[3], printer: 'La Ender', printerMinutes: 108450,
      state: { due: true, dueByHours: false, dueByDays: true, minutesLeft: 3550, daysLeft: -26, progress: 116 / 90 },
    });
    expect(listed[2]).toMatchObject({ id: 2, state: { due: true, dueByHours: true, minutesLeft: -900 } });
    expect(listed[3]).toMatchObject({ id: 1, printer: 'La A1', printerMinutes: 74100, state: { due: false, minutesLeft: 300, daysLeft: null } });
  });

  it('lists the tasks of one printer', async () => {
    const { call } = setup();
    expect(ids((await call('GET', '/api/service/tasks?printerId=2')).body)).toEqual([4]);
    expect(await call('GET', '/api/service/tasks?printerId=3')).toEqual({ status: 200, body: { tasks: [] } });
  });

  it('rejects a printer filter that is not an id', async () => {
    const { call } = setup();
    expect(await call('GET', '/api/service/tasks?printerId=la-a1'))
      .toEqual({ status: 422, body: { error: 'Revisá el filtro.', fields: { printerId: 'Elegí una impresora de la lista.' } } });
  });

  it('rejects other methods', async () => {
    const { call } = setup();
    expect(await call('PATCH', '/api/service/tasks')).toEqual({ status: 405, body: { error: 'Método no permitido.' } });
  });
});

describe('POST /api/service/tasks', () => {
  it('creates a task counting from the printer minutes of now and today, and lists it', async () => {
    const { call } = setup();
    const { status, body } = await call('POST', '/api/service/tasks', { printerId: 2, name: ' Revisar correas ', intervalHours: 300 });
    expect(status).toBe(201);
    expect(body.task).toEqual({
      id: 6, printerId: 2, printer: 'La Ender', printerMinutes: 108450, name: 'Revisar correas', intervalHours: 300, intervalDays: null,
      lastDoneMinutes: 108450, lastDoneDate: TODAY, active: true, createdAt: expect.any(String), updatedAt: expect.any(String),
      state: { due: false, dueByHours: false, dueByDays: false, minutesLeft: 18000, daysLeft: null, progress: 0 },
    });
    expect(ids((await call('GET', '/api/service/tasks?printerId=2')).body)).toEqual([4, 6]);
  });

  it('counts the days from the date it was last done when given', async () => {
    const { call } = setup();
    const { status, body } = await call('POST', '/api/service/tasks', { printerId: 3, name: 'Limpiar cama', intervalDays: 30, lastDoneDate: '2026-10-26' });
    expect(status).toBe(201);
    expect(body.task).toMatchObject({ lastDoneDate: '2026-10-26', state: { due: true, dueByDays: true, daysLeft: 0 } });
  });

  it('rejects a task without an interval and stores nothing', async () => {
    const { call, snapshot } = setup();
    const before = await snapshot();
    const message = 'Poné cada cuántas horas de impresión, cada cuántos días, o las dos.';
    expect(await call('POST', '/api/service/tasks', { printerId: 1, name: 'Revisar correas' }))
      .toEqual({ status: 422, body: { error: 'Revisá los datos de la tarea.', fields: { intervalHours: message, intervalDays: message } } });
    expect(await snapshot()).toEqual(before);
  });

  it('rejects wrong fields and stores nothing', async () => {
    const { call, snapshot } = setup();
    const before = await snapshot();
    const { status, body } = await call('POST', '/api/service/tasks', { name: '', intervalHours: 1.5, lastDoneDate: 'ayer' });
    expect(status).toBe(422);
    expect(Object.keys(body.fields as object).sort()).toEqual(['intervalHours', 'lastDoneDate', 'name', 'printerId']);
    expect(await snapshot()).toEqual(before);
  });

  it('rejects a printer that does not exist and stores nothing', async () => {
    const { call, snapshot } = setup();
    const before = await snapshot();
    expect(await call('POST', '/api/service/tasks', { printerId: 9, name: 'Revisar correas', intervalHours: 300 }))
      .toEqual({ status: 422, body: { error: 'Revisá los datos de la tarea.', fields: { printerId: 'Esa impresora no existe.' } } });
    expect(await snapshot()).toEqual(before);
  });

  it('rejects a body that is not JSON and stores nothing', async () => {
    const { call, snapshot } = setup();
    const before = await snapshot();
    expect(await call('POST', '/api/service/tasks', 'no es json')).toEqual({ status: 400, body: { error: 'El cuerpo tiene que ser JSON.' } });
    expect(await snapshot()).toEqual(before);
  });
});

describe('PUT /api/service/tasks/:id', () => {
  it('changes the fields sent and keeps the rest, never the printer or the counters', async () => {
    const { call } = setup();
    const { status, body } = await call('PUT', '/api/service/tasks/1', { intervalDays: 10, printerId: 2, lastDoneMinutes: 0, lastDoneDate: '2026-01-01' });
    expect(status).toBe(200);
    expect(body.task).toMatchObject({
      id: 1, printerId: 1, name: 'Limpiar boquilla', intervalHours: 100, intervalDays: 10, lastDoneMinutes: 68400, lastDoneDate: '2026-11-10',
      state: { due: true, dueByHours: false, dueByDays: true, daysLeft: -5 },
    });
    expect((await call('GET', '/api/service/tasks?printerId=1')).body.tasks).toContainEqual(body.task);
  });

  it('can drop one interval while the other stays', async () => {
    const { call } = setup();
    const { status, body } = await call('PUT', '/api/service/tasks/4', { intervalHours: null, name: 'Lubricar varillas y husillo' });
    expect(status).toBe(200);
    expect(body.task).toMatchObject({ name: 'Lubricar varillas y husillo', intervalHours: null, intervalDays: 90, state: { minutesLeft: null } });
  });

  it('rejects dropping the only interval, or a wrong name, and changes nothing', async () => {
    const { call, snapshot } = setup();
    const before = await snapshot();
    const message = 'Poné cada cuántas horas de impresión, cada cuántos días, o las dos.';
    expect(await call('PUT', '/api/service/tasks/1', { intervalHours: null }))
      .toEqual({ status: 422, body: { error: 'Revisá los datos de la tarea.', fields: { intervalHours: message, intervalDays: message } } });
    expect(await call('PUT', '/api/service/tasks/1', { name: ' ' }))
      .toEqual({ status: 422, body: { error: 'Revisá los datos de la tarea.', fields: { name: 'Completá este dato.' } } });
    expect(await snapshot()).toEqual(before);
  });

  it('rejects a body that is not a JSON object and changes nothing', async () => {
    const { call, snapshot } = setup();
    const before = await snapshot();
    expect(await call('PUT', '/api/service/tasks/1', '[1]')).toEqual({ status: 400, body: { error: 'El cuerpo tiene que ser JSON.' } });
    expect(await snapshot()).toEqual(before);
  });

  it('answers 404 for a task that does not exist or was deactivated', async () => {
    const { call, snapshot } = setup();
    const before = await snapshot();
    expect(await call('PUT', '/api/service/tasks/99', { name: 'Otra' })).toEqual({ status: 404, body: { error: 'No existe la tarea 99.' } });
    expect(await call('PUT', '/api/service/tasks/5', { name: 'Otra' })).toEqual({ status: 404, body: { error: 'No existe la tarea 5.' } });
    expect(await snapshot()).toEqual(before);
  });

  it('rejects other methods', async () => {
    const { call } = setup();
    expect(await call('GET', '/api/service/tasks/1')).toEqual({ status: 405, body: { error: 'Método no permitido.' } });
  });
});

describe('DELETE /api/service/tasks/:id', () => {
  it('deactivates the task: it leaves the list and its services keep its name', async () => {
    const { call } = setup();
    const { status, body } = await call('DELETE', '/api/service/tasks/1');
    expect(status).toBe(200);
    expect(body.task).toMatchObject({ id: 1, active: false });
    expect(ids((await call('GET', '/api/service/tasks')).body)).toEqual([4, 3, 2]);
    expect((await call('GET', '/api/service/logs')).body.logs).toContainEqual(expect.objectContaining({ id: 1, taskId: 1, task: 'Limpiar boquilla' }));
  });

  it('answers 404 for a task that does not exist or is already deactivated, changing nothing', async () => {
    const { call, snapshot } = setup();
    const before = await snapshot();
    expect(await call('DELETE', '/api/service/tasks/99')).toEqual({ status: 404, body: { error: 'No existe la tarea 99.' } });
    expect(await call('DELETE', '/api/service/tasks/5')).toEqual({ status: 404, body: { error: 'No existe la tarea 5.' } });
    expect(await snapshot()).toEqual(before);
  });
});

describe('POST /api/printers/:id/service-plan', () => {
  it('creates the default plan counting from the printer hours of now and today', async () => {
    const { call } = setup();
    const { status, body } = await call('POST', '/api/printers/3/service-plan');
    expect(status).toBe(201);
    const counted = { printerId: 3, printer: 'La vieja', printerMinutes: 121800, lastDoneMinutes: 121800, lastDoneDate: TODAY, active: true, intervalDays: null };
    expect(body.tasks).toEqual([
      expect.objectContaining({ ...counted, id: 6, name: 'Limpiar boquilla', intervalHours: 100, state: expect.objectContaining({ due: false, minutesLeft: 6000 }) }),
      expect.objectContaining({ ...counted, id: 7, name: 'Lubricar varillas', intervalHours: 200 }),
      expect.objectContaining({ ...counted, id: 8, name: 'Revisar correas', intervalHours: 300 }),
    ]);
    expect(ids((await call('GET', '/api/service/tasks?printerId=3')).body)).toEqual([6, 7, 8]);
  });

  it('creates nothing when the printer already has tasks', async () => {
    const { call, snapshot } = setup();
    const before = await snapshot();
    expect(await call('POST', '/api/printers/1/service-plan')).toEqual({ status: 409, body: { error: 'La A1 ya tiene tareas de servicio.' } });
    expect(await snapshot()).toEqual(before);
  });

  it('creates nothing when a task appears between the check and the write', async () => {
    const { call, snapshot } = setup({
      // Someone adopts the plan for La vieja right after this request checked it had no tasks.
      service: (repo) => ({ ...repo, adoptPlan: async (printerId, today) => { await repo.adoptPlan(printerId, today); return repo.adoptPlan(printerId, today); } }),
    });
    expect(await call('POST', '/api/printers/3/service-plan')).toEqual({ status: 409, body: { error: 'La vieja ya tiene tareas de servicio.' } });
    expect(ids((await snapshot()).tasks)).toEqual([4, 3, 2, 1, 6, 7, 8]);
  });

  it('counts a printer whose tasks were all deactivated as one without tasks', async () => {
    const { call } = setup();
    await call('DELETE', '/api/service/tasks/4');
    const { status, body } = await call('POST', '/api/printers/2/service-plan');
    expect(status).toBe(201);
    expect(ids(body)).toEqual([6, 7, 8]);
  });

  it('answers 404 for a printer that does not exist, creating nothing', async () => {
    const { call, snapshot } = setup();
    const before = await snapshot();
    expect(await call('POST', '/api/printers/9/service-plan')).toEqual({ status: 404, body: { error: 'No existe la impresora 9.' } });
    expect(await snapshot()).toEqual(before);
  });

  it('rejects other methods', async () => {
    const { call } = setup();
    expect(await call('GET', '/api/printers/1/service-plan')).toEqual({ status: 405, body: { error: 'Método no permitido.' } });
  });
});

describe('POST /api/printers with servicePlan', () => {
  const printer = { name: 'La Prusa', purchasePrice: 900000, lifetimeHours: 6000, powerWatts: 80, printMinutes: 600 };

  it('creates the printer with the default plan counted from its hours', async () => {
    const { call, callPrinters } = setup();
    const { status, body } = await callPrinters('POST', '/api/printers', { ...printer, servicePlan: true });
    expect(status).toBe(201);
    expect(body.printer).toMatchObject({ id: 4, name: 'La Prusa', printMinutes: 600 });
    const listed = (await call('GET', '/api/service/tasks?printerId=4')).body.tasks as Record<string, unknown>[];
    expect(listed.map((t) => [t.name, t.intervalHours, t.lastDoneMinutes, t.lastDoneDate])).toEqual([
      ['Limpiar boquilla', 100, 600, TODAY], ['Lubricar varillas', 200, 600, TODAY], ['Revisar correas', 300, 600, TODAY],
    ]);
  });

  it('creates the printer alone without the flag or with it off', async () => {
    const { call, callPrinters } = setup();
    expect((await callPrinters('POST', '/api/printers', printer)).status).toBe(201);
    expect((await callPrinters('POST', '/api/printers', { ...printer, servicePlan: false })).status).toBe(201);
    expect((await call('GET', '/api/service/tasks?printerId=4')).body.tasks).toEqual([]);
    expect((await call('GET', '/api/service/tasks?printerId=5')).body.tasks).toEqual([]);
  });

  it('rejects a flag that is not true or false, with the printer errors, and stores nothing', async () => {
    const { callPrinters, snapshot } = setup();
    const before = await snapshot();
    expect(await callPrinters('POST', '/api/printers', { ...printer, servicePlan: 'si' })).toEqual({
      status: 422, body: { error: 'Revisá los datos de la impresora.', fields: { servicePlan: 'Elegí si va con el plan de servicio o sin él.' } },
    });
    const { status, body } = await callPrinters('POST', '/api/printers', { name: '', servicePlan: true });
    expect(status).toBe(422);
    expect(Object.keys(body.fields as object).sort()).toEqual(['lifetimeHours', 'name', 'powerWatts', 'purchasePrice']);
    expect(await snapshot()).toEqual(before);
  });
});

describe('GET /api/service/logs', () => {
  it('lists the services, newest first, with printer and task names, and the cost per printer', async () => {
    const { call } = setup();
    expect(await call('GET', '/api/service/logs')).toEqual({
      status: 200,
      body: {
        logs: [{ ...logs[0], printer: 'La A1', task: 'Limpiar boquilla' }, { ...logs[1], printer: 'La Ender', task: null }],
        totals: [{ printerId: 1, printer: 'La A1', count: 1, cost: 1500 }, { printerId: 2, printer: 'La Ender', count: 1, cost: 4800 }],
      },
    });
  });

  it('lists the services of one printer', async () => {
    const { call } = setup();
    const { body } = await call('GET', '/api/service/logs?printerId=2');
    expect(ids(body, 'logs')).toEqual([2]);
    expect(body.totals).toEqual([{ printerId: 2, printer: 'La Ender', count: 1, cost: 4800 }]);
  });

  it('rejects a printer filter that is not an id', async () => {
    const { call } = setup();
    expect(await call('GET', '/api/service/logs?printerId=x'))
      .toEqual({ status: 422, body: { error: 'Revisá el filtro.', fields: { printerId: 'Elegí una impresora de la lista.' } } });
  });
});

describe('POST /api/service/logs', () => {
  it('logs a service against a task and resets both its counters to the printer minutes and the service date', async () => {
    const { call } = setup();
    const { status, body } = await call('POST', '/api/service/logs', {
      printerId: 1, taskId: 2, date: '2026-11-24', done: 'Lubricar varillas', parts: 'Grasa de litio', cost: 2500, note: '',
    });
    expect(status).toBe(201);
    expect(body.log).toEqual({
      id: 3, printerId: 1, printer: 'La A1', taskId: 2, task: 'Lubricar varillas', date: '2026-11-24', done: 'Lubricar varillas', parts: 'Grasa de litio',
      cost: 2500, note: '', createdAt: expect.any(String), updatedAt: expect.any(String),
    });
    expect(body.task).toMatchObject({
      id: 2, lastDoneMinutes: 74100, lastDoneDate: '2026-11-24', state: { due: false, minutesLeft: 12000, progress: 0 },
    });
    const after = await call('GET', '/api/service/tasks');
    expect(ids(after.body)).toEqual([4, 3, 1, 2]);
    expect((await call('GET', '/api/service/logs')).body.totals).toContainEqual({ printerId: 1, printer: 'La A1', count: 2, cost: 4000 });
  });

  it('resets a task due by days and by hours alike', async () => {
    const { call } = setup();
    const { body } = await call('POST', '/api/service/logs', { printerId: 2, taskId: 4, date: TODAY, done: 'Lubricar varillas' });
    expect(body.task).toMatchObject({ lastDoneMinutes: 108450, lastDoneDate: TODAY, state: { due: false, minutesLeft: 12000, daysLeft: 90 } });
  });

  it('takes the printer minutes at the moment of the write, not the ones read before', async () => {
    const { call, printerRepo } = setup({
      // A print job adds 90 minutes to La A1 right after the route checked the printer.
      printers: (repo) => ({ ...repo, get: async (id) => { const p = await repo.get(id); await repo.update(1, { printMinutes: 74190 }); return p; } }),
    });
    const { body } = await call('POST', '/api/service/logs', { printerId: 1, taskId: 2, done: 'Lubricar varillas' });
    expect(body.task).toMatchObject({ lastDoneMinutes: 74190, printerMinutes: 74190, lastDoneDate: TODAY });
    expect((await printerRepo.get(1))?.printMinutes).toBe(74190);
  });

  it('logs a service without a task, defaulting the date to today and the cost to 0, and resets no task', async () => {
    const { call, snapshot } = setup();
    const before = await snapshot();
    const { status, body } = await call('POST', '/api/service/logs', { printerId: 3, done: 'Desarmada para repuestos' });
    expect(status).toBe(201);
    expect(body).toEqual({
      log: {
        id: 3, printerId: 3, printer: 'La vieja', taskId: null, task: null, date: TODAY, done: 'Desarmada para repuestos', parts: '', cost: 0, note: '',
        createdAt: expect.any(String), updatedAt: expect.any(String),
      },
      task: null,
    });
    expect((await snapshot()).tasks).toEqual(before.tasks);
  });

  it('rejects wrong fields and changes nothing', async () => {
    const { call, snapshot } = setup();
    const before = await snapshot();
    const { status, body } = await call('POST', '/api/service/logs', { printerId: 1, taskId: 2, done: '', cost: -5, date: '2026-13-01' });
    expect(status).toBe(422);
    expect(body).toEqual({
      error: 'Revisá los datos del servicio.',
      fields: { done: 'Completá este dato.', cost: 'Poné el costo en pesos, sin centavos.', date: 'La fecha tiene que ser AAAA-MM-DD.' },
    });
    expect(await snapshot()).toEqual(before);
  });

  it('rejects a printer that does not exist and changes nothing', async () => {
    const { call, snapshot } = setup();
    const before = await snapshot();
    expect(await call('POST', '/api/service/logs', { printerId: 9, done: 'Algo' }))
      .toEqual({ status: 422, body: { error: 'Revisá los datos del servicio.', fields: { printerId: 'Esa impresora no existe.' } } });
    expect(await snapshot()).toEqual(before);
  });

  it('rejects a task of another printer, a deactivated one or one that does not exist, and changes nothing', async () => {
    const { call, snapshot } = setup();
    const before = await snapshot();
    const rejected = { status: 422, body: { error: 'Revisá los datos del servicio.', fields: { taskId: 'Esa tarea no está en el plan de esta impresora.' } } };
    expect(await call('POST', '/api/service/logs', { printerId: 1, taskId: 4, done: 'Lubricar varillas' })).toEqual(rejected);
    expect(await call('POST', '/api/service/logs', { printerId: 1, taskId: 5, done: 'Cambiar PTFE' })).toEqual(rejected);
    expect(await call('POST', '/api/service/logs', { printerId: 1, taskId: 99, done: 'Algo' })).toEqual(rejected);
    expect(await snapshot()).toEqual(before);
  });

  it('writes nothing when the task is deactivated between the check and the write', async () => {
    const { call, snapshot } = setup({
      service: (repo) => ({ ...repo, getTask: async (id) => { const t = await repo.getTask(id); await repo.deactivateTask(id); return t; } }),
    });
    const before = await snapshot();
    expect(await call('POST', '/api/service/logs', { printerId: 1, taskId: 2, done: 'Lubricar varillas' }))
      .toEqual({ status: 422, body: { error: 'Revisá los datos del servicio.', fields: { taskId: 'Esa tarea no está en el plan de esta impresora.' } } });
    const after = await snapshot();
    expect(after.logs).toEqual(before.logs);
    expect(ids(after.tasks)).toEqual([4, 3, 1]);
  });

  it('rejects a body that is not JSON and changes nothing', async () => {
    const { call, snapshot } = setup();
    const before = await snapshot();
    expect(await call('POST', '/api/service/logs', '{')).toEqual({ status: 400, body: { error: 'El cuerpo tiene que ser JSON.' } });
    expect(await snapshot()).toEqual(before);
  });

  it('rejects other methods', async () => {
    const { call } = setup();
    expect(await call('DELETE', '/api/service/logs')).toEqual({ status: 405, body: { error: 'Método no permitido.' } });
  });
});

it('leaves other paths to the caller', async () => {
  const tables = memoryTables();
  const deps = { service: memoryServiceRepository(tables), printers: memoryPrinterRepository(tables), today: () => TODAY };
  for (const path of ['/api/printers', '/api/printers/1', '/api/service', '/api/service/tasks/abc', '/api/orders']) {
    const url = new URL(`https://app.test${path}`);
    expect(await handleService(new Request(url), url, deps)).toBeNull();
  }
});
