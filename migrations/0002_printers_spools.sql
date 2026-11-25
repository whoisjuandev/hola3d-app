-- Printers and filament spools. Money is whole pesos, weights whole grams, print time minutes.

CREATE TABLE printers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  purchase_price INTEGER NOT NULL CHECK (purchase_price >= 0),
  lifetime_hours INTEGER NOT NULL CHECK (lifetime_hours > 0),   -- expected lifetime in print hours
  power_watts INTEGER NOT NULL CHECK (power_watts >= 0),        -- average draw while printing
  print_minutes INTEGER NOT NULL DEFAULT 0 CHECK (print_minutes >= 0),  -- accumulated; print jobs add to it
  status TEXT NOT NULL DEFAULT 'activa'
    CHECK (status IN ('activa', 'en_servicio', 'fuera_de_uso')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE spools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  material TEXT NOT NULL,                     -- free text: PLA, PETG, TPU…
  color_name TEXT NOT NULL,
  color_hex TEXT NOT NULL,                    -- '#rrggbb'
  brand TEXT NOT NULL DEFAULT '',
  net_grams INTEGER NOT NULL CHECK (net_grams > 0),
  -- print jobs subtract from it; the bounds also guard those writes
  remaining_grams INTEGER NOT NULL CHECK (remaining_grams >= 0 AND remaining_grams <= net_grams),
  price INTEGER NOT NULL CHECK (price >= 0),
  low_stock_grams INTEGER NOT NULL DEFAULT 150 CHECK (low_stock_grams >= 0),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX spools_material ON spools (material);
