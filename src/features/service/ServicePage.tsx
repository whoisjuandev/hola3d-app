import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Printer } from '../../../shared/printers';
import { serviceCostByPrinter, type ServiceLog, type ServiceTaskWithState } from '../../../shared/service';
import { Icon } from '../../ui/Icon';
import { ErrorBanner } from '../orders/components';
import { isoDate } from '../orders/format';
import { fetchPrinters } from '../printers/api';
import { createServiceTask, deactivateServiceTask, fetchServiceLogs, fetchServiceTasks, logService, updateServiceTask } from './api';
import { AdoptPlanButton, CostTotals, DeactivateDialog, LogRow, LogServiceDialog, TaskDialog, TaskRow } from './components';
import { planText } from './format';
import '../orders/orders.css';
import './service.css';

interface Data { tasks: ServiceTaskWithState[]; logs: ServiceLog[]; printers: Printer[] }

type State = { status: 'loading' } | { status: 'error'; error: string } | { status: 'ready'; data: Data };

type Dialog =
  | { kind: 'log'; task: ServiceTaskWithState | null }
  | { kind: 'task'; task: ServiceTaskWithState | null }
  | { kind: 'deactivate'; task: ServiceTaskWithState };

async function fetchAll(): Promise<Data> {
  const [tasks, { logs }, printers] = await Promise.all([fetchServiceTasks(), fetchServiceLogs(), fetchPrinters()]);
  return { tasks, logs, printers };
}

