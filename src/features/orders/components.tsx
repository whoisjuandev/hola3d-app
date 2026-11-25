// Presentational pieces of the Pedidos screen. State lives in OrdersPage.
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { Channel, NewOrder, Order, Stage } from '../../../shared/orders';
import { CHANNELS, STAGES, STAGE_LABEL, nextStage, previousStage, stageIndex } from '../../../shared/orders';
import { Icon } from '../../ui/Icon';
import { ClientPicker } from '../clients/ClientPicker';
import { clientReference, usePickerClients } from '../clients/picker';
import { ApiError } from './api';
import { depositLabel, dueLabel, isOverdue, money } from './format';
import { PrintJobs } from './PrintJobs';

const STAGE_COLOR: Record<Stage, { bg: string; fg: string }> = {
  nuevo: { bg: 'var(--sky)', fg: 'var(--ink)' },
  disenando: { bg: 'var(--sky)', fg: 'var(--ink)' },
  imprimiendo: { bg: 'var(--yellow)', fg: 'var(--ink)' },
  listo: { bg: 'var(--blue)', fg: 'var(--white)' },
  entregado: { bg: 'var(--rule)', fg: 'var(--ink)' },
};

export function StageChip({ stage }: { stage: Stage }) {
  const c = STAGE_COLOR[stage];
  return <span className="chip" style={{ background: c.bg, color: c.fg }}>{STAGE_LABEL[stage]}</span>;
}

export function OrderCard({ order, today, selected, showStage, onSelect }: {
  order: Order; today: string; selected: boolean; showStage: boolean; onSelect: () => void;
}) {
  const late = isOverdue(order, today);
  return (
    <button type="button" className="order-card" aria-pressed={selected} onClick={onSelect}>
      <span className="order-card__meta"><span>#{order.id} · {order.channel}</span>{showStage && <StageChip stage={order.stage} />}</span>
      <span className="order-card__item">{order.item}</span>
      <span className="order-card__client">{order.client}</span>
      <span className="order-card__foot">
        <span className={late ? 'order-card__due order-card__due--late' : 'order-card__due'}>
          <Icon name="calendar" size={14} />{dueLabel(order, today)}{late ? ' · atrasado' : ''}
        </span>
        <b>{money(order.price)}</b>
      </span>
    </button>
  );
}

export function StageBoard({ orders, today, selectedId, onSelect }: {
  orders: Order[]; today: string; selectedId: string | null; onSelect: (id: string) => void;
}) {
  return (
    <div className="board">
      {STAGES.map((stage) => {
        const inStage = orders.filter((o) => o.stage === stage);
        return (
          <section key={stage} className="lane" aria-label={STAGE_LABEL[stage]}>
            <header className="lane__head"><StageChip stage={stage} /><span className="lane__count">{inStage.length}</span></header>
            {inStage.map((o) => (
              <OrderCard key={o.id} order={o} today={today} showStage={false} selected={o.id === selectedId} onSelect={() => onSelect(o.id)} />
            ))}
            {inStage.length === 0 && <p className="lane__empty">Sin pedidos acá</p>}
          </section>
        );
      })}
    </div>
  );
}

export type StageTab = 'activos' | Stage;

export function StageTabs({ orders, value, onChange }: { orders: Order[]; value: StageTab; onChange: (t: StageTab) => void }) {
  const tabs: { key: StageTab; label: string; count: number }[] = [
    { key: 'activos', label: 'Activos', count: orders.filter((o) => o.stage !== 'entregado').length },
    ...STAGES.map((s) => ({ key: s as StageTab, label: STAGE_LABEL[s], count: orders.filter((o) => o.stage === s).length })),
  ];
  return (
    <div className="pills-row" role="group" aria-label="Etapa">
      {tabs.map((t) => (
        <button key={t.key} type="button" className="pill" aria-pressed={value === t.key} onClick={() => onChange(t.key)}>
          {t.label}<span className="pill__count">{t.count}</span>
        </button>
      ))}
    </div>
  );
}

