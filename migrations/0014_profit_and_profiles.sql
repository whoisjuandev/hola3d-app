-- Profit by multiplier and saved calculator profiles.

-- How a new calculation sets its profit: a percentage of the production cost (margin_percent, as before) or a
-- multiplier of it. A multiplier of m is a margin of (m − 1) × 100 %, so 1 to 11 matches the 0 to 1000 % range.
ALTER TABLE cost_settings ADD COLUMN profit_mode TEXT NOT NULL DEFAULT 'porcentaje'
  CHECK (profit_mode IN ('porcentaje', 'multiplicador'));
ALTER TABLE cost_settings ADD COLUMN profit_multiplier REAL NOT NULL DEFAULT 3
  CHECK (profit_multiplier >= 1 AND profit_multiplier <= 11);
-- The multipliers the calculator offers as buttons: a JSON array of 1 to 8 {"name", "multiplier"}, names unique.
ALTER TABLE cost_settings ADD COLUMN profit_shortcuts_json TEXT NOT NULL
  DEFAULT '[{"name":"Mayorista","multiplier":3},{"name":"Minorista","multiplier":4},{"name":"Llaveros","multiplier":5}]'
  CHECK (json_valid(profit_shortcuts_json) AND json_array_length(profit_shortcuts_json) BETWEEN 1 AND 8);

-- The calculator's input saved under a name to load again. The input is JSON as the calculator sends it, printer and
-- spool ids included; a printer or spool deleted later is left to choose again when the profile is loaded.
CREATE TABLE calc_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(name) BETWEEN 1 AND 60),
  input_json TEXT NOT NULL CHECK (json_valid(input_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
