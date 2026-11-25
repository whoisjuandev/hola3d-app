import { expect, it } from 'vitest';
import { grams } from './format';

it('writes grams with thousands separators', () => {
  expect(grams(1000)).toBe('1.000 g');
  expect(grams(90)).toBe('90 g');
});
