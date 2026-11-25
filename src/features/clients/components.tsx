// Presentational pieces of the Clientes screens. State lives in ClientsPage and ClientPage.
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { Client, ClientSummary } from '../../../shared/clients';
import { balanceOwed, instagramUrl, whatsappUrl } from '../../../shared/clients';
import type { Order } from '../../../shared/orders';
import { FormDialog, type FieldSpec } from '../../ui/FormDialog';
import { changedValues } from '../../ui/forms';
import { Icon } from '../../ui/Icon';
import { StageChip } from '../orders/components';
import { dueLabel, isOverdue, money } from '../orders/format';

/** Phone as a WhatsApp link, Instagram as a profile link, email as a mail link. Only the ones the client has. */
export function ContactLinks({ client }: { client: Pick<Client, 'name' | 'phone' | 'instagram' | 'email'> }) {
  const wa = whatsappUrl(client.phone);
  const ig = instagramUrl(client.instagram);
  if (!wa && !ig && !client.email) return <p className="muted">Sin datos de contacto.</p>;
  return (
    <ul className="contact-links">
      {wa && (
        <li><a href={wa} target="_blank" rel="noreferrer" aria-label={`WhatsApp de ${client.name}: ${client.phone}`}><Icon name="chat" size={18} />{client.phone}</a></li>
      )}
      {ig && (
        <li><a href={ig} target="_blank" rel="noreferrer" aria-label={`Instagram de ${client.name}: @${client.instagram}`}><Icon name="instagram" size={18} />@{client.instagram}</a></li>
      )}
      {client.email && (
        <li><a href={`mailto:${client.email}`}><Icon name="mail" size={18} />{client.email}</a></li>
      )}
    </ul>
  );
}

export function ClientTotals({ client, big }: { client: ClientSummary; big?: boolean }) {
  return (
    <dl className={big ? 'client-totals client-totals--big' : 'client-totals'}>
      <div><dt>Pedidos</dt><dd>{client.orderCount}</dd></div>
      <div><dt>Total gastado</dt><dd>{money(client.totalSpent)}</dd></div>
      <div><dt>Saldo a cobrar</dt><dd className={client.balanceOwed > 0 ? 'client-totals__owed' : undefined}>{money(client.balanceOwed)}</dd></div>
    </dl>
  );
}

export function ClientCard({ client, onEdit }: { client: ClientSummary; onEdit: () => void }) {
  return (
    <article className="card client-card" aria-labelledby={`client-${client.id}`}>
      <h2 id={`client-${client.id}`} className="client-card__name">
        <Link to={`/clientes/${client.id}`}>{client.name}</Link>
      </h2>
      <ContactLinks client={client} />
      <ClientTotals client={client} />
      <div className="client-card__actions">
        <Link to={`/clientes/${client.id}`} className="btn btn--sm" aria-label={`Ver la ficha de ${client.name}`}>Ver ficha</Link>
        <button type="button" className="btn btn--ghost btn--sm" onClick={onEdit} aria-label={`Editar ${client.name}`}>Editar</button>
      </div>
    </article>
  );
}

/** One of the client's orders, with what is left to collect. `action` goes under the money, like a project's remove button. */
export function ClientOrderRow({ order, today, action }: { order: Order; today: string; action?: ReactNode }) {
  const late = isOverdue(order, today);
  const owed = balanceOwed([order]);
  return (
    <li className="client-order">
      <div className="client-order__main">
        <span className="client-order__meta">#{order.id} · {order.channel} <StageChip stage={order.stage} /></span>
        <span className="client-order__item">{order.item}</span>
        <span className={late ? 'order-card__due order-card__due--late' : 'order-card__due'}>
          <Icon name="calendar" size={14} />{dueLabel(order, today)}{late ? ' · atrasado' : ''}
        </span>
      </div>
      <div className="client-order__money">
        <b>{money(order.price)}</b>
        <span className={owed > 0 ? 'client-order__owed' : 'muted'}>{order.paid ? 'Pagado' : owed > 0 ? `Debe ${money(owed)}` : 'Sin saldo'}</span>
        {action}
      </div>
    </li>
  );
}

const FIELDS: FieldSpec[] = [
  { key: 'name', label: 'Nombre', placeholder: 'Nombre o comercio' },
  { key: 'phone', label: 'Teléfono (WhatsApp)', inputMode: 'tel', placeholder: '+54 9 11 5555-0142', hint: 'Con código de país y área, así el link abre el chat.' },
  { key: 'instagram', label: 'Instagram', placeholder: '@usuario' },
  { key: 'email', label: 'Email', inputMode: 'email', placeholder: 'nombre@mail.com' },
  { key: 'note', label: 'Nota', type: 'textarea', placeholder: 'Cómo paga, cómo retira, qué le gusta…' },
];

const EMPTY = { name: '', phone: '', instagram: '', email: '', note: '' };

function toForm(c: Client): Record<string, string> {
  return { name: c.name, phone: c.phone, instagram: c.instagram ? `@${c.instagram}` : '', email: c.email, note: c.note };
}

/** Create a client, or edit one sending only the fields the owner changed. */
export function ClientDialog({ client, onCreate, onUpdate, onClose }: {
  client: Client | null;
  onCreate: (input: Record<string, unknown>) => Promise<unknown>;
  onUpdate: (id: number, changes: Record<string, unknown>) => Promise<unknown>;
  onClose: () => void;
}) {
  const initial = client ? toForm(client) : EMPTY;
  return (
    <FormDialog
      title={client ? `Editar ${client.name}` : 'Nuevo cliente'}
      fields={FIELDS}
      initial={initial}
      submitLabel={client ? 'Guardar cambios' : 'Guardar cliente'}
      onClose={onClose}
      onSubmit={async (values) => {
        if (!client) { await onCreate(values); return; }
        const changes = changedValues(values, initial);
        if (Object.keys(changes).length) await onUpdate(client.id, changes);
      }}
    />
  );
}
