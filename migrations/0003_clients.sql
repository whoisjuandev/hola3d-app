-- Clients: an order now points to a client record instead of carrying the client as loose text.

CREATE TABLE clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',             -- as written; the WhatsApp link uses its digits
  instagram TEXT NOT NULL DEFAULT '',         -- handle without the leading '@'
  email TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- SQLite cannot add a NOT NULL column without a default, so client_id is nullable; the app always sets it.
-- The old orders.client text column stays: SQLite cannot cheaply drop it and it holds the names backfilled
-- below. New code reads the name through the client.
ALTER TABLE orders ADD COLUMN client_id INTEGER REFERENCES clients (id);

-- One client per distinct client text, created when its first order was, in that order.
INSERT INTO clients (name, created_at, updated_at)
SELECT TRIM(client), MIN(created_at), MIN(created_at)
FROM orders
GROUP BY TRIM(client)
ORDER BY MIN(created_at), TRIM(client);

UPDATE orders SET client_id = (SELECT id FROM clients WHERE clients.name = TRIM(orders.client));

CREATE INDEX orders_client ON orders (client_id);
