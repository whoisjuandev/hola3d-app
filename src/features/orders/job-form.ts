// The log-a-print-job form as the owners fill it in, and the API body it becomes.
import type { PrintResult } from '../../../shared/print-jobs';
import { parseWhole } from '../../ui/forms';

export interface JobDraft {
  printerId: string;
  hours: string;
  minutes: string;
  filaments: { spoolId: string; grams: string }[];
  result: PrintResult;
  note: string;
}

export function emptyJobDraft(printerId: string): JobDraft {
  return { printerId, hours: '', minutes: '', filaments: [{ spoolId: '', grams: '' }], result: 'ok', note: '' };
}

/** Hours and minutes as whole minutes; an empty part counts as 0. Other text comes back as typed, for the API to reject. */
export function draftMinutes(hours: string, minutes: string): number | string {
  const h = parseWhole(hours) ?? 0;
  const m = parseWhole(minutes) ?? 0;
  if (typeof h === 'number' && typeof m === 'number') return h * 60 + m;
  return [hours && `${hours} h`, minutes && `${minutes} min`].filter(Boolean).join(' ');
}

/** The body of POST /api/orders/:id/jobs. Rows with neither spool nor grams are left out. */
export function jobRequest(draft: JobDraft): Record<string, unknown> {
  return {
    printerId: draft.printerId ? Number(draft.printerId) : null,
    actualMinutes: draftMinutes(draft.hours, draft.minutes),
    result: draft.result,
    note: draft.note,
    filaments: draft.filaments
      .filter((f) => f.spoolId || f.grams.trim())
      .map((f) => ({ spoolId: f.spoolId ? Number(f.spoolId) : null, grams: parseWhole(f.grams) })),
  };
}
