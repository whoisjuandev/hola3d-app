import { useMemo, useState } from 'react';
import type { Spool } from '../../../shared/spools';
import { filterByMaterial, isLowStock, materialsOf, totalGrams } from '../../../shared/spools';
import { Icon } from '../../ui/Icon';
import { useCollection } from '../../ui/useCollection';
import { PHONE_QUERY, useMediaQuery } from '../../ui/useMediaQuery';
import { ErrorBanner } from '../orders/components';
import { createSpool, fetchSpools, updateSpool } from './api';
import { MaterialPills, SpoolCard, SpoolDialog, type MaterialFilter } from './components';
import { grams } from './format';
import '../orders/orders.css';
import './spools.css';

export function SpoolsPage() {
  const { items: spools, status, error, load, add, replace } = useCollection(fetchSpools);
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [material, setMaterial] = useState<MaterialFilter>('');
  // undefined: closed; null: creating; a spool: editing it.
  const [editing, setEditing] = useState<Spool | null | undefined>(undefined);

  const listed = useMemo(() => filterByMaterial(spools, material), [spools, material]);
  const lowCount = listed.filter(isLowStock).length;
  const summary = `${material ? `${material} · ` : ''}${listed.length} bobinas · ${grams(totalGrams(listed))} en stock`;

  return (
    <div className="spools">
      <header className="spools__head">
        <div>
          <h1 className="page-title">Filamento</h1>
          <p className="page-sub">{status === 'ready' ? summary : 'Cargando…'}</p>
        </div>
        {!isPhone && <button type="button" className="btn" onClick={() => setEditing(null)}><Icon name="plus" />Nueva bobina</button>}
      </header>

      {error && <ErrorBanner text={error} onRetry={() => void load()} />}

      {status === 'loading' && <div className="orders__skeleton" aria-hidden="true"><span /><span /><span /></div>}

      {status === 'ready' && spools.length > 0 && <MaterialPills spools={spools} value={material} onChange={setMaterial} />}

      {status === 'ready' && lowCount > 0 && (
        <p className="spools__alert" role="status">
          {lowCount === 1 ? 'Una bobina está' : `${lowCount} bobinas están`} por terminarse. Conviene reponer.
        </p>
      )}

      {status === 'ready' && spools.length === 0 && (
        <section className="card empty">
          <div className="tape tape--sky" aria-hidden="true" />
          <p className="hand empty__title">Todavía no cargaste bobinas</p>
          <p className="muted">Cargá cada bobina con su peso y te avisamos cuando quede poco.</p>
          <button type="button" className="btn btn--sm" onClick={() => setEditing(null)}>Cargar una bobina</button>
        </section>
      )}

      {status === 'ready' && listed.length > 0 && (
        <div className="spools__grid">
          {listed.map((s) => <SpoolCard key={s.id} spool={s} onEdit={() => setEditing(s)} />)}
        </div>
      )}

      {isPhone && editing === undefined && (
        <button type="button" className="btn fab" aria-label="Nueva bobina" onClick={() => setEditing(null)}><Icon name="plus" size={26} /></button>
      )}

      {editing !== undefined && (
        <SpoolDialog
          spool={editing}
          materials={materialsOf(spools)}
          onCreate={async (input) => add(await createSpool(input))}
          onUpdate={async (id, changes) => replace(await updateSpool(id, changes))}
          onClose={() => setEditing(undefined)}
        />
      )}
    </div>
  );
}
