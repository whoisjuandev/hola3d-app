// The month view's day panel: everything of the chosen day in time order, with its hand-made events to add, mark done,
// edit and delete, and a link to that day's week.
import { useState } from 'react';
import { Link } from 'react-router';
import type { CalendarData } from '../../../shared/calendar';
import type { CalendarEvent } from '../../../shared/calendar-events';
import { Icon } from '../../ui/Icon';
import { deleteEvent, updateEvent } from './api';
import { itemClass, kindLabel, longDayTitle, panelItems } from './format';
import { ItemLink } from './items';

export function DayPanel({ day, today, data, onAdd, onEdit, onChanged }: {
  day: string;
  today: string;
  data: CalendarData;
  onAdd: () => void;
  onEdit: (event: CalendarEvent) => void;
  /** An event was marked or deleted: the calendar reads its data again. */
  onChanged: () => void;
}) {
  const items = panelItems(data, day);
  const [busy, setBusy] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(id: number, action: () => Promise<unknown>) {
    setBusy(id);
    setError(null);
    try {
      await action();
      setConfirming(null);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(null);
  }

  return (
    <section className="cal-panel" aria-labelledby="cal-panel-title">
      <div className="cal-panel__head">
        <h2 id="cal-panel-title" className="cal-panel__title">
          {longDayTitle(day)}{day === today && <span className="cal-week__today">Hoy</span>}
        </h2>
        <Link to={`/agenda?vista=semana&dia=${day}`} className="cal-panel__week">Ver la semana<Icon name="forward" size={16} /></Link>
      </div>
      <button type="button" className="btn btn--sm cal-panel__add" onClick={onAdd}><Icon name="plus" size={16} />Agregar evento</button>
      {error && <p className="field__error" role="alert">{error}</p>}
      {items.length === 0 ? (
        <p className="cal-day__empty">Nada para este día.</p>
      ) : (
        <ol className="cal-agenda">
          {items.map((item) => (
            <li key={item.key} className="cal-agenda__row">
              <span className="cal-agenda__time">{item.time ?? 'Todo el día'}</span>
              <div className="cal-agenda__body">
                {item.event ? (
                  <EventRow event={item.event} className={itemClass(item)} kind={kindLabel(item)} busy={busy === item.event.id}
                    confirming={confirming === item.event.id}
                    onToggle={(e) => void run(e.id, () => updateEvent(e.id, { done: !e.done }))}
                    onEdit={onEdit}
                    onAskDelete={(e) => { setError(null); setConfirming(e.id); }}
                    onCancelDelete={() => setConfirming(null)}
                    onDelete={(e) => void run(e.id, () => deleteEvent(e.id))} />
                ) : (
                  <ItemLink item={item} />
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function EventRow({ event, className, kind, busy, confirming, onToggle, onEdit, onAskDelete, onCancelDelete, onDelete }: {
  event: CalendarEvent;
  className: string;
  kind: string;
  busy: boolean;
  confirming: boolean;
  onToggle: (event: CalendarEvent) => void;
  onEdit: (event: CalendarEvent) => void;
  onAskDelete: (event: CalendarEvent) => void;
  onCancelDelete: () => void;
  onDelete: (event: CalendarEvent) => void;
}) {
  return (
    <div className="cal-agenda__event">
      <div className="cal-agenda__line">
        <button type="button" className="cal-check" aria-pressed={event.done} disabled={busy} onClick={() => onToggle(event)}
          aria-label={event.done ? `Marcar “${event.title}” como no hecho` : `Marcar “${event.title}” como hecho`}
          title={event.done ? 'Hecho: tocá para desmarcar' : 'Marcar como hecho'}>
          <Icon name="check" size={16} />
        </button>
        <div className={className}>
          <span className="cal-item__label">{event.title}</span>
          <span className="cal-item__detail">{kind}{event.done ? ' · hecho' : ''}</span>
          {event.note && <span className="cal-agenda__note">{event.note}</span>}
        </div>
      </div>
      {confirming ? (
        <div className="job__confirm" role="group" aria-label="Confirmar borrado">
          <span>¿Borramos “{event.title}”?</span>
          <span className="job__confirm-actions">
            <button type="button" className="btn btn--sm" disabled={busy} onClick={() => onDelete(event)}>Sí, borrar</button>
            <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={onCancelDelete}>No</button>
          </span>
        </div>
      ) : (
        <div className="cal-agenda__actions">
          <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => onEdit(event)}>Editar</button>
          <button type="button" className="btn btn--ghost btn--sm cal-agenda__delete" disabled={busy} onClick={() => onAskDelete(event)}>Borrar</button>
        </div>
      )}
    </div>
  );
}
