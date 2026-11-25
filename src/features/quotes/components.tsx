// Presentational pieces of the Presupuestos screens and the calculator's save action.
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import type { CalcInput, CalcLineResult } from '../../../shared/calculator';
import type { CostSettingsInput } from '../../../shared/cost-settings';
import { CHANNELS, type Channel } from '../../../shared/orders';
import type { Quote, QuoteStatus } from '../../../shared/quotes';
import { QUOTE_STATUS_LABEL, defaultValidUntil, formatDay, isQuoteExpired, ordersFromQuote } from '../../../shared/quotes';
import { FormDialog, type FieldSpec } from '../../ui/FormDialog';
import { ApiError } from '../../ui/api';
import { changedValues } from '../../ui/forms';
import { Icon } from '../../ui/Icon';
import { BreakdownList } from '../calculator/components';
import { ClientPicker } from '../clients/ClientPicker';
import { clientReference, usePickerClients } from '../clients/picker';
import { isoDate, money } from '../orders/format';
import { grams } from '../spools/format';
import { createQuote } from './api';
import { defaultQuoteTitle, durationLabel } from './format';

const STATUS_COLOR: Record<QuoteStatus, { bg: string; fg: string }> = {
  borrador: { bg: 'var(--rule)', fg: 'var(--ink)' },
  enviado: { bg: 'var(--sky)', fg: 'var(--ink)' },
  aceptado: { bg: 'var(--blue)', fg: 'var(--white)' },
  rechazado: { bg: 'var(--red)', fg: 'var(--white)' },
};

export function QuoteStatusChip({ status }: { status: QuoteStatus }) {
  const c = STATUS_COLOR[status];
  return <span className="chip" style={{ background: c.bg, color: c.fg }}>{QUOTE_STATUS_LABEL[status]}</span>;
}

/** "Vale hasta 10/12/2026", red with "vencido" once a quote still waiting for an answer is past it. */
export function Validity({ quote, today }: { quote: Pick<Quote, 'status' | 'validUntil'>; today: string }) {
  const expired = isQuoteExpired(quote, today);
  return (
    <span className={expired ? 'quote-validity quote-validity--late' : 'quote-validity'}>
      <Icon name="calendar" size={14} />Vale hasta {formatDay(quote.validUntil)}{expired ? ' · vencido' : ''}
    </span>
  );
}

/** One quote in a list, linking to its page. */
export function QuoteRow({ quote, today, showClient }: { quote: Quote; today: string; showClient: boolean }) {
  return (
    <li>
      <Link to={`/presupuestos/${quote.id}`} className="quote-row">
        <span className="quote-row__main">
          <span className="quote-row__meta">{quote.number}{showClient ? ` · ${quote.client}` : ''} <QuoteStatusChip status={quote.status} /></span>
          <span className="quote-row__title">{quote.title}</span>
          <Validity quote={quote} today={today} />
        </span>
        <b className="quote-row__total">{money(quote.total)}</b>
      </Link>
    </li>
  );
}

/** A frozen line as it was priced: printer, times, filaments, its total and, folded, its own breakdown. */
export function FrozenLine({ line, settings }: { line: CalcLineResult; settings: CostSettingsInput }) {
  const id = useId();
  return (
    <article className="card quote-line" aria-labelledby={id}>
      <header className="quote-line__head">
        <h3 id={id} className="quote-line__title">{line.name}{line.quantity > 1 ? ` × ${line.quantity}` : ''}</h3>
        <span className="quote-line__price">
          <b>{money(line.total)}</b>
          {line.quantity > 1 && <span className="muted">{money(line.unitPrice)} c/u</span>}
        </span>
      </header>
      <p className="quote-line__facts">
        <span>{line.printerName ?? 'Sin impresora'}</span>
        <span>{durationLabel(line.printMinutesPerUnit)} por unidad</span>
        <span>Preparación {line.prepMinutes} min</span>
        <span>Post-procesado {line.postMinutes} min</span>
      </p>
      {line.filaments.length > 0 && (
        <ul className="quote-line__uses">
          {line.filaments.map((f, i) => (
            <li key={i}>
              <span className="calc-use__swatch quote-line__swatch" style={{ background: f.colorHex ?? 'var(--mist)' }} aria-hidden="true" />
              <span>{f.label}</span>
              <span className="muted">{grams(f.grams)} · {money(f.pricePerKg)}/kg</span>
              <b>{money(f.cost)}</b>
            </li>
          ))}
        </ul>
      )}
      <details className="quote-line__details">
        <summary>Desglose de esta pieza</summary>
        <BreakdownList breakdown={line.breakdown} settings={settings} />
      </details>
    </article>
  );
}

/** Opens the dialog on mount and closes it on unmount, like the other dialogs. */
function useModal() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return ref;
}

