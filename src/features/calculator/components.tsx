// Presentational pieces of the Calculadora screen. State lives in CalculatorPage.
import { useId, useState } from 'react';
import type { CalcLineResult, CalcResult, SpoolShortage } from '../../../shared/calculator';
import { BREAKDOWN_TERMS, type BreakdownKey, type CostBreakdown } from '../../../shared/calculator';
import type { CostSettings, PricingSettings } from '../../../shared/cost-settings';
import type { Printer } from '../../../shared/printers';
import { MAX_SHORTCUTS, profitLabel, profitSettingsOf, resultProfit, type ProfitChoice, type ProfitShortcut } from '../../../shared/profit';
import { PRINTER_STATUS_LABEL } from '../../../shared/printers';
import type { Spool } from '../../../shared/spools';
import { FormDialog, type FieldSpec } from '../../ui/FormDialog';
import { changedValues, parseDecimal, parseWhole } from '../../ui/forms';
import { Icon } from '../../ui/Icon';
import { money } from '../orders/format';
import { grams } from '../spools/format';
import { badWhole, CHOOSE_AGAIN, decimalText, profitProblem, TYPED_MATERIAL, type LineDraft, type ProfitDraft, type UseDraft } from './draft';
import { ModelLoader } from './ModelLoader';
import { useFileDrop, useLineModel } from './useLineModel';

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
          <select id={`${id}-spool`} className="field__control" value={use.spool} aria-invalid={use.spool === CHOOSE_AGAIN}
            onChange={(e) => set({ spool: e.target.value })}>
            {use.spool === CHOOSE_AGAIN && <option value={CHOOSE_AGAIN} disabled>Elegí una bobina</option>}
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
  const model = useLineModel(line, spools, onChange);
  const drop = useFileDrop((file) => void model.readFile(file));
  const set = (patch: Partial<LineDraft>) => model.change({ ...line, ...patch });
  const title = line.name.trim() || `Pieza ${index + 1}`;
  return (
    <article className={drop.over ? 'card calc-line calc-line--drop' : 'card calc-line'} aria-labelledby={`${id}-title`} {...drop.handlers}>
      <header className="calc-line__head">
        <h2 id={`${id}-title`} className="calc-line__title">{title}</h2>
        {canRemove && <button type="button" className="btn btn--ghost btn--sm" onClick={onRemove}>Quitar pieza</button>}
      </header>

      <ModelLoader title={title} model={model.model} error={model.error} busy={model.busy}
        onFile={(file) => void model.readFile(file)} onTune={model.tune} />

      <div className="calc-line__grid">
        <div className="field calc-line__name">
          <label className="field__label" htmlFor={`${id}-name`}>Pieza</label>
          <input id={`${id}-name`} className="field__control" autoComplete="off" placeholder="Llavero con logo" value={line.name}
            onChange={(e) => set({ name: e.target.value })} />
        </div>
        <NumberField label="Cantidad" value={line.quantity} onChange={(quantity) => set({ quantity })} />
        <div className="field calc-line__printer">
          <label className="field__label" htmlFor={`${id}-printer`}>Impresora</label>
          <select id={`${id}-printer`} className="field__control" value={line.printerId} aria-invalid={line.printerId === CHOOSE_AGAIN}
            onChange={(e) => set({ printerId: e.target.value })}>
            {line.printerId === CHOOSE_AGAIN && <option value={CHOOSE_AGAIN} disabled>Elegí una impresora</option>}
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

const NOTE: Partial<Record<BreakdownKey, (s: PricingSettings, profit: ProfitChoice) => string>> = {
  failureAllowance: (s) => percent(s.failurePercent),
  profit: (_s, profit) => profitLabel(profit), // "Ganancia ×4" or "Ganancia 60 %"
  commission: (s) => percent(s.commissionPercent),
  rounding: (s) => `a ${money(s.roundingStep)}`,
};

/** Every term of the formula, in order, with the percentage, multiplier or step it used. */
export function BreakdownList({ breakdown, settings, profit }: { breakdown: CostBreakdown; settings: PricingSettings; profit: ProfitChoice }) {
  return (
    <dl className="calc-breakdown">
      {BREAKDOWN_TERMS.map((t) => (
        <div key={t.key} className={t.total ? 'calc-breakdown__row calc-breakdown__row--total' : 'calc-breakdown__row'}>
          <dt>{t.label}{NOTE[t.key] && <span className="calc-breakdown__note"> {NOTE[t.key]!(settings, profit)}</span>}</dt>
          <dd>{money(breakdown[t.key])}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The price card. `settings` are the ones the result was priced with: today's, or a quote's frozen ones. The profit is
 * the one the result recorded (a quote saved before it was recorded reads as its percentage).
 */
export function Summary({ result, settings }: { result: CalcResult; settings: PricingSettings }) {
  return (
    <section className="card calc-summary" id="precio" aria-labelledby="precio-titulo">
      <div className="tape" aria-hidden="true" />
      <h2 id="precio-titulo" className="calc-summary__title">Precio</h2>
      <BreakdownList breakdown={result.breakdown} settings={settings} profit={resultProfit(result)} />
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

/**
 * The "Ganancia" block: a percentage of the production cost or a multiplier of it, the stored shortcuts as buttons, and
 * a value of the owner's own. `choice` is what the calculation uses right now.
 */
export function ProfitPicker({ draft, choice, shortcuts, onChange }: {
  draft: ProfitDraft; choice: ProfitChoice; shortcuts: ProfitShortcut[]; onChange: (d: ProfitDraft) => void;
}) {
  const id = useId();
  const byMultiplier = draft.mode === 'multiplicador';
  const problem = profitProblem(draft);
  const key = byMultiplier ? 'multiplier' : 'percent';
  return (
    <section className="card calc-profit" aria-labelledby={`${id}-title`}>
      <div className="calc-profit__head">
        <h2 id={`${id}-title`} className="calc-profit__title">Ganancia</h2>
        <div className="calc-profit__modes" role="group" aria-label="Cómo se calcula la ganancia">
          <button type="button" className="pill" aria-pressed={!byMultiplier} onClick={() => onChange({ ...draft, mode: 'porcentaje' })}>Porcentaje</button>
          <button type="button" className="pill" aria-pressed={byMultiplier} onClick={() => onChange({ ...draft, mode: 'multiplicador' })}>Multiplicador</button>
        </div>
      </div>
      {byMultiplier && (
        <div className="calc-profit__shortcuts" role="group" aria-label="Atajos de multiplicador">
          {shortcuts.map((s) => (
            <button key={s.name} type="button" className="pill" aria-pressed={choice.mode === 'multiplicador' && choice.value === s.multiplier}
              onClick={() => onChange({ ...draft, multiplier: decimalText(s.multiplier) })}>
              {s.name} <b>×{decimalText(s.multiplier)}</b>
            </button>
          ))}
        </div>
      )}
      <div className="field calc-profit__value">
        <label className="field__label" htmlFor={`${id}-value`}>{byMultiplier ? 'Multiplicador' : 'Porcentaje sobre el costo'}</label>
        <span className="calc-input">
          <input id={`${id}-value`} className="field__control" inputMode="decimal" autoComplete="off" value={draft[key]}
            placeholder={byMultiplier ? '3' : '50'} aria-invalid={!!problem} aria-describedby={`${id}-hint`}
            onChange={(e) => onChange({ ...draft, [key]: e.target.value })} />
          <span className="calc-input__suffix" aria-hidden="true">{byMultiplier ? '×' : '%'}</span>
        </span>
        {problem
          ? <span id={`${id}-hint`} className="field__error">{problem} Mientras tanto se usa {profitLabel(choice)}.</span>
          : <span id={`${id}-hint`} className="muted">
            {byMultiplier
              ? `×${decimalText(choice.value)}: el precio antes de comisión es ${decimalText(choice.value)} veces el costo de producción.`
              : `Se suma al costo de producción el ${decimalText(choice.value)} % de ese costo.`}
          </span>}
      </div>
    </section>
  );
}

/** "Copiar resumen": the client-facing text to the clipboard, or in a field to copy by hand when there is no clipboard. */
export function CopySummary({ text }: { text: string }) {
  const id = useId();
  const [copied, setCopied] = useState<string | null>(null);
  const [manual, setManual] = useState(false);

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error('no clipboard');
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setManual(false);
    } catch {
      setManual(true);
    }
  }

  return (
    <div className="calc-copy">
      <button type="button" className="btn btn--ghost btn--block" onClick={() => void copy()}><Icon name="chat" />Copiar resumen</button>
      {copied === text && !manual && <p className="muted calc__note" role="status">Copiado: las piezas, sus precios y el total, sin costos.</p>}
      {manual && (
        <div className="field">
          <label className="field__label" htmlFor={id}>No se pudo copiar solo: seleccioná el texto y copialo</label>
          <textarea id={id} className="field__control calc-copy__text" readOnly value={text} rows={Math.min(10, text.split('\n').length + 1)}
            onFocus={(e) => e.target.select()} />
        </div>
      )}
    </div>
  );
}

const DECIMAL_KEYS = ['failurePercent', 'marginPercent', 'commissionPercent', 'profitMultiplier'];

const SETTINGS_FIELDS: FieldSpec[] = [
  { key: 'kwhPrice', label: 'Luz ($ por kWh)', inputMode: 'numeric', hint: 'Mirá el precio por kWh en tu factura.' },
  { key: 'labourPerHour', label: 'Mano de obra ($ por hora)', inputMode: 'numeric', hint: 'Para preparar y terminar las piezas.' },
  { key: 'monthlyFixedCosts', label: 'Gastos fijos por mes ($)', inputMode: 'numeric', hint: 'Alquiler, internet, software…' },
  { key: 'monthlyPrintHours', label: 'Horas de impresión por mes', inputMode: 'numeric', hint: 'Entre estas horas se reparten los gastos fijos.' },
  { key: 'failurePercent', label: 'Margen por fallas (%)', inputMode: 'decimal', hint: 'Sobre material, luz y desgaste.' },
  { key: 'packagingCost', label: 'Packaging ($)', inputMode: 'numeric', hint: 'Con este valor empieza cada pieza nueva.' },
  { key: 'roundingStep', label: 'Redondear a ($)', inputMode: 'numeric', hint: 'El precio final sube al múltiplo siguiente.' },
  { key: 'commissionPercent', label: 'Comisión de venta (%)', inputMode: 'decimal', hint: 'Por ejemplo, Mercado Libre. 0 si vendés directo.' },
  {
    key: 'profitMode', label: 'La ganancia empieza en', type: 'select',
    options: [{ value: 'porcentaje', label: 'Porcentaje' }, { value: 'multiplicador', label: 'Multiplicador' }],
    hint: 'Cada cálculo nuevo arranca así; en la calculadora se cambia.',
  },
  { key: 'marginPercent', label: 'Ganancia (%)', inputMode: 'decimal', hint: 'Sobre el costo de producción, en modo porcentaje.' },
  { key: 'profitMultiplier', label: 'Multiplicador inicial (×)', inputMode: 'decimal', hint: 'De 1 a 11. ×3 cobra 3 veces el costo de producción.' },
];

function toForm(s: CostSettings): Record<string, string> {
  const all = { ...s, ...profitSettingsOf(s) };
  return Object.fromEntries(SETTINGS_FIELDS.map((f) => {
    const value = all[f.key as keyof typeof all];
    if (typeof value === 'string') return [f.key, value];
    return [f.key, DECIMAL_KEYS.includes(f.key) ? decimalText(value as number) : String(value)];
  }));
}

function toApi(values: Record<string, string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => {
    if (key === 'profitMode') return [key, value];
    return [key, DECIMAL_KEYS.includes(key) ? parseDecimal(value) : parseWhole(value)];
  }));
}

interface ShortcutRow {
  key: number;
  name: string;
  multiplier: string;
}

/** The shortcuts as the API takes them: names trimmed, multipliers parsed (wrong text goes as is, for its message). */
function shortcutsToApi(rows: ShortcutRow[]): { name: string; multiplier: unknown }[] {
  return rows.map((r) => ({ name: r.name.trim(), multiplier: parseDecimal(r.multiplier.replace(/[×x]/gi, '')) }));
}

/** The multiplier buttons of the calculator: 1 to 8, each a name and a multiplier. */
function ShortcutsEditor({ rows, error, onChange }: { rows: ShortcutRow[]; error: string | undefined; onChange: (rows: ShortcutRow[]) => void }) {
  const id = useId();
  const set = (i: number, patch: Partial<ShortcutRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <fieldset className="calc-shortcuts" aria-describedby={`${id}-hint`}>
      <legend className="field__label">Atajos de multiplicador</legend>
      <ul className="calc-shortcuts__list">
        {rows.map((r, i) => (
          <li key={r.key} className="calc-shortcuts__row">
            <div className="field">
              <label className="field__label" htmlFor={`${id}-${r.key}-name`}>Nombre</label>
              <input id={`${id}-${r.key}-name`} className="field__control" autoComplete="off" maxLength={30} value={r.name} placeholder="Mayorista"
                onChange={(e) => set(i, { name: e.target.value })} />
            </div>
            <div className="field">
              <label className="field__label" htmlFor={`${id}-${r.key}-mult`}>Multiplicador</label>
              <span className="calc-input">
                <input id={`${id}-${r.key}-mult`} className="field__control" inputMode="decimal" autoComplete="off" value={r.multiplier} placeholder="3"
                  onChange={(e) => set(i, { multiplier: e.target.value })} />
                <span className="calc-input__suffix" aria-hidden="true">×</span>
              </span>
            </div>
            <button type="button" className="icon-btn icon-btn--quiet calc-shortcuts__remove" aria-label={`Quitar el atajo ${r.name || i + 1}`}
              disabled={rows.length === 1} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
              <Icon name="close" />
            </button>
          </li>
        ))}
      </ul>
      {rows.length < MAX_SHORTCUTS && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => onChange([...rows, { key: Math.max(0, ...rows.map((r) => r.key)) + 1, name: '', multiplier: '' }])}>
          <Icon name="plus" />Agregar atajo
        </button>
      )}
      {error
        ? <span id={`${id}-hint`} className="field__error">{error}</span>
        : <span id={`${id}-hint`} className="muted">Botones de la calculadora en modo multiplicador. De 1 a {MAX_SHORTCUTS}, cada uno de ×1 a ×11.</span>}
    </fieldset>
  );
}

/** Edit the workshop costs, the starting profit and the shortcuts, sending only what the owner changed. */
export function SettingsDialog({ settings, onSave, onClose }: {
  settings: CostSettings; onSave: (changes: Record<string, unknown>) => Promise<unknown>; onClose: () => void;
}) {
  const initial = toForm(settings);
  const [initialRows] = useState<ShortcutRow[]>(() =>
    profitSettingsOf(settings).profitShortcuts.map((s, i) => ({ key: i + 1, name: s.name, multiplier: decimalText(s.multiplier) })));
  const [rows, setRows] = useState(initialRows);
  return (
    <FormDialog
      title="Costos del taller"
      fields={SETTINGS_FIELDS}
      initial={initial}
      submitLabel="Guardar costos"
      onClose={onClose}
      extra={(errors) => <ShortcutsEditor rows={rows} error={errors.profitShortcuts} onChange={setRows} />}
      onSubmit={async (values) => {
        const changes = toApi(changedValues(values, initial));
        const shortcuts = shortcutsToApi(rows);
        if (JSON.stringify(shortcuts) !== JSON.stringify(shortcutsToApi(initialRows))) changes.profitShortcuts = shortcuts;
        if (Object.keys(changes).length) await onSave(changes);
      }}
    />
  );
}
