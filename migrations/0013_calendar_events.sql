-- Hand-made calendar events: a delivery, a pickup, a meeting, a task or a reminder on a day, with an optional time and
-- note, that the owners mark done. They live next to what the calendar already reads from orders, projects, service
-- tasks and planned print jobs.

CREATE TABLE calendar_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('entrega', 'retiro', 'reunion', 'tarea', 'recordatorio')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  event_date TEXT NOT NULL,                     -- YYYY-MM-DD
  event_time TEXT,                              -- HH:MM; null for the whole day
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX calendar_events_date ON calendar_events (event_date, event_time);
