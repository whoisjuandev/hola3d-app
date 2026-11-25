-- Machine service: recurring tasks per printer, due by print hours or days (whichever comes first), and a log of every
-- service with its parts and cost. Money is whole pesos, print time minutes, dates YYYY-MM-DD.

CREATE TABLE service_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  printer_id INTEGER NOT NULL REFERENCES printers (id),
  name TEXT NOT NULL,
  interval_hours INTEGER CHECK (interval_hours IS NULL OR interval_hours > 0),   -- every so many print hours
  interval_days INTEGER CHECK (interval_days IS NULL OR interval_days > 0),      -- every so many days
  -- When it was last done: the printer's print minutes at that moment and the date. Logging a service resets both.
  last_done_minutes INTEGER NOT NULL CHECK (last_done_minutes >= 0),
  last_done_date TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),                    -- 0: out of the plan, kept for the log
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (interval_hours IS NOT NULL OR interval_days IS NOT NULL)
);

CREATE INDEX service_tasks_printer ON service_tasks (printer_id, active);

CREATE TABLE service_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  printer_id INTEGER NOT NULL REFERENCES printers (id),
  task_id INTEGER REFERENCES service_tasks (id),                                 -- the task it completed, if any
  service_date TEXT NOT NULL,
  done TEXT NOT NULL,                                                            -- what was done
  parts TEXT NOT NULL DEFAULT '',
  cost INTEGER NOT NULL DEFAULT 0 CHECK (cost >= 0),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX service_logs_printer ON service_logs (printer_id, service_date);
