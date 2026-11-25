-- Projects: several orders of one client grouped as one job, like a school's robotics kit. An order belongs to at most
-- one project, always one of its own client's (the app checks it in the same statement that writes the link).

CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  client_id INTEGER NOT NULL REFERENCES clients (id),
  status TEXT NOT NULL DEFAULT 'activo' CHECK (status IN ('activo', 'terminado')),
  due_date TEXT,                                -- YYYY-MM-DD
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX projects_client ON projects (client_id, status);

-- Null: the order is in no project.
ALTER TABLE orders ADD COLUMN project_id INTEGER REFERENCES projects (id);

CREATE INDEX orders_project ON orders (project_id);
