// The dialog that plans a print on a printer, or changes or deletes a planned one. Used by Calendario and by the
// "Impresiones" block of an order.
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { isActive, type Order } from '../../../shared/orders';
import type { PrintJob } from '../../../shared/print-jobs';
import type { Printer } from '../../../shared/printers';
import { ApiError } from '../../ui/api';
import { Icon } from '../../ui/Icon';
import '../../ui/form-dialog.css';
import '../orders/orders.css';
import './calendar.css';
import { deletePlannedJob, fetchOrders, planPrintJob, updatePlannedJob } from '../orders/api';
import { fetchPrinters } from '../printers/api';
import { planChanges, planDraft, planRequest, type PlanDraft } from './plan-form';

export type PlannedJobRef = Pick<PrintJob, 'id' | 'orderId' | 'printerId' | 'plannedStart' | 'estimatedMinutes' | 'note'>;

export function PlanJobDialog({ job, order, defaults, orderLink = false, onSaved, onDeleted, onClose }: {
  /** The planned job to change, or null to plan a new one. */
  job: PlannedJobRef | null;
  /** The order the plan is for; without it the dialog offers the active orders. */
  order?: Pick<Order, 'id' | 'item'>;
  defaults?: { date?: string; printerId?: string };
  /** Offer a link to the order in Pedidos (from Calendario). */
  orderLink?: boolean;
  onSaved: (job: PrintJob) => void;
  onDeleted?: (order: Order) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const [initial] = useState<PlanDraft>(() => planDraft(job, { orderId: order?.id, ...defaults }));
  const [draft, setDraft] = useState<PlanDraft>(initial);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const pickOrder = !job && !order;

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchPrinters(), pickOrder ? fetchOrders() : Promise.resolve([])]).then(
      ([p, o]) => {
        if (!alive) return;
        setPrinters(p);
        setOrders(o.filter(isActive));
        const first = p.find((x) => x.status === 'activa');
        setDraft((d) => (d.printerId || !first ? d : { ...d, printerId: String(first.id) }));
      },
      (e: Error) => { if (alive) setBanner(e.message); },
    );
    return () => { alive = false; };
  }, [pickOrder]);

  const set = (key: keyof PlanDraft) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [key]: e.target.value }));
  // Only active printers can take a plan; a planned job's own printer stays listed so the form shows it.
  const choices = printers.filter((p) => p.status === 'activa' || String(p.id) === draft.printerId);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBanner(null);
    if (!draft.orderId) {
      setErrors({ orderId: 'Elegí un pedido.' });
      setBanner('Revisá los datos de la impresión.');
      return;
    }
    if (job && Object.keys(planChanges(draft, initial)).length === 0) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      // An edit sends only what changed here, so it never undoes a change another request made to the other fields.
      onSaved(job ? await updatePlannedJob(job.orderId, job.id, planChanges(draft, initial)) : await planPrintJob(draft.orderId, planRequest(draft)));
      onClose();
    } catch (err) {
      const apiErr = err as ApiError;
      setErrors(apiErr.fields ?? {});
      setBanner(apiErr.message);
      setSaving(false);
    }
  }

  async function remove() {
    if (!job) return;
    setSaving(true);
    try {
      // Deletes it only while it is still planned: a job finished meanwhile keeps its counters (409).
      const saved = await deletePlannedJob(job.orderId, job.id);
      onDeleted?.(saved);
      onClose();
    } catch (err) {
      setBanner((err as Error).message);
      setSaving(false);
    }
  }

  const describedBy = (key: string) => (errors[key] ? `${uid}-${key}-err` : undefined);
  const fieldError = (key: string) => errors[key] && <span id={`${uid}-${key}-err`} className="field__error">{errors[key]}</span>;

  return (
    <dialog ref={ref} className="form-dialog" aria-labelledby={`${uid}-title`} onCancel={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="form-dialog__head">
          <h2 id={`${uid}-title`} className="form-dialog__title">{job ? 'Cambiar el plan' : 'Planificar impresión'}</h2>
          <button type="button" className="icon-btn icon-btn--quiet" aria-label="Cerrar" onClick={onClose}><Icon name="close" /></button>
        </div>
        {banner && <p className="field__error" role="alert">{banner}</p>}
        <div className="form-dialog__grid">
          <div className="field form-dialog__wide">
            <label className="field__label" htmlFor={`${uid}-order`}>Pedido</label>
            {pickOrder ? (
              <select id={`${uid}-order`} className="field__control" value={draft.orderId} onChange={set('orderId')}
                aria-invalid={!!errors.orderId} aria-describedby={describedBy('orderId')}>
                <option value="">Elegí un pedido</option>
                {orders.map((o) => <option key={o.id} value={o.id}>#{o.id} · {o.item} · {o.client}</option>)}
              </select>
            ) : (
              <input id={`${uid}-order`} className="field__control" readOnly value={order ? `#${order.id} · ${order.item}` : `#${draft.orderId}`} />
            )}
            {orderLink && draft.orderId && <Link to={`/pedidos?pedido=${draft.orderId}`} className="plan-form__link">Ver el pedido #{draft.orderId}</Link>}
            {fieldError('orderId')}
          </div>
          <div className="field form-dialog__wide">
            <label className="field__label" htmlFor={`${uid}-printer`}>Impresora</label>
            <select id={`${uid}-printer`} className="field__control" value={draft.printerId} onChange={set('printerId')}
              aria-invalid={!!errors.printerId} aria-describedby={describedBy('printerId')}>
              <option value="">Elegí una</option>
              {choices.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {fieldError('printerId')}
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`${uid}-date`}>Día</label>
            <input id={`${uid}-date`} type="date" className="field__control" value={draft.date} onChange={set('date')}
              aria-invalid={!!errors.plannedStart} aria-describedby={describedBy('plannedStart')} />
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`${uid}-time`}>Hora de inicio</label>
            <input id={`${uid}-time`} type="time" className="field__control" value={draft.time} onChange={set('time')}
              aria-invalid={!!errors.plannedStart} aria-describedby={describedBy('plannedStart')} />
          </div>
          {errors.plannedStart && <div className="form-dialog__wide">{fieldError('plannedStart')}</div>}
          <fieldset className="field form-dialog__wide plan-form__duration">
            <legend className="field__label">Cuánto va a tardar</legend>
            <div className="plan-form__time">
              <label className="plan-form__unit">
                <input className="field__control" inputMode="numeric" placeholder="0" value={draft.hours} onChange={set('hours')}
                  aria-label="Horas" aria-invalid={!!errors.estimatedMinutes} aria-describedby={describedBy('estimatedMinutes')} />
                <span>h</span>
              </label>
              <label className="plan-form__unit">
                <input className="field__control" inputMode="numeric" placeholder="0" value={draft.minutes} onChange={set('minutes')}
                  aria-label="Minutos" aria-invalid={!!errors.estimatedMinutes} aria-describedby={describedBy('estimatedMinutes')} />
                <span>min</span>
              </label>
            </div>
            {fieldError('estimatedMinutes')}
          </fieldset>
          <div className="field form-dialog__wide">
            <label className="field__label" htmlFor={`${uid}-note`}>Nota (opcional)</label>
            <textarea id={`${uid}-note`} className="field__control" value={draft.note} onChange={set('note')} placeholder="Qué tanda, qué filamento…"
              aria-invalid={!!errors.note} aria-describedby={describedBy('note')} />
            {fieldError('note')}
          </div>
        </div>
        <p className="muted">Planificar no suma horas ni descuenta filamento: eso pasa cuando la terminás y cargás lo real.</p>
        {confirming ? (
          <div className="job__confirm" role="group" aria-label="Confirmar borrado">
            <span>¿Borramos este plan? No cambia ningún contador.</span>
            <span className="job__confirm-actions">
              <button type="button" className="btn btn--sm" disabled={saving} onClick={() => void remove()}>Sí, borrar</button>
              <button type="button" className="btn btn--ghost btn--sm" disabled={saving} onClick={() => setConfirming(false)}>No</button>
            </span>
          </div>
        ) : (
          <div className="form-dialog__actions">
            {job && <button type="button" className="btn btn--ghost plan-form__delete" onClick={() => setConfirming(true)}>Borrar plan</button>}
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn" disabled={saving}>{saving ? 'Guardando…' : job ? 'Guardar cambios' : 'Planificar'}</button>
          </div>
        )}
      </form>
    </dialog>
  );
}
