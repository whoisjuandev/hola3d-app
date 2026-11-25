import { useEffect, useMemo, useRef, useState } from 'react';
import { calculateCost, spoolShortages } from '../../../shared/calculator';
import type { CostSettings } from '../../../shared/cost-settings';
import type { Printer } from '../../../shared/printers';
import type { Spool } from '../../../shared/spools';
import { Icon } from '../../ui/Icon';
import { useCollection } from '../../ui/useCollection';
import { ErrorBanner } from '../orders/components';
import { money } from '../orders/format';
import { fetchPrinters } from '../printers/api';
import { fetchSpools } from '../spools/api';
import { fetchCostSettings, updateCostSettings } from './api';
import { LineEditor, SettingsDialog, Summary } from './components';
import { newLine, newUse, toCalcInput, type LineDraft } from './draft';
import '../orders/orders.css';
import './calculator.css';

/** Loads printers, spools and the cost settings, then shows the calculator. */
export function CalculatorPage() {
  const printers = useCollection(fetchPrinters);
  const spools = useCollection(fetchSpools);
  const [settings, setSettings] = useState<CostSettings | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [editingSettings, setEditingSettings] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchCostSettings().then(
      (s) => { if (alive) setSettings(s); },
      (e: Error) => { if (alive) setSettingsError(e.message); },
    );
    return () => { alive = false; };
  }, []);

  const reloadSettings = () => {
    setSettingsError(null);
    fetchCostSettings().then(setSettings, (e: Error) => setSettingsError(e.message));
  };

  const error = printers.error ?? spools.error ?? settingsError;
  const ready = printers.status === 'ready' && spools.status === 'ready' && settings !== null;

  return (
    <div className="calc">
      <header className="calc__head">
        <div>
          <h1 className="page-title">Calculadora</h1>
          <p className="page-sub">Costo real de cada pieza y el precio para cobrarla.</p>
        </div>
        {settings && (
          <button type="button" className="btn btn--ghost" onClick={() => setEditingSettings(true)}><Icon name="sliders" />Costos del taller</button>
        )}
      </header>

      {error && (
        <ErrorBanner text={error} onRetry={() => {
          if (printers.error) void printers.load();
          if (spools.error) void spools.load();
          if (settingsError) reloadSettings();
        }} />
      )}

      {!ready && !error && <div className="orders__skeleton" aria-hidden="true"><span /><span /></div>}

      {ready && (
        <Calculator
          printers={printers.items}
          spools={spools.items}
          settings={settings}
        />
      )}

      {editingSettings && settings && (
        <SettingsDialog
          settings={settings}
          onSave={async (changes) => setSettings(await updateCostSettings(changes))}
          onClose={() => setEditingSettings(false)}
        />
      )}
    </div>
  );
}

function Calculator({ printers, spools, settings }: { printers: Printer[]; spools: Spool[]; settings: CostSettings }) {
  const nextKey = useRef(2);
  const defaultPrinter = (printers.find((p) => p.status === 'activa') ?? printers[0])?.id ?? null;
  const defaultSpool = (spools.find((s) => s.remainingGrams > 0) ?? spools[0])?.id ?? null;
  const [lines, setLines] = useState<LineDraft[]>(() => [newLine(1, { printerId: defaultPrinter, spoolId: defaultSpool, packaging: settings.packagingCost })]);

  const input = useMemo(() => toCalcInput(lines), [lines]);
  const result = useMemo(() => calculateCost(input, printers, spools, settings), [input, printers, spools, settings]);
  const shortages = useMemo(() => spoolShortages(input, spools), [input, spools]);

  const key = () => nextKey.current++;
  const update = (i: number, next: LineDraft) => setLines((ls) => ls.map((l, j) => (j === i ? next : l)));

  return (
    <>
      <div className="calc__body">
        <div className="calc__lines">
          {lines.map((line, i) => (
            <LineEditor
              key={line.key}
              index={i}
              line={line}
              result={result.lines[i]}
              printers={printers}
              spools={spools}
              shortages={shortages}
              canRemove={lines.length > 1}
              onChange={(next) => update(i, next)}
              onRemove={() => setLines((ls) => ls.filter((_, j) => j !== i))}
              onAddUse={() => update(i, { ...line, uses: [...line.uses, newUse(key(), defaultSpool)] })}
            />
          ))}
          <button
            type="button"
            className="btn btn--ghost calc__add"
            onClick={() => setLines((ls) => [...ls, newLine(key(), { printerId: defaultPrinter, spoolId: defaultSpool, packaging: settings.packagingCost })])}
          >
            <Icon name="plus" />Agregar otra pieza
          </button>
        </div>

        <aside className="calc__aside">
          <Summary result={result} settings={settings} />
          <p className="muted calc__note">El cálculo no se guarda todavía: los presupuestos llegan en la próxima etapa.</p>
        </aside>
      </div>

      <a href="#precio" className="calc__bar" aria-label={`Total ${money(result.total)}, ver el detalle`}>
        <span>Total</span>
        <b>{money(result.total)}</b>
        <span className="calc__bar-more">Ver detalle</span>
      </a>
    </>
  );
}
