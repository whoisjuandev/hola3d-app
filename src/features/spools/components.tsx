// Presentational pieces of the Filamento screen. State lives in SpoolsPage.
import type { Spool } from '../../../shared/spools';
import { COMMON_MATERIALS, DEFAULT_LOW_STOCK_GRAMS, filterByMaterial, isLowStock, materialsOf } from '../../../shared/spools';
import { FormDialog, type FieldSpec } from '../../ui/FormDialog';
import { changedValues, parseWhole } from '../../ui/forms';
import { money } from '../orders/format';
import { grams } from './format';

export function SpoolCard({ spool, onEdit }: { spool: Spool; onEdit: () => void }) {
  const low = isLowStock(spool);
  const percent = Math.round((spool.remainingGrams / spool.netGrams) * 100);
  return (
    <article className="card spool-card" aria-labelledby={`spool-${spool.id}`}>
      <header className="spool-card__head">
        <span className="spool-card__swatch" style={{ background: spool.colorHex }} aria-hidden="true" />
        <div className="spool-card__title">
          <h2 id={`spool-${spool.id}`} className="spool-card__name">{spool.material} · {spool.colorName}</h2>
          {spool.brand && <p className="muted">{spool.brand}</p>}
        </div>
        {low && <span className="chip spool-card__low">Queda poco</span>}
      </header>
      <div className="spool-card__meter" role="meter" aria-valuemin={0} aria-valuemax={spool.netGrams} aria-valuenow={spool.remainingGrams}
        aria-label={`Quedan ${grams(spool.remainingGrams)} de ${grams(spool.netGrams)}`}>
        <span style={{ width: `${percent}%`, background: low ? 'var(--red)' : 'var(--blue)' }} />
      </div>
      <p className="spool-card__stock">
        <span><b>{grams(spool.remainingGrams)}</b> de {grams(spool.netGrams)}</span>
        <span className="muted">{money(spool.price)}</span>
      </p>
      {spool.note && <p className="spool-card__note">{spool.note}</p>}
      <button type="button" className="btn btn--ghost btn--sm" onClick={onEdit} aria-label={`Editar ${spool.material} ${spool.colorName}`}>Editar</button>
    </article>
  );
}

export type MaterialFilter = string; // '' means all

export function MaterialPills({ spools, value, onChange }: { spools: Spool[]; value: MaterialFilter; onChange: (m: MaterialFilter) => void }) {
  const materials = materialsOf(spools);
  return (
    <div className="pills-row" role="group" aria-label="Material">
      <button type="button" className="pill" aria-pressed={value === ''} onClick={() => onChange('')}>
        Todos<span className="pill__count">{spools.length}</span>
      </button>
      {materials.map((m) => (
        <button key={m} type="button" className="pill" aria-pressed={value === m} onClick={() => onChange(m)}>
          {m}<span className="pill__count">{filterByMaterial(spools, m).length}</span>
        </button>
      ))}
    </div>
  );
}

const WHOLE = ['netGrams', 'remainingGrams', 'price', 'lowStockGrams'];

function fields(known: string[]): FieldSpec[] {
  return [
    { key: 'material', label: 'Material', placeholder: 'PLA', suggestions: [...new Set([...COMMON_MATERIALS, ...known])] },
    { key: 'brand', label: 'Marca', placeholder: 'Grilon3' },
    { key: 'colorName', label: 'Color', placeholder: 'Blanco' },
    { key: 'colorHex', label: 'Tono', type: 'color' },
    { key: 'netGrams', label: 'Peso neto (g)', inputMode: 'numeric', placeholder: '1000' },
    { key: 'remainingGrams', label: 'Quedan (g)', inputMode: 'numeric', placeholder: 'Igual al peso neto' },
    { key: 'price', label: 'Precio pagado ($)', inputMode: 'numeric', placeholder: '21000' },
    { key: 'lowStockGrams', label: 'Avisar cuando queden (g)', inputMode: 'numeric', placeholder: String(DEFAULT_LOW_STOCK_GRAMS) },
    { key: 'note', label: 'Nota', type: 'textarea', placeholder: 'Temperatura, dónde se compró, para qué pedido…' },
  ];
}

const EMPTY = { material: '', brand: '', colorName: '', colorHex: '#ffffff', netGrams: '1000', remainingGrams: '', price: '', lowStockGrams: String(DEFAULT_LOW_STOCK_GRAMS), note: '' };

function toForm(s: Spool): Record<string, string> {
  return {
    material: s.material, brand: s.brand, colorName: s.colorName, colorHex: s.colorHex, note: s.note,
    netGrams: String(s.netGrams), remainingGrams: String(s.remainingGrams), price: String(s.price), lowStockGrams: String(s.lowStockGrams),
  };
}

function toApi(values: Record<string, string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, WHOLE.includes(key) ? parseWhole(value) : value]));
}

/** Create a spool, or edit one sending only the fields the owner changed. */
export function SpoolDialog({ spool, materials, onCreate, onUpdate, onClose }: {
  spool: Spool | null;
  materials: string[];
  onCreate: (input: Record<string, unknown>) => Promise<unknown>;
  onUpdate: (id: number, changes: Record<string, unknown>) => Promise<unknown>;
  onClose: () => void;
}) {
  const initial = spool ? toForm(spool) : EMPTY;
  return (
    <FormDialog
      title={spool ? `Editar ${spool.material} ${spool.colorName}` : 'Nueva bobina'}
      fields={fields(materials)}
      initial={initial}
      submitLabel={spool ? 'Guardar cambios' : 'Guardar bobina'}
      onClose={onClose}
      onSubmit={async (values) => {
        if (!spool) { await onCreate(toApi(values)); return; }
        const changes = changedValues(values, initial);
        if (Object.keys(changes).length) await onUpdate(spool.id, toApi(changes));
      }}
    />
  );
}
