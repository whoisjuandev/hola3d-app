// The "Impresiones" block of the order detail: the jobs printed for the order, logging a new one, and the real cost.
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import type { Order } from '../../../shared/orders';
import {
  PRINT_RESULT_LABEL, REAL_COST_TERMS, jobCostTotal, realCost, realProfit, type PrintJob, type PrintResult, type RealCost,
} from '../../../shared/print-jobs';
import type { Printer } from '../../../shared/printers';
import { spoolLabel } from '../../../shared/calculator';
import type { Spool } from '../../../shared/spools';
import { Icon } from '../../ui/Icon';
import { latestRequests } from '../../ui/latest';
import { fetchPrinters } from '../printers/api';
import { durationLabel } from '../quotes/format';
import { fetchSpools } from '../spools/api';
import { grams } from '../spools/format';
import { dayTitle, timeRange } from '../calendar/format';
import { PlanJobDialog, type PlannedJobRef } from '../calendar/PlanJobDialog';
import { addMinutes } from '../../../shared/calendar';
import { ApiError, deletePlannedJob, deletePrintJob, fetchPrintJobs, finishPrintJob, logPrintJob } from './api';
import { money } from './format';
import { emptyJobDraft, finishDraft, jobRequest, type JobDraft } from './job-form';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "14 nov", in local time. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function ResultChip({ result }: { result: PrintResult | null }) {
  const failed = result === 'fallida';
  const background = failed ? 'var(--red)' : result === null ? 'var(--yellow)' : 'var(--sky)';
  return (
    <span className="chip" style={{ background, color: failed ? 'var(--white)' : 'var(--ink)' }}>
      {result ? PRINT_RESULT_LABEL[result] : 'Planeada'}
    </span>
  );
}

