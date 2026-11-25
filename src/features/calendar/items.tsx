// How one thing of a day shows in the calendar: a due order, project or service task, a planned print, or a hand-made
// event in its type's colour (struck through once done).
import { Link } from 'react-router';
import type { CalendarEvent } from '../../../shared/calendar-events';
import { itemClass, kindLabel, type DayItem } from './format';

/** One item, linked to its section; a hand-made event opens its form instead, when `onOpenEvent` is given. */
export function ItemLink({ item, onOpenEvent }: { item: DayItem; onOpenEvent?: (event: CalendarEvent) => void }) {
  const text = (
    <>
      <span className="cal-item__label">{item.label}</span>
      <span className="cal-item__detail">{item.detail}{item.overdue ? ' · atrasado' : ''}{item.done ? ' · hecho' : ''}</span>
    </>
  );
  if (item.to) return <Link to={item.to} className={itemClass(item)} title={`${item.label} · ${item.detail}`}>{text}</Link>;
  const { event } = item;
  if (event && onOpenEvent) {
    return (
      <button type="button" className={itemClass(item)} title={`${item.label} · ${item.detail}`} onClick={() => onOpenEvent(event)}
        aria-label={`${kindLabel(item)}: ${item.label}${item.done ? ', hecho' : ''}. Editar el evento.`}>
        {text}
      </button>
    );
  }
  return <span className={itemClass(item)} title={`${item.label} · ${item.detail}`}>{text}</span>;
}
