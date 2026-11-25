import type { Project, ProjectStatus } from '../../shared/projects';
import type { MemoryTables, StoredProject } from '../memory';

/** What storage needs to save a project: the validated request with its client already resolved to an id. */
export interface ProjectDraft {
  name: string;
  clientId: number;
  status: ProjectStatus;
  dueDate: string | null;
  note: string;
}

/** Port: what the project routes need from storage. */
export interface ProjectRepository {
  /** Active projects first, then by due date (undated last) and name. */
  list(filter?: { clientId?: number }): Promise<Project[]>;
  get(id: number): Promise<Project | null>;
  /** `draft.clientId` must be an existing client. */
  create(draft: ProjectDraft): Promise<Project>;
  /**
   * Write every field of the draft. The client changes only while the project has no orders, so its orders always
   * stay with its client; returns null having written nothing when that fails or the project does not exist.
   */
  update(id: number, draft: ProjectDraft): Promise<Project | null>;
}

interface ProjectRow {
  id: number;
  name: string;
  client_id: number;
  client_name: string | null;
  status: string;
  due_date: string | null;
  note: string;
  created_at: string;
  updated_at: string;
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    clientId: row.client_id,
    client: row.client_name ?? '',
    status: row.status as ProjectStatus,
    dueDate: row.due_date,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT = 'SELECT projects.*, clients.name AS client_name FROM projects LEFT JOIN clients ON clients.id = projects.client_id';
const ORDER_BY = "ORDER BY projects.status = 'terminado', projects.due_date IS NULL, projects.due_date, projects.name COLLATE NOCASE, projects.id";

/** Adapter: D1 storage. */
export function d1ProjectRepository(db: D1Database): ProjectRepository {
  const get = async (id: number) => {
    const row = await db.prepare(`${SELECT} WHERE projects.id = ?`).bind(id).first<ProjectRow>();
    return row ? toProject(row) : null;
  };

  return {
    async list(filter = {}) {
      const statement = filter.clientId === undefined
        ? db.prepare(`${SELECT} ${ORDER_BY}`)
        : db.prepare(`${SELECT} WHERE projects.client_id = ? ${ORDER_BY}`).bind(filter.clientId);
      const { results } = await statement.all<ProjectRow>();
      return results.map(toProject);
    },

    get,

    async create(draft) {
      const now = new Date().toISOString();
      const row = await db
        .prepare(
          `INSERT INTO projects (name, client_id, status, due_date, note, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           RETURNING id`,
        )
        .bind(draft.name, draft.clientId, draft.status, draft.dueDate, draft.note, now, now)
        .first<{ id: number }>();
      const project = row && (await get(row.id));
      if (!project) throw new Error('Insert returned no row');
      return project;
    },

    async update(id, draft) {
      // The guard repeats the route's check in SQL, so an order assigned in between keeps the project's client.
      const row = await db
        .prepare(
          `UPDATE projects SET name = ?1, client_id = ?2, status = ?3, due_date = ?4, note = ?5, updated_at = ?6
           WHERE id = ?7 AND (client_id = ?2 OR NOT EXISTS (SELECT 1 FROM orders WHERE orders.project_id = projects.id))
           RETURNING id`,
        )
        .bind(draft.name, draft.clientId, draft.status, draft.dueDate, draft.note, new Date().toISOString(), id)
        .first<{ id: number }>();
      return row ? get(row.id) : null;
    },
  };
}

/** Active first, then by due date (undated last), name and id, as the D1 adapter sorts them. */
function compare(a: StoredProject, b: StoredProject): number {
  const finished = Number(a.status === 'terminado') - Number(b.status === 'terminado');
  if (finished) return finished;
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }) || a.id - b.id;
}

/** Adapter: in-memory storage for tests. Shares its tables with the in-memory client and order repositories. */
export function memoryProjectRepository(tables: MemoryTables): ProjectRepository {
  const { projects, clients, orders } = tables;
  const read = (p: StoredProject): Project => ({ ...p, client: clients.get(p.clientId)?.name ?? '' });

  return {
    async list(filter = {}) {
      return [...projects.values()]
        .filter((p) => filter.clientId === undefined || p.clientId === filter.clientId)
        .sort(compare)
        .map(read);
    },
    async get(id) {
      const project = projects.get(id);
      return project ? read(project) : null;
    },
    async create(draft) {
      const id = Math.max(0, ...projects.keys()) + 1;
      const now = new Date().toISOString();
      const project: StoredProject = { ...draft, id, createdAt: now, updatedAt: now };
      projects.set(id, project);
      return read(project);
    },
    async update(id, draft) {
      // No await in here, so nothing can run between the check and the write.
      const current = projects.get(id);
      if (!current) return null;
      if (draft.clientId !== current.clientId && [...orders.values()].some((o) => o.projectId === id)) return null;
      const updated: StoredProject = { ...current, ...draft, updatedAt: new Date().toISOString() };
      projects.set(id, updated);
      return read(updated);
    },
  };
}