export function PrintJobs({ order, onOrderChange }: { order: Order; onOrderChange: (order: Order) => void }) {
  const [jobs, setJobs] = useState<PrintJob[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Shared by the first load and every refresh, so an older answer never overwrites a newer one.
  const [requests] = useState(latestRequests);
  const [logging, setLogging] = useState(false);
  const [finishing, setFinishing] = useState<PrintJob | null>(null);
  const [planning, setPlanning] = useState<PlannedJobRef | 'new' | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  /** Read the jobs again. A failure leaves the list as it is and offers a retry. */
  const load = useCallback(async () => {
    const isLatest = requests.start();
    try {
      const data = await fetchPrintJobs(order.id);
      if (!isLatest()) return;
      setJobs(data.jobs);
      setLoadError(null);
    } catch (e) {
      if (isLatest()) setLoadError((e as Error).message);
    }
  }, [order.id, requests]);

  // Mounted with the order id as its key, so another order starts from a clean state. The first load counts as a request
  // too, so a refresh started before it answers wins.
  useEffect(() => {
    const isLatest = requests.start();
    fetchPrintJobs(order.id).then(
      (data) => { if (isLatest()) { setJobs(data.jobs); setLoadError(null); } },
      (e: Error) => { if (isLatest()) setLoadError(e.message); },
    );
    return () => requests.cancel();
  }, [order.id, requests]);

  async function remove(job: PrintJob) {
    setBusy(true);
    try {
      // A planned job is deleted as a plan, which refuses (409) once it has been finished meanwhile.
      onOrderChange(await (job.status === 'planeada' ? deletePlannedJob(order.id, job.id) : deletePrintJob(order.id, job.id)));
      setConfirming(null);
      setError(null);
      // It is gone: off the list now, whether or not the refresh below gets through.
      setJobs((list) => list && list.filter((j) => j.id !== job.id));
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
        {!logging && (
          <span className="jobs__actions">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPlanning('new')}><Icon name="calendar" size={16} />Planificar impresión</button>
            <button type="button" className="btn btn--sm" onClick={() => { setFinishing(null); setLogging(true); }}><Icon name="plus" size={16} />Cargar impresión</button>
          </span>
        )}
      </div>

      {error && <p className="field__error" role="alert">{error}</p>}
      {loadError && (
        <div className="error-banner" role="alert">
          <span>{jobs === null ? loadError : `No pudimos actualizar las impresiones: ${loadError}`}</span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => void load()}>Reintentar</button>
        </div>
      )}

      <RealCostSummary price={order.price} cost={jobs && realCost(jobs)} />

      {logging && (
        <LogJobForm
          key={finishing?.id ?? 'new'}
          orderId={order.id}
          finishing={finishing}
          onLogged={async (saved) => { onOrderChange(saved); setLogging(false); setFinishing(null); await load(); }}
          onCancel={() => { setLogging(false); setFinishing(null); }}
        />
      )}

      {jobs === null && !loadError && <p className="muted">Cargando impresiones…</p>}
      {jobs !== null && jobs.length === 0 && !logging && (
        <p className="jobs__empty">Todavía no cargaste impresiones. Al terminar una, cargá el tiempo y los gramos reales: suman horas a la impresora y descuentan filamento.</p>
      )}
      {jobs !== null && jobs.length > 0 && (
        <ul className="jobs__list">
          {jobs.map((job) => (
            <li key={job.id} className={job.status === 'planeada' ? 'job job--planned' : 'job'}>
              <div className="job__head">
                <span className="job__meta"><ResultChip result={job.result} />{job.status === 'planeada' ? planDay(job) : dayLabel(job.plannedStart === null ? job.createdAt : job.updatedAt)}</span>
                <b>{job.actualMinutes === null ? `≈ ${durationLabel(job.estimatedMinutes ?? 0)}` : durationLabel(job.actualMinutes)}</b>
              </div>
              <span className="job__printer"><Icon name="printer" size={16} />{job.printer}{planText(job)}</span>
              <JobCostLine job={job} />
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
                  <span>
                    {job.status === 'planeada'
                      ? '¿Borramos este plan? No cambia ningún contador.'
                      : `¿La borramos? Vuelven ${job.actualMinutes === null ? '' : `${durationLabel(job.actualMinutes)} a la impresora y `}los gramos a cada bobina.`}
                  </span>
                  <span className="job__confirm-actions">
                    <button type="button" className="btn btn--sm" disabled={busy} onClick={() => void remove(job)}>Sí, borrar</button>
                    <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setConfirming(null)}>No</button>
                  </span>
                </div>
              ) : job.status === 'planeada' ? (
                <span className="job__plan-actions">
                  <button type="button" className="btn btn--sm" onClick={() => { setFinishing(job); setLogging(true); }}><Icon name="check" size={16} />Terminar</button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPlanning(job)}>Cambiar plan</button>
                  <button type="button" className="job__delete" onClick={() => setConfirming(job.id)}>Borrar</button>
                </span>
              ) : (
                <button type="button" className="job__delete" onClick={() => setConfirming(job.id)}>Borrar</button>
              )}
            </li>
          ))}
        </ul>
      )}

      {planning && (
        <PlanJobDialog
          job={planning === 'new' ? null : planning}
          order={order}
          onSaved={() => void load()}
          onDeleted={(saved) => { onOrderChange(saved); void load(); }}
          onClose={() => setPlanning(null)}
        />
      )}
    </section>
  );
}

/** "Jue 26 nov", the day a planned job starts. */
function planDay(job: PrintJob): string {
  return job.plannedStart ? dayTitle(job.plannedStart.slice(0, 10)) : '';
}

/** " · 09:00 – 17:00" for a planned job; " · estimado 2 h 40 min" for a finished one that was planned. */
function planText(job: PrintJob): string {
  if (job.plannedStart === null || job.estimatedMinutes === null) return '';
  if (job.status === 'planeada') return ` · ${timeRange({ start: job.plannedStart, end: addMinutes(job.plannedStart, job.estimatedMinutes) })}`;
  return ` · estimado ${durationLabel(job.estimatedMinutes)}`;
}

