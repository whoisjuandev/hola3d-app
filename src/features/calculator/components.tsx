// Presentational pieces of the Calculadora screen. State lives in CalculatorPage.
import { useId } from 'react';
import type { CalcLineResult, CalcResult, SpoolShortage } from '../../../shared/calculator';
import { BREAKDOWN_TERMS, type BreakdownKey } from '../../../shared/calculator';
import type { CostSettings } from '../../../shared/cost-settings';
import type { Printer } from '../../../shared/printers';
import { PRINTER_STATUS_LABEL } from '../../../shared/printers';
import type { Spool } from '../../../shared/spools';
import { FormDialog, type FieldSpec } from '../../ui/FormDialog';
import { changedValues, parseDecimal, parseWhole } from '../../ui/forms';
import { Icon } from '../../ui/Icon';
import { money } from '../orders/format';
import { grams } from '../spools/format';
import { badWhole, TYPED_MATERIAL, type LineDraft, type UseDraft } from './draft';

function percent(n: number): string {
  return `${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })} %`;
}

/** A labelled text input for whole numbers, marked invalid when the text is not one. */
function NumberField({ label, value, onChange, suffix, className }: {
  label: string; value: string; onChange: (v: string) => void; suffix?: string; className?: string;
}) {
  const id = useId();
  const bad = badWhole(value);
  return (
    <div className={className ? `field ${className}` : 'field'}>
      <label className="field__label" htmlFor={id}>{label}</label>
      <span className="calc-input">
        <input id={id} className="field__control" inputMode="numeric" autoComplete="off" value={value} placeholder="0"
          aria-invalid={bad} aria-describedby={bad ? `${id}-err` : undefined} onChange={(e) => onChange(e.target.value)} />
        {suffix && <span className="calc-input__suffix" aria-hidden="true">{suffix}</span>}
      </span>
      {bad && <span id={`${id}-err`} className="field__error">Un número entero, sin decimales.</span>}
    </div>
  );
}

function spoolOption(s: Spool): string {
  return `${s.material} ${s.colorName}${s.brand ? ` · ${s.brand}` : ''} (quedan ${grams(s.remainingGrams)})`;
}

function UseRow({ use, spools, shortage, canRemove, onChange, onRemove }: {
  use: UseDraft; spools: Spool[]; shortage: SpoolShortage | undefined; canRemove: boolean;
  onChange: (u: UseDraft) => void; onRemove: () => void;
}) {
  const id = useId();
  const typed = use.spool === TYPED_MATERIAL;
  const spool = typed ? undefined : spools.find((s) => String(s.id) === use.spool);
  const set = (patch: Partial<UseDraft>) => onChange({ ...use, ...patch });
  return (
    <li className="calc-use">
      <div className="calc-use__main">
        <span className="calc-use__swatch" style={{ background: spool ? spool.colorHex : 'var(--mist)' }} aria-hidden="true" />
        <div className="field calc-use__spool">
          <label className="field__label" htmlFor={`${id}-spool`}>Filamento</label>
          <select id={`${id}-spool`} className="field__control" value={use.spool} onChange={(e) => set({ spool: e.target.value })}>
            {spools.map((s) => <option key={s.id} value={String(s.id)}>{spoolOption(s)}</option>)}
            <option value={TYPED_MATERIAL}>Otro material (sin bobina en stock)</option>
          </select>
        </div>
        <NumberField className="calc-use__grams" label="Gramos por unidad" suffix="g" value={use.grams} onChange={(grams) => set({ grams })} />
        {canRemove && (
          <button type="button" className="icon-btn icon-btn--quiet calc-use__remove" aria-label="Quitar este filamento" onClick={onRemove}>
            <Icon name="close" />
          </button>
        )}
      </div>
      {typed && (
        <div className="calc-use__typed">
          <div className="field">
            <label className="field__label" htmlFor={`${id}-material`}>Material</label>
            <input id={`${id}-material`} className="field__control" autoComplete="off" placeholder="PETG negro" value={use.material}
              onChange={(e) => set({ material: e.target.value })} />
          </div>
          <NumberField label="Precio por kg" suffix="$" value={use.pricePerKg} onChange={(pricePerKg) => set({ pricePerKg })} />
        </div>
      )}
      {shortage && (
        <p className="calc-use__warning" role="status">
          <Icon name="alert" size={18} />
          No alcanza: entre todas las piezas hacen falta {grams(shortage.needed)} y a esta bobina le quedan {grams(shortage.remaining)}.
        </p>
      )}
    </li>
  );
}

