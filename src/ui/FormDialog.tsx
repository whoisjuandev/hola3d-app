// A modal form for creating or editing one record. Field errors come from the API's `fields`.
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ApiError } from './api';
import { Icon } from './Icon';
import './form-dialog.css';

export interface FieldSpec {
  key: string;
  label: string;
  type?: 'text' | 'select' | 'color' | 'textarea';
  options?: readonly { value: string; label: string }[];
  inputMode?: 'numeric' | 'decimal' | 'tel' | 'email';
  placeholder?: string;
  suggestions?: readonly string[];
  hint?: string;
}

export function FormDialog({ title, fields, initial, submitLabel, onSubmit, onClose }: {
  title: string;
  fields: FieldSpec[];
  initial: Record<string, string>;
  submitLabel: string;
  onSubmit: (values: Record<string, string>) => Promise<void>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const uid = useId();

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setBanner(null);
    try {
      await onSubmit(values);
      onClose();
    } catch (err) {
      const apiErr = err as ApiError;
      setErrors(apiErr.fields ?? {});
      setBanner(apiErr.message);
      setSaving(false);
    }
  }

  const control = (f: FieldSpec) => {
    const id = `${uid}-${f.key}`;
    const common = {
      id,
      className: f.type === 'color' ? 'field__control field__control--color' : 'field__control',
      value: values[f.key] ?? '',
      onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [f.key]: e.target.value })),
      'aria-invalid': !!errors[f.key],
      'aria-describedby': errors[f.key] ? `${id}-err` : f.hint ? `${id}-hint` : undefined,
    };
    if (f.type === 'textarea') return <textarea {...common} placeholder={f.placeholder} />;
    if (f.type === 'select') {
      return <select {...common}>{f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
    }
    if (f.type === 'color') return <input {...common} type="color" />;
    return (
      <>
        <input {...common} inputMode={f.inputMode} placeholder={f.placeholder} list={f.suggestions ? `${id}-list` : undefined} autoComplete="off" />
        {f.suggestions && <datalist id={`${id}-list`}>{f.suggestions.map((s) => <option key={s} value={s} />)}</datalist>}
      </>
    );
  };

  return (
    <dialog ref={ref} className="form-dialog" aria-labelledby={`${uid}-title`} onCancel={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="form-dialog__head">
          <h2 id={`${uid}-title`} className="form-dialog__title">{title}</h2>
          <button type="button" className="icon-btn icon-btn--quiet" aria-label="Cerrar" onClick={onClose}><Icon name="close" /></button>
        </div>
        {banner && <p className="field__error" role="alert">{banner}</p>}
        <div className="form-dialog__grid">
          {fields.map((f) => (
            <div key={f.key} className={f.type === 'textarea' ? 'field form-dialog__wide' : 'field'}>
              <label className="field__label" htmlFor={`${uid}-${f.key}`}>{f.label}</label>
              {control(f)}
              {errors[f.key]
                ? <span id={`${uid}-${f.key}-err`} className="field__error">{errors[f.key]}</span>
                : f.hint && <span id={`${uid}-${f.key}-hint`} className="muted">{f.hint}</span>}
            </div>
          ))}
        </div>
        <div className="form-dialog__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn" disabled={saving}>{saving ? 'Guardando…' : submitLabel}</button>
        </div>
      </form>
    </dialog>
  );
}
