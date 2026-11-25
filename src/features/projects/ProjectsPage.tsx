import { useState } from 'react';
import type { ProjectStatus, ProjectSummary } from '../../../shared/projects';
import { Icon } from '../../ui/Icon';
import { useCollection } from '../../ui/useCollection';
import { PHONE_QUERY, useMediaQuery } from '../../ui/useMediaQuery';
import { ErrorBanner } from '../orders/components';
import { isoDate, money } from '../orders/format';
import { createProject, fetchProjects, updateProject } from './api';
import { ProjectCard, ProjectDialog } from './components';
import '../orders/orders.css';
import '../clients/clients.css';
import './projects.css';

type Filter = ProjectStatus | 'todos';

const FILTER_LABEL: Record<Filter, string> = { activo: 'Activos', terminado: 'Terminados', todos: 'Todos' };

export function ProjectsPage() {
  const { items: projects, status, error, load, add, replace } = useCollection(fetchProjects);
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [filter, setFilter] = useState<Filter>('activo');
  const [today] = useState(() => isoDate(new Date()));
  // undefined: closed; null: creating; a project: editing it.
  const [editing, setEditing] = useState<ProjectSummary | null | undefined>(undefined);

  const listed = filter === 'todos' ? projects : projects.filter((p) => p.status === filter);
  const active = projects.filter((p) => p.status === 'activo');
  const owed = active.reduce((sum, p) => sum + p.balanceOwed, 0);
  const summary = `${active.length} ${active.length === 1 ? 'activo' : 'activos'} · ${money(owed)} a cobrar`;
  const count = (f: Filter) => (f === 'todos' ? projects.length : projects.filter((p) => p.status === f).length);

  return (
    <div className="projects">
      <header className="clients__head">
        <div>
          <h1 className="page-title">Proyectos</h1>
          <p className="page-sub">{status === 'ready' ? summary : 'Cargando…'}</p>
        </div>
        {!isPhone && <button type="button" className="btn" onClick={() => setEditing(null)}><Icon name="plus" />Nuevo proyecto</button>}
      </header>

      {error && <ErrorBanner text={error} onRetry={() => void load()} />}

      {status === 'loading' && <div className="orders__skeleton" aria-hidden="true"><span /><span /><span /></div>}

      {status === 'ready' && projects.length > 0 && (
        <div className="pills-row" role="group" aria-label="Estado">
          {(['activo', 'terminado', 'todos'] as const).map((f) => (
            <button key={f} type="button" className="pill" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {FILTER_LABEL[f]}<span className="pill__count">{count(f)}</span>
            </button>
          ))}
        </div>
      )}

      {status === 'ready' && projects.length === 0 && (
        <section className="card empty">
          <div className="tape tape--sky" aria-hidden="true" />
          <p className="hand empty__title">Todavía no hay proyectos</p>
          <p className="muted">Un proyecto junta varios pedidos de un mismo cliente, como un kit con muchas piezas.</p>
          <button type="button" className="btn btn--sm" onClick={() => setEditing(null)}>Crear un proyecto</button>
        </section>
      )}

      {status === 'ready' && projects.length > 0 && listed.length === 0 && (
        <p className="lane__empty">Ningún proyecto {FILTER_LABEL[filter].toLowerCase()} por ahora.</p>
      )}

      {status === 'ready' && listed.length > 0 && (
        <div className="clients__grid">
          {listed.map((p) => <ProjectCard key={p.id} project={p} today={today} onEdit={() => setEditing(p)} />)}
        </div>
      )}

      {isPhone && editing === undefined && (
        <button type="button" className="btn fab" aria-label="Nuevo proyecto" onClick={() => setEditing(null)}><Icon name="plus" size={26} /></button>
      )}

      {editing !== undefined && (
        <ProjectDialog
          project={editing}
          onCreate={async (input) => add(await createProject(input))}
          onUpdate={async (id, changes) => replace(await updateProject(id, changes))}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}
