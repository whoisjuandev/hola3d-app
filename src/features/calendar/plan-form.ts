// The plan-a-print form as the owners fill it in, and the API body it becomes.
import type { PrintJob } from '../../../shared/print-jobs';
import { draftMinutes } from '../orders/job-form';

export interface PlanDraft {
  orderId: string;
  printerId: string;
  date: string; // YYYY-MM-DD, from a date input
  time: string; // HH:MM, from a time input
  hours: string;
  minutes: string;
  note: string;
}

/** The form for a new plan (`job` null, starting at 09:00 of `date`) or for editing a planned job. */
export function planDraft(
  job: Pick<PrintJob, 'orderId' | 'printerId' | 'plannedStart' | 'estimatedMinutes' | 'note'> | null,
  defaults: { orderId?: string; printerId?: string; date?: string },
): PlanDraft {
  if (!job) return { orderId: defaults.orderId ?? '', printerId: defaults.printerId ?? '', date: defaults.date ?? '', time: '09:00', hours: '', minutes: '', note: '' };
  const [date, time] = (job.plannedStart ?? 'T').split('T');
  const minutes = job.estimatedMinutes ?? 0;
  return {
    orderId: job.orderId, printerId: String(job.printerId), date, time,
    hours: String(Math.floor(minutes / 60)), minutes: String(minutes % 60), note: job.note,
  };
}

/**
 * The body of an edit: only the fields whose request value differs from the one the form started from, so an edit
 * never writes back a value another request changed meanwhile. Empty when nothing changed.
 */
export function planChanges(draft: PlanDraft, initial: PlanDraft): Record<string, unknown> {
  const before = planRequest(initial);
  return Object.fromEntries(Object.entries(planRequest(draft)).filter(([key, value]) => value !== before[key]));
}

/** The body of a plan or edit request. A missing date or time goes as null for the API to name. */
export function planRequest(draft: PlanDraft): Record<string, unknown> {
  return {
    printerId: draft.printerId ? Number(draft.printerId) : null,
    plannedStart: draft.date && draft.time ? `${draft.date}T${draft.time}` : null,
    estimatedMinutes: draftMinutes(draft.hours, draft.minutes),
    note: draft.note,
  };
}
