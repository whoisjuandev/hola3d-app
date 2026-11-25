import { describe, expect, it } from 'vitest';
import { draftMinutes, emptyJobDraft, finishDraft, jobRequest, type JobDraft } from './job-form';

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
    printerId: '1', hours: '2', minutes: '36', result: 'fallida', note: ' Se despegó ', labourMinutes: '45', extraCost: '$1.500',
    filaments: [{ spoolId: '1', grams: '36' }, { spoolId: '', grams: '' }, { spoolId: '2', grams: '1.200' }],
  };

  it('builds the API body, skipping empty spool rows', () => {
    expect(jobRequest(draft)).toEqual({
      printerId: 1, actualMinutes: 156, result: 'fallida', note: ' Se despegó ', labourMinutes: 45, extraCost: 1500,
      filaments: [{ spoolId: 1, grams: 36 }, { spoolId: 2, grams: 1200 }],
    });
  });

  it('sends the submission key the form made when it opened, so every try of one save carries the same one', () => {
    expect(jobRequest(draft, '0b6c5f4e-9a51-4c1e-8f43-2f1d3c4b5a69')).toEqual({ ...jobRequest(draft), submissionKey: '0b6c5f4e-9a51-4c1e-8f43-2f1d3c4b5a69' });
  });

  it('sends empty labour minutes and extra cost as null, for the API to take as 0', () => {
    expect(jobRequest({ ...draft, labourMinutes: '', extraCost: ' ' })).toMatchObject({ labourMinutes: null, extraCost: null });
  });

  it('sends labour minutes or an extra cost that are not whole numbers as typed, so the API names the field', () => {
    expect(jobRequest({ ...draft, labourMinutes: '1,5', extraCost: 'mil' })).toMatchObject({ labourMinutes: '1,5', extraCost: 'mil' });
  });

  it('keeps a half-filled row so the API can say what is missing', () => {
    expect(jobRequest({ ...draft, printerId: '', filaments: [{ spoolId: '3', grams: '' }] })).toMatchObject({
      printerId: null, filaments: [{ spoolId: 3, grams: null }],
    });
  });
});

describe('finishDraft', () => {
  it('starts the log form of a planned job with its printer, its estimated time and its note', () => {
    expect(finishDraft({ printerId: 3, estimatedMinutes: 160, note: 'Segunda tanda' })).toEqual({
      ...emptyJobDraft('3'), hours: '2', minutes: '40', note: 'Segunda tanda',
    });
    expect(finishDraft({ printerId: 1, estimatedMinutes: null, note: '' })).toEqual(emptyJobDraft('1'));
  });
});
