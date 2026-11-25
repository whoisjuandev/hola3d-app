import { useMemo, useState } from 'react';
import type { ClientSummary } from '../../../shared/clients';
import { matchesClientSearch } from '../../../shared/clients';
import { Icon } from '../../ui/Icon';
import { useCollection } from '../../ui/useCollection';
import { PHONE_QUERY, useMediaQuery } from '../../ui/useMediaQuery';
import { ErrorBanner } from '../orders/components';
import { money } from '../orders/format';
import { createClient, fetchClients, updateClient } from './api';
import { ClientCard, ClientDialog } from './components';
import '../orders/orders.css';
import './clients.css';

export function ClientsPage() {
  const { items: clients, status, error, load, add, replace } = useCollection(fetchClients);
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [query, setQuery] = useState('');
  // undefined: closed; null: creating; a client: editing it.
  const [editing, setEditing] = useState<ClientSummary | null | undefined>(undefined);

  const listed = useMemo(
    () => clients.filter((c) => matchesClientSearch(c, query)).sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [clients, query],
  );
  const owed = clients.reduce((sum, c) => sum + c.balanceOwed, 0);
  const summary = `${clients.length} ${clients.length === 1 ? 'cliente' : 'clientes'} · ${money(owed)} a cobrar`;

  return (
    <div className="clients">
      <header className="clients__head">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="page-sub">{status === 'ready' ? summary : 'Cargando…'}</p>
        </div>
        <div className="orders__tools">
          <label className="search">
            <Icon name="search" />
            <span className="visually-hidden">Buscar cliente</span>
            <input type="search" placeholder="Nombre, teléfono o Instagram" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          {!isPhone && <button type="button" className="btn" onClick={() => setEditing(null)}><Icon name="plus" />Nuevo cliente</button>}
        </div>
      </header>

      {error && <ErrorBanner text={error} onRetry={() => void load()} />}

      {status === 'loading' && <div className="orders__skeleton" aria-hidden="true"><span /><span /><span /></div>}

      {status === 'ready' && listed.length === 0 && (
        <section className="card empty" aria-live="polite">
          <div className="tape tape--sky" aria-hidden="true" />
          {query ? (
            <>
              <p className="hand empty__title">No encontramos «{query}»</p>
              <p className="muted">Probá con el nombre, el teléfono o el usuario de Instagram.</p>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setQuery('')}>Borrar búsqueda</button>
            </>
          ) : (
            <>
              <p className="hand empty__title">Todavía no hay clientes</p>
              <p className="muted">Se crean solos al cargar un pedido, o los podés cargar acá con su contacto.</p>
              <button type="button" className="btn btn--sm" onClick={() => setEditing(null)}>Cargar un cliente</button>
            </>
          )}
        </section>
      )}

      {status === 'ready' && listed.length > 0 && (
        <div className="clients__grid">
          {listed.map((c) => <ClientCard key={c.id} client={c} onEdit={() => setEditing(c)} />)}
        </div>
      )}

      {isPhone && editing === undefined && (
        <button type="button" className="btn fab" aria-label="Nuevo cliente" onClick={() => setEditing(null)}><Icon name="plus" size={26} /></button>
      )}

      {editing !== undefined && (
        <ClientDialog
          client={editing}
          onCreate={async (input) => add(await createClient(input))}
          onUpdate={async (id, changes) => replace(await updateClient(id, changes))}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}
