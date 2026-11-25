// Presentational pieces of the Servicio técnico screen, and the plan button the Impresoras cards share. State lives in ServicePage.
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { Printer } from '../../../shared/printers';
import { formatDay } from '../../../shared/quotes';
import type { ServiceCost, ServiceLog, ServiceTaskWithState } from '../../../shared/service';
import { FormDialog, type FieldSpec } from '../../ui/FormDialog';
import { changedValues, parseWhole } from '../../ui/forms';
import { Icon } from '../../ui/Icon';
import { money } from '../orders/format';
import { hoursLabel } from '../printers/format';
import { adoptServicePlan } from './api';
import { intervalLabel, stateLabel } from './format';

export function TaskRow({ task, showPrinter, onLog, onEdit, onDeactivate }: {
  task: ServiceTaskWithState; showPrinter: boolean; onLog: () => void; onEdit: () => void; onDeactivate: () => void;
}) {
  const { state } = task;
  return (
    <li className={state.due ? 'service-task service-task--due' : 'service-task'}>
      <div className="service-task__main">
        <p className="service-task__meta">
          {showPrinter && <span className="service-task__printer">{task.printer}</span>}
          <span>{intervalLabel(task)}</span>
        </p>
        <h3 className="service-task__name">{task.name}</h3>
        <p className={state.due ? 'service-task__left service-task__left--due' : 'service-task__left'}>
          {state.due && <Icon name="alert" size={16} />}
          {stateLabel(state)}
        </p>
        <div className="service-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, Math.round(state.progress * 100))}%` }} /></div>
        <p className="muted">Última vez: {formatDay(task.lastDoneDate)}, con {hoursLabel(task.lastDoneMinutes)} impresas</p>
      </div>
      <div className="service-task__actions">
        <button type="button" className="btn btn--sm" onClick={onLog} aria-label={`Registrar ${task.name} de ${task.printer}`}>
          <Icon name="check" size={18} />Registrar
        </button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onEdit} aria-label={`Editar ${task.name} de ${task.printer}`}>Editar</button>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onDeactivate} aria-label={`Dar de baja ${task.name} de ${task.printer}`}>Dar de baja</button>
      </div>
    </li>
  );
}

export function LogRow({ log, showPrinter }: { log: ServiceLog; showPrinter: boolean }) {
  return (
    <li className="service-log">
      <div className="service-log__main">
        <p className="service-log__meta">
          <span>{formatDay(log.date)}</span>
          {showPrinter && <span>{log.printer}</span>}
          {log.task && <span className="service-log__task">Tarea: {log.task}</span>}
        </p>
        <p className="service-log__done">{log.done}</p>
        {log.parts && <p className="service-log__line"><b>Repuestos:</b> {log.parts}</p>}
        {log.note && <p className="service-log__line">{log.note}</p>}
      </div>
      <b className="service-log__cost">{money(log.cost)}</b>
    </li>
  );
}

export function CostTotals({ totals }: { totals: ServiceCost[] }) {
  const sum = totals.reduce((total, t) => total + t.cost, 0);
  return (
    <>
      <ul className="service-costs">
        {totals.map((t) => (
          <li key={t.printerId}>
            <span>{t.printer}<span className="muted">{t.count} {t.count === 1 ? 'servicio' : 'servicios'}</span></span>
            <b>{money(t.cost)}</b>
          </li>
        ))}
      </ul>
      {totals.length > 1 && <p className="service-costs__sum"><span>Total</span><b>{money(sum)}</b></p>}
    </>
  );
}

/** Adds the default plan to a printer without tasks. */
export function AdoptPlanButton({ printerId, printerName, onAdopted }: { printerId: number; printerName: string; onAdopted: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        disabled={saving}
        aria-label={`Usar el plan básico en ${printerName}`}
        onClick={async () => {
          setSaving(true);
          setError(null);
          try {
            await adoptServicePlan(printerId);
            onAdopted();
          } catch (e) {
            setError((e as Error).message);
          }
          setSaving(false);
        }}
      >
        <Icon name="wrench" size={18} />{saving ? 'Sumando…' : 'Usar el plan básico'}
      </button>
      {error && <span className="field__error" role="alert">{error}</span>}
    </>
  );
}

const NAME_SUGGESTIONS = ['Limpiar boquilla', 'Lubricar varillas', 'Revisar correas', 'Limpiar la cama PEI', 'Cambiar PTFE', 'Ajustar excéntricas', 'Nivelar la cama'];

function printerOptions(printers: Printer[]) {
  return printers.map((p) => ({ value: String(p.id), label: p.name }));
}

function taskToApi(values: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (key === 'printerId') out[key] = Number(value);
    else if (key === 'intervalHours' || key === 'intervalDays') out[key] = parseWhole(value);
    else out[key] = value;
  }
  return out;
}

