// Workshop cost settings, shared by the Worker API and the calculator. One record for the whole shop.
import { asBody, readInteger, type Body, type Errors } from './fields';
import type { ValidationResult } from './orders';

export interface CostSettingsInput {
  kwhPrice: number; // whole pesos per kWh
  labourPerHour: number; // whole pesos per hour of preparation and post-processing
  failurePercent: number; // 0 to 100, at most two decimals; applied to material, energy and machine wear
  marginPercent: number; // 0 to 1000, at most two decimals; applied to the production cost
  monthlyFixedCosts: number; // whole pesos: rent, internet, software… spread over the monthly print hours
  monthlyPrintHours: number; // whole hours, more than 0
  packagingCost: number; // whole pesos; the packaging a new calculator line starts with
  roundingStep: number; // whole pesos, at least 1; final prices go up to a multiple of it
  commissionPercent: number; // 0 to under 100, at most two decimals; a sales platform's cut (Mercado Libre)
}

export interface CostSettings extends CostSettingsInput {
  updatedAt: string | null; // null while the defaults have never been saved
}

/** Sensible starting values for a small Argentine workshop, late 2026. The owners adjust them. */
export const DEFAULT_COST_SETTINGS: CostSettingsInput = {
  kwhPrice: 200,
  labourPerHour: 6000,
  failurePercent: 10,
  marginPercent: 50,
  monthlyFixedCosts: 120000,
  monthlyPrintHours: 200,
  packagingCost: 800,
  roundingStep: 100,
  commissionPercent: 0,
};

/** A number from `min` with at most two decimals, below `max` (or up to it when `inclusiveMax`). */
function readPercent(body: Body, errors: Errors, key: string, max: number, inclusiveMax: boolean, message: string): number | null {
  const raw = body[key];
  const ok = typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 && (inclusiveMax ? raw <= max : raw < max)
    && Number(raw.toFixed(2)) === raw;
  if (ok) return raw;
  errors[key] = message;
  return null;
}

const PERCENT = 'Poné un porcentaje entre 0 y 100, con hasta dos decimales.';

/** Validate the whole settings record. Error messages are shown to the owners as is. */
export function validateCostSettings(input: unknown): ValidationResult<CostSettingsInput> {
  const errors: Errors = {};
  const body = asBody(input);

  const kwhPrice = readInteger(body, errors, 'kwhPrice', 0, 'Poné el precio del kWh en pesos, sin centavos.');
  const labourPerHour = readInteger(body, errors, 'labourPerHour', 0, 'Poné el valor de la hora en pesos, sin centavos.');
  const failurePercent = readPercent(body, errors, 'failurePercent', 100, true, PERCENT);
  const marginPercent = readPercent(body, errors, 'marginPercent', 1000, true, 'El margen va de 0 a 1000 %, con hasta dos decimales.');
  const monthlyFixedCosts = readInteger(body, errors, 'monthlyFixedCosts', 0, 'Poné los gastos fijos en pesos, sin centavos.');
  const monthlyPrintHours = readInteger(body, errors, 'monthlyPrintHours', 1, 'Poné las horas de impresión por mes: un número entero mayor que 0.');
  const packagingCost = readInteger(body, errors, 'packagingCost', 0, 'Poné el packaging en pesos, sin centavos.');
  const roundingStep = readInteger(body, errors, 'roundingStep', 1, 'El redondeo va en pesos: un número entero desde 1.');
  const commissionPercent = readPercent(body, errors, 'commissionPercent', 100, false, 'La comisión va de 0 a menos de 100 %, con hasta dos decimales.');

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      kwhPrice: kwhPrice as number,
      labourPerHour: labourPerHour as number,
      failurePercent: failurePercent as number,
      marginPercent: marginPercent as number,
      monthlyFixedCosts: monthlyFixedCosts as number,
      monthlyPrintHours: monthlyPrintHours as number,
      packagingCost: packagingCost as number,
      roundingStep: roundingStep as number,
      commissionPercent: commissionPercent as number,
    },
  };
}
