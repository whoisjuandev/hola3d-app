import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router';
import type { Order } from '../../../shared/orders';
import type { ProjectSummary } from '../../../shared/projects';
import { fetchClientProjects, setOrderProject } from '../projects/api';
import { projectChoices } from '../projects/format';

/** The order's project, with a link to it, and a picker to change or clear it among its client's active projects. */
export function OrderProject({ order, onOrderChange }: { order: Order; onOrderChange: (order: Order) => void }) {
  const uid = useId();
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (order.clientId === null) return;
    let alive = true;
    fetchClientProjects(order.clientId).then(
      (list) => { if (alive) setProjects(list); },
      (e: Error) => { if (alive) { setProjects([]); setError(`No se pudieron cargar los proyectos: ${e.message}`); } },
    );
    return () => { alive = false; };
  }, [order.clientId]);

  const choices = projectChoices(projects ?? [], order.clientId, order.projectId);
  // The current project shows even before the list loads.
  const listed = order.projectId !== null && !choices.some((p) => p.id === order.projectId)
    ? [...choices, { id: order.projectId, name: order.project ?? `Proyecto ${order.projectId}` }]
    : choices;

  async function change(value: string) {
    setSaving(true);
    setError(null);
    try {
      onOrderChange(await setOrderProject(order.id, value ? Number(value) : null));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const hint = order.clientId === null
    ? 'Este pedido no tiene ficha de cliente, así que no puede ir en un proyecto.'
    : projects !== null && listed.length === 0 ? 'Este cliente no tiene proyectos activos.' : null;

  return (
    <div className="detail__project">
      <div className="detail__project-head">
        <label className="field__label" htmlFor={`${uid}-project`}>Proyecto</label>
        {order.projectId !== null && <Link to={`/proyectos/${order.projectId}`}>Ver {order.project ?? 'el proyecto'}</Link>}
      </div>
      <select id={`${uid}-project`} className="field__control" value={order.projectId ?? ''} disabled={saving || order.clientId === null}
        onChange={(e) => void change(e.target.value)} aria-invalid={!!error}
        aria-describedby={error || hint ? `${uid}-project-msg` : undefined}>
        <option value="">Sin proyecto</option>
        {listed.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {error
        ? <span id={`${uid}-project-msg`} className="field__error" role="alert">{error}</span>
        : hint && <span id={`${uid}-project-msg`} className="muted">{hint}</span>}
    </div>
  );
}
