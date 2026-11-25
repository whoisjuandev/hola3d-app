import type { CostSettings, CostSettingsInput } from '../../shared/cost-settings';

/** Port: what the cost settings routes need from storage. There is one record, or none yet. */
export interface CostSettingsRepository {
  get(): Promise<CostSettings | null>;
  save(input: CostSettingsInput): Promise<CostSettings>;
}

interface CostSettingsRow {
  kwh_price: number;
  labour_per_hour: number;
  failure_percent: number;
  margin_percent: number;
  monthly_fixed_costs: number;
  monthly_print_hours: number;
  packaging_cost: number;
  rounding_step: number;
  commission_percent: number;
  updated_at: string | null;
}

function toSettings(row: CostSettingsRow): CostSettings {
  return {
    kwhPrice: row.kwh_price,
    labourPerHour: row.labour_per_hour,
    failurePercent: row.failure_percent,
    marginPercent: row.margin_percent,
    monthlyFixedCosts: row.monthly_fixed_costs,
    monthlyPrintHours: row.monthly_print_hours,
    packagingCost: row.packaging_cost,
    roundingStep: row.rounding_step,
    commissionPercent: row.commission_percent,
    updatedAt: row.updated_at,
  };
}

/** Adapter: D1 storage. The single row has id 1; saving creates it if a database lacks it. */
export function d1CostSettingsRepository(db: D1Database): CostSettingsRepository {
  return {
    async get() {
      const row = await db.prepare('SELECT * FROM cost_settings WHERE id = 1').first<CostSettingsRow>();
      return row ? toSettings(row) : null;
    },

    async save(input) {
      const row = await db
        .prepare(
          `INSERT INTO cost_settings (id, kwh_price, labour_per_hour, failure_percent, margin_percent, monthly_fixed_costs,
             monthly_print_hours, packaging_cost, rounding_step, commission_percent, updated_at)
           VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (id) DO UPDATE SET
             kwh_price = excluded.kwh_price, labour_per_hour = excluded.labour_per_hour,
             failure_percent = excluded.failure_percent, margin_percent = excluded.margin_percent,
             monthly_fixed_costs = excluded.monthly_fixed_costs, monthly_print_hours = excluded.monthly_print_hours,
             packaging_cost = excluded.packaging_cost, rounding_step = excluded.rounding_step,
             commission_percent = excluded.commission_percent, updated_at = excluded.updated_at
           RETURNING *`,
        )
        .bind(
          input.kwhPrice, input.labourPerHour, input.failurePercent, input.marginPercent, input.monthlyFixedCosts,
          input.monthlyPrintHours, input.packagingCost, input.roundingStep, input.commissionPercent, new Date().toISOString(),
        )
        .first<CostSettingsRow>();
      if (!row) throw new Error('Upsert returned no row');
      return toSettings(row);
    },
  };
}

/** Adapter: in-memory storage for tests. */
export function memoryCostSettingsRepository(seed: CostSettings | null = null): CostSettingsRepository {
  let current = seed ? { ...seed } : null;
  return {
    async get() {
      return current;
    },
    async save(input) {
      current = { ...input, updatedAt: new Date().toISOString() };
      return current;
    },
  };
}
