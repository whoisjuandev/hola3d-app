// Inicio: what is due today, what is late, what runs low, what waits for an answer, and how the month is going.
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { DashboardData, DashboardList, DashboardOrder, DashboardQuote, DashboardServiceTask, DashboardSpool } from '../../../shared/dashboard';
import { Icon, type IconName } from '../../ui/Icon';
import { ErrorBanner, StageChip } from '../orders/components';
import { dueLabel, money } from '../orders/format';
import { NoClientTag, Validity } from '../quotes/components';
import { stateLabel } from '../service/format';
import { grams } from '../spools/format';
import { fetchDashboard } from './api';
import { greetingDate, lateLabel, monthName, moreLabel, partialProfitNote } from './format';
import '../orders/orders.css';
import '../quotes/quotes.css';
import './home.css';

type State = { status: 'loading' } | { status: 'error'; error: string } | { status: 'ready'; data: DashboardData };

export function HomePage() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchDashboard().then(
      (data) => { if (alive) setState({ status: 'ready', data }); },
      (e: Error) => { if (alive) setState({ status: 'error', error: e.message }); },
    );
    return () => { alive = false; };
  }, [attempt]);

  const data = state.status === 'ready' ? state.data : null;

  return (
    <div className="home">
      <header className="home__head">
        <h1 className="page-title">¡Hola!</h1>
        <p className="page-sub">{data ? greetingDate(data.today) : 'Cargando…'}</p>
      </header>

      <QuickActions />

      {state.status === 'error' && <ErrorBanner text={state.error} onRetry={() => { setState({ status: 'loading' }); setAttempt((n) => n + 1); }} />}
      {state.status === 'loading' && <div className="orders__skeleton" aria-hidden="true"><span /><span /><span /></div>}

      {data && (
        <div className="home__blocks">
          <Block id="atrasados" title="Atrasados" icon="alert" list={data.overdue} urgent to="/pedidos" toLabel="Ver Pedidos"
            empty="Nada atrasado. ¡Vas al día!">
            {data.overdue.items.map((o) => <OrderItem key={o.id} order={o} today={data.today} />)}
          </Block>
          <Block id="hoy" title="Vencen hoy" icon="calendar" list={data.dueToday} to="/pedidos" toLabel="Ver Pedidos"
            empty="Hoy no vence ningún pedido.">
            {data.dueToday.items.map((o) => <OrderItem key={o.id} order={o} today={data.today} />)}
          </Block>
          <Block id="servicio" title="Mantenimiento vencido" icon="wrench" list={data.serviceDue} urgent to="/taller" toLabel="Ver Servicio técnico"
            empty="Las impresoras están al día con el mantenimiento.">
            {data.serviceDue.items.map((t) => <ServiceItem key={t.id} task={t} />)}
          </Block>
          <Block id="bobinas" title="Bobinas con poco filamento" icon="spool" list={data.lowSpools} urgent to="/filamento" toLabel="Ver Filamento"
            empty="Todas las bobinas tienen filamento de sobra.">
            {data.lowSpools.items.map((s) => <SpoolItem key={s.id} spool={s} />)}
          </Block>
          <Block id="presupuestos" title="Presupuestos sin respuesta" icon="quote" list={data.quotesWaiting} to="/presupuestos" toLabel="Ver Presupuestos"
            empty="No hay presupuestos esperando respuesta.">
            {data.quotesWaiting.items.map((q) => <QuoteItem key={q.id} quote={q} today={data.today} />)}
          </Block>
          <MonthCard data={data} />
        </div>
      )}
    </div>
  );
}

function QuickActions() {
  return (
    <nav className="home__actions" aria-label="Accesos rápidos">
      <Link to="/pedidos?nuevo=1" className="btn"><Icon name="plus" />Nuevo pedido</Link>
      <Link to="/calculadora" className="btn btn--ghost"><Icon name="calculator" />Calcular precio</Link>
      <Link to="/agenda?vista=semana&planificar=1" className="btn btn--ghost"><Icon name="printer" />Planificar impresión</Link>
    </nav>
  );
}

/** One list of the home screen: its count, its first items, a friendly empty state and a link to its section. */
function Block({ id, title, icon, list, urgent = false, to, toLabel, empty, children }: {
  id: string; title: string; icon: IconName; list: DashboardList<unknown>; urgent?: boolean; to: string; toLabel: string; empty: string;
  children: ReactNode;
}) {
  const more = moreLabel(list.count, list.items.length);
  const hot = urgent && list.count > 0;
  return (
    <section className={hot ? 'card home-block home-block--hot' : 'card home-block'} aria-labelledby={`home-${id}`}>
      <header className="home-block__head">
        <h2 id={`home-${id}`} className="home-block__title"><Icon name={icon} size={20} />{title}</h2>
        <span className="home-block__count" aria-label={`${list.count} en total`}>{list.count}</span>
      </header>
      {list.count === 0
        ? <p className="home-block__empty"><Icon name="check" size={18} />{empty}</p>
        : <ul className="home-list">{children}</ul>}
      <Link to={to} className="home-block__link">{more ? `${more} · ` : ''}{toLabel}<Icon name="forward" size={16} /></Link>
    </section>
  );
}

