// The log-a-print-job form as the owners fill it in, and the API body it becomes.
import type { PrintJob, PrintResult } from '../../../shared/print-jobs';
import { parseWhole } from '../../ui/forms';

export interface JobDraft {
  printerId: string;
  hours: string;
  minutes: string;
  filaments: { spoolId: string; grams: string }[];
  result: PrintResult;
  labourMinutes: string;
  extraCost: string;
  note: string;
}

export function emptyJobDraft(printerId: string): JobDraft {
  return { printerId, hours: '', minutes: '', filaments: [{ spoolId: '', grams: '' }], result: 'ok', labourMinutes: '', extraCost: '', note: '' };
}

/** The form that finishes a planned job: its printer, its estimated time as the time it took, and its note. */
export function finishDraft(job: Pick<PrintJob, 'printerId' | 'estimatedMinutes' | 'note'>): JobDraft {
  const minutes = job.estimatedMinutes ?? 0;
  const time = minutes > 0 ? { hours: String(Math.floor(minutes / 60)), minutes: String(minutes % 60) } : {};
  return { ...emptyJobDraft(String(job.printerId)), ...time, note: job.note };
}

/** Hours and minutes as whole minutes; an empty part counts as 0. Other text comes back as typed, for the API to reject. */
export function draftMinutes(hours: string, minutes: string): number | string {
  const h = parseWhole(hours) ?? 0;
  const m = parseWhole(minutes) ?? 0;
  if (typeof h === 'number' && typeof m === 'number') return h * 60 + m;
  return [hours && `${hours} h`, minutes && `${minutes} min`].filter(Boolean).join(' ');
}

/**
 * The body of POST /api/orders/:id/jobs. Rows with neither spool nor grams are left out. Empty labour minutes and
 * extra cost go as null, which the API takes as 0. `submissionKey`, made once when the form opens, lets the API
 * recognise a retry of a save it already stored.
 */
export function jobRequest(draft: JobDraft, submissionKey?: string): Record<string, unknown> {
  return {
    ...(submissionKey ? { submissionKey } : {}),
    printerId: draft.printerId ? Number(draft.printerId) : null,
    actualMinutes: draftMinutes(draft.hours, draft.minutes),
    result: draft.result,
    labourMinutes: parseWhole(draft.labourMinutes),
    extraCost: parseWhole(draft.extraCost),
    note: draft.note,
    filaments: draft.filaments
      .filter((f) => f.spoolId || f.grams.trim())
      .map((f) => ({ spoolId: f.spoolId ? Number(f.spoolId) : null, grams: parseWhole(f.grams) })),
  };
}
