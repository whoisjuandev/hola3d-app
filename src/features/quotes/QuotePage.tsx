import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { Channel } from '../../../shared/orders';
import { canAcceptQuote, formatDay, quoteWhatsappUrl, type QuoteStatus } from '../../../shared/quotes';
import { Icon } from '../../ui/Icon';
import { Summary } from '../calculator/components';
import { ClientOrderRow } from '../clients/components';
import { ErrorBanner } from '../orders/components';
import { isoDate } from '../orders/format';
import { acceptQuote, fetchQuote, updateQuote, type QuoteDetail } from './api';
import { AcceptDialog, EditQuoteDialog, FrozenLine, QuoteStatusChip, Validity } from './components';
import '../orders/orders.css';
import '../clients/clients.css';
import '../calculator/calculator.css';
import './quotes.css';

type State = { status: 'loading' } | { status: 'error'; error: string } | ({ status: 'ready' } & QuoteDetail);

export function QuotePage() {
  const id = Number(useParams().id);
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [dialog, setDialog] = useState<'edit' | 'accept' | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [today] = useState(() => isoDate(new Date()));

  useEffect(() => {
    let alive = true;
    fetchQuote(id).then(
      (detail) => { if (alive) setState({ status: 'ready', ...detail }); },
      (e: Error) => { if (alive) setState({ status: 'error', error: e.message }); },
    );
    return () => { alive = false; };
  }, [id, attempt]);

  const retry = () => { setState({ status: 'loading' }); setAttempt((n) => n + 1); };

  if (state.status !== 'ready') {
    return (
      <div className="quote-page">
        <Link to="/presupuestos" className="back-link"><Icon name="back" size={18} />Presupuestos</Link>
        {state.status === 'loading' && <div className="orders__skeleton" aria-hidden="true"><span /><span /></div>}
        {state.status === 'error' && <ErrorBanner text={state.error} onRetry={retry} />}
      </div>
    );
  }

  const { quote, client, orders } = state;
  const open = canAcceptQuote(quote.status);

  const save = async (changes: Record<string, unknown>) => {
    const saved = await updateQuote(quote.id, changes);
    setState((s) => (s.status === 'ready' ? { ...s, quote: saved } : s));
  };

  const move = async (status: QuoteStatus) => {
    setBusy(true);
    setActionError(null);
    try {
      await save({ status });
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const accept = async (channel: Channel) => {
    const accepted = await acceptQuote(quote.id, channel);
    setState((s) => (s.status === 'ready' ? { ...s, ...accepted } : s));
  };

  return (
    <div className="quote-page">
      <Link to="/presupuestos" className="back-link"><Icon name="back" size={18} />Presupuestos</Link>

      <header className="quotes__head">
        <div>
          <p className="quote-page__number">{quote.number} <QuoteStatusChip status={quote.status} /></p>
          <h1 className="page-title">{quote.title}</h1>
          <p className="page-sub quote-page__sub">
            <span>Para <Link to={`/clientes/${quote.clientId}`}>{quote.client}</Link></span>
            <Validity quote={quote} today={today} />
            <span>Guardado el {formatDay(isoDate(new Date(quote.createdAt)))}</span>
          </p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={() => setDialog('edit')}>Editar</button>
      </header>

      <div className="quote-actions" role="group" aria-label="Acciones">
        {quote.status === 'borrador' && (
          <button type="button" className="btn" disabled={busy} onClick={() => void move('enviado')}><Icon name="check" />Marcar como enviado</button>
        )}
        {open && <button type="button" className="btn" disabled={busy} onClick={() => setDialog('accept')}>Aceptar y crear pedidos</button>}
        {open && <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void move('rechazado')}>Rechazar</button>}
        {(quote.status === 'enviado' || quote.status === 'rechazado') && (
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void move('borrador')}>Volver a borrador</button>
        )}
        <a className="btn btn--ghost" href={quoteWhatsappUrl(quote, client?.phone ?? '')} target="_blank" rel="noreferrer">
          <Icon name="chat" />WhatsApp
        </a>
        <Link className="btn btn--ghost" to={`/presupuestos/${quote.id}/imprimir`}><Icon name="print" />Imprimir o PDF</Link>
      </div>

      {actionError && <ErrorBanner text={actionError} onDismiss={() => setActionError(null)} />}

      {quote.note && (
        <section className="card quote-page__note" aria-label="Nota para el cliente">
          <span className="field__label">Nota para el cliente</span>
          <p>{quote.note}</p>
        </section>
      )}

      {quote.status === 'aceptado' && (
        <section aria-labelledby="pedidos-presupuesto" className="client-page__orders">
          <h2 id="pedidos-presupuesto" className="client-page__section">Pedidos creados</h2>
          {orders.length === 0
            ? <p className="lane__empty">Este presupuesto no tiene pedidos.</p>
            : <ul className="client-orders">{orders.map((o) => <ClientOrderRow key={o.id} order={o} today={today} />)}</ul>}
          <Link to="/pedidos" className="back-link">Ver el tablero de Pedidos</Link>
        </section>
      )}

      <div className="quote-page__body">
        <section className="quote-page__lines" aria-labelledby="piezas">
          <h2 id="piezas" className="client-page__section">Piezas</h2>
          {quote.result.lines.map((line, i) => <FrozenLine key={i} line={line} settings={quote.result.settings} />)}
        </section>
        <aside className="calc__aside">
          <Summary result={quote.result} settings={quote.result.settings} />
          <p className="muted calc__note">
            Costos y precios congelados al guardar. Si cambian los costos del taller, las bobinas o las impresoras, este presupuesto no cambia.
            El cliente no ve este desglose.
          </p>
        </aside>
      </div>

      {dialog === 'edit' && <EditQuoteDialog quote={quote} onSave={save} onClose={() => setDialog(null)} />}
      {dialog === 'accept' && <AcceptDialog quote={quote} onAccept={accept} onClose={() => setDialog(null)} />}
    </div>
  );
}
