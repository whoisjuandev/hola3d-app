import { useState } from 'react';
import { Link } from 'react-router';
import { QUOTE_STATUSES, QUOTE_STATUS_LABEL, type QuoteStatus } from '../../../shared/quotes';
import { Icon } from '../../ui/Icon';
import { useCollection } from '../../ui/useCollection';
import { ErrorBanner } from '../orders/components';
import { isoDate, money } from '../orders/format';
import { fetchQuotes } from './api';
import { QuoteRow } from './components';
import '../orders/orders.css';
import './quotes.css';

type Filter = 'todos' | QuoteStatus;

export function QuotesPage() {
  const { items: quotes, status, error, load } = useCollection(fetchQuotes);
  const [filter, setFilter] = useState<Filter>('todos');
  const [today] = useState(() => isoDate(new Date()));

  const listed = filter === 'todos' ? quotes : quotes.filter((q) => q.status === filter);
  const sum = listed.reduce((total, q) => total + q.total, 0);
  const waiting = quotes.filter((q) => q.status === 'borrador' || q.status === 'enviado');
  const summary = `${quotes.length} ${quotes.length === 1 ? 'presupuesto' : 'presupuestos'} · ${money(waiting.reduce((t, q) => t + q.total, 0))} esperando respuesta`;
  const pills: { key: Filter; label: string; count: number }[] = [
    { key: 'todos', label: 'Todos', count: quotes.length },
    ...QUOTE_STATUSES.map((s) => ({ key: s as Filter, label: QUOTE_STATUS_LABEL[s], count: quotes.filter((q) => q.status === s).length })),
  ];

  return (
    <div className="quotes">
      <header className="quotes__head">
        <div>
          <h1 className="page-title">Presupuestos</h1>
          <p className="page-sub">{status === 'ready' ? summary : 'Cargando…'}</p>
        </div>
        <Link to="/calculadora" className="btn"><Icon name="calculator" />Armar uno en la Calculadora</Link>
      </header>

      {error && <ErrorBanner text={error} onRetry={() => void load()} />}

      {status === 'loading' && <div className="orders__skeleton" aria-hidden="true"><span /><span /><span /></div>}

      {status === 'ready' && quotes.length > 0 && (
        <div className="pills-row" role="group" aria-label="Estado">
          {pills.map((p) => (
            <button key={p.key} type="button" className="pill" aria-pressed={filter === p.key} onClick={() => setFilter(p.key)}>
              {p.label}<span className="pill__count">{p.count}</span>
            </button>
          ))}
        </div>
      )}

      {status === 'ready' && quotes.length === 0 && (
        <section className="card empty">
          <div className="tape tape--sky" aria-hidden="true" />
          <p className="hand empty__title">Todavía no hay presupuestos</p>
          <p className="muted">Calculá el precio en la Calculadora y tocá «Guardar como presupuesto».</p>
          <Link to="/calculadora" className="btn btn--sm">Ir a la Calculadora</Link>
        </section>
      )}

      {status === 'ready' && quotes.length > 0 && (
        <section aria-label="Presupuestos" className="quotes__list">
          {listed.length === 0
            ? <p className="lane__empty">Ningún presupuesto {QUOTE_STATUS_LABEL[filter as QuoteStatus].toLowerCase()} por ahora.</p>
            : <ul className="quote-rows">{listed.map((q) => <QuoteRow key={q.id} quote={q} today={today} showClient />)}</ul>}
          {listed.length > 0 && (
            <p className="quotes__sum">
              <span>{listed.length} {listed.length === 1 ? 'presupuesto' : 'presupuestos'}</span>
              <span>Total <b>{money(sum)}</b></span>
            </p>
          )}
        </section>
      )}
    </div>
  );
}
