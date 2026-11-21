-- Orders: one row per customer order. Prices are whole pesos.
CREATE TABLE orders (
  id TEXT PRIMARY KEY,                       -- four-digit number, e.g. '0142'
  item TEXT NOT NULL,
  client TEXT NOT NULL,
  channel TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'nuevo'
    CHECK (stage IN ('nuevo', 'disenando', 'imprimiendo', 'listo', 'entregado')),
  due_date TEXT,                             -- YYYY-MM-DD
  due_time TEXT,                             -- HH:MM
  price INTEGER NOT NULL CHECK (price >= 0),
  deposit INTEGER CHECK (deposit IS NULL OR deposit >= 0),
  paid INTEGER NOT NULL DEFAULT 0 CHECK (paid IN (0, 1)),
  material TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX orders_stage ON orders (stage);
CREATE INDEX orders_due ON orders (due_date);
