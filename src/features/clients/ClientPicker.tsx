import type { ClientSummary } from '../../../shared/clients';
import { clientPickerHint } from './picker';

/** A client name field with the client list as suggestions. `saving` names what creates a new client ("el pedido"). */
export function ClientPicker({ id, value, clients, error, saving, autoFocus, onChange }: {
  id: string; value: string; clients: ClientSummary[]; error?: string; saving: string; autoFocus?: boolean; onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>Cliente</label>
      <input id={id} className="field__control" value={value} placeholder="Nombre o comercio" list={`${id}-clients`} autoComplete="off"
        autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error} aria-describedby={error ? `${id}-err` : `${id}-hint`} />
      <datalist id={`${id}-clients`}>
        {clients.map((c) => <option key={c.id} value={c.name} />)}
      </datalist>
      {error
        ? <span id={`${id}-err`} className="field__error">{error}</span>
        : <span id={`${id}-hint`} className="muted" aria-live="polite">{clientPickerHint(clients, value, saving)}</span>}
    </div>
  );
}
