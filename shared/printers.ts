// Printer domain shared by the Worker API and the React app.
import { asBody, readInteger, readText, type Errors } from './fields';
import type { ValidationResult } from './orders';

export const PRINTER_STATUSES = ['activa', 'en_servicio', 'fuera_de_uso'] as const;
export type PrinterStatus = (typeof PRINTER_STATUSES)[number];

export const PRINTER_STATUS_LABEL: Record<PrinterStatus, string> = {
  activa: 'Activa',
  en_servicio: 'En servicio',
  fuera_de_uso: 'Fuera de uso',
};

export interface Printer {
  id: number;
  name: string;
  model: string;
  purchasePrice: number; // whole pesos
  lifetimeHours: number; // expected lifetime in print hours, at least 1
  powerWatts: number; // average draw while printing
  printMinutes: number; // accumulated; finished print jobs add to it
  status: PrinterStatus;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export type PrinterInput = Omit<Printer, 'id' | 'createdAt' | 'updatedAt'>;

export function isPrinterStatus(value: unknown): value is PrinterStatus {
  return typeof value === 'string' && (PRINTER_STATUSES as readonly string[]).includes(value);
}

/** Validate a printer for create or update. Error messages are shown to the owners as is. */
export function validatePrinter(input: unknown): ValidationResult<PrinterInput> {
  const errors: Errors = {};
  const body = asBody(input);

  const name = readText(body, errors, 'name', 80, true);
  const model = readText(body, errors, 'model', 80, false);
  const purchasePrice = readInteger(body, errors, 'purchasePrice', 0, 'Poné el precio en pesos, sin centavos.');
  const lifetimeHours = readInteger(body, errors, 'lifetimeHours', 1, 'Poné las horas de vida útil: un número entero mayor que 0.');
  const powerWatts = readInteger(body, errors, 'powerWatts', 0, 'Poné el consumo en watts, sin decimales.');
  const printMinutes = readInteger(body, errors, 'printMinutes', 0, 'Los minutos impresos van sin decimales, desde 0.', 0);
  const status = body.status == null || body.status === '' ? 'activa' : body.status;
  if (!isPrinterStatus(status)) errors.status = 'Elegí un estado.';
  const note = readText(body, errors, 'note', 1000, false);

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name, model, note,
      purchasePrice: purchasePrice as number,
      lifetimeHours: lifetimeHours as number,
      powerWatts: powerWatts as number,
      printMinutes: printMinutes as number,
      status: status as PrinterStatus,
    },
  };
}

export function printHours(printer: Pick<Printer, 'printMinutes'>): number {
  return printer.printMinutes / 60;
}

/** Machine wear in pesos per print hour: purchase price ÷ expected lifetime hours. Not rounded. */
export function wearCostPerHour(printer: Pick<Printer, 'purchasePrice' | 'lifetimeHours'>): number {
  return printer.purchasePrice / printer.lifetimeHours;
}
