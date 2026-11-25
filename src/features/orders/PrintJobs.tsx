// The "Impresiones" block of the order detail: the jobs printed for the order, logging a new one, and the real cost.
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import type { Order } from '../../../shared/orders';
import { PRINT_RESULT_LABEL, REAL_COST_TERMS, type PrintJob, type PrintResult, type RealCost } from '../../../shared/print-jobs';
import type { Printer } from '../../../shared/printers';
import { spoolLabel } from '../../../shared/calculator';
import type { Spool } from '../../../shared/spools';
import { Icon } from '../../ui/Icon';
import { fetchPrinters } from '../printers/api';
import { durationLabel } from '../quotes/format';
import { fetchSpools } from '../spools/api';
import { grams } from '../spools/format';
import { ApiError, deletePrintJob, fetchPrintJobs, logPrintJob } from './api';
import { money } from './format';
import { emptyJobDraft, jobRequest, type JobDraft } from './job-form';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "14 nov", in local time. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function ResultChip({ result }: { result: PrintResult | null }) {
  const failed = result === 'fallida';
  return (
    <span className="chip" style={{ background: failed ? 'var(--red)' : 'var(--sky)', color: failed ? 'var(--white)' : 'var(--ink)' }}>
      {result ? PRINT_RESULT_LABEL[result] : 'Planeada'}
    </span>
  );
}

