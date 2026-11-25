import { useCallback, useEffect, useState } from 'react';
import type { Printer } from '../../../shared/printers';
import type { ServiceTaskWithState } from '../../../shared/service';
import { Icon } from '../../ui/Icon';
import { useCollection } from '../../ui/useCollection';
import { PHONE_QUERY, useMediaQuery } from '../../ui/useMediaQuery';
import { ErrorBanner } from '../orders/components';
import { fetchServiceTasks } from '../service/api';
import { createPrinter, fetchPrinters, updatePrinter } from './api';
import { PrinterCard, PrinterDialog, type PrinterService } from './components';
import '../orders/orders.css';
import './printers.css';

export function PrintersPage() {
  const { items: printers, status, error, load, add, replace } = useCollection(fetchPrinters);
  const isPhone = useMediaQuery(PHONE_QUERY);
  // undefined: closed; null: creating; a printer: editing it.
  const [editing, setEditing] = useState<Printer | null | undefined>(undefined);
  const active = printers.filter((p) => p.status === 'activa').length;
  // Service tasks, for each card's badge. Without them the cards just leave the service line out.
  const [tasks, setTasks] = useState<ServiceTaskWithState[] | null>(null);
  const [tasksAttempt, setTasksAttempt] = useState(0);
  const reloadTasks = useCallback(() => setTasksAttempt((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    fetchServiceTasks().then(
      (list) => { if (alive) setTasks(list); },
      () => { if (alive) setTasks(null); },
    );
    return () => { alive = false; };
  }, [tasksAttempt]);

  const serviceOf = (id: number): PrinterService | undefined => {
    if (!tasks) return undefined;
    const mine = tasks.filter((t) => t.printerId === id);
    return { tasks: mine.length, due: mine.filter((t) => t.state.due).length };
  };

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
          {printers.map((p) => <PrinterCard key={p.id} printer={p} service={serviceOf(p.id)} onEdit={() => setEditing(p)} onPlanAdopted={reloadTasks} />)}
        </div>
      )}

      {isPhone && editing === undefined && (
        <button type="button" className="btn fab" aria-label="Nueva impresora" onClick={() => setEditing(null)}><Icon name="plus" size={26} /></button>
      )}

      {editing !== undefined && (
        <PrinterDialog
          printer={editing}
          onCreate={async (input) => { add(await createPrinter(input)); reloadTasks(); }}
          onUpdate={async (id, changes) => replace(await updatePrinter(id, changes))}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}