export function ServicePage() {
  const [params, setParams] = useSearchParams();
  const printerId = Number(params.get('impresora')) || null;
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [today] = useState(() => isoDate(new Date()));

  useEffect(() => {
    let alive = true;
    fetchAll().then(
      (data) => { if (alive) setState({ status: 'ready', data }); },
      (e: Error) => { if (alive) setState({ status: 'error', error: e.message }); },
    );
    return () => { alive = false; };
  }, [attempt]);

  // Reloads everything after a write: a service resets a task and adds to the costs.
  const reload = () => setAttempt((n) => n + 1);
  const choose = (id: number | null) => setParams(id === null ? {} : { impresora: String(id) }, { replace: true });

  const data = state.status === 'ready' ? state.data : null;
  const printers = data?.printers ?? [];
  const chosen = printers.find((p) => p.id === printerId) ?? null;
  const mine = <T extends { printerId: number }>(rows: T[]) => (chosen ? rows.filter((r) => r.printerId === chosen.id) : rows);
  const tasks = mine(data?.tasks ?? []);
  const due = tasks.filter((t) => t.state.due);
  const upcoming = tasks.filter((t) => !t.state.due);
  const logs = mine(data?.logs ?? []);
  const withoutPlan = (chosen ? [chosen] : printers).filter((p) => !data?.tasks.some((t) => t.printerId === p.id));
  const dueOf = (id: number) => (data?.tasks ?? []).filter((t) => t.printerId === id && t.state.due).length;
  const summary = due.length === 0 ? 'Todo al día' : `${due.length} ${due.length === 1 ? 'tarea vencida' : 'tareas vencidas'}`;

  const rowProps = (task: ServiceTaskWithState) => ({
    task, showPrinter: !chosen,
    onLog: () => setDialog({ kind: 'log', task }),
    onEdit: () => setDialog({ kind: 'task', task }),
    onDeactivate: () => setDialog({ kind: 'deactivate', task }),
  });

  return (
    <div className="service">
      <header className="service__head">
        <div>
          <h1 className="page-title">Servicio técnico</h1>
          <p className="page-sub">{data ? `${chosen ? `${chosen.name} · ` : ''}${summary}` : 'Cargando…'}</p>
        </div>
        {data && printers.length > 0 && (
          <div className="service__actions">
            <button type="button" className="btn btn--ghost" onClick={() => setDialog({ kind: 'log', task: null })}>Registrar un servicio</button>
            <button type="button" className="btn" onClick={() => setDialog({ kind: 'task', task: null })}><Icon name="plus" />Nueva tarea</button>
          </div>
        )}
      </header>

      {state.status === 'error' && <ErrorBanner text={state.error} onRetry={() => { setState({ status: 'loading' }); reload(); }} />}

      {state.status === 'loading' && <div className="orders__skeleton" aria-hidden="true"><span /><span /><span /></div>}

      {data && printers.length === 0 && (
        <section className="card empty">
          <div className="tape tape--sky" aria-hidden="true" />
          <p className="hand empty__title">Primero cargá una impresora</p>
          <p className="muted">Las tareas de servicio van por impresora y cuentan sus horas de impresión.</p>
        </section>
      )}

      {data && printers.length > 0 && (
        <>
          <div className="pills-row" role="group" aria-label="Impresora">
            <button type="button" className="pill" aria-pressed={!chosen} onClick={() => choose(null)}>Todas</button>
            {printers.map((p) => (
              <button key={p.id} type="button" className="pill" aria-pressed={chosen?.id === p.id} onClick={() => choose(p.id)}>
                {p.name}
                {dueOf(p.id) > 0 && <span className="pill__count service-pill__due" aria-label={`${dueOf(p.id)} vencidas`}>{dueOf(p.id)}</span>}
              </button>
            ))}
          </div>

          <div className="service__body">
            <div className="service__tasks">
              <section aria-labelledby="vencidas" className="service__section">
                <h2 id="vencidas" className="service__title">Para hacer ya</h2>
                {due.length === 0
                  ? <p className="lane__empty">Nada vencido{chosen ? ` en ${chosen.name}` : ''}.</p>
                  : <ul className="service-tasks">{due.map((t) => <TaskRow key={t.id} {...rowProps(t)} />)}</ul>}
              </section>

              {upcoming.length > 0 && (
                <section aria-labelledby="proximas" className="service__section">
                  <h2 id="proximas" className="service__title">Lo que viene</h2>
                  <ul className="service-tasks">{upcoming.map((t) => <TaskRow key={t.id} {...rowProps(t)} />)}</ul>
                </section>
              )}

              {withoutPlan.length > 0 && (
                <section aria-labelledby="sin-plan" className="card service-noplan">
                  <h2 id="sin-plan" className="service__title">Sin plan de servicio</h2>
                  <p className="muted">El plan básico: {planText()} Cuenta desde las horas que tiene hoy la impresora.</p>
                  <ul className="service-noplan__list">
                    {withoutPlan.map((p) => (
                      <li key={p.id}>
                        <b>{p.name}</b>
                        <span className="service-noplan__action"><AdoptPlanButton printerId={p.id} printerName={p.name} onAdopted={reload} /></span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>

            <aside className="service__side" aria-label="Gastos y registro">
              <section aria-labelledby="gasto" className="card service-money">
                <h2 id="gasto" className="service__title">Gasto en servicio</h2>
                {logs.length === 0 ? <p className="muted">Todavía no hay servicios registrados.</p> : <CostTotals totals={serviceCostByPrinter(logs)} />}
              </section>

              <section aria-labelledby="registro" className="service__section">
                <h2 id="registro" className="service__title">Registro</h2>
                {logs.length === 0
                  ? <p className="lane__empty">Cuando registres un servicio, queda acá con sus repuestos y su costo.</p>
                  : <ul className="service-logs">{logs.map((l) => <LogRow key={l.id} log={l} showPrinter={!chosen} />)}</ul>}
              </section>
            </aside>
          </div>
        </>
      )}

      {dialog?.kind === 'log' && (
        <LogServiceDialog
          task={dialog.task} printers={printers} printerId={chosen?.id ?? null} today={today}
          onLog={async (input) => { await logService(input); reload(); }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'task' && (
        <TaskDialog
          task={dialog.task} printers={printers} printerId={chosen?.id ?? null} today={today}
          onCreate={async (input) => { await createServiceTask(input); reload(); }}
          onUpdate={async (id, changes) => { await updateServiceTask(id, changes); reload(); }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'deactivate' && (
        <DeactivateDialog
          task={dialog.task}
          onConfirm={async () => { await deactivateServiceTask(dialog.task.id); reload(); }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
