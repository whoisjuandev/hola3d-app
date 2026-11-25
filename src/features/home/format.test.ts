import { describe, expect, it } from 'vitest';
import { greetingDate, lateLabel, monthName, moreLabel, partialProfitNote } from './format';

describe('greetingDate', () => {
  it('reads the workshop date as a weekday, day and month', () => {
    expect(greetingDate('2026-11-25')).toBe('Miércoles 25 de noviembre');
    expect(greetingDate('2026-11-29')).toBe('Domingo 29 de noviembre');
    expect(greetingDate('2027-01-01')).toBe('Viernes 1 de enero');
  });
});

describe('monthName', () => {
  it('names the month of a YYYY-MM', () => {
    expect(monthName('2026-11')).toBe('Noviembre');
    expect(monthName('2027-01')).toBe('Enero');
  });
});

describe('lateLabel', () => {
  it('says how many days late, in singular for one', () => {
    expect(lateLabel(1)).toBe('1 día de atraso');
    expect(lateLabel(5)).toBe('5 días de atraso');
  });
});

describe('moreLabel', () => {
  it('says how many items the block does not show, or nothing when it shows them all', () => {
    expect(moreLabel(8, 5)).toBe('y 3 más');
    expect(moreLabel(5, 5)).toBeNull();
    expect(moreLabel(0, 0)).toBeNull();
  });
});

describe('partialProfitNote', () => {
  it('explains which delivered orders the profit leaves out, or nothing when it counts them all', () => {
    expect(partialProfitNote(0)).toBeNull();
    expect(partialProfitNote(1)).toBe('Sin contar 1 pedido entregado que todavía no tiene impresiones cargadas.');
    expect(partialProfitNote(3)).toBe('Sin contar 3 pedidos entregados que todavía no tienen impresiones cargadas.');
  });
});
