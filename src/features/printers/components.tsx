// Presentational pieces of the Impresoras screen. State lives in PrintersPage.
import { Link } from 'react-router';
import type { Printer, PrinterStatus } from '../../../shared/printers';
import { PRINTER_STATUSES, PRINTER_STATUS_LABEL, wearCostPerHour } from '../../../shared/printers';
import { FormDialog, type FieldSpec } from '../../ui/FormDialog';
import { changedValues, parseWhole } from '../../ui/forms';
import { Icon } from '../../ui/Icon';
import { money } from '../orders/format';
import { AdoptPlanButton } from '../service/components';
import { planText } from '../service/format';
import { hoursLabel, hoursText, hoursTextToMinutes } from './format';

const STATUS_COLOR: Record<PrinterStatus, { bg: string; fg: string }> = {
  activa: { bg: 'var(--blue)', fg: 'var(--white)' },
  en_servicio: { bg: 'var(--yellow)', fg: 'var(--ink)' },
  fuera_de_uso: { bg: 'var(--rule)', fg: 'var(--ink)' },
};

export function StatusChip({ status }: { status: PrinterStatus }) {
  const c = STATUS_COLOR[status];
  return <span className="chip" style={{ background: c.bg, color: c.fg }}>{PRINTER_STATUS_LABEL[status]}</span>;
}

/** A printer's service tasks: how many it has and how many are due. */
export interface PrinterService { tasks: number; due: number }

/** The service part of a printer card: a badge when tasks are due, a link when all is done, the plan when it has none. */
function ServiceLine({ printer, service, onPlanAdopted }: { printer: Printer; service: PrinterService; onPlanAdopted: () => void }) {
  const to = `/taller?impresora=${printer.id}`;
  if (service.due > 0) {
    return (
      <Link to={to} className="service-badge" aria-label={`${printer.name}: ${service.due} ${service.due === 1 ? 'tarea vencida' : 'tareas vencidas'}, ver servicio técnico`}>
        <Icon name="alert" size={16} />{service.due} {service.due === 1 ? 'tarea vencida' : 'tareas vencidas'}
      </Link>
    );
  }
  if (service.tasks > 0) return <Link to={to} className="printer-card__service"><Icon name="wrench" size={16} />Servicio al día</Link>;
  return (
    <div className="printer-card__plan">
      <span className="muted">Sin plan de servicio.</span>
      <AdoptPlanButton printerId={printer.id} printerName={printer.name} onAdopted={onPlanAdopted} />
    </div>
  );
}

export function PrinterCard({ printer, service, onEdit, onPlanAdopted }: {
  printer: Printer; service?: PrinterService; onEdit: () => void; onPlanAdopted: () => void;
}) {
  return (
    <article className="card printer-card" aria-labelledby={`printer-${printer.id}`}>
      <header className="printer-card__head">
        <div>
          <h2 id={`printer-${printer.id}`} className="printer-card__name">{printer.name}</h2>
          {printer.model && <p className="muted">{printer.model}</p>}
        </div>
        <StatusChip status={printer.status} />
      </header>
      <dl className="printer-card__facts">
        <div><dt>Horas impresas</dt><dd className="printer-card__big">{hoursLabel(printer.printMinutes)}</dd></div>
        <div><dt>Desgaste por hora</dt><dd className="printer-card__big">{money(Math.round(wearCostPerHour(printer)))}</dd></div>
        <div><dt>Precio de compra</dt><dd>{money(printer.purchasePrice)}</dd></div>
        <div><dt>Vida útil</dt><dd>{printer.lifetimeHours.toLocaleString('es-AR')} h</dd></div>
        <div><dt>Consumo</dt><dd>{printer.powerWatts} W</dd></div>
      </dl>
      {printer.note && <p className="printer-card__note">{printer.note}</p>}
      {service && <ServiceLine printer={printer} service={service} onPlanAdopted={onPlanAdopted} />}
      <button type="button" className="btn btn--ghost btn--sm" onClick={onEdit} aria-label={`Editar ${printer.name}`}>Editar</button>
    </article>
  );
}

const FIELDS: FieldSpec[] = [
  { key: 'name', label: 'Nombre', placeholder: 'La A1' },
  { key: 'model', label: 'Modelo', placeholder: 'Marca y modelo' },
  { key: 'status', label: 'Estado', type: 'select', options: PRINTER_STATUSES.map((s) => ({ value: s, label: PRINTER_STATUS_LABEL[s] })) },
  { key: 'purchasePrice', label: 'Precio de compra ($)', inputMode: 'numeric', placeholder: '720000' },
  { key: 'lifetimeHours', label: 'Vida útil (horas de impresión)', inputMode: 'numeric', placeholder: '5000' },
  { key: 'powerWatts', label: 'Consumo promedio (W)', inputMode: 'numeric', placeholder: '95' },
  { key: 'printMinutes', label: 'Horas impresas hasta hoy', inputMode: 'decimal', placeholder: '0', hint: 'Cada trabajo terminado las va sumando.' },
  { key: 'note', label: 'Nota', type: 'textarea', placeholder: 'Boquilla, repuestos, mañas…' },
];

// Only when creating: the default service plan, on unless the owner unticks it.
const PLAN_FIELD: FieldSpec = { key: 'servicePlan', label: 'Sumar el plan de servicio básico', type: 'checkbox', hint: planText() };

const EMPTY = { name: '', model: '', status: 'activa', purchasePrice: '', lifetimeHours: '', powerWatts: '', printMinutes: '0', note: '', servicePlan: 'true' };

function toForm(p: Printer): Record<string, string> {
  return {
    name: p.name, model: p.model, status: p.status, note: p.note,
    purchasePrice: String(p.purchasePrice), lifetimeHours: String(p.lifetimeHours), powerWatts: String(p.powerWatts),
    printMinutes: hoursText(p.printMinutes),
  };
}

function toApi(values: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (key === 'printMinutes') out[key] = hoursTextToMinutes(value);
    else if (key === 'purchasePrice' || key === 'lifetimeHours' || key === 'powerWatts') out[key] = parseWhole(value);
    else if (key === 'servicePlan') out[key] = value === 'true';
    else out[key] = value;
  }
  return out;
}

/** Create a printer, or edit one sending only the fields the owner changed. */
export function PrinterDialog({ printer, onCreate, onUpdate, onClose }: {
  printer: Printer | null;
  onCreate: (input: Record<string, unknown>) => Promise<unknown>;
  onUpdate: (id: number, changes: Record<string, unknown>) => Promise<unknown>;
  onClose: () => void;
}) {
  const initial = printer ? toForm(printer) : EMPTY;
  return (
    <FormDialog
      title={printer ? `Editar ${printer.name}` : 'Nueva impresora'}
      fields={printer ? FIELDS : [...FIELDS, PLAN_FIELD]}
      initial={initial}
      submitLabel={printer ? 'Guardar cambios' : 'Guardar impresora'}
      onClose={onClose}
      onSubmit={async (values) => {
        if (!printer) { await onCreate(toApi(values)); return; }
        const changes = changedValues(values, initial);
        if (Object.keys(changes).length) await onUpdate(printer.id, toApi(changes));
      }}
    />
  );
}
