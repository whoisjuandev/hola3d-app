import { describe, expect, it } from 'vitest';
import { changedValues, parseWhole } from './forms';

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

it('keeps only the form values that changed', () => {
  expect(changedValues({ name: 'La A1', note: 'nueva' }, { name: 'La A1', note: '' })).toEqual({ note: 'nueva' });
  expect(changedValues({ name: 'La A1' }, { name: 'La A1' })).toEqual({});
});
