// The quote as the client sees it, outside the app shell, for the browser to print or save as PDF.
// It shows items, quantities, prices, total, validity and the note; never costs, margin or the breakdown.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { Quote } from '../../../shared/quotes';
import { formatDay } from '../../../shared/quotes';
import { Icon } from '../../ui/Icon';
import { ErrorBanner } from '../orders/components';
import { isoDate, money } from '../orders/format';
import { fetchQuote } from './api';
import '../orders/orders.css';
import './print.css';

type State = { status: 'loading' } | { status: 'error'; error: string } | { status: 'ready'; quote: Quote };

export function QuotePrintPage() {
  const id = Number(useParams().id);
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  // Put the app's title back when leaving the print view.
  useEffect(() => {
    const previous = document.title;
    return () => { document.title = previous; };
  }, []);

  useEffect(() => {
    let alive = true;
    fetchQuote(id).then(
      ({ quote }) => {
        if (!alive) return;
        setState({ status: 'ready', quote });
        // The saved PDF takes the page title as its file name.
        document.title = `Presupuesto ${quote.number} · Hola3D`;
      },
      (e: Error) => { if (alive) setState({ status: 'error', error: e.message }); },
    );
    return () => { alive = false; };
  }, [id, attempt]);

  return (
    <div className="print-page">
      <nav className="print-tools" aria-label="Acciones">
        <Link to={`/presupuestos/${id}`} className="btn btn--ghost btn--sm"><Icon name="back" size={18} />Volver al presupuesto</Link>
        {state.status === 'ready' && (
          <button type="button" className="btn btn--sm" onClick={() => window.print()}><Icon name="print" />Imprimir o guardar PDF</button>
        )}
      </nav>

      {state.status === 'loading' && <p className="muted">Cargando…</p>}
      {state.status === 'error' && <ErrorBanner text={state.error} onRetry={() => { setState({ status: 'loading' }); setAttempt((n) => n + 1); }} />}
      {state.status === 'ready' && <QuoteDocument quote={state.quote} />}
    </div>
  );
}

function QuoteDocument({ quote }: { quote: Quote }) {
  return (
    <article className="quote-doc" aria-label={`Presupuesto ${quote.number}`}>
      <header className="quote-doc__head">
        <div className="quote-doc__brand">
          <img src="/brand/cube.svg" alt="" width={52} height={57} />
          <span>
            <span className="quote-doc__brand-name">Hola3D</span>
            <span className="quote-doc__brand-tag hand">impresión 3D</span>
          </span>
        </div>
        <div className="quote-doc__id">
          <h1>Presupuesto</h1>
          <p className="quote-doc__number">{quote.number}</p>
          <p>Fecha: {formatDay(isoDate(new Date(quote.createdAt)))}</p>
        </div>
      </header>

      <section className="quote-doc__client">
        <span className="quote-doc__label">Para</span>
        <p className="quote-doc__client-name">{quote.client}</p>
        <p className="quote-doc__title">{quote.title}</p>
      </section>

      <table className="quote-doc__items">
        <thead>
          <tr>
            <th scope="col">Pieza</th>
            <th scope="col" className="num">Cantidad</th>
            <th scope="col" className="num">Precio unitario</th>
            <th scope="col" className="num">Precio</th>
          </tr>
        </thead>
        <tbody>
          {quote.result.lines.map((line, i) => (
            <tr key={i}>
              <td>{line.name}</td>
              <td className="num">{line.quantity}</td>
              <td className="num">{money(line.unitPrice)}</td>
              <td className="num">{money(line.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={3}>Total</th>
            <td className="num">{money(quote.total)}</td>
          </tr>
        </tfoot>
      </table>

      <p className="quote-doc__validity">Válido hasta el <b>{formatDay(quote.validUntil)}</b>.</p>
      {quote.note && <p className="quote-doc__note">{quote.note}</p>}

      <footer className="quote-doc__foot">
        <span className="hand">¡Gracias por elegir Hola3D!</span>
      </footer>
    </article>
  );
}
