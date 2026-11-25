// Presentational pieces of the Proyectos screens. State lives in ProjectsPage and ProjectPage.
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { ProjectStatus, ProjectSummary, ProjectTotals } from '../../../shared/projects';
import { PROJECT_STATUS_LABEL, isProjectOverdue } from '../../../shared/projects';
import { ApiError } from '../../ui/api';
import { changedValues } from '../../ui/forms';
import { Icon } from '../../ui/Icon';
import { ClientPicker } from '../clients/ClientPicker';
import { clientReference, usePickerClients } from '../clients/picker';
import { money } from '../orders/format';
import { percentLabel, progressText, projectDueLabel } from './format';
import '../../ui/form-dialog.css';

const STATUS_COLOR: Record<ProjectStatus, { bg: string; fg: string }> = {
  activo: { bg: 'var(--sky)', fg: 'var(--ink)' },
  terminado: { bg: 'var(--rule)', fg: 'var(--ink)' },
};

export function ProjectStatusChip({ status }: { status: ProjectStatus }) {
  const c = STATUS_COLOR[status];
  return <span className="chip" style={{ background: c.bg, color: c.fg }}>{PROJECT_STATUS_LABEL[status]}</span>;
}

/** "Entrega 5 dic", red with "atrasado" once an active project is past it. */
export function ProjectDue({ project, today }: { project: Pick<ProjectSummary, 'status' | 'dueDate'>; today: string }) {
  const late = isProjectOverdue(project, today);
  return (
    <span className={late ? 'order-card__due order-card__due--late' : 'order-card__due'}>
      <Icon name="calendar" size={14} />{project.dueDate ? `Entrega ${projectDueLabel(project, today)}` : 'Sin fecha'}{late ? ' · atrasado' : ''}
    </span>
  );
}

