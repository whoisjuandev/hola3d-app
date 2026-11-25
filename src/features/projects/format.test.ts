import { describe, expect, it } from 'vitest';
import type { Project } from '../../../shared/projects';
import { percentLabel, progressText, projectChoices, projectDueLabel } from './format';

const stamp = '2026-11-01T00:00:00.000Z';
const kit: Project = {
  id: 1, name: 'Kit robótica', clientId: 5, client: 'Escuela N.º 12', status: 'activo', dueDate: '2026-12-05', note: '', createdAt: stamp, updatedAt: stamp,
};

it('shows progress as a whole percent', () => {
  expect(percentLabel(0)).toBe('0 %');
  expect(percentLabel(1 / 3)).toBe('33 %');
  expect(percentLabel(1)).toBe('100 %');
});

it('says how many orders are delivered', () => {
  expect(progressText({ orderCount: 0, deliveredCount: 0 })).toBe('Sin pedidos todavía');
  expect(progressText({ orderCount: 1, deliveredCount: 0 })).toBe('0 de 1 pedido entregado');
  expect(progressText({ orderCount: 3, deliveredCount: 1 })).toBe('1 de 3 pedidos entregados');
});

it('labels the due date like an order\'s', () => {
  expect(projectDueLabel(kit, '2026-11-25')).toBe('5 dic');
  expect(projectDueLabel({ ...kit, dueDate: '2026-11-26' }, '2026-11-25')).toBe('Mañana');
  expect(projectDueLabel({ ...kit, dueDate: null }, '2026-11-25')).toBe('Sin fecha');
});

describe('projectChoices', () => {
  const finished = { ...kit, id: 2, name: 'Carteles', status: 'terminado' as const };
  const other = { ...kit, id: 3, name: 'Carta', clientId: 1 };
  const all = [kit, finished, other];

  it('offers only the active projects of the client', () => {
    expect(projectChoices(all, 5, null)).toEqual([kit]);
    expect(projectChoices(all, 1, null)).toEqual([other]);
    expect(projectChoices(all, null, null)).toEqual([]);
  });

  it('keeps the order\'s current project even when it is finished', () => {
    expect(projectChoices(all, 5, 2)).toEqual([kit, finished]);
  });
});
