import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { ClientSummary } from '../../../shared/clients';
import type { Order } from '../../../shared/orders';
import type { Quote } from '../../../shared/quotes';
import { Icon } from '../../ui/Icon';
import { ErrorBanner } from '../orders/components';
import { isoDate } from '../orders/format';
import { fetchClientQuotes } from '../quotes/api';
import { QuoteRow } from '../quotes/components';
import { fetchClient, updateClient } from './api';
import { ClientDialog, ClientOrderRow, ClientTotals, ContactLinks } from './components';
import '../orders/orders.css';
import './clients.css';
import '../quotes/quotes.css';

type State =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; client: ClientSummary; orders: Order[] };

export function ClientPage() {
  const id = Number(useParams().id);
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const [today] = useState(() => isoDate(new Date()));
  // Loaded on their own: the client page still works when they fail.
  const [quotes, setQuotes] = useState<Quote[] | null>(null);
  const [quotesError, setQuotesError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchClient(id).then(
      ({ client, orders }) => { if (alive) setState({ status: 'ready', client, orders }); },
      (e: Error) => { if (alive) setState({ status: 'error', error: e.message }); },
    );
    fetchClientQuotes(id).then(
      (list) => { if (alive) { setQuotes(list); setQuotesError(null); } },
      (e: Error) => { if (alive) setQuotesError(e.message); },
    );
    return () => { alive = false; };
  }, [id, attempt]);

  const retry = () => { setState({ status: 'loading' }); setAttempt((n) => n + 1); };

  return (
    <div className="client-page">
      <Link to="/clientes" className="back-link"><Icon name="back" size={18} />Clientes</Link>

      {state.status === 'loading' && <div className="orders__skeleton" aria-hidden="true"><span /><span /></div>}

      {state.status === 'error' && <ErrorBanner text={state.error} onRetry={retry} />}

      {state.status === 'ready' && (
        <>
          <header className="clients__head">
            <div>
              <h1 className="page-title">{state.client.name}</h1>
              <p className="page-sub">
                {state.client.orderCount === 0 ? 'Sin pedidos todavía' : `${state.client.orderCount} ${state.client.orderCount === 1 ? 'pedido' : 'pedidos'}`}
              </p>
            </div>
            <button type="button" className="btn btn--ghost" onClick={() => setEditing(true)}>Editar cliente</button>
          </header>

          <div className="client-page__top">
            <section className="card client-page__contact" aria-labelledby="contacto">
              <h2 id="contacto" className="client-page__section">Contacto</h2>
              <ContactLinks client={state.client} />
              {state.client.note && <p className="client-page__note">{state.client.note}</p>}
            </section>
            <section className="card client-page__money" aria-label="Cuentas">
              <ClientTotals client={state.client} big />
              <p className="muted">Total gastado: pedidos entregados. Saldo: lo que falta cobrar de los pedidos sin pagar, descontada la seña.</p>
            </section>
          </div>

          <section aria-labelledby="pedidos-cliente" className="client-page__orders">
            <h2 id="pedidos-cliente" className="client-page__section">Pedidos</h2>
            {state.orders.length === 0
              ? <p className="lane__empty">Todavía no tiene pedidos. Cargalo desde <Link to="/pedidos">Pedidos</Link> y elegí este cliente.</p>
              : <ul className="client-orders">{state.orders.map((o) => <ClientOrderRow key={o.id} order={o} today={today} />)}</ul>}
          </section>

          <section aria-labelledby="presupuestos-cliente" className="client-page__orders">
            <h2 id="presupuestos-cliente" className="client-page__section">Presupuestos</h2>
            {quotesError && <ErrorBanner text={`No se pudieron cargar los presupuestos: ${quotesError}`} onRetry={retry} />}
            {quotes && quotes.length === 0 && (
              <p className="lane__empty">Todavía no tiene presupuestos. Armalo en la <Link to="/calculadora">Calculadora</Link> y guardalo para este cliente.</p>
            )}
            {quotes && quotes.length > 0 && (
              <ul className="quote-rows">{quotes.map((q) => <QuoteRow key={q.id} quote={q} today={today} showClient={false} />)}</ul>
            )}
          </section>

          {editing && (
            <ClientDialog
              client={state.client}
              onCreate={async () => undefined}
              onUpdate={async (clientId, changes) => {
                const client = await updateClient(clientId, changes);
                setState((s) => (s.status === 'ready' ? { ...s, client, orders: s.orders.map((o) => ({ ...o, client: client.name })) } : s));
              }}
              onClose={() => setEditing(false)}
            />
          )}
        </>
      )}
    </div>
  );
}