/** Create a task for a printer, or edit the name and intervals of one, sending only what changed. */
export function TaskDialog({ task, printers, printerId, today, onCreate, onUpdate, onClose }: {
  task: ServiceTaskWithState | null;
  printers: Printer[];
  printerId: number | null;
  today: string;
  onCreate: (input: Record<string, unknown>) => Promise<unknown>;
  onUpdate: (id: number, changes: Record<string, unknown>) => Promise<unknown>;
  onClose: () => void;
}) {
  const intervals: FieldSpec[] = [
    { key: 'intervalHours', label: 'Cada cuántas horas de impresión', inputMode: 'numeric', placeholder: '100' },
    { key: 'intervalDays', label: 'Cada cuántos días', inputMode: 'numeric', placeholder: '30', hint: 'Podés poner las dos: vence con la que llegue primero.' },
  ];
  const name: FieldSpec = { key: 'name', label: 'Tarea', placeholder: 'Limpiar boquilla', suggestions: NAME_SUGGESTIONS };
  if (task) {
    const initial = { name: task.name, intervalHours: task.intervalHours === null ? '' : String(task.intervalHours), intervalDays: task.intervalDays === null ? '' : String(task.intervalDays) };
    return (
      <FormDialog
        title={`Editar ${task.name}`}
        fields={[name, ...intervals]}
        initial={initial}
        submitLabel="Guardar cambios"
        onClose={onClose}
        onSubmit={async (values) => {
          const changes = changedValues(values, initial);
          if (Object.keys(changes).length) await onUpdate(task.id, taskToApi(changes));
        }}
      />
    );
  }
  const fields: FieldSpec[] = [
    { key: 'printerId', label: 'Impresora', type: 'select', options: printerOptions(printers) },
    name,
    ...intervals,
    { key: 'lastDoneDate', label: 'Hecha por última vez', type: 'date', hint: 'Los días se cuentan desde esta fecha; las horas, desde las que tiene hoy la impresora.' },
  ];
  return (
    <FormDialog
      title="Nueva tarea"
      fields={fields}
      initial={{ printerId: String(printerId ?? printers[0]?.id ?? ''), name: '', intervalHours: '', intervalDays: '', lastDoneDate: today }}
      submitLabel="Guardar tarea"
      onClose={onClose}
      onSubmit={async (values) => { await onCreate(taskToApi(values)); }}
    />
  );
}

/** Log a service, from a task (it restarts that task's count) or on its own. */
export function LogServiceDialog({ task, printers, printerId, today, onLog, onClose }: {
  task: ServiceTaskWithState | null;
  printers: Printer[];
  printerId: number | null;
  today: string;
  onLog: (input: Record<string, unknown>) => Promise<unknown>;
  onClose: () => void;
}) {
  const fields: FieldSpec[] = [
    ...(task ? [] : [{ key: 'printerId', label: 'Impresora', type: 'select', options: printerOptions(printers) } satisfies FieldSpec]),
    {
      key: 'date', label: 'Fecha', type: 'date',
      hint: task ? `La tarea vuelve a contar desde esta fecha y las horas que tiene hoy ${task.printer}.` : undefined,
    },
    { key: 'done', label: 'Qué se hizo', placeholder: 'Cambio de boquilla' },
    { key: 'parts', label: 'Repuestos', placeholder: 'Boquilla 0,4 mm × 2' },
    { key: 'cost', label: 'Costo ($)', inputMode: 'numeric', placeholder: '0' },
    { key: 'note', label: 'Nota', type: 'textarea', placeholder: 'Qué encontraste, qué queda pendiente…' },
  ];
  const initial = {
    printerId: String(task?.printerId ?? printerId ?? printers[0]?.id ?? ''),
    date: today, done: task?.name ?? '', parts: '', cost: '', note: '',
  };
  return (
    <FormDialog
      title={task ? `${task.name} · ${task.printer}` : 'Registrar un servicio'}
      fields={fields}
      initial={initial}
      submitLabel="Guardar servicio"
      onClose={onClose}
      onSubmit={async (values) => {
        await onLog({
          printerId: Number(values.printerId), taskId: task?.id ?? null, date: values.date, done: values.done, parts: values.parts,
          cost: parseWhole(values.cost), note: values.note,
        });
      }}
    />
  );
}

/** Confirm taking a task out of the plan. */
export function DeactivateDialog({ task, onConfirm, onClose }: { task: ServiceTaskWithState; onConfirm: () => Promise<void>; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const uid = useId();
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
      await onConfirm();
      onClose();
    } catch (err) {
      setBanner((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <dialog ref={ref} className="form-dialog" aria-labelledby={`${uid}-title`} onCancel={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="form-dialog__head">
          <h2 id={`${uid}-title`} className="form-dialog__title">Dar de baja {task.name}</h2>
          <button type="button" className="icon-btn icon-btn--quiet" aria-label="Cerrar" onClick={onClose}><Icon name="close" /></button>
        </div>
        {banner && <p className="field__error" role="alert">{banner}</p>}
        <p>Sale del plan de <b>{task.printer}</b> y deja de avisar. Los servicios que ya registraste quedan en el registro.</p>
        <div className="form-dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn" disabled={saving}>{saving ? 'Guardando…' : 'Dar de baja'}</button>
        </div>
      </form>
    </dialog>
  );
}
