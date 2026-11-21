import { describe, expect, it } from 'vitest';
import { depositLabel, dueLabel, isOverdue, money } from './format';

const today = '2026-11-20';

describe('dueLabel', () => {
  it('names today and tomorrow, and keeps the time', () => {
    expect(dueLabel({ dueDate: '2026-11-20', dueTime: '10:00', stage: 'listo' }, today)).toBe('Hoy, 10:00');
    expect(dueLabel({ dueDate: '2026-11-21', dueTime: null, stage: 'listo' }, today)).toBe('Mañana');
  });

  it('uses day and short month otherwise, also across month ends', () => {
    expect(dueLabel({ dueDate: '2026-11-23', dueTime: null, stage: 'nuevo' }, today)).toBe('23 nov');
    expect(dueLabel({ dueDate: '2026-12-01', dueTime: null, stage: 'nuevo' }, '2026-11-30')).toBe('Mañana');
  });

  it('marks delivered orders and missing dates', () => {
    expect(dueLabel({ dueDate: '2026-11-17', dueTime: null, stage: 'entregado' }, today)).toBe('Entregado 17 nov');
    expect(dueLabel({ dueDate: null, dueTime: null, stage: 'nuevo' }, today)).toBe('Sin fecha');
  });
});

it('flags active orders past their date as overdue', () => {
  expect(isOverdue({ dueDate: '2026-11-19', stage: 'listo' }, today)).toBe(true);
  expect(isOverdue({ dueDate: '2026-11-19', stage: 'entregado' }, today)).toBe(false);
  expect(isOverdue({ dueDate: '2026-11-20', stage: 'listo' }, today)).toBe(false);
});

it('formats pesos and deposits the way the shop writes them', () => {
  expect(money(36000)).toBe('$36.000');
  expect(depositLabel({ deposit: 18000, paid: false })).toBe('$18.000');
  expect(depositLabel({ deposit: null, paid: false })).toBe('Sin seña');
  expect(depositLabel({ deposit: null, paid: true })).toBe('Pagado');
});
