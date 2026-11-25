-- Quick quotes: a quote saved for a recipient written as text (name and phone), with no client record until it is
-- accepted. It may have no validity date, and it records whether its print view shows the cost breakdown.
--
-- client_id and valid_until were NOT NULL in 0005 and SQLite cannot relax that in place, so the table is rebuilt: create
-- the new one, copy every row with its id and number, drop the old one, rename the new one and recreate its index.
-- orders.quote_id still names "quotes", so after the rename it points to the same ids in the new table. The new table is
-- renamed (never the old one), because renaming a table rewrites the foreign keys that name it.
--
-- D1 applies a migration in one transaction with foreign keys on. Dropping the old table deletes its rows first, which
-- the orders that point to them would refuse. Deferring the foreign keys lets the drop through; SQLite still counts
-- those orders as pending, and switching the deferral off at the end clears that count, so the commit goes through.
-- No order is left pointing to a missing quote: the rename puts the same ids back (worker/quotes/d1.test.ts checks it).
PRAGMA defer_foreign_keys = on;

CREATE TABLE quotes_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number INTEGER NOT NULL UNIQUE,              -- sequential, shown as 'P-0001'
  client_id INTEGER REFERENCES clients (id),   -- null for a quick quote until it is accepted
  recipient_name TEXT NOT NULL DEFAULT '' CHECK (length(recipient_name) <= 80), -- who a quick quote is for, as text
  recipient_phone TEXT NOT NULL DEFAULT '',    -- as written, for WhatsApp; '' when not given
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'borrador'
    CHECK (status IN ('borrador', 'enviado', 'aceptado', 'rechazado')),
  valid_until TEXT,                            -- YYYY-MM-DD; null means no deadline, so it never expires
  show_breakdown INTEGER NOT NULL DEFAULT 0 CHECK (show_breakdown IN (0, 1)), -- the print view shows the costs
  -- The calculator input and its result (lines, breakdown, the settings used) as JSON, exactly as they were
  -- when the quote was saved. Never recalculated: later changes to settings, spools or printers do not reach them.
  input_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  total INTEGER NOT NULL CHECK (total >= 0),   -- whole pesos, the result's total
  note TEXT NOT NULL DEFAULT '',               -- for the client: print view and WhatsApp message
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (client_id IS NOT NULL OR length(trim(recipient_name)) > 0)
);

-- The new table goes on from the old one's id sequence (above the highest id when quotes were deleted), so no id is
-- given twice. Copying the rows raises it further if needed; the rename carries it over to "quotes".
INSERT INTO sqlite_sequence (name, seq) SELECT 'quotes_new', seq FROM sqlite_sequence WHERE name = 'quotes';

INSERT INTO quotes_new (id, number, client_id, title, status, valid_until, input_json, result_json, total, note, created_at, updated_at)
SELECT id, number, client_id, title, status, valid_until, input_json, result_json, total, note, created_at, updated_at FROM quotes;

DROP TABLE quotes;

ALTER TABLE quotes_new RENAME TO quotes;

CREATE INDEX quotes_client ON quotes (client_id);

PRAGMA defer_foreign_keys = off;
