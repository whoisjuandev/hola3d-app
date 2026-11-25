-- Workshop cost settings for the calculator: one row (id 1). Money is whole pesos; percentages allow two decimals.

CREATE TABLE cost_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  kwh_price INTEGER NOT NULL CHECK (kwh_price >= 0),                          -- pesos per kWh
  labour_per_hour INTEGER NOT NULL CHECK (labour_per_hour >= 0),              -- pesos per hour of prep and post-processing
  failure_percent REAL NOT NULL CHECK (failure_percent >= 0 AND failure_percent <= 100),
  margin_percent REAL NOT NULL CHECK (margin_percent >= 0 AND margin_percent <= 1000),
  monthly_fixed_costs INTEGER NOT NULL CHECK (monthly_fixed_costs >= 0),      -- spread over the monthly print hours
  monthly_print_hours INTEGER NOT NULL CHECK (monthly_print_hours > 0),
  packaging_cost INTEGER NOT NULL CHECK (packaging_cost >= 0),                -- what a new calculator line starts with
  rounding_step INTEGER NOT NULL DEFAULT 100 CHECK (rounding_step >= 1),      -- final prices go up to a multiple of it
  commission_percent REAL NOT NULL DEFAULT 0 CHECK (commission_percent >= 0 AND commission_percent < 100),
  updated_at TEXT                                                             -- null until the owners save them
);

-- Starting values for a small Argentine workshop (late 2026). Same as DEFAULT_COST_SETTINGS in shared/cost-settings.ts.
INSERT INTO cost_settings (id, kwh_price, labour_per_hour, failure_percent, margin_percent, monthly_fixed_costs,
  monthly_print_hours, packaging_cost, rounding_step, commission_percent, updated_at)
VALUES (1, 200, 6000, 10, 50, 120000, 200, 800, 100, 0, NULL);
