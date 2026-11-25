import { describe, expect, it } from 'vitest';
import { defaultQuoteTitle, durationLabel } from './format';

describe('durationLabel', () => {
  it('writes minutes as hours and minutes', () => {
    expect(durationLabel(0)).toBe('0 min');
    expect(durationLabel(45)).toBe('45 min');
    expect(durationLabel(120)).toBe('2 h');
    expect(durationLabel(1110)).toBe('18 h 30 min');
  });
});

describe('defaultQuoteTitle', () => {
  it('starts the title from the piece names', () => {
    expect(defaultQuoteTitle(['Llavero con logo'])).toBe('Llavero con logo');
    expect(defaultQuoteTitle(['Llavero con logo', ' Cartel '])).toBe('Llavero con logo y Cartel');
    expect(defaultQuoteTitle(['Llavero con logo', 'Cartel', 'Imán'])).toBe('Llavero con logo y 2 piezas más');
    expect(defaultQuoteTitle(['', 'Cartel'])).toBe('Cartel');
    expect(defaultQuoteTitle(['', ' '])).toBe('');
  });
});
