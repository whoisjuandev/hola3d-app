import { describe, expect, it } from 'vitest';
import type { ServiceState } from '../../../shared/service';
import { intervalLabel, planText, stateLabel } from './format';

describe('planText', () => {
  it('describes the default plan in one sentence', () => {
    expect(planText()).toBe('Limpiar boquilla cada 100 h, lubricar varillas cada 200 h y revisar correas cada 300 h.');
  });
});

const state = (overrides: Partial<ServiceState>): ServiceState => ({
  due: false, dueByHours: false, dueByDays: false, minutesLeft: null, daysLeft: null, progress: 0, ...overrides,
});

describe('intervalLabel', () => {
  it('says how often a task comes back', () => {
    expect(intervalLabel({ intervalHours: 100, intervalDays: null })).toBe('Cada 100 h de impresión');
    expect(intervalLabel({ intervalHours: null, intervalDays: 30 })).toBe('Cada 30 días');
    expect(intervalLabel({ intervalHours: null, intervalDays: 1 })).toBe('Cada 1 día');
    expect(intervalLabel({ intervalHours: 1200, intervalDays: 90 })).toBe('Cada 1.200 h de impresión o 90 días');
  });
});

describe('stateLabel', () => {
  it('says how much is left of each interval', () => {
    expect(stateLabel(state({ minutesLeft: 300 }))).toBe('Faltan 5 h');
    expect(stateLabel(state({ minutesLeft: 60 }))).toBe('Falta 1 h');
    expect(stateLabel(state({ minutesLeft: 90 }))).toBe('Faltan 1,5 h');
    expect(stateLabel(state({ daysLeft: 1 }))).toBe('Falta 1 día');
    expect(stateLabel(state({ minutesLeft: 3550, daysLeft: 30 }))).toBe('Faltan 59,2 h o 30 días');
  });

  it('says how far past due a task is, by whichever interval it reached', () => {
    expect(stateLabel(state({ due: true, dueByHours: true, minutesLeft: -900 }))).toBe('Vencida hace 15 h');
    expect(stateLabel(state({ due: true, dueByHours: true, minutesLeft: 0 }))).toBe('Vence ahora');
    expect(stateLabel(state({ due: true, dueByDays: true, minutesLeft: 3550, daysLeft: -26 }))).toBe('Vencida hace 26 días');
    expect(stateLabel(state({ due: true, dueByDays: true, daysLeft: -1 }))).toBe('Vencida hace 1 día');
    expect(stateLabel(state({ due: true, dueByDays: true, daysLeft: 0 }))).toBe('Vence hoy');
    expect(stateLabel(state({ due: true, dueByHours: true, dueByDays: true, minutesLeft: -600, daysLeft: -3 }))).toBe('Vencida hace 10 h y 3 días');
  });
});