export function PrintJobs({ order, onOrderChange }: { order: Order; onOrderChange: (order: Order) => void }) {
  const [jobs, setJobs] = useState<PrintJob[] | null>(null);
  const [cost, setCost] = useState<RealCost | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchPrintJobs(order.id);
      setJobs(data.jobs);
      setCost(data.cost);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [order.id]);

  // Mounted with the order id as its key, so another order starts from a clean state.
  useEffect(() => {
    let alive = true;
    fetchPrintJobs(order.id).then(
      (data) => { if (alive) { setJobs(data.jobs); setCost(data.cost); setError(null); } },
      (e: Error) => { if (alive) setError(e.message); },
    );
    return () => { alive = false; };
  }, [order.id]);

  async function remove(jobId: number) {
    setBusy(true);
    try {
      onOrderChange(await deletePrintJob(order.id, jobId));
      setConfirming(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="jobs" aria-labelledby={`jobs-${order.id}`}>
      <div className="jobs__head">
        <h3 id={`jobs-${order.id}`} className="jobs__title">Impresiones</h3>
        {!logging && <button type="button" className="btn btn--sm" onClick={() => setLogging(true)}><Icon name="plus" size={16} />Cargar impresión</button>}
      </div>

      {error && <p className="field__error" role="alert">{error}</p>}

      <RealCostSummary order={order} cost={cost} />

      {logging && (
        <LogJobForm
          orderId={order.id}
          onLogged={async (saved) => { onOrderChange(saved); setLogging(false); await load(); }}
          onCancel={() => setLogging(false)}
        />
      )}

      {jobs === null && !error && <p className="muted">Cargando impresiones…</p>}
      {jobs !== null && jobs.length === 0 && !logging && (
        <p className="jobs__empty">Todavía no cargaste impresiones. Al terminar una, cargá el tiempo y los gramos reales: suman horas a la impresora y descuentan filamento.</p>
      )}
      {jobs !== null && jobs.length > 0 && (
        <ul className="jobs__list">
          {jobs.map((job) => (
            <li key={job.id} className="job">
              <div className="job__head">
                <span className="job__meta"><ResultChip result={job.result} />{dayLabel(job.createdAt)}</span>
                <b>{job.actualMinutes === null ? '—' : durationLabel(job.actualMinutes)}</b>
              </div>
              <span className="job__printer"><Icon name="printer" size={16} />{job.printer}</span>
              <ul className="job__uses">
                {job.filaments.map((f) => (
                  <li key={f.spoolId}>
                    <span className="job__swatch" style={{ background: f.colorHex }} aria-hidden="true" />
                    <span>{f.spool}</span>
                    <b>{grams(f.grams)}</b>
                  </li>
                ))}
              </ul>
              {job.note && <p className="job__note">{job.note}</p>}
              {confirming === job.id ? (
                <div className="job__confirm" role="group" aria-label="Confirmar borrado">
                  <span>¿La borramos? Vuelven {job.actualMinutes === null ? '' : `${durationLabel(job.actualMinutes)} a la impresora y `}los gramos a cada bobina.</span>
                  <span className="job__confirm-actions">
                    <button type="button" className="btn btn--sm" disabled={busy} onClick={() => void remove(job.id)}>Sí, borrar</button>
                    <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setConfirming(null)}>No</button>
                  </span>
                </div>
              ) : (
                <button type="button" className="job__delete" onClick={() => setConfirming(job.id)}>Borrar</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RealCostSummary({ order, cost }: { order: Order; cost: RealCost | null }) {
  if (!cost || order.realCost === null) return null;
  const loss = order.realProfit !== null && order.realProfit < 0;
  return (
    <div className="real-cost">
      <dl className="real-cost__totals">
        <div><dt>Costo real</dt><dd>{money(order.realCost)}</dd></div>
        <div><dt>{loss ? 'Pérdida real' : 'Ganancia real'}</dt><dd className={loss ? 'real-cost__loss' : undefined}>{money(order.realProfit ?? 0)}</dd></div>
        <div><dt>Precio estimado</dt><dd>{money(order.price)}</dd></div>
      </dl>
      <details className="real-cost__details">
        <summary>
          {cost.jobs} {cost.jobs === 1 ? 'impresión' : 'impresiones'}
          {cost.failedJobs > 0 ? ` (${cost.failedJobs} ${cost.failedJobs === 1 ? 'fallida' : 'fallidas'})` : ''} · {durationLabel(cost.minutes)} · {grams(cost.grams)}
        </summary>
        <dl className="real-cost__terms">
          {REAL_COST_TERMS.map((t) => <div key={t.key}><dt>{t.label}</dt><dd>{money(cost[t.key])}</dd></div>)}
        </dl>
      </details>
      <p className="muted">Con los tiempos y gramos reales, las fallidas incluidas. No suma mano de obra ni packaging: no se cargan por impresión.</p>
    </div>
  );
}

function LogJobForm({ orderId, onLogged, onCancel }: { orderId: string; onLogged: (order: Order) => Promise<void>; onCancel: () => void }) {
  const uid = useId();
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [spools, setSpools] = useState<Spool[]>([]);
  const [draft, setDraft] = useState<JobDraft>(emptyJobDraft(''));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Fresh hours and grams every time the form opens.
  useEffect(() => {
    let alive = true;
    Promise.all([fetchPrinters(), fetchSpools()]).then(
      ([p, s]) => {
        if (!alive) return;
        setPrinters(p);
        setSpools(s);
        const first = p.find((x) => x.status === 'activa') ?? p[0];
        setDraft((d) => (d.printerId || !first ? d : { ...d, printerId: String(first.id) }));
      },
      (e: Error) => { if (alive) setBanner(e.message); },
    );
    return () => { alive = false; };
  }, []);

  const set = <K extends keyof JobDraft>(key: K, value: JobDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setUse = (i: number, patch: Partial<JobDraft['filaments'][number]>) =>
    setDraft((d) => ({ ...d, filaments: d.filaments.map((f, j) => (j === i ? { ...f, ...patch } : f)) }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setBanner(null);
    try {
      const { order } = await logPrintJob(orderId, jobRequest(draft));
      await onLogged(order);
    } catch (err) {
      const apiErr = err as ApiError;
      setErrors(apiErr.fields ?? {});
      setBanner(apiErr.message);
      setSaving(false);
    }
  }

  const describedBy = (key: string) => (errors[key] ? `${uid}-${key}-err` : undefined);
  const fieldError = (key: string) => errors[key] && <span id={`${uid}-${key}-err`} className="field__error">{errors[key]}</span>;

  return (
    <form className="job-form" onSubmit={submit} noValidate aria-labelledby={`${uid}-title`}>
      <h4 id={`${uid}-title`} className="job-form__title">Cargar una impresión terminada</h4>
      {banner && <p className="field__error" role="alert">{banner}</p>}

      <div className="field">
        <label className="field__label" htmlFor={`${uid}-printer`}>Impresora</label>
        <select id={`${uid}-printer`} className="field__control" value={draft.printerId} onChange={(e) => set('printerId', e.target.value)}
          aria-invalid={!!errors.printerId} aria-describedby={describedBy('printerId')}>
          <option value="">Elegí una</option>
          {printers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {fieldError('printerId')}
      </div>

      <fieldset className="job-form__group">
        <legend className="field__label">Cuánto tardó</legend>
        <div className="job-form__time">
          <label className="job-form__unit">
            <input className="field__control" inputMode="numeric" placeholder="0" value={draft.hours} onChange={(e) => set('hours', e.target.value)}
              aria-invalid={!!errors.actualMinutes} aria-describedby={describedBy('actualMinutes')} />
            <span>h</span>
          </label>
          <label className="job-form__unit">
            <input className="field__control" inputMode="numeric" placeholder="0" value={draft.minutes} onChange={(e) => set('minutes', e.target.value)}
              aria-invalid={!!errors.actualMinutes} aria-describedby={describedBy('actualMinutes')} />
            <span>min</span>
          </label>
        </div>
        {fieldError('actualMinutes')}
      </fieldset>

      <fieldset className="job-form__group">
        <legend className="field__label">Filamento usado</legend>
        {draft.filaments.map((use, i) => {
          const spool = spools.find((s) => String(s.id) === use.spoolId);
          const typed = Number(use.grams.replace(/[.\s]/g, ''));
          const short = spool && Number.isInteger(typed) && typed > spool.remainingGrams;
          return (
            <div key={i} className="job-form__use">
              <span className="job__swatch" style={{ background: spool?.colorHex ?? 'transparent' }} aria-hidden="true" />
              <select className="field__control" aria-label={`Bobina ${i + 1}`} value={use.spoolId} onChange={(e) => setUse(i, { spoolId: e.target.value })}
                aria-invalid={!!errors.filaments} aria-describedby={describedBy('filaments')}>
                <option value="">Elegí una bobina</option>
                {spools.map((s) => <option key={s.id} value={s.id}>{spoolLabel(s)} · quedan {grams(s.remainingGrams)}</option>)}
              </select>
              <label className="job-form__unit job-form__grams">
                <input className="field__control" inputMode="numeric" placeholder="0" aria-label={`Gramos de la bobina ${i + 1}`} value={use.grams}
                  onChange={(e) => setUse(i, { grams: e.target.value })} aria-invalid={!!errors.filaments || !!short} />
                <span>g</span>
              </label>
              {draft.filaments.length > 1 && (
                <button type="button" className="icon-btn icon-btn--quiet" aria-label={`Quitar bobina ${i + 1}`}
                  onClick={() => set('filaments', draft.filaments.filter((_, j) => j !== i))}><Icon name="close" size={16} /></button>
              )}
              {short && <span className="field__error job-form__warn">A esta bobina le quedan {grams(spool.remainingGrams)}.</span>}
            </div>
          );
        })}
        {fieldError('filaments')}
        <button type="button" className="btn btn--ghost btn--sm job-form__add" onClick={() => set('filaments', [...draft.filaments, { spoolId: '', grams: '' }])}>
          <Icon name="plus" size={16} />Otra bobina
        </button>
      </fieldset>

      <fieldset className="job-form__group">
        <legend className="field__label">Cómo salió</legend>
        <div className="pills-row job-form__result">
          {(['ok', 'fallida'] as const).map((r) => (
            <button key={r} type="button" className="pill" aria-pressed={draft.result === r} onClick={() => set('result', r)}>{PRINT_RESULT_LABEL[r]}</button>
          ))}
        </div>
        {fieldError('result')}
      </fieldset>

      <div className="field">
        <label className="field__label" htmlFor={`${uid}-note`}>Nota (opcional)</label>
        <textarea id={`${uid}-note`} className="field__control" value={draft.note} onChange={(e) => set('note', e.target.value)}
          placeholder="Qué pasó, qué cambiaste…" aria-invalid={!!errors.note} aria-describedby={describedBy('note')} />
        {fieldError('note')}
      </div>

      <p className="muted">Al guardar se suman las horas a la impresora y se descuentan los gramos de cada bobina.</p>
      <div className="job-form__actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn btn--sm" disabled={saving}>{saving ? 'Guardando…' : 'Guardar impresión'}</button>
      </div>
    </form>
  );
}