/** Delivered ÷ all orders, as a bar and in words. */
export function ProjectProgress({ totals }: { totals: ProjectTotals }) {
  const percent = Math.round(totals.progress * 100);
  return (
    <div className="project-progress">
      <div className="project-progress__head">
        <span>{progressText(totals)}</span>
        <b>{percentLabel(totals.progress)}</b>
      </div>
      <div className="project-progress__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
        aria-label={`Avance: ${progressText(totals)}`}>
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function ProjectMoney({ totals, big }: { totals: ProjectTotals; big?: boolean }) {
  return (
    <dl className={big ? 'client-totals client-totals--big' : 'client-totals'}>
      <div><dt>Precio</dt><dd>{money(totals.totalPrice)}</dd></div>
      <div><dt>Señas</dt><dd>{money(totals.totalDeposits)}</dd></div>
      <div><dt>Saldo a cobrar</dt><dd className={totals.balanceOwed > 0 ? 'client-totals__owed' : undefined}>{money(totals.balanceOwed)}</dd></div>
    </dl>
  );
}

export function ProjectCard({ project, today, onEdit }: { project: ProjectSummary; today: string; onEdit: () => void }) {
  return (
    <article className="card project-card" aria-labelledby={`project-${project.id}`}>
      <div className="project-card__top">
        <h2 id={`project-${project.id}`} className="client-card__name">
          <Link to={`/proyectos/${project.id}`}>{project.name}</Link>
        </h2>
        <ProjectStatusChip status={project.status} />
      </div>
      <p className="project-card__meta">
        <Link to={`/clientes/${project.clientId}`}>{project.client}</Link>
        <ProjectDue project={project} today={today} />
      </p>
      <ProjectProgress totals={project} />
      <ProjectMoney totals={project} />
      <div className="client-card__actions">
        <Link to={`/proyectos/${project.id}`} className="btn btn--sm" aria-label={`Ver el proyecto ${project.name}`}>Ver proyecto</Link>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onEdit} aria-label={`Editar ${project.name}`}>Editar</button>
      </div>
    </article>
  );
}

/** One project in a list (the client page), linking to its page. */
export function ProjectRow({ project, today }: { project: ProjectSummary; today: string }) {
  return (
    <li>
      <Link to={`/proyectos/${project.id}`} className="quote-row">
        <span className="quote-row__main">
          <span className="quote-row__meta">{progressText(project)} <ProjectStatusChip status={project.status} /></span>
          <span className="quote-row__title">{project.name}</span>
          <ProjectDue project={project} today={today} />
        </span>
        <span className="project-row__money">
          <b className="quote-row__total">{money(project.totalPrice)}</b>
          <span className="muted">{percentLabel(project.progress)}</span>
        </span>
      </Link>
    </li>
  );
}

type FormState = Record<'name' | 'client' | 'dueDate' | 'note', string>;

function toForm(p: ProjectSummary | null): FormState {
  return p ? { name: p.name, client: p.client, dueDate: p.dueDate ?? '', note: p.note } : { name: '', client: '', dueDate: '', note: '' };
}

/** Create a project, or edit one sending only what the owner changed. The client comes from the client picker. */
export function ProjectDialog({ project, onCreate, onUpdate, onClose }: {
  project: ProjectSummary | null;
  onCreate: (input: Record<string, unknown>) => Promise<unknown>;
  onUpdate: (id: number, changes: Record<string, unknown>) => Promise<unknown>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const clients = usePickerClients();
  const [initial] = useState(() => toForm(project));
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setBanner(null);
    try {
      const { client, ...changes } = project ? changedValues(form, initial) : form;
      const body: Record<string, unknown> = { ...changes };
      if ('dueDate' in body) body.dueDate = form.dueDate || null;
      // A name from the list links that client; any other name creates a new one.
      if (client !== undefined) Object.assign(body, clientReference(clients, client));
      if (!project) await onCreate(body);
      else if (Object.keys(body).length) await onUpdate(project.id, body);
      onClose();
    } catch (err) {
      const apiErr = err as ApiError;
      const { clientId, ...fields } = apiErr.fields ?? {};
      setErrors(clientId ? { client: clientId, ...fields } : fields);
      setBanner(apiErr.message);
      setSaving(false);
    }
  }

  const field = (key: 'name' | 'dueDate', label: string, props: Record<string, unknown>) => (
    <div className="field">
      <label className="field__label" htmlFor={`${uid}-${key}`}>{label}</label>
      <input id={`${uid}-${key}`} className="field__control" value={form[key]} autoComplete="off" {...props}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${uid}-${key}-err` : undefined} />
      {errors[key] && <span id={`${uid}-${key}-err`} className="field__error">{errors[key]}</span>}
    </div>
  );

  return (
    <dialog ref={ref} className="form-dialog" aria-labelledby={`${uid}-title`} onCancel={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="form-dialog__head">
          <h2 id={`${uid}-title`} className="form-dialog__title">{project ? `Editar ${project.name}` : 'Nuevo proyecto'}</h2>
          <button type="button" className="icon-btn icon-btn--quiet" aria-label="Cerrar" onClick={onClose}><Icon name="close" /></button>
        </div>
        {banner && <p className="field__error" role="alert">{banner}</p>}
        <div className="form-dialog__grid">
          {field('name', 'Nombre', { placeholder: 'Kit robótica', autoFocus: true })}
          <ClientPicker id={`${uid}-client`} value={form.client} clients={clients} error={errors.client} saving="el proyecto"
            onChange={(client) => setForm((f) => ({ ...f, client }))} />
          {field('dueDate', 'Fecha de entrega (opcional)', { type: 'date' })}
          <div className="field form-dialog__wide">
            <label className="field__label" htmlFor={`${uid}-note`}>Nota</label>
            <textarea id={`${uid}-note`} className="field__control" value={form.note} placeholder="Qué incluye, cómo se entrega, cómo se factura…"
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              aria-invalid={!!errors.note} aria-describedby={errors.note ? `${uid}-note-err` : undefined} />
            {errors.note && <span id={`${uid}-note-err`} className="field__error">{errors.note}</span>}
          </div>
        </div>
        <div className="form-dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn" disabled={saving}>{saving ? 'Guardando…' : project ? 'Guardar cambios' : 'Guardar proyecto'}</button>
        </div>
      </form>
    </dialog>
  );
}
