// The quote as the client sees it, outside the app shell, for the browser to print or save as PDF.
// It shows items, quantities, prices, total, validity (when it has one) and the note. Costs and profit only when the
// quote's "Incluir desglose de costos" switch is on: then each piece's cost breakdown, the total cost and the profit.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { BREAKDOWN_TERMS, type CalcResult } from '../../../shared/calculator';
import { profitLabel, resultProfit } from '../../../shared/profit';
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
        <p className="quote-doc__client-name">{quote.client ?? quote.recipientName}</p>
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

      {quote.validUntil !== null && <p className="quote-doc__validity">Válido hasta el <b>{formatDay(quote.validUntil)}</b>.</p>}
      {quote.note && <p className="quote-doc__note">{quote.note}</p>}
      {quote.showBreakdown && <CostBreakdown result={quote.result} />}

      <footer className="quote-doc__foot">
        <span className="hand">¡Gracias por elegir Hola3D!</span>
      </footer>
    </article>
  );
}

/** The cost terms of a piece, up to its production cost: what the price is made of before the profit. */
const COST_TERMS = BREAKDOWN_TERMS.slice(0, BREAKDOWN_TERMS.findIndex((t) => t.key === 'productionCost') + 1);

/** Each piece's costs, then the total production cost and the profit, as the quote froze them. */
function CostBreakdown({ result }: { result: CalcResult }) {
  return (
    <section className="quote-doc__costs" aria-labelledby="desglose">
      <h2 id="desglose" className="quote-doc__label">Desglose de costos</h2>
      <div className="quote-doc__pieces">
        {result.lines.map((line, i) => (
          <div key={i} className="quote-doc__piece">
            <p className="quote-doc__piece-name">{line.name}{line.quantity > 1 ? ` × ${line.quantity}` : ''}</p>
            <dl>
              {COST_TERMS.map((t) => (
                <div key={t.key} className={t.total ? 'quote-doc__cost quote-doc__cost--total' : 'quote-doc__cost'}>
                  <dt>{t.label}</dt>
                  <dd>{money(line.breakdown[t.key])}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <dl className="quote-doc__cost-totals">
        <div className="quote-doc__cost"><dt>Costo de producción total</dt><dd>{money(result.breakdown.productionCost)}</dd></div>
        <div className="quote-doc__cost"><dt>Ganancia ({profitLabel(resultProfit(result))})</dt><dd>{money(result.breakdown.profit)}</dd></div>
      </dl>
    </section>
  );
}
