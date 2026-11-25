-- Quotes: a calculator result saved for a client with its price frozen. Accepting one creates its orders.

CREATE TABLE quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number INTEGER NOT NULL UNIQUE,              -- sequential, shown as 'P-0001'
  client_id INTEGER NOT NULL REFERENCES clients (id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'borrador'
    CHECK (status IN ('borrador', 'enviado', 'aceptado', 'rechazado')),
  valid_until TEXT NOT NULL,                   -- YYYY-MM-DD
  -- The calculator input and its result (lines, breakdown, the settings used) as JSON, exactly as they were
  -- when the quote was saved. Never recalculated: later changes to settings, spools or printers do not reach them.
  input_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  total INTEGER NOT NULL CHECK (total >= 0),   -- whole pesos, the result's total
  note TEXT NOT NULL DEFAULT '',               -- for the client: print view and WhatsApp message
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX quotes_client ON quotes (client_id);

-- The quote an order was accepted from. Null for orders loaded by hand.
ALTER TABLE orders ADD COLUMN quote_id INTEGER REFERENCES quotes (id);

CREATE INDEX orders_quote ON orders (quote_id);
