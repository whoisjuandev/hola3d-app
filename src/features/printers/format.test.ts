import { describe, expect, it } from 'vitest';
import { hoursLabel, hoursText, hoursTextToMinutes } from './format';

describe('print hours', () => {
  it('labels minutes as hours with at most one decimal', () => {
    expect(hoursLabel(74100)).toBe('1.235 h');
    expect(hoursLabel(90)).toBe('1,5 h');
    expect(hoursLabel(0)).toBe('0 h');
  });

  it('writes minutes as an editable hours value and reads it back', () => {
    expect(hoursText(74100)).toBe('1235');
    expect(hoursText(61)).toBe('1,02');
    expect(hoursTextToMinutes(hoursText(61))).toBe(61);
    expect(hoursTextToMinutes('1.235,5')).toBe(74130);
    expect(hoursTextToMinutes('1.5')).toBe(90);
  });

  it('reads empty as null and gives back text that is not a number', () => {
    expect(hoursTextToMinutes('')).toBeNull();
    expect(hoursTextToMinutes('mucho')).toBe('mucho');
  });
});
