import { useState } from 'react';
import type { Printer } from '../../../shared/printers';
import { Icon } from '../../ui/Icon';
import { useCollection } from '../../ui/useCollection';
import { PHONE_QUERY, useMediaQuery } from '../../ui/useMediaQuery';
import { ErrorBanner } from '../orders/components';
import { createPrinter, fetchPrinters, updatePrinter } from './api';
import { PrinterCard, PrinterDialog } from './components';
import '../orders/orders.css';
import './printers.css';

export function PrintersPage() {
  const { items: printers, status, error, load, add, replace } = useCollection(fetchPrinters);
  const isPhone = useMediaQuery(PHONE_QUERY);
  // undefined: closed; null: creating; a printer: editing it.
  const [editing, setEditing] = useState<Printer | null | undefined>(undefined);
  const active = printers.filter((p) => p.status === 'activa').length;

  return (
    <div className="printers">
      <header className="printers__head">
        <div>
          <h1 className="page-title">Impresoras</h1>
          <p className="page-sub">{status === 'ready' ? `${printers.length} ${printers.length === 1 ? 'impresora' : 'impresoras'} · ${active} ${active === 1 ? 'activa' : 'activas'}` : 'Cargando…'}</p>
        </div>
        {!isPhone && <button type="button" className="btn" onClick={() => setEditing(null)}><Icon name="plus" />Nueva impresora</button>}
      </header>

      {error && <ErrorBanner text={error} onRetry={() => void load()} />}

      {status === 'loading' && <div className="orders__skeleton" aria-hidden="true"><span /><span /></div>}

      {status === 'ready' && printers.length === 0 && (
        <section className="card empty">
          <div className="tape tape--sky" aria-hidden="true" />
          <p className="hand empty__title">Todavía no cargaste impresoras</p>
          <p className="muted">Con el precio y la vida útil sale cuánto se gasta la máquina por cada hora de impresión.</p>
          <button type="button" className="btn btn--sm" onClick={() => setEditing(null)}>Cargar una impresora</button>
        </section>
      )}

      {status === 'ready' && printers.length > 0 && (
        <div className="printers__grid">
          {printers.map((p) => <PrinterCard key={p.id} printer={p} onEdit={() => setEditing(p)} />)}
        </div>
      )}

      {isPhone && editing === undefined && (
        <button type="button" className="btn fab" aria-label="Nueva impresora" onClick={() => setEditing(null)}><Icon name="plus" size={26} /></button>
      )}

      {editing !== undefined && (
        <PrinterDialog
          printer={editing}
          onCreate={async (input) => add(await createPrinter(input))}
          onUpdate={async (id, changes) => replace(await updatePrinter(id, changes))}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}
