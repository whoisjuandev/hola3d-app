// Calendario: a month and a week of due orders, projects, service tasks by date, and the prints planned per printer.
import { Fragment, useEffect, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { CalendarData, CalendarPlannedJob } from '../../../shared/calendar';
import type { Printer } from '../../../shared/printers';
import { workshopToday } from '../../../shared/service';
import { Icon } from '../../ui/Icon';
import { PHONE_QUERY, useMediaQuery } from '../../ui/useMediaQuery';
import { ErrorBanner } from '../orders/components';
import { fetchPrinters } from '../printers/api';
import { durationLabel } from '../quotes/format';
import { fetchCalendar } from './api';
import {
  KIND_LABEL, WEEKDAYS, dayBars, dayItems, dayTitle, hourMarks, laneHours, monthGrid, monthTitle, readView, shiftAnchor, timeRange, viewRange, weekDays, weekTitle,
  type CalendarView, type DayItem, type ItemKind,
} from './format';
import { PlanJobDialog, type PlannedJobRef } from './PlanJobDialog';
import '../orders/orders.css';
import './calendar.css';

type State = { status: 'loading' } | { status: 'error'; error: string } | { status: 'ready'; key: string; data: CalendarData; printers: Printer[] };

/** What the plan dialog opens with: a planned job to change, or a new plan on a day and maybe a printer. */
type Dialog = { job: CalendarPlannedJob } | { date: string; printerId?: number };

const MONTH_LABELS = 3; // labels a month cell shows before "+N más"
const TRACK_HEIGHT = 50; // px per track of a printer's row

export function CalendarPage() {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [today] = useState(() => workshopToday(new Date()));
  const [params, setParams] = useSearchParams();
  const { view, anchor } = readView(params, today);
  const range = viewRange(view, anchor);
  const key = `${range.from}/${range.to}`;
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  // `?planificar=1` (from Inicio) opens the plan dialog on today.
  const [dialog, setDialog] = useState<Dialog | null>(() => (params.get('planificar') === '1' ? { date: today } : null));

  useEffect(() => {
    let alive = true;
    const [from, to] = key.split('/');
    Promise.all([fetchCalendar({ from, to }), fetchPrinters()]).then(
      ([data, printers]) => { if (alive) setState({ status: 'ready', key, data, printers }); },
      (e: Error) => { if (alive) setState({ status: 'error', error: e.message }); },
    );
    return () => { alive = false; };
  }, [key, attempt]);

  const go = (nextView: CalendarView, nextAnchor: string) => setParams({ vista: nextView, dia: nextAnchor });
  const reload = () => setAttempt((n) => n + 1);
  // The data of another range stays on screen, faded, until the new one arrives.
  const ready = state.status === 'ready' ? state : null;
  const stale = ready !== null && ready.key !== key;

  return (
    <div className="calendar">
      <header className="calendar__head">
        <div>
          <h1 className="page-title">Calendario</h1>
          <p className="page-sub" aria-live="polite">{view === 'mes' ? monthTitle(anchor) : weekTitle(anchor)}</p>
        </div>
        <div className="calendar__tools">
          <div className="pills-row calendar__views" role="group" aria-label="Vista">
            <button type="button" className="pill" aria-pressed={view === 'mes'} onClick={() => go('mes', anchor)}>Mes</button>
            <button type="button" className="pill" aria-pressed={view === 'semana'} onClick={() => go('semana', anchor)}>Semana</button>
          </div>
          <div className="calendar__nav">
            <button type="button" className="icon-btn icon-btn--quiet" aria-label={view === 'mes' ? 'Mes anterior' : 'Semana anterior'}
              onClick={() => go(view, shiftAnchor(view, anchor, -1))}><Icon name="back" /></button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => go(view, today)}>Hoy</button>
            <button type="button" className="icon-btn icon-btn--quiet" aria-label={view === 'mes' ? 'Mes siguiente' : 'Semana siguiente'}
              onClick={() => go(view, shiftAnchor(view, anchor, 1))}><Icon name="forward" /></button>
          </div>
          {view === 'semana' && (
            <button type="button" className="btn btn--sm" onClick={() => setDialog({ date: range.from <= today && today <= range.to ? today : range.from })}>
              <Icon name="plus" size={16} />Planificar impresión
            </button>
          )}
        </div>
      </header>

      <Legend />

      {state.status === 'error' && <ErrorBanner text={state.error} onRetry={() => { setState({ status: 'loading' }); reload(); }} />}
      {state.status === 'loading' && <div className="orders__skeleton" aria-hidden="true"><span /><span /><span /></div>}

      {ready && (
        <div className={stale ? 'calendar__body calendar__body--stale' : 'calendar__body'} aria-busy={stale}>
          {view === 'mes' && <MonthView anchor={anchor} today={today} data={ready.data} compact={isPhone} onOpenWeek={(day) => go('semana', day)} />}
          {view === 'semana' && !isPhone && (
            <WeekGrid anchor={anchor} today={today} data={ready.data} printers={ready.printers}
              onPlan={(date, printerId) => setDialog({ date, printerId })} onOpenJob={(job) => setDialog({ job })} />
          )}
          {view === 'semana' && isPhone && <DayList anchor={anchor} today={today} data={ready.data} onOpenJob={(job) => setDialog({ job })} />}
        </div>
      )}

      {dialog && (
        <PlanJobDialog
          job={'job' in dialog ? toRef(dialog.job) : null}
          order={'job' in dialog ? { id: dialog.job.orderId, item: dialog.job.item } : undefined}
          defaults={'job' in dialog ? undefined : { date: dialog.date, printerId: dialog.printerId ? String(dialog.printerId) : undefined }}
          orderLink
          onSaved={reload}
          onDeleted={reload}
          onClose={() => {
            setDialog(null);
            if (params.has('planificar')) setParams({ vista: view, dia: anchor }, { replace: true });
          }}
        />
      )}
    </div>
  );
}