function OrderItem({ order, today }: { order: DashboardOrder; today: string }) {
  const late = order.daysLate > 0;
  return (
    <li>
      <Link to={`/pedidos?pedido=${order.id}`} className="home-item">
        <span className="home-item__main">
          <span className="home-item__meta">#{order.id} · {order.client} <StageChip stage={order.stage} /></span>
          <span className="home-item__title">{order.item}</span>
          <span className={late ? 'order-card__due order-card__due--late' : 'order-card__due'}>
            <Icon name="calendar" size={14} />{dueLabel(order, today)}{late ? ` · ${lateLabel(order.daysLate)}` : ''}
          </span>
        </span>
        <b className="home-item__side">{money(order.price)}</b>
      </Link>
    </li>
  );
}

function ServiceItem({ task }: { task: DashboardServiceTask }) {
  return (
    <li>
      <Link to={`/taller?impresora=${task.printerId}`} className="home-item">
        <span className="home-item__main">
          <span className="home-item__meta">{task.printer}</span>
          <span className="home-item__title">{task.name}</span>
          <span className="order-card__due order-card__due--late"><Icon name="alert" size={14} />{stateLabel(task.state)}</span>
        </span>
      </Link>
    </li>
  );
}

function SpoolItem({ spool }: { spool: DashboardSpool }) {
  const percent = Math.round(spool.share * 100);
  return (
    <li>
      <Link to="/filamento" className="home-item">
        <span className="spool-swatch" style={{ background: spool.colorHex }} aria-hidden="true" />
        <span className="home-item__main">
          <span className="home-item__meta">{spool.brand || spool.material}</span>
          <span className="home-item__title">{spool.material} · {spool.colorName}</span>
          <span className="home-meter" aria-hidden="true"><span style={{ width: `${percent}%` }} /></span>
        </span>
        <span className="home-item__side">
          <b>{grams(spool.remainingGrams)}</b>
          <span className="muted">de {grams(spool.netGrams)}</span>
        </span>
      </Link>
    </li>
  );
}

function QuoteItem({ quote, today }: { quote: DashboardQuote; today: string }) {
  return (
    <li>
      <Link to={`/presupuestos/${quote.id}`} className="home-item">
        <span className="home-item__main">
          <span className="home-item__meta">{quote.number} · {quote.client}{quote.clientId === null && <> <NoClientTag /></>}</span>
          <span className="home-item__title">{quote.title}</span>
          <Validity quote={{ status: 'enviado', validUntil: quote.validUntil }} today={today} />
        </span>
        <b className="home-item__side">{money(quote.total)}</b>
      </Link>
    </li>
  );
}

/** This month's revenue and real profit, with the note when the profit leaves out delivered orders without a real cost. */
function MonthCard({ data }: { data: DashboardData }) {
  const { month } = data;
  const note = partialProfitNote(month.withoutRealCost);
  return (
    <section className="card home-block home-month" aria-labelledby="home-mes">
      <header className="home-block__head">
        <h2 id="home-mes" className="home-block__title"><Icon name="box" size={20} />{monthName(month.month)} en plata</h2>
      </header>
      <dl className="home-month__figures">
        <div>
          <dt>Facturado</dt>
          <dd>{money(month.revenue)}</dd>
          <dd className="muted">{month.deliveredCount === 1 ? '1 pedido entregado' : `${month.deliveredCount} pedidos entregados`}</dd>
        </div>
        <div>
          <dt>Ganancia real</dt>
          <dd className={month.realProfit < 0 ? 'home-month__loss' : undefined}>{money(month.realProfit)}</dd>
          <dd className="muted">{note ? 'Parcial' : 'Precio menos lo que costó imprimir'}</dd>
        </div>
      </dl>
      {month.deliveredCount === 0 && <p className="home-block__empty">Todavía no entregaste pedidos este mes. ¡Ya va a llegar!</p>}
      {note && <p className="home-month__note"><Icon name="alert" size={16} />{note}</p>}
      <Link to="/pedidos" className="home-block__link">Ver Pedidos<Icon name="forward" size={16} /></Link>
    </section>
  );
}