/** Save the calculation as a quote: client, title, validity and a note. The server prices it and freezes it. */
export function SaveQuoteDialog({ input, total, onClose }: { input: CalcInput; total: number; onClose: () => void }) {
  const ref = useModal();
  const uid = useId();
  const navigate = useNavigate();
  const clients = usePickerClients();
  const [form, setForm] = useState(() => ({
    client: '', title: defaultQuoteTitle(input.lines.map((l) => l.name)), validUntil: defaultValidUntil(isoDate(new Date())), note: '',
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setBanner(null);
    try {
      const { client, ...rest } = form;
      const quote = await createQuote({ ...rest, ...clientReference(clients, client), input });
      navigate(`/presupuestos/${quote.id}`);
    } catch (err) {
      const apiErr = err as ApiError;
      const { clientId, ...fields } = apiErr.fields ?? {};
      setErrors(clientId ? { client: clientId, ...fields } : fields);
      setBanner(apiErr.message);
      setSaving(false);
    }
  }

  const field = (key: 'title' | 'validUntil', label: string, props: Record<string, unknown>) => (
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
          <h2 id={`${uid}-title`} className="form-dialog__title">Guardar como presupuesto</h2>
          <button type="button" className="icon-btn icon-btn--quiet" aria-label="Cerrar" onClick={onClose}><Icon name="close" /></button>
        </div>
        {banner && <p className="field__error" role="alert">{banner}{errors.input ? ` ${errors.input}` : ''}</p>}
        <p className="save-quote__total">
          <span>Total</span><b>{money(total)}</b>
          <span className="muted">Se guarda con los costos de hoy: si después cambian, este precio no cambia.</span>
        </p>
        <div className="form-dialog__grid">
          <ClientPicker id={`${uid}-client`} value={form.client} clients={clients} error={errors.client} saving="el presupuesto" autoFocus
            onChange={(client) => setForm((f) => ({ ...f, client }))} />
          {field('title', 'Título', { placeholder: 'Llaveros con logo' })}
          {field('validUntil', 'Válido hasta', { type: 'date' })}
          <div className="field form-dialog__wide">
            <label className="field__label" htmlFor={`${uid}-note`}>Nota para el cliente (opcional)</label>
            <textarea id={`${uid}-note`} className="field__control" value={form.note} placeholder="Seña, plazo de entrega, cómo retira…"
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              aria-invalid={!!errors.note} aria-describedby={`${uid}-note-hint`} />
            {errors.note
              ? <span id={`${uid}-note-hint`} className="field__error">{errors.note}</span>
              : <span id={`${uid}-note-hint`} className="muted">Sale en el PDF y en el mensaje de WhatsApp.</span>}
          </div>
        </div>
        <div className="form-dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn" disabled={saving}>{saving ? 'Guardando…' : 'Guardar presupuesto'}</button>
        </div>
      </form>
    </dialog>
  );
}

/** Confirm the acceptance: shows the orders it creates and asks where the client confirmed. */
export function AcceptDialog({ quote, onAccept, onClose }: {
  quote: Quote; onAccept: (channel: Channel) => Promise<void>; onClose: () => void;
}) {
  const ref = useModal();
  const uid = useId();
  const [channel, setChannel] = useState<Channel>('WhatsApp');
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const orders = ordersFromQuote(quote, channel);
  const count = `${orders.length} ${orders.length === 1 ? 'pedido' : 'pedidos'}`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setBanner(null);
    try {
      await onAccept(channel);
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
          <h2 id={`${uid}-title`} className="form-dialog__title">Aceptar {quote.number}</h2>
          <button type="button" className="icon-btn icon-btn--quiet" aria-label="Cerrar" onClick={onClose}><Icon name="close" /></button>
        </div>
        {banner && <p className="field__error" role="alert">{banner}</p>}
        <p>{orders.length === 1 ? 'Se crea' : 'Se crean'} {count} para <b>{quote.client}</b>, en Nuevo, con los precios del presupuesto. Se acepta una sola vez.</p>
        <ul className="accept-orders">
          {orders.map((o, i) => <li key={i}><span>{o.item}</span><b>{money(o.price)}</b></li>)}
        </ul>
        <div className="field">
          <label className="field__label" htmlFor={`${uid}-channel`}>Lo confirmó por</label>
          <select id={`${uid}-channel`} className="field__control" value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
            {CHANNELS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="form-dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn" disabled={saving}>{saving ? 'Creando…' : `Crear ${count}`}</button>
        </div>
      </form>
    </dialog>
  );
}

const EDIT_FIELDS: FieldSpec[] = [
  { key: 'title', label: 'Título' },
  { key: 'validUntil', label: 'Válido hasta', type: 'date' },
  { key: 'note', label: 'Nota para el cliente', type: 'textarea', hint: 'Sale en el PDF y en el mensaje de WhatsApp.' },
];

/** Edit the title, validity and note, sending only what changed. The prices stay as they were saved. */
export function EditQuoteDialog({ quote, onSave, onClose }: {
  quote: Quote; onSave: (changes: Record<string, unknown>) => Promise<unknown>; onClose: () => void;
}) {
  const initial = { title: quote.title, validUntil: quote.validUntil, note: quote.note };
  return (
    <FormDialog
      title={`Editar ${quote.number}`}
      fields={EDIT_FIELDS}
      initial={initial}
      submitLabel="Guardar cambios"
      onClose={onClose}
      onSubmit={async (values) => {
        const changes = changedValues(values, initial);
        if (Object.keys(changes).length) await onSave(changes);
      }}
    />
  );
}