export function OrderDetail({ order, today, asSheet, onMove, onOrderChange, onClose }: {
  order: Order; today: string; asSheet: boolean; onMove: (to: Stage) => void; onOrderChange: (order: Order) => void; onClose: () => void;
}) {
  const next = nextStage(order.stage);
  const prev = previousStage(order.stage);
  const idx = stageIndex(order.stage);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [order.id, onClose]);

  return (
    <>
      {asSheet && <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />}
      <aside className={asSheet ? 'detail detail--sheet' : 'detail'} aria-labelledby="detalle-titulo" role={asSheet ? 'dialog' : undefined} aria-modal={asSheet || undefined}>
        {asSheet && <div className="detail__grip" aria-hidden="true" />}
        <div className="detail__head">
          <span className="detail__id">Pedido #{order.id} <StageChip stage={order.stage} /></span>
          <button ref={closeRef} type="button" className="icon-btn icon-btn--quiet" aria-label="Cerrar detalle" onClick={onClose}><Icon name="close" /></button>
        </div>
        <h2 id="detalle-titulo" className="detail__title">{order.item}</h2>

        <div className="detail__stage">
          <span className="muted" style={{ fontSize: 14, fontWeight: 700 }}>
            {next ? `Etapa ${idx + 1} de ${STAGES.length} · sigue ${STAGE_LABEL[next]}` : `Etapa ${STAGES.length} de ${STAGES.length} · pedido cerrado`}
          </span>
          <div className="steps" aria-hidden="true">
            {STAGES.map((s, i) => <span key={s} style={{ background: i < idx ? 'var(--blue)' : i === idx ? 'var(--yellow)' : 'var(--rule)' }} />)}
          </div>
          <div className="detail__moves">
            <button type="button" className="btn" disabled={!next} onClick={() => next && onMove(next)}>
              {next ? `Pasar a ${STAGE_LABEL[next]}` : 'Ya está entregado'}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" disabled={!prev} onClick={() => prev && onMove(prev)}>
              {prev ? `Volver a ${STAGE_LABEL[prev]}` : 'Es la primera etapa'}
            </button>
          </div>
        </div>

        <dl className="detail__facts">
          <div><dt>Cliente</dt><dd>{order.clientId === null ? order.client : <Link to={`/clientes/${order.clientId}`}>{order.client}</Link>}</dd></div>
          <div><dt>Canal</dt><dd>{order.channel}</dd></div>
          <div><dt>Entrega</dt><dd>{dueLabel(order, today)}</dd></div>
          <div><dt>Material</dt><dd>{order.material || '—'}</dd></div>
          {order.quoteId !== null && <div><dt>Presupuesto</dt><dd><Link to={`/presupuestos/${order.quoteId}`}>Ver presupuesto</Link></dd></div>}
          <div><dt>Precio</dt><dd className="detail__big">{money(order.price)}</dd></div>
          <div><dt>Seña</dt><dd className="detail__big">{depositLabel(order)}</dd></div>
        </dl>
        {order.note && <p className="detail__note">{order.note}</p>}
        <PrintJobs key={order.id} order={order} onOrderChange={onOrderChange} />
      </aside>
    </>
  );
}

export function UndoToast({ text, onUndo, onDismiss }: { text: string; onUndo: () => void; onDismiss: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDismiss, 8000);
    return () => window.clearTimeout(t);
  }, [text, onDismiss]);
  return (
    <div className="toast" role="status">
      <span>{text}</span>
      <button type="button" onClick={onUndo}>Deshacer</button>
    </div>
  );
}

export function ErrorBanner({ text, onRetry, onDismiss }: { text: string; onRetry?: () => void; onDismiss?: () => void }) {
  return (
    <div className="error-banner" role="alert">
      <span>{text}</span>
      <span style={{ display: 'flex', gap: 8 }}>
        {onRetry && <button type="button" className="btn btn--ghost btn--sm" onClick={onRetry}>Reintentar</button>}
        {onDismiss && <button type="button" className="icon-btn icon-btn--quiet" aria-label="Cerrar aviso" onClick={onDismiss}><Icon name="close" /></button>}
      </span>
    </div>
  );
}

