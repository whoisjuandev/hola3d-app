import { describe, expect, it } from 'vitest';
import { draftMinutes, jobRequest, type JobDraft } from './job-form';

describe('draftMinutes', () => {
  it('turns hours and minutes into whole minutes, an empty part counting as 0', () => {
    expect(draftMinutes('1', '35')).toBe(95);
    expect(draftMinutes('7', '')).toBe(420);
    expect(draftMinutes('', '45')).toBe(45);
    expect(draftMinutes('', '')).toBe(0);
  });

  it('sends text that is not a whole number as is, so the API names the field', () => {
    expect(draftMinutes('1,5', '')).toBe('1,5 h');
    expect(draftMinutes('2', 'diez')).toBe('2 h diez min');
  });
});

describe('jobRequest', () => {
  const draft: JobDraft = {
    printerId: '1', hours: '2', minutes: '36', result: 'fallida', note: ' Se despegó ',
    filaments: [{ spoolId: '1', grams: '36' }, { spoolId: '', grams: '' }, { spoolId: '2', grams: '1.200' }],
  };

  it('builds the API body, skipping empty spool rows', () => {
    expect(jobRequest(draft)).toEqual({
      printerId: 1, actualMinutes: 156, result: 'fallida', note: ' Se despegó ',
      filaments: [{ spoolId: 1, grams: 36 }, { spoolId: 2, grams: 1200 }],
    });
  });

  it('keeps a half-filled row so the API can say what is missing', () => {
    expect(jobRequest({ ...draft, printerId: '', filaments: [{ spoolId: '3', grams: '' }] })).toMatchObject({
      printerId: null, filaments: [{ spoolId: 3, grams: null }],
    });
  });
});
