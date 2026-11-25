import { describe, expect, it } from 'vitest';
import { readSubmissionKey } from '../../shared/print-jobs';
import { newSubmissionKey } from './submission-key';

describe('newSubmissionKey', () => {
  it('uses a random UUID when the browser has one', () => {
    expect(newSubmissionKey({ randomUUID: () => 'f3b0c442-98fc-4c1c-a3e6-6f2d5b8e9a01', getRandomValues: () => { throw new Error('not used'); } }))
      .toBe('f3b0c442-98fc-4c1c-a3e6-6f2d5b8e9a01');
  });

  it('builds one from random bytes when randomUUID is not there (a page served over plain http)', () => {
    let calls = 0;
    const bytes = <T extends ArrayBufferView | null>(array: T): T => {
      calls++;
      if (array instanceof Uint8Array) array.forEach((_, i) => { array[i] = (i * 37 + calls * 11) % 256; });
      return array;
    };
    const first = newSubmissionKey({ getRandomValues: bytes });
    const second = newSubmissionKey({ getRandomValues: bytes });
    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(second).toMatch(/^[0-9a-f]{32}$/);
    expect(first).not.toBe(second);
    // The API takes it as it is.
    expect(readSubmissionKey({ submissionKey: first })).toEqual({ ok: true, value: first });
  });

  it('makes a key the API takes with the real crypto of this runtime', () => {
    const key = newSubmissionKey();
    expect(readSubmissionKey({ submissionKey: key })).toEqual({ ok: true, value: key });
    expect(newSubmissionKey()).not.toBe(key);
  });
});
