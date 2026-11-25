import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import type { Order } from '../../../shared/orders';
import { projectTotals, type ProjectSummary } from '../../../shared/projects';
import { Icon } from '../../ui/Icon';
import { fetchClient } from '../clients/api';
import { ClientOrderRow } from '../clients/components';
import { ErrorBanner } from '../orders/components';
import { isoDate, money } from '../orders/format';
import { fetchProject, setOrderProject, updateProject } from './api';
import { ProjectDialog, ProjectDue, ProjectMoney, ProjectProgress, ProjectStatusChip } from './components';
import '../orders/orders.css';
import '../clients/clients.css';
import '../quotes/quotes.css';
import './projects.css';

type State =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; project: ProjectSummary; orders: Order[] };

export function ProjectPage() {
  const id = Number(useParams().id);
  const uid = useId();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [today] = useState(() => isoDate(new Date()));
  // The client's orders that are in no project, to add here. Loaded on their own: the page works without them.
  const [loose, setLoose] = useState<Order[] | null>(null);
  const [picked, setPicked] = useState('');

  useEffect(() => {
    let alive = true;
    fetchProject(id).then(
      ({ project, orders }) => { if (alive) setState({ status: 'ready', project, orders }); },
      (e: Error) => { if (alive) setState({ status: 'error', error: e.message }); },
    );
    return () => { alive = false; };
  }, [id, attempt]);

  const clientId = state.status === 'ready' ? state.project.clientId : null;
  useEffect(() => {
    if (clientId === null) return;
    let alive = true;
    fetchClient(clientId).then(
      ({ orders }) => { if (alive) setLoose(orders.filter((o) => o.projectId === null)); },
      () => { if (alive) setLoose([]); },
    );
    return () => { alive = false; };
  }, [clientId, attempt]);

  const retry = () => { setState({ status: 'loading' }); setAttempt((n) => n + 1); };

  if (state.status !== 'ready') {
    return (
      <div className="project-page">
        <Link to="/proyectos" className="back-link"><Icon name="back" size={18} />Proyectos</Link>
        {state.status === 'loading' && <div className="orders__skeleton" aria-hidden="true"><span /><span /></div>}
        {state.status === 'error' && <ErrorBanner text={state.error} onRetry={retry} />}
      </div>
    );
  }

  const { project, orders } = state;
  const finished = project.status === 'terminado';

  /** Run one action, showing its error under the header. */
  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** The project's orders changed here: its totals follow them. */
  const withOrders = (next: Order[]) =>
    setState((s) => (s.status === 'ready' ? { ...s, orders: next, project: { ...s.project, ...projectTotals(next) } } : s));

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!picked) return;
    void act(async () => {
      const order = await setOrderProject(picked, project.id);
      withOrders([...orders, order]);
      setLoose((list) => list?.filter((o) => o.id !== order.id) ?? null);
      setPicked('');
    });
  };

  const remove = (order: Order) => void act(async () => {
    const saved = await setOrderProject(order.id, null);
    withOrders(orders.filter((o) => o.id !== saved.id));
    setLoose((list) => (list ? [...list, saved] : list));
  });

  const setStatus = (status: 'activo' | 'terminado') => void act(async () => {
    const saved = await updateProject(project.id, { status });
    setState((s) => (s.status === 'ready' ? { ...s, project: saved } : s));
  });

  return (
    <div className="project-page">
      <Link to="/proyectos" className="back-link"><Icon name="back" size={18} />Proyectos</Link>

      <header className="clients__head">
        <div>
          <p className="quote-page__number">Proyecto <ProjectStatusChip status={project.status} /></p>
          <h1 className="page-title">{project.name}</h1>
          <p className="page-sub quote-page__sub">
            <span>Para <Link to={`/clientes/${project.clientId}`}>{project.client}</Link></span>
            <ProjectDue project={project} today={today} />
          </p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={() => setEditing(true)}>Editar</button>
      </header>

      <div className="quote-actions" role="group" aria-label="Acciones">
        {finished
          ? <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setStatus('activo')}>Reabrir proyecto</button>
          : <button type="button" className="btn" disabled={busy} onClick={() => setStatus('terminado')}><Icon name="check" />Marcar como terminado</button>}
      </div>

      {actionError && <ErrorBanner text={actionError} onDismiss={() => setActionError(null)} />}

      <div className="client-page__top">
        <section className="card client-page__contact" aria-labelledby="avance">
          <h2 id="avance" className="client-page__section">Avance</h2>
          <ProjectProgress totals={project} />
          {project.note && <p className="client-page__note">{project.note}</p>}
        </section>
        <section className="card client-page__money" aria-label="Cuentas">
          <ProjectMoney totals={project} big />
          <p className="muted">Precio y señas de todos los pedidos del proyecto. Saldo: lo que falta cobrar de los pedidos sin pagar, descontada la seña.</p>
        </section>
      </div>

      <section aria-labelledby="pedidos-proyecto" className="client-page__orders">
        <h2 id="pedidos-proyecto" className="client-page__section">Pedidos</h2>
        {orders.length === 0
          ? <p className="lane__empty">Este proyecto todavía no tiene pedidos. Agregá uno de {project.client} abajo.</p>
          : (
            <ul className="client-orders">
              {orders.map((o) => (
                <ClientOrderRow key={o.id} order={o} today={today} action={(
                  <button type="button" className="project-order__remove" disabled={busy} onClick={() => remove(o)}
                    aria-label={`Sacar el pedido #${o.id} del proyecto`}>
                    Sacar del proyecto
                  </button>
                )} />
              ))}
            </ul>
          )}

        <form className="card project-add" onSubmit={add}>
          <div className="field">
            <label className="field__label" htmlFor={`${uid}-add`}>Agregar un pedido de {project.client}</label>
            <select id={`${uid}-add`} className="field__control" value={picked} disabled={!loose?.length}
              onChange={(e) => setPicked(e.target.value)} aria-describedby={`${uid}-add-hint`}>
              <option value="">{loose === null ? 'Cargando pedidos…' : loose.length ? 'Elegí un pedido' : 'No hay pedidos sueltos'}</option>
              {loose?.map((o) => <option key={o.id} value={o.id}>#{o.id} · {o.item} · {money(o.price)}</option>)}
            </select>
          </div>
          <button type="submit" className="btn" disabled={busy || !picked}><Icon name="plus" />Agregar</button>
          <span id={`${uid}-add-hint`} className="muted project-add__hint">
            Solo pedidos de este cliente que no están en otro proyecto. Para uno nuevo, cargalo en <Link to="/pedidos">Pedidos</Link> y elegí este proyecto.
          </span>
        </form>
      </section>

      {editing && (
        <ProjectDialog
          project={project}
          onCreate={async () => undefined}
          onUpdate={async (projectId, changes) => {
            const saved = await updateProject(projectId, changes);
            setState((s) => (s.status === 'ready' ? { ...s, project: saved } : s));
          }}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