function toRef(job: CalendarPlannedJob): PlannedJobRef {
  return { id: job.id, orderId: job.orderId, printerId: job.printerId, plannedStart: job.start, estimatedMinutes: job.estimatedMinutes, note: job.note };
}

function Legend() {
  const kinds: ItemKind[] = ['order', 'project', 'service', 'job'];
  return (
    <ul className="calendar__legend" aria-label="Referencias">
      {kinds.map((k) => <li key={k}><span className={`cal-dot cal-dot--${k}`} aria-hidden="true" />{KIND_LABEL[k]}</li>)}
      <li><span className="cal-dot cal-dot--late" aria-hidden="true" />Atrasado</li>
    </ul>
  );
}

function itemClass(item: DayItem): string {
  return `cal-item cal-item--${item.kind}${item.overdue ? ' cal-item--late' : ''}`;
}

/** One due order, project or service task, linked to its section. */
function ItemLink({ item }: { item: DayItem }) {
  return (
    <Link to={item.to} className={itemClass(item)} title={`${item.label} · ${item.detail}`}>
      <span className="cal-item__label">{item.label}</span>
      <span className="cal-item__detail">{item.detail}{item.overdue ? ' · atrasado' : ''}</span>
    </Link>
  );
}

function MonthView({ anchor, today, data, compact, onOpenWeek }: {
  anchor: string; today: string; data: CalendarData; compact: boolean; onOpenWeek: (day: string) => void;
}) {
  const month = anchor.slice(0, 7);
  return (
    <div className="cal-month">
      {WEEKDAYS.map((d) => <span key={d} className="cal-month__weekday" aria-hidden="true">{d}</span>)}
      {monthGrid(anchor).map((day) => {
        const items = dayItems(data, day);
        const shown = items.slice(0, compact ? 4 : MONTH_LABELS);
        const more = items.length - shown.length;
        const classes = ['cal-month__day', day.slice(0, 7) !== month && 'cal-month__day--other', day === today && 'cal-month__day--today'].filter(Boolean).join(' ');
        const summary = items.length === 0 ? 'nada' : items.map((i) => `${KIND_LABEL[i.kind]} ${i.label}${i.overdue ? ', atrasado' : ''}`).join('; ');
        return (
          <button key={day} type="button" className={classes} onClick={() => onOpenWeek(day)} aria-label={`${dayTitle(day)}: ${summary}. Ver la semana.`}>
            <span className="cal-month__num">{Number(day.slice(8))}</span>
            {compact ? (
              <span className="cal-month__dots" aria-hidden="true">
                {shown.map((i) => <span key={i.key} className={`cal-dot cal-dot--${i.overdue ? 'late' : i.kind}`} />)}
                {more > 0 && <span className="cal-month__more">+{more}</span>}
              </span>
            ) : (
              <span className="cal-month__items" aria-hidden="true">
                {shown.map((i) => <span key={i.key} className={itemClass(i)}><span className="cal-item__label">{i.label}</span></span>)}
                {more > 0 && <span className="cal-month__more">+{more} más</span>}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function DayHead({ day, today }: { day: string; today: string }) {
  return (
    <span className={day === today ? 'cal-week__day cal-week__day--today' : 'cal-week__day'}>
      {dayTitle(day)}{day === today && <span className="cal-week__today">Hoy</span>}
    </span>
  );
}

function WeekGrid({ anchor, today, data, printers, onPlan, onOpenJob }: {
  anchor: string; today: string; data: CalendarData; printers: Printer[];
  onPlan: (date: string, printerId: number) => void; onOpenJob: (job: CalendarPlannedJob) => void;
}) {
  const days = weekDays(anchor);
  // One row per active printer, plus any other printer that has a planned job this week.
  const rows = printers.filter((p) => p.status === 'activa' || data.plannedJobs.some((j) => j.printerId === p.id));
  // Every day column of every lane shows the same hours: the ones this week's jobs use, at least 08:00 to 20:00.
  const hours = laneHours(data.plannedJobs, days);
  const marks = hourMarks(hours);
  return (
    <div className="cal-week" style={{ '--lane-hours': hours.to - hours.from } as CSSProperties}>
      <div className="cal-week__grid">
        <span className="cal-week__corner" />
        {days.map((d) => <DayHead key={d} day={d} today={today} />)}

        <span className="cal-week__label">Entregas y servicio</span>
        {days.map((d) => (
          <div key={d} className={d === today ? 'cal-week__cell cal-week__cell--today' : 'cal-week__cell'}>
            {dayItems(data, d, false).map((item) => <ItemLink key={item.key} item={item} />)}
          </div>
        ))}

        {rows.length > 0 && (
          <>
            <span className="cal-week__label cal-week__label--hours">Horario</span>
            {days.map((d) => (
              <div key={d} className="cal-week__hours" aria-hidden="true">
                {marks.map((m) => <span key={m.text} style={{ left: `${m.left}%` }}>{m.text}</span>)}
              </div>
            ))}
          </>
        )}

        {rows.map((p) => {
          const jobs = data.plannedJobs.filter((j) => j.printerId === p.id);
          const bars = days.map((d) => dayBars(jobs, d, hours));
          const trackCount = Math.max(1, ...bars.map((b) => b.length));
          return (
            <Fragment key={p.id}>
              <span className="cal-week__label"><Icon name="printer" size={16} />{p.name}</span>
              <div className="cal-week__lane" role="group" aria-label={`Impresiones de ${p.name}`}>
                {days.map((d, i) => (
                  <div key={d} className="cal-week__day-lane" style={{ minHeight: 16 + trackCount * TRACK_HEIGHT }}>
                    <button type="button" className="cal-week__slot" aria-label={`Planificar en ${p.name} el ${dayTitle(d)}`}
                      disabled={p.status !== 'activa'} onClick={() => onPlan(d, p.id)} />
                    {bars[i].map(({ job: j, left, width, track, fromBefore, goesOn }) => {
                      const text = `#${j.orderId} ${j.item} · ${timeRange(j)} · ${durationLabel(j.estimatedMinutes)}`;
                      const barClass = ['cal-job__bar', fromBefore && 'cal-job__bar--from-before', goesOn && 'cal-job__bar--goes-on'].filter(Boolean).join(' ');
                      return (
                        // The button spans its day's column; the bar sits at the job's hours, the label under it stays in the column.
                        <button key={j.id} type="button" className="cal-job" style={{ top: 8 + track * TRACK_HEIGHT }} title={text}
                          aria-label={`Impresión planeada del pedido #${j.orderId}, ${j.item}, ${dayTitle(j.start.slice(0, 10))} ${timeRange(j)}. Cambiar el plan.`}
                          onClick={() => onOpenJob(j)}>
                          <span className="cal-job__track"><span className={barClass} style={{ marginLeft: `${left}%`, width: `${width}%` }} /></span>
                          <span className="cal-job__text">
                            <span className="cal-job__label">#{j.orderId} {j.item}</span>
                            <span className="cal-job__time">{timeRange(j)}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </Fragment>
          );
        })}
      </div>
      {rows.length === 0 && <p className="lane__empty">No hay impresoras activas para planificar.</p>}
    </div>
  );
}

/** The week on a phone: one block per day with what is due and what prints. */
function DayList({ anchor, today, data, onOpenJob }: {
  anchor: string; today: string; data: CalendarData; onOpenJob: (job: CalendarPlannedJob) => void;
}) {
  return (
    <ol className="cal-days">
      {weekDays(anchor).map((d) => {
        const items = dayItems(data, d, false);
        const jobs = data.plannedJobs.filter((j) => j.start < `${d}T24:00` && j.end > `${d}T00:00`);
        return (
          <li key={d} className={d === today ? 'cal-day cal-day--today' : 'cal-day'}>
            <h2 className="cal-day__title"><DayHead day={d} today={today} /></h2>
            {items.length === 0 && jobs.length === 0 && <p className="cal-day__empty">Nada para este día.</p>}
            {items.map((item) => <ItemLink key={item.key} item={item} />)}
            {jobs.map((j) => (
              <button key={j.id} type="button" className="cal-item cal-item--job" onClick={() => onOpenJob(j)}
                aria-label={`Impresión planeada del pedido #${j.orderId}, ${j.item}, en ${j.printer}, ${timeRange(j)}. Cambiar el plan.`}>
                <span className="cal-item__label">#{j.orderId} {j.item}</span>
                <span className="cal-item__detail">{j.printer} · {timeRange(j)}</span>
              </button>
            ))}
          </li>
        );
      })}
    </ol>
  );
}