type FormState = Record<'item' | 'client' | 'channel' | 'dueDate' | 'dueTime' | 'price' | 'deposit' | 'material' | 'note', string>;
const EMPTY: FormState = { item: '', client: '', channel: 'WhatsApp', dueDate: '', dueTime: '', price: '', deposit: '', material: '', note: '' };

function toPesos(text: string): number | string {
  const digits = text.replace(/[.\s$]/g, '');
  return /^\d+$/.test(digits) ? Number(digits) : text;
}

export function NewOrderDialog({ onCreate, onClose }: { onCreate: (input: Partial<NewOrder>) => Promise<Order>; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const clients = usePickerClients();
  const uid = useId();

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  const set = (key: keyof FormState) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setBanner(null);
    try {
      const { client, ...rest } = form;
      await onCreate({
        ...rest,
        // A name from the list links that client; any other name creates a new one.
        ...clientReference(clients, client),
        channel: form.channel as Channel,
        dueDate: form.dueDate || null,
        dueTime: form.dueTime || null,
        price: toPesos(form.price) as number,
        deposit: form.deposit ? (toPesos(form.deposit) as number) : null,
      });
      onClose();
    } catch (err) {
      const apiErr = err as ApiError;
      const { clientId, ...fields } = apiErr.fields ?? {};
      setErrors(clientId ? { client: clientId, ...fields } : fields);
      setBanner(apiErr.message);
      setSaving(false);
    }
  }

  const field = (key: keyof FormState, label: string, props: Record<string, unknown> = {}, hint?: string) => (
    <div className="field">
      <label className="field__label" htmlFor={`${uid}-${key}`}>{label}</label>
      <input id={`${uid}-${key}`} className="field__control" value={form[key]} onChange={set(key)}
        aria-invalid={!!errors[key]} aria-describedby={errors[key] ? `${uid}-${key}-err` : hint ? `${uid}-${key}-hint` : undefined} {...props} />
      {errors[key]
        ? <span id={`${uid}-${key}-err`} className="field__error">{errors[key]}</span>
        : hint && <span id={`${uid}-${key}-hint`} className="muted" aria-live="polite">{hint}</span>}
    </div>
  );

  return (
    <dialog ref={ref} className="new-order" aria-labelledby={`${uid}-title`} onCancel={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="detail__head">
          <h2 id={`${uid}-title`} className="detail__title">Nuevo pedido</h2>
          <button type="button" className="icon-btn icon-btn--quiet" aria-label="Cerrar" onClick={onClose}><Icon name="close" /></button>
        </div>
        {banner && <p className="field__error" role="alert">{banner}</p>}
        <div className="new-order__grid">
          {field('item', 'Qué hay que hacer', { placeholder: 'Llaveros con logo × 12', autoFocus: true })}
          <ClientPicker id={`${uid}-client`} value={form.client} clients={clients} error={errors.client} saving="el pedido"
            onChange={(client) => setForm((f) => ({ ...f, client }))} />
          <div className="field">
            <label className="field__label" htmlFor={`${uid}-channel`}>Llegó por</label>
            <select id={`${uid}-channel`} className="field__control" value={form.channel} onChange={set('channel')}>
              {CHANNELS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          {field('material', 'Material', { placeholder: 'PLA blanco' })}
          {field('dueDate', 'Fecha de entrega', { type: 'date' })}
          {field('dueTime', 'Hora (opcional)', { type: 'time' })}
          {field('price', 'Precio ($)', { inputMode: 'numeric', placeholder: '36000' })}
          {field('deposit', 'Seña ($, opcional)', { inputMode: 'numeric', placeholder: '18000' })}
        </div>
        <div className="field">
          <label className="field__label" htmlFor={`${uid}-note`}>Nota</label>
          <textarea id={`${uid}-note`} className="field__control" value={form.note} onChange={set('note')} placeholder="Detalles, medidas, cómo lo retira…" />
        </div>
        <div className="new-order__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn" disabled={saving}>{saving ? 'Guardando…' : 'Guardar pedido'}</button>
        </div>
      </form>
    </dialog>
  );
}
