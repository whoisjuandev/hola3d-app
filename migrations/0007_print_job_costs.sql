-- The cost of a print job is frozen when it is logged: what the owners spent on it besides printing (labour minutes
-- and an extra cost in pesos), and the six cost terms worked out with the printer, spool prices and cost settings of
-- that moment. An order's real cost is the sum of the stored terms of its jobs, so later price changes never change it.

ALTER TABLE print_jobs ADD COLUMN labour_minutes INTEGER NOT NULL DEFAULT 0 CHECK (labour_minutes >= 0);  -- prep and post-processing
ALTER TABLE print_jobs ADD COLUMN extra_cost INTEGER NOT NULL DEFAULT 0 CHECK (extra_cost >= 0);          -- pesos: packaging, supplies

-- The stored terms, whole pesos. All 0 for a planned job.
ALTER TABLE print_jobs ADD COLUMN cost_material INTEGER NOT NULL DEFAULT 0 CHECK (cost_material >= 0);
ALTER TABLE print_jobs ADD COLUMN cost_energy INTEGER NOT NULL DEFAULT 0 CHECK (cost_energy >= 0);
ALTER TABLE print_jobs ADD COLUMN cost_machine_wear INTEGER NOT NULL DEFAULT 0 CHECK (cost_machine_wear >= 0);
ALTER TABLE print_jobs ADD COLUMN cost_fixed INTEGER NOT NULL DEFAULT 0 CHECK (cost_fixed >= 0);
ALTER TABLE print_jobs ADD COLUMN cost_labour INTEGER NOT NULL DEFAULT 0 CHECK (cost_labour >= 0);
ALTER TABLE print_jobs ADD COLUMN cost_extra INTEGER NOT NULL DEFAULT 0 CHECK (cost_extra >= 0);

-- Freeze the jobs logged before this migration with the printers, spools and settings as they are now. Same formula
-- and rounding as `jobCost` in shared/print-jobs.ts (each term rounded on its own; no labour or extra was logged yet).
-- The settings row is created by 0004; the fallbacks are DEFAULT_COST_SETTINGS in case a database lacks it.
UPDATE print_jobs SET
  cost_material = (
    SELECT CAST(ROUND(COALESCE(SUM(f.grams * (s.price * 1.0 / s.net_grams)), 0)) AS INTEGER)
    FROM print_job_filaments f JOIN spools s ON s.id = f.spool_id
    WHERE f.job_id = print_jobs.id
  ),
  cost_energy = (
    SELECT CAST(ROUND((p.power_watts / 1000.0) * (print_jobs.actual_minutes / 60.0)
      * COALESCE((SELECT kwh_price FROM cost_settings WHERE id = 1), 200)) AS INTEGER)
    FROM printers p WHERE p.id = print_jobs.printer_id
  ),
  cost_machine_wear = (
    SELECT CAST(ROUND(((print_jobs.actual_minutes / 60.0) * p.purchase_price) / p.lifetime_hours) AS INTEGER)
    FROM printers p WHERE p.id = print_jobs.printer_id
  ),
  cost_fixed = CAST(ROUND(((actual_minutes / 60.0) * COALESCE((SELECT monthly_fixed_costs FROM cost_settings WHERE id = 1), 120000))
    / COALESCE((SELECT monthly_print_hours FROM cost_settings WHERE id = 1), 200)) AS INTEGER)
WHERE status IN ('terminada', 'fallida') AND actual_minutes IS NOT NULL;