export function LineEditor({ index, line, result, printers, spools, shortages, canRemove, onChange, onRemove, onAddUse }: {
  index: number; line: LineDraft; result: CalcLineResult; printers: Printer[]; spools: Spool[]; shortages: SpoolShortage[];
  canRemove: boolean; onChange: (l: LineDraft) => void; onRemove: () => void; onAddUse: () => void;
}) {
  const id = useId();
  const set = (patch: Partial<LineDraft>) => onChange({ ...line, ...patch });
  const title = line.name.trim() || `Pieza ${index + 1}`;
  return (
    <article className="card calc-line" aria-labelledby={`${id}-title`}>
      <header className="calc-line__head">
        <h2 id={`${id}-title`} className="calc-line__title">{title}</h2>
        {canRemove && <button type="button" className="btn btn--ghost btn--sm" onClick={onRemove}>Quitar pieza</button>}
      </header>

      <div className="calc-line__grid">
        <div className="field calc-line__name">
          <label className="field__label" htmlFor={`${id}-name`}>Pieza</label>
          <input id={`${id}-name`} className="field__control" autoComplete="off" placeholder="Llavero con logo" value={line.name}
            onChange={(e) => set({ name: e.target.value })} />
        </div>
        <NumberField label="Cantidad" value={line.quantity} onChange={(quantity) => set({ quantity })} />
        <div className="field calc-line__printer">
          <label className="field__label" htmlFor={`${id}-printer`}>Impresora</label>
          <select id={`${id}-printer`} className="field__control" value={line.printerId} onChange={(e) => set({ printerId: e.target.value })}>
            <option value="">Sin impresora</option>
            {printers.map((p) => (
              <option key={p.id} value={String(p.id)}>{p.name}{p.status === 'activa' ? '' : ` (${PRINTER_STATUS_LABEL[p.status].toLowerCase()})`}</option>
            ))}
          </select>
        </div>
        <fieldset className="calc-line__time">
          <legend className="field__label">Tiempo de impresión por unidad</legend>
          <NumberField label="Horas" suffix="h" value={line.hours} onChange={(hours) => set({ hours })} />
          <NumberField label="Minutos" suffix="min" value={line.minutes} onChange={(minutes) => set({ minutes })} />
        </fieldset>
      </div>

      <section className="calc-line__uses" aria-label={`Filamentos de ${title}`}>
        <ul className="calc-uses">
          {line.uses.map((u, i) => (
            <UseRow
              key={u.key}
              use={u}
              spools={spools}
              shortage={u.spool === TYPED_MATERIAL ? undefined : shortages.find((s) => String(s.spoolId) === u.spool)}
              canRemove={line.uses.length > 1}
              onChange={(next) => set({ uses: line.uses.map((x, j) => (j === i ? next : x)) })}
              onRemove={() => set({ uses: line.uses.filter((_, j) => j !== i) })}
            />
          ))}
        </ul>
        <button type="button" className="btn btn--ghost btn--sm calc-line__add" onClick={onAddUse}><Icon name="plus" />Agregar filamento</button>
      </section>

      <div className="calc-line__grid calc-line__grid--three">
        <NumberField label="Preparación" suffix="min" value={line.prepMinutes} onChange={(prepMinutes) => set({ prepMinutes })} />
        <NumberField label="Post-procesado" suffix="min" value={line.postMinutes} onChange={(postMinutes) => set({ postMinutes })} />
        <NumberField label="Packaging" suffix="$" value={line.packaging} onChange={(packaging) => set({ packaging })} />
      </div>
      <p className="muted">Preparación, post-procesado y packaging son para todas las unidades de esta pieza juntas.</p>

      <footer className="calc-line__foot">
        <span>Esta pieza</span>
        <b>{money(result.total)}</b>
        {result.quantity > 1 && <span className="muted">{money(result.unitPrice)} c/u</span>}
      </footer>
    </article>
  );
}

const NOTE: Partial<Record<BreakdownKey, (s: CostSettings) => string>> = {
  failureAllowance: (s) => percent(s.failurePercent),
  profit: (s) => percent(s.marginPercent),
  commission: (s) => percent(s.commissionPercent),
  rounding: (s) => `a ${money(s.roundingStep)}`,
};

