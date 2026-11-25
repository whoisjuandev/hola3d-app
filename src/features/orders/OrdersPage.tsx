import { useCallback, useMemo, useState } from 'react';
import { isActive, matchesSearch } from '../../../shared/orders';
import { Icon } from '../../ui/Icon';
import { PHONE_QUERY, useMediaQuery } from '../../ui/useMediaQuery';
import { ErrorBanner, NewOrderDialog, OrderCard, OrderDetail, StageBoard, StageTabs, UndoToast, type StageTab } from './components';
import { isoDate } from './format';
import { useOrders } from './useOrders';
import './orders.css';

export function OrdersPage() {
  const { orders, status, error, lastChange, load, move, undo, create, update, dismissError, dismissChange } = useOrders();
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<StageTab>('activos');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [today] = useState(() => isoDate(new Date()));

  const found = useMemo(() => orders.filter((o) => matchesSearch(o, query)), [orders, query]);
  const listed = isPhone ? found.filter((o) => (tab === 'activos' ? isActive(o) : o.stage === tab)) : found;
  const selected = orders.find((o) => o.id === selectedId) ?? null;
  const activeCount = orders.filter(isActive).length;
  const close = useCallback(() => setSelectedId(null), []);

  return (
    <div className={selected && !isPhone ? 'orders orders--with-detail' : 'orders'}>
      <header className="orders__head">
        <div>
          <h1 className="page-title">Pedidos</h1>
          <p className="page-sub">{status === 'ready' ? `${orders.length} pedidos · ${activeCount} activos` : 'Cargando…'}</p>
        </div>
        <div className="orders__tools">
          <label className="search">
            <Icon name="search" />
            <span className="visually-hidden">Buscar pedido</span>
            <input type="search" placeholder="Cliente, pieza o número" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          {!isPhone && <button type="button" className="btn" onClick={() => setCreating(true)}><Icon name="plus" />Nuevo pedido</button>}
        </div>
      </header>

      {error && <ErrorBanner text={error} onRetry={status === 'error' ? () => void load() : undefined} onDismiss={status === 'error' ? undefined : dismissError} />}

      {status === 'loading' && <div className="orders__skeleton" aria-hidden="true"><span /><span /><span /></div>}

      {status === 'ready' && isPhone && <StageTabs orders={found} value={tab} onChange={setTab} />}

      {status === 'ready' && found.length === 0 && (
        <section className="card empty" aria-live="polite">
          <div className="tape tape--sky" aria-hidden="true" />
          {query ? (
            <>
              <p className="hand empty__title">No encontramos «{query}»</p>
              <p className="muted">Probá con el cliente, la pieza o el número de pedido (por ejemplo, 0142).</p>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setQuery('')}>Borrar búsqueda</button>
            </>
          ) : (
            <>
              <p className="hand empty__title">Todavía no hay pedidos</p>
              <p className="muted">Cargá el primero y aparece acá, en la etapa Nuevo.</p>
              <button type="button" className="btn btn--sm" onClick={() => setCreating(true)}>Cargar un pedido</button>
            </>
          )}
        </section>
      )}

      {status === 'ready' && found.length > 0 && !isPhone && (
        <StageBoard orders={found} today={today} selectedId={selectedId} onSelect={setSelectedId} />
      )}

      {status === 'ready' && found.length > 0 && isPhone && (
        <div className="order-list">
          {listed.map((o) => (
            <OrderCard key={o.id} order={o} today={today} showStage selected={o.id === selectedId} onSelect={() => setSelectedId(o.id)} />
          ))}
          {listed.length === 0 && <p className="lane__empty">Nada en esta etapa por ahora.</p>}
        </div>
      )}

      {selected && (
        <OrderDetail order={selected} today={today} asSheet={isPhone} onMove={(to) => { void move(selected, to); if (isPhone) close(); }}
          onOrderChange={update} onClose={close} />
      )}

      {isPhone && !selected && (
        <button type="button" className="btn fab" aria-label="Nuevo pedido" onClick={() => setCreating(true)}><Icon name="plus" size={26} /></button>
      )}

      {lastChange && <UndoToast text={lastChange.text} onUndo={() => void undo()} onDismiss={dismissChange} />}
      {creating && <NewOrderDialog onCreate={async (input) => { const o = await create(input); setSelectedId(o.id); return o; }} onClose={() => setCreating(false)} />}
    </div>
  );
}
