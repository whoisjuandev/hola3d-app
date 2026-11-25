import { describe, expect, it } from 'vitest';
import { changedValues, parseDecimal, parseWhole } from './forms';

describe('parseWhole', () => {
  it('reads whole numbers written the way the shop writes them', () => {
    expect(parseWhole('36000')).toBe(36000);
    expect(parseWhole('$ 36.000')).toBe(36000);
    expect(parseWhole('-5')).toBe(-5);
  });

  it('gives back empty as null and anything else as typed, so the API can explain it', () => {
    expect(parseWhole('  ')).toBeNull();
    expect(parseWhole('12,5')).toBe('12,5');
  });
});

describe('parseDecimal', () => {
  it('reads a decimal comma or point, a percent sign and thousands dots', () => {
    expect(parseDecimal('14,5')).toBe(14.5);
    expect(parseDecimal('14.5 %')).toBe(14.5);
    expect(parseDecimal('10')).toBe(10);
    expect(parseDecimal('1.000,25')).toBe(1000.25);
    expect(parseDecimal('-2')).toBe(-2);
  });

  it('gives back empty as null and anything else as typed, so the API can explain it', () => {
    expect(parseDecimal(' ')).toBeNull();
    expect(parseDecimal('diez')).toBe('diez');
  });
});

it('keeps only the form values that changed', () => {
  expect(changedValues({ name: 'La A1', note: 'nueva' }, { name: 'La A1', note: '' })).toEqual({ note: 'nueva' });
  expect(changedValues({ name: 'La A1' }, { name: 'La A1' })).toEqual({});
});
