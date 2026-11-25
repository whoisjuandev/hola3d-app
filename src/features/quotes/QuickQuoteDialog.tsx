// "Cotización rápida": a short form from the calculator's result for someone who is not a client yet. The first of its
// three actions saves the quote once, as enviado, with the recipient as text; later actions reuse it, updating it first
// when the form changed. Every try of the save sends the key made when the dialog opened, so after a failed save (even
// one whose answer was lost) the next action stores no second quote.
import { useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import type { CalcInput } from '../../../shared/calculator';
import { quoteContact, quoteWhatsappMessage, quoteWhatsappUrl, type Quote } from '../../../shared/quotes';
import { workshopToday } from '../../../shared/service';
import { ApiError } from '../../ui/api';
import { Icon } from '../../ui/Icon';
import { newSubmissionKey } from '../../ui/submission-key';
import { money } from '../orders/format';
import { createQuote, updateQuote } from './api';
import {
  newQuickQuoteForm, quickQuoteFields, quickQuoteProblem, saveQuickQuote, VALIDITY_CHOICES, type QuickQuoteForm,
} from './quick';
import { useModal } from './useModal';

type Action = 'pdf' | 'whatsapp' | 'copy';

const FIELD_OF_ERROR: Record<string, string> = { recipientPhone: 'phone' };

export function QuickQuoteDialog({ input, total, onClose }: { input: CalcInput; total: number; onClose: () => void }) {
  const ref = useModal();
  const uid = useId();
  const [today] = useState(() => workshopToday(new Date()));
  const [form, setForm] = useState<QuickQuoteForm>(() => newQuickQuoteForm(input.lines.map((l) => l.name)));
  const [saved, setSaved] = useState<Quote | null>(null);
  const [submissionKey] = useState(() => newSubmissionKey());
  const [busy, setBusy] = useState(false);
  // The state above changes on the next render; this stops a second click that lands before it.
  const running = useRef(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [fallback, setFallback] = useState<{ href: string; label: string } | null>(null);
  const [manualCopy, setManualCopy] = useState<string | null>(null);

  const set = <K extends keyof QuickQuoteForm>(key: K, value: QuickQuoteForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  /** The saved quote, saving it until a save has answered and updating what changed in the form since then. */
  function save(): Promise<Quote> {
    return saveQuickQuote({ saved, fields: quickQuoteFields(form, today), input, submissionKey }, { create: createQuote, update: updateQuote });
  }

  async function run(action: Action) {
    if (running.current) return;
    const problem = quickQuoteProblem(form);
    if (problem) {
      setErrors(problem);
      return;
    }
    running.current = true;
    setBusy(true);
    setBanner(null);
    setDone(null);
    setFallback(null);
    setManualCopy(null);
    // A tab opened while the click still counts as the owner's is not blocked; it gets its address once the quote is saved.
    const tab = action === 'copy' ? null : window.open('', '_blank');
    try {
      const quote = await save();
      setSaved(quote);
      setErrors({});
      if (action === 'copy') await copy(quoteWhatsappMessage(quote));
      else {
        const href = action === 'pdf' ? `/presupuestos/${quote.id}/imprimir` : quoteWhatsappUrl(quote, quoteContact(quote, null).phone);
        open(tab, href, action === 'pdf' ? 'Abrir el PDF' : 'Abrir WhatsApp');
      }
    } catch (err) {
      tab?.close();
      const apiErr = err as ApiError;
      const fields = Object.fromEntries(Object.entries(apiErr.fields ?? {}).map(([key, message]) => [FIELD_OF_ERROR[key] ?? key, message]));
      setErrors(fields);
      setBanner(`${apiErr.message}${fields.input ? ` ${fields.input}` : ''}`);
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  function open(tab: Window | null, href: string, label: string) {
    if (!tab) {
      setFallback({ href, label });
      return;
    }
    tab.opener = null;
    tab.location.href = new URL(href, window.location.href).href;
  }

  async function copy(text: string) {
    try {
      if (!navigator.clipboard) throw new Error('no clipboard');
      await navigator.clipboard.writeText(text);
      setDone('Copiado: el mensaje con las piezas, los precios y el total.');
    } catch {
      setManualCopy(text);
    }
  }

  const fieldProps = (key: string) => ({
    id: `${uid}-${key}`,
    className: 'field__control',
    'aria-invalid': !!errors[key],
    'aria-describedby': errors[key] ? `${uid}-${key}-err` : undefined,
  });
  const error = (key: string) => errors[key] && <span id={`${uid}-${key}-err`} className="field__error">{errors[key]}</span>;

  return (
    <dialog ref={ref} className="form-dialog" aria-labelledby={`${uid}-heading`} onCancel={onClose}>
      <form onSubmit={(e) => e.preventDefault()} noValidate>
        <div className="form-dialog__head">
          <h2 id={`${uid}-heading`} className="form-dialog__title">Cotización rápida</h2>
          <button type="button" className="icon-btn icon-btn--quiet" aria-label="Cerrar" onClick={onClose}><Icon name="close" /></button>
        </div>
        {banner && <p className="field__error" role="alert">{banner}</p>}
        <div className="form-dialog__grid">
          <div className="field">
            <label className="field__label" htmlFor={`${uid}-recipientName`}>Para (nombre)</label>
            <input {...fieldProps('recipientName')} value={form.recipientName} placeholder="Nombre de quien pide" autoComplete="off" autoFocus
              onChange={(e) => set('recipientName', e.target.value)} />
            {error('recipientName')}
          </div>
          <div className="field">
            <label className="field__label" htmlFor={`${uid}-title`}>Producto o trabajo</label>
            <input {...fieldProps('title')} value={form.title} autoComplete="off" onChange={(e) => set('title', e.target.value)} />
            {error('title')}
          </div>
          <fieldset className="field form-dialog__wide quick-quote__validity">
            <legend className="field__label">Validez</legend>
            <div className="pills-row" role="group" aria-label="Validez">
              {VALIDITY_CHOICES.map((c) => (
                <button key={c.key} type="button" className="pill" aria-pressed={form.validity === c.key} onClick={() => set('validity', c.key)}>
                  {c.label}
                </button>
              ))}
            </div>
            {form.validity === 'other' && (
              <input {...fieldProps('validUntil')} type="date" aria-label="Válido hasta" value={form.otherDate} min={today}
                onChange={(e) => set('otherDate', e.target.value)} />
            )}
            {error('validUntil')}
          </fieldset>
          <div className="field form-dialog__wide">
            <label className="field__label" htmlFor={`${uid}-note`}>Notas o plazo de entrega (opcional)</label>
            <textarea {...fieldProps('note')} value={form.note} placeholder="Seña, plazo de entrega, cómo retira…" onChange={(e) => set('note', e.target.value)} />
            {error('note')}
          </div>
          <div className="field form-dialog__wide">
            <label className="field__check">
              <input type="checkbox" checked={form.showBreakdown} onChange={(e) => set('showBreakdown', e.target.checked)}
                aria-describedby={`${uid}-breakdown-hint`} />
              Incluir desglose de costos
            </label>
            <span id={`${uid}-breakdown-hint`} className="muted">El PDF muestra el costo de cada pieza, el costo total y la ganancia.</span>
          </div>
          <div className="field form-dialog__wide">
            <label className="field__label" htmlFor={`${uid}-phone`}>Teléfono para WhatsApp (opcional)</label>
            <input {...fieldProps('phone')} type="tel" inputMode="tel" value={form.phone} placeholder="+54 9 11 5555-0000" autoComplete="off"
              onChange={(e) => set('phone', e.target.value)} />
            {error('phone')}
          </div>
        </div>

        <p className="save-quote__total">
          <span>Total</span><b>{money(total)}</b>
          <span className="muted">Se guarda en Presupuestos como enviado, sin crear cliente, con el precio de hoy.</span>
        </p>

        <div className="quick-quote__actions" role="group" aria-label="Enviar">
          <button type="button" className="btn" disabled={busy} onClick={() => void run('pdf')}><Icon name="print" />Descargar PDF</button>
          <button type="button" className="btn" disabled={busy} onClick={() => void run('whatsapp')}><Icon name="chat" />WhatsApp</button>
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void run('copy')}><Icon name="quote" />Copiar</button>
        </div>
        <p className="muted" role="status">
          {busy ? 'Guardando…' : done}
          {fallback && !busy && <a href={fallback.href} target="_blank" rel="noreferrer">{fallback.label}</a>}
        </p>
        {manualCopy && (
          <div className="field">
            <label className="field__label" htmlFor={`${uid}-copy`}>No se pudo copiar solo: seleccioná el texto y copialo</label>
            <textarea id={`${uid}-copy`} className="field__control calc-copy__text" readOnly value={manualCopy}
              rows={Math.min(10, manualCopy.split('\n').length + 1)} onFocus={(e) => e.target.select()} />
          </div>
        )}
        {saved && (
          <p className="quick-quote__saved">
            Guardado como <Link to={`/presupuestos/${saved.id}`}>{saved.number} en Presupuestos</Link>.
          </p>
        )}
      </form>
    </dialog>
  );
}
