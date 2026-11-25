// "Cargar modelo 3D" in a calculator line: the control and what the loaded model says. State: useLineModel.ts.
import { useId, useRef } from 'react';
import { Icon } from '../../ui/Icon';
import { parseInfill, parseRate, volumeText, type LineModel } from './model/line';
import type { ModelTune } from './useLineModel';

function TuneField({ label, suffix, value, valid, problem, onChange }: {
  label: string; suffix: string; value: string; valid: boolean; problem: string; onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>{label}</label>
      <span className="calc-input">
        <input id={id} className="field__control" inputMode="decimal" autoComplete="off" value={value} aria-invalid={!valid}
          aria-describedby={valid ? undefined : `${id}-err`} onChange={(e) => onChange(e.target.value)} />
        <span className="calc-input__suffix" aria-hidden="true">{suffix}</span>
      </span>
      {!valid && <span id={`${id}-err`} className="field__error">{problem}</span>}
    </div>
  );
}

/** File, volume, the "estimado" or "del laminador" badge, and for an estimate its infill and grams per hour. */
export function ModelLoader({ title, model, error, busy, onFile, onTune }: {
  title: string; model: LineModel | null; error: string | null; busy: boolean;
  onFile: (file: File) => void; onTune: (patch: ModelTune) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const estimating = model?.linked && model.source === 'estimado';
  return (
    <section className="calc-model" aria-label={`Modelo 3D de ${title}`}>
      <div className="calc-model__pick">
        <button type="button" className="btn btn--ghost btn--sm" disabled={busy} aria-describedby={`${id}-hint`} onClick={() => input.current?.click()}>
          <Icon name="box" />Cargar modelo 3D
        </button>
        <input ref={input} type="file" accept=".stl,.3mf" className="visually-hidden" tabIndex={-1} aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onFile(file);
          }} />
        <span id={`${id}-hint`} className="muted calc-model__hint">
          {busy ? 'Leyendo el modelo…' : 'STL o 3MF, o soltalo sobre la pieza. Se lee acá y no se sube.'}
        </span>
      </div>
      {error && <p className="calc-model__error" role="alert"><Icon name="alert" size={18} />{error}</p>}
      {model && (
        <div className="calc-model__info" role="status">
          <span className="calc-model__file">{model.fileName}</span>
          {model.volumeCm3 !== null && <span className="calc-model__volume">{volumeText(model.volumeCm3)}</span>}
          {model.linked
            ? <span className={`chip calc-model__badge calc-model__badge--${model.source}`}>{model.source === 'estimado' ? 'estimado' : 'del laminador'}</span>
            : <span className="muted">Gramos y tiempo cargados a mano.</span>}
        </div>
      )}
      {model?.linked && model.sliced && model.sliced.filaments > 1 && (
        <p className="muted">El laminador usó {model.sliced.filaments} filamentos: el total de gramos va en el primero.</p>
      )}
      {estimating && (
        <>
          <div className="calc-model__tune">
            <TuneField label="Relleno" suffix="%" value={model.infill} valid={parseInfill(model.infill) !== null}
              problem="De 0 a 100." onChange={(infill) => onTune({ infill })} />
            <TuneField label="Gramos por hora" suffix="g/h" value={model.rate} valid={parseRate(model.rate) !== null}
              problem="Un número mayor que 0, hasta 1000." onChange={(rate) => onTune({ rate })} />
          </div>
          <p className="muted">Aproximado por el volumen: no sabe de soportes, paredes ni velocidad. Un 3MF laminado trae los números exactos.</p>
        </>
      )}
    </section>
  );
}
