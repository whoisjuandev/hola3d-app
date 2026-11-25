import type { CalendarEvent } from '../shared/calendar-events';
import type { Client } from '../shared/clients';
import type { Order } from '../shared/orders';
import type { PrintJob } from '../shared/print-jobs';
import type { Project } from '../shared/projects';
import type { Printer } from '../shared/printers';
import type { Quote } from '../shared/quotes';
import type { ServiceLog, ServiceTask } from '../shared/service';
import type { Spool } from '../shared/spools';

/** An order as stored: its real cost is worked out from its print jobs and its project's name read when it is read. */
export type StoredOrder = Omit<Order, 'realCost' | 'realProfit' | 'project'>;

/** A project as stored: its client by id only, the client's name read when it is read. */
export type StoredProject = Omit<Project, 'client'>;

/**
 * A print job as stored: its printer and spools by id only, their names read when it is read. Its cost is stored as logged.
 * `submissionKey` is the key of the save that logged or finished it, if one was sent; it is not part of the API's job.
 */
export type StoredPrintJob = Omit<PrintJob, 'printer' | 'filaments'> & { filaments: { spoolId: number; grams: number }[]; submissionKey?: string | null };

/** A service task as stored: its printer by id only, the printer's name and minutes read when it is read. */
export type StoredServiceTask = Omit<ServiceTask, 'printer' | 'printerMinutes'>;

/** A service log entry as stored: its printer and task by id only, their names read when it is read. */
export type StoredServiceLog = Omit<ServiceLog, 'printer' | 'task'>;

/**
 * In-memory tables for the test adapters of modules that read each other's rows, like orders and their
 * clients. Orders and quotes keep their client id; their client name is read from `clients`, as in D1.
 * Print jobs change printer minutes and spool grams; orders add up the costs their jobs stored. Service tasks read the
 * minutes of their printer. Orders keep their project id; their project name is read from `projects`.
 */
export interface MemoryTables {
  clients: Map<number, Client>;
  orders: Map<string, StoredOrder>;
  quotes: Map<number, Quote>;
  printers: Map<number, Printer>;
  spools: Map<number, Spool>;
  printJobs: Map<number, StoredPrintJob>;
  /** Highest print job id ever given, kept with the tables so every adapter over them shares it (as AUTOINCREMENT). */
  printJobSeq: { last: number };
  serviceTasks: Map<number, StoredServiceTask>;
  serviceLogs: Map<number, StoredServiceLog>;
  projects: Map<number, StoredProject>;
  calendarEvents: Map<number, CalendarEvent>;
  /** Highest calendar event id ever given, so a deleted event's id is never given again (as AUTOINCREMENT). */
  calendarEventSeq: { last: number };
}

export interface WorkshopSeed {
  printers?: Printer[];
  spools?: Spool[];
  printJobs?: StoredPrintJob[];
  serviceTasks?: StoredServiceTask[];
  serviceLogs?: StoredServiceLog[];
  projects?: StoredProject[];
  calendarEvents?: CalendarEvent[];
}

export function memoryTables(clients: Client[] = [], orders: StoredOrder[] = [], quotes: Quote[] = [], workshop: WorkshopSeed = {}): MemoryTables {
  return {
    clients: new Map(clients.map((c) => [c.id, { ...c }])),
    orders: new Map(orders.map((o) => {
      const { realCost: _cost, realProfit: _profit, project: _project, ...stored } = o as Order;
      return [o.id, stored];
    })),
    quotes: new Map(quotes.map((q) => [q.id, structuredClone(q)])),
    printers: new Map((workshop.printers ?? []).map((p) => [p.id, { ...p }])),
    spools: new Map((workshop.spools ?? []).map((s) => [s.id, { ...s }])),
    printJobs: new Map((workshop.printJobs ?? []).map((j) => [j.id, structuredClone(j)])),
    printJobSeq: { last: Math.max(0, ...(workshop.printJobs ?? []).map((j) => j.id)) },
    serviceTasks: new Map((workshop.serviceTasks ?? []).map((t) => [t.id, { ...t }])),
    serviceLogs: new Map((workshop.serviceLogs ?? []).map((l) => [l.id, { ...l }])),
    projects: new Map((workshop.projects ?? []).map((p) => [p.id, { ...p }])),
    calendarEvents: new Map((workshop.calendarEvents ?? []).map((e) => [e.id, { ...e }])),
    calendarEventSeq: { last: Math.max(0, ...(workshop.calendarEvents ?? []).map((e) => e.id)) },
  };
}
