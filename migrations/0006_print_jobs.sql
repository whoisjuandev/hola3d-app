-- Print jobs on an order. Logging a finished job adds its minutes to the printer and takes its grams off each spool;
-- the order's real cost is worked out from its jobs. A job can also be planned before it prints (the calendar).

CREATE TABLE print_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,         -- never reused, so a logging batch can find its job as the highest id
  order_id TEXT NOT NULL REFERENCES orders (id),
  printer_id INTEGER NOT NULL REFERENCES printers (id),
  status TEXT NOT NULL CHECK (status IN ('planeada', 'terminada', 'fallida')),
  planned_start TEXT,                           -- YYYY-MM-DDTHH:MM, local time; for planned jobs
  estimated_minutes INTEGER CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),
  actual_minutes INTEGER CHECK (actual_minutes IS NULL OR actual_minutes > 0),
  result TEXT CHECK (result IS NULL OR result IN ('ok', 'fallida')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  -- A planned job has no outcome yet; a finished one has its minutes, and its result matches its status.
  CHECK (
    (status = 'planeada' AND actual_minutes IS NULL AND result IS NULL)
    OR (status = 'terminada' AND actual_minutes IS NOT NULL AND result = 'ok')
    OR (status = 'fallida' AND actual_minutes IS NOT NULL AND result = 'fallida')
  )
);

CREATE INDEX print_jobs_order ON print_jobs (order_id);
CREATE INDEX print_jobs_printer ON print_jobs (printer_id, planned_start);

-- Grams a job used from each spool. One row per spool and job.
CREATE TABLE print_job_filaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES print_jobs (id) ON DELETE CASCADE,
  spool_id INTEGER NOT NULL REFERENCES spools (id),
  grams INTEGER NOT NULL CHECK (grams > 0),
  UNIQUE (job_id, spool_id)
);

CREATE INDEX print_job_filaments_spool ON print_job_filaments (spool_id);