export function Summary({ result, settings }: { result: CalcResult; settings: CostSettings }) {
  return (
    <section className="card calc-summary" id="precio" aria-labelledby="precio-titulo">
      <div className="tape" aria-hidden="true" />
      <h2 id="precio-titulo" className="calc-summary__title">Precio</h2>
      <dl className="calc-breakdown">
        {BREAKDOWN_TERMS.map((t) => (
          <div key={t.key} className={t.total ? 'calc-breakdown__row calc-breakdown__row--total' : 'calc-breakdown__row'}>
            <dt>{t.label}{NOTE[t.key] && <span className="calc-breakdown__note"> {NOTE[t.key]!(settings)}</span>}</dt>
            <dd>{money(result.breakdown[t.key])}</dd>
          </div>
        ))}
      </dl>
      <div className="calc-summary__total">
        <span>Total</span>
        <b>{money(result.total)}</b>
      </div>
      <p className="calc-summary__unit">
        {money(result.unitPrice)} por unidad · {result.quantity} {result.quantity === 1 ? 'unidad' : 'unidades'}
      </p>
      {result.lines.length > 1 && (
        <ul className="calc-summary__lines">
          {result.lines.map((l, i) => (
            <li key={i}>
              <span>{l.name || `Pieza ${i + 1}`} × {l.quantity}</span>
              <span><b>{money(l.total)}</b> <span className="muted">{money(l.unitPrice)} c/u</span></span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const PERCENT_KEYS = ['failurePercent', 'marginPercent', 'commissionPercent'];

const SETTINGS_FIELDS: FieldSpec[] = [
  { key: 'kwhPrice', label: 'Luz ($ por kWh)', inputMode: 'numeric', hint: 'Mirá el precio por kWh en tu factura.' },
  { key: 'labourPerHour', label: 'Mano de obra ($ por hora)', inputMode: 'numeric', hint: 'Para preparar y terminar las piezas.' },
  { key: 'monthlyFixedCosts', label: 'Gastos fijos por mes ($)', inputMode: 'numeric', hint: 'Alquiler, internet, software…' },
  { key: 'monthlyPrintHours', label: 'Horas de impresión por mes', inputMode: 'numeric', hint: 'Entre estas horas se reparten los gastos fijos.' },
  { key: 'failurePercent', label: 'Margen por fallas (%)', inputMode: 'decimal', hint: 'Sobre material, luz y desgaste.' },
  { key: 'marginPercent', label: 'Ganancia (%)', inputMode: 'decimal', hint: 'Sobre el costo de producción.' },
  { key: 'packagingCost', label: 'Packaging ($)', inputMode: 'numeric', hint: 'Con este valor empieza cada pieza nueva.' },
  { key: 'roundingStep', label: 'Redondear a ($)', inputMode: 'numeric', hint: 'El precio final sube al múltiplo siguiente.' },
  { key: 'commissionPercent', label: 'Comisión de venta (%)', inputMode: 'decimal', hint: 'Por ejemplo, Mercado Libre. 0 si vendés directo.' },
];

function toForm(s: CostSettings): Record<string, string> {
  return Object.fromEntries(SETTINGS_FIELDS.map((f) => {
    const value = s[f.key as keyof CostSettings] as number;
    return [f.key, PERCENT_KEYS.includes(f.key) ? value.toLocaleString('es-AR', { maximumFractionDigits: 2, useGrouping: false }) : String(value)];
  }));
}

function toApi(values: Record<string, string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, PERCENT_KEYS.includes(key) ? parseDecimal(value) : parseWhole(value)]));
}

/** Edit the workshop costs, sending only the fields the owner changed. */
export function SettingsDialog({ settings, onSave, onClose }: {
  settings: CostSettings; onSave: (changes: Record<string, unknown>) => Promise<unknown>; onClose: () => void;
}) {
  const initial = toForm(settings);
  return (
    <FormDialog
      title="Costos del taller"
      fields={SETTINGS_FIELDS}
      initial={initial}
      submitLabel="Guardar costos"
      onClose={onClose}
      onSubmit={async (values) => {
        const changes = changedValues(values, initial);
        if (Object.keys(changes).length) await onSave(toApi(changes));
      }}
    />
  );
}
