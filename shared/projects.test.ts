import { describe, expect, it } from 'vitest';
import type { Order } from './orders';
import {
  isProjectOverdue, projectClientProblem, projectProgress, projectTotals, summarizeProjects, validateProject, validateProjectId,
} from './projects';

type Money = Pick<Order, 'stage' | 'price' | 'deposit' | 'paid'>;

const delivered: Money = { stage: 'entregado', price: 20000, deposit: null, paid: true };
const printing: Money = { stage: 'imprimiendo', price: 96000, deposit: 48000, paid: false };
const fresh: Money = { stage: 'nuevo', price: 9000, deposit: null, paid: false };

describe('validateProject', () => {
  it('accepts a project for a client picked by id and trims text', () => {
    expect(validateProject({ name: ' Kit robótica ', clientId: 5, dueDate: '2026-12-05', note: ' Para la feria. ' })).toEqual({
      ok: true, value: { name: 'Kit robótica', client: '', clientId: 5, status: 'activo', dueDate: '2026-12-05', note: 'Para la feria.' },
    });
  });

  it('accepts a client by name, like an order, and leaves the due date and note optional', () => {
    expect(validateProject({ name: 'Kit robótica', client: ' Escuela N.º 12 ', dueDate: '' })).toEqual({
      ok: true, value: { name: 'Kit robótica', client: 'Escuela N.º 12', clientId: null, status: 'activo', dueDate: null, note: '' },
    });
  });

  it('takes a status of activo or terminado', () => {
    const r = validateProject({ name: 'Kit', clientId: 1, status: 'terminado' });
    expect(r.ok && r.value.status).toBe('terminado');
  });

  it('reports every wrong field with its message', () => {
    expect(validateProject({ name: '', clientId: 'cinco', status: 'pausado', dueDate: '2026-02-30', note: 'x'.repeat(1001) })).toEqual({
      ok: false,
      errors: {
        name: 'Completá este dato.',
        clientId: 'Elegí un cliente de la lista.',
        status: 'Elegí activo o terminado.',
        dueDate: 'La fecha tiene que ser AAAA-MM-DD.',
        note: 'Máximo 1000 caracteres.',
      },
    });
  });

  it('needs a client', () => {
    expect(validateProject({ name: 'Kit' })).toEqual({ ok: false, errors: { client: 'Completá este dato.' } });
  });
});

describe('validateProjectId', () => {
  it('reads a project id or null', () => {
    expect(validateProjectId({ projectId: 3 }, true)).toEqual({ ok: true, value: 3 });
    expect(validateProjectId({ projectId: null }, true)).toEqual({ ok: true, value: null });
  });

  it('needs the key when required, and defaults to no project when not', () => {
    expect(validateProjectId({}, true)).toEqual({ ok: false, errors: { projectId: 'Elegí un proyecto o «Sin proyecto».' } });
    expect(validateProjectId({}, false)).toEqual({ ok: true, value: null });
    expect(validateProjectId({ projectId: '' }, false)).toEqual({ ok: true, value: null });
  });

  it('rejects anything that is not a whole id above 0', () => {
    for (const projectId of [0, -1, 1.5, '3', true]) {
      expect(validateProjectId({ projectId }, true)).toEqual({ ok: false, errors: { projectId: 'Elegí un proyecto de la lista.' } });
    }
  });
});

describe('projectProgress', () => {
  it('is delivered orders ÷ all orders', () => {
    expect(projectProgress([delivered, printing, fresh])).toBeCloseTo(1 / 3);
    expect(projectProgress([delivered, { ...delivered }])).toBe(1);
    expect(projectProgress([printing])).toBe(0);
  });

  it('is 0 for a project without orders', () => {
    expect(projectProgress([])).toBe(0);
  });
});

describe('projectTotals', () => {
  it('adds up prices and deposits, and the balance like a client: price minus deposit of the orders not paid', () => {
    expect(projectTotals([delivered, printing, fresh])).toEqual({
      orderCount: 3, deliveredCount: 1, progress: 1 / 3, totalPrice: 125000, totalDeposits: 48000, balanceOwed: 48000 + 9000,
    });
  });

  it('leaves out a paid order from the balance even when it has a deposit', () => {
    expect(projectTotals([{ ...printing, paid: true }]).balanceOwed).toBe(0);
    expect(projectTotals([{ ...printing, paid: true }]).totalDeposits).toBe(48000);
  });

  it('is all zeros without orders', () => {
    expect(projectTotals([])).toEqual({ orderCount: 0, deliveredCount: 0, progress: 0, totalPrice: 0, totalDeposits: 0, balanceOwed: 0 });
  });
});

it('summarizes each project with its own orders only', () => {
  const projects = [{ id: 1, name: 'Kit' }, { id: 2, name: 'Vacío' }];
  const orders = [{ ...printing, projectId: 1 }, { ...delivered, projectId: 1 }, { ...fresh, projectId: null }, { ...fresh, projectId: 3 }];
  expect(summarizeProjects(projects, orders)).toEqual([
    { id: 1, name: 'Kit', orderCount: 2, deliveredCount: 1, progress: 0.5, totalPrice: 116000, totalDeposits: 48000, balanceOwed: 48000 },
    { id: 2, name: 'Vacío', orderCount: 0, deliveredCount: 0, progress: 0, totalPrice: 0, totalDeposits: 0, balanceOwed: 0 },
  ]);
});

describe('isProjectOverdue', () => {
  it('is true for an active project whose due date is past', () => {
    expect(isProjectOverdue({ status: 'activo', dueDate: '2026-11-24' }, '2026-11-25')).toBe(true);
  });

  it('is false on the due date, without a date, or once finished', () => {
    expect(isProjectOverdue({ status: 'activo', dueDate: '2026-11-25' }, '2026-11-25')).toBe(false);
    expect(isProjectOverdue({ status: 'activo', dueDate: null }, '2026-11-25')).toBe(false);
    expect(isProjectOverdue({ status: 'terminado', dueDate: '2026-11-01' }, '2026-11-25')).toBe(false);
  });
});

describe('projectClientProblem', () => {
  const kit = { name: 'Kit robótica', clientId: 5, client: 'Escuela N.º 12' };

  it('is null when the order is of the project\'s client', () => {
    expect(projectClientProblem(kit, { clientId: 5, client: 'Escuela N.º 12' })).toBeNull();
  });

  it('explains why an order of another client cannot go in it', () => {
    expect(projectClientProblem(kit, { clientId: 3, client: 'Café Nube' }))
      .toBe('«Kit robótica» es de Escuela N.º 12 y este pedido es de Café Nube: un proyecto junta pedidos de un solo cliente.');
    expect(projectClientProblem(kit, { clientId: null, client: 'Sin ficha' })).not.toBeNull();
  });
});