/** What the job cost when it was logged, with the labour and extras it carried. */
function JobCostLine({ job }: { job: PrintJob }) {
  if (job.status === 'planeada') return null;
  const parts = [`Costó ${money(jobCostTotal(job.cost))}`];
  if (job.labourMinutes > 0) parts.push(`${durationLabel(job.labourMinutes)} de mano de obra`);
  if (job.extraCost > 0) parts.push(`${money(job.extraCost)} de extras`);
  return <span className="job__cost">{parts.join(' · ')}</span>;
}

/** The totals are added up from the jobs just fetched (as the API does), never from the board's copy of the order. */
function RealCostSummary({ price, cost }: { price: number; cost: RealCost | null }) {
  if (!cost) return null;
  const profit = realProfit(price, cost) as number;
  const loss = profit < 0;
  return (
    <div className="real-cost">
      <dl className="real-cost__totals">
        <div><dt>Costo real</dt><dd>{money(cost.total)}</dd></div>
        <div><dt>{loss ? 'Pérdida real' : 'Ganancia real'}</dt><dd className={loss ? 'real-cost__loss' : undefined}>{money(profit)}</dd></div>
        <div><dt>Precio estimado</dt><dd>{money(price)}</dd></div>
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
      <p className="muted">Lo que costó cada impresión al cargarla, las fallidas incluidas. Si después cambian los precios, no cambia.</p>
    </div>
  );
}

function LogJobForm({ orderId, finishing, onLogged, onCancel }: {
  orderId: string;
  /** The planned job this form finishes; null to log a new one. */
  finishing: PrintJob | null;
  onLogged: (order: Order) => Promise<void>;
  onCancel: () => void;
}) {
  const uid = useId();
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [spools, setSpools] = useState<Spool[]>([]);
  const [draft, setDraft] = useState<JobDraft>(() => (finishing ? finishDraft(finishing) : emptyJobDraft('')));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // One key per opening of the form, sent with every try: a retry after a lost answer gets the job already stored.
  const [submissionKey] = useState(() => crypto.randomUUID());

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
      const body = jobRequest(draft, submissionKey);
      const { order } = finishing ? await finishPrintJob(orderId, finishing.id, body) : await logPrintJob(orderId, body);
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
      <h4 id={`${uid}-title`} className="job-form__title">{finishing ? 'Terminar la impresión planeada' : 'Cargar una impresión terminada'}</h4>
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

      <fieldset className="job-form__group">
        <legend className="field__label">Además de imprimir (opcional)</legend>
        <div className="job-form__time">
          <label className="job-form__extra">
            <span className="job-form__caption">Mano de obra</span>
            <span className="job-form__unit">
              <input className="field__control" inputMode="numeric" placeholder="0" value={draft.labourMinutes}
                onChange={(e) => set('labourMinutes', e.target.value)} aria-invalid={!!errors.labourMinutes} aria-describedby={describedBy('labourMinutes')} />
              <span>min</span>
            </span>
          </label>
          <label className="job-form__extra">
            <span className="job-form__caption">Packaging y extras</span>
            <span className="job-form__unit">
              <span>$</span>
              <input className="field__control" inputMode="numeric" placeholder="0" value={draft.extraCost}
                onChange={(e) => set('extraCost', e.target.value)} aria-invalid={!!errors.extraCost} aria-describedby={describedBy('extraCost')} />
            </span>
          </label>
        </div>
        {fieldError('labourMinutes')}
        {fieldError('extraCost')}
      </fieldset>

      <div className="field">
        <label className="field__label" htmlFor={`${uid}-note`}>Nota (opcional)</label>
        <textarea id={`${uid}-note`} className="field__control" value={draft.note} onChange={(e) => set('note', e.target.value)}
          placeholder="Qué pasó, qué cambiaste…" aria-invalid={!!errors.note} aria-describedby={describedBy('note')} />
        {fieldError('note')}
      </div>

      <p className="muted">Al guardar se suman las horas a la impresora, se descuentan los gramos de cada bobina y el costo queda fijo con los precios de hoy.</p>
      <div className="job-form__actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn btn--sm" disabled={saving}>{saving ? 'Guardando…' : 'Guardar impresión'}</button>
      </div>
    </form>
  );
}
