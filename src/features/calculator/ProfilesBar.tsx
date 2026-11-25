// Saved calculator profiles: save the current input under a name or over a saved one, load, rename and delete.
import { useEffect, useId, useState } from 'react';
import { MAX_PROFILE_NAME, type CalcProfile } from '../../../shared/calc-profiles';
import type { CalcInput } from '../../../shared/calculator';
import { ApiError } from '../../ui/api';
import { FormDialog } from '../../ui/FormDialog';
import { Icon } from '../../ui/Icon';
import { createProfile, deleteProfile, fetchProfiles, updateProfile } from './api';

type Confirm = 'load' | 'overwrite' | 'delete';

/** An API error with the input's own message added, since a name dialog has no field for it. */
function withInputMessage(err: unknown): Error {
  if (!(err instanceof ApiError)) return err as Error;
  const { input, ...fields } = err.fields;
  return new ApiError(input ? `${err.message} ${input}` : err.message, fields);
}

function byName(profiles: CalcProfile[]): CalcProfile[] {
  return [...profiles].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }) || a.id - b.id);
}

/**
 * The profiles card. `input` is the calculator's current input; `dirty` says the owner typed something, so loading over
 * it asks first. `onLoad` puts a profile's input in the calculator and answers the notice of what is missing, if any.
 */
export function ProfilesBar({ input, dirty, onLoad }: { input: CalcInput; dirty: boolean; onLoad: (input: CalcInput) => string | null }) {
  const id = useId();
  const [profiles, setProfiles] = useState<CalcProfile[] | null>(null);
  const [selected, setSelected] = useState('');
  const [dialog, setDialog] = useState<'new' | 'rename' | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchProfiles().then(
      (list) => { if (alive) setProfiles(byName(list)); },
      (e: Error) => { if (alive) setError(e.message); },
    );
    return () => { alive = false; };
  }, []);

  const load = () => {
    setError(null);
    fetchProfiles().then((list) => setProfiles(byName(list)), (e: Error) => setError(e.message));
  };

  const profile = profiles?.find((p) => String(p.id) === selected) ?? null;
  const say = (text: string) => { setStatus(text); setError(null); };
  const replace = (p: CalcProfile) => setProfiles((list) => byName([...(list ?? []).filter((x) => x.id !== p.id), p]));

  function loadProfile(p: CalcProfile) {
    setConfirm(null);
    setNotice(onLoad(p.input));
    say(`Cargado «${p.name}».`);
  }

  async function act(run: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await run();
      setConfirm(null);
    } catch (err) {
      setError(withInputMessage(err).message);
    } finally {
      setBusy(false);
    }
  }

  const overwrite = (p: CalcProfile) => act(async () => {
    replace(await updateProfile(p.id, { input }));
    say(`Guardado sobre «${p.name}».`);
  });
  const remove = (p: CalcProfile) => act(async () => {
    await deleteProfile(p.id);
    setProfiles((list) => (list ?? []).filter((x) => x.id !== p.id));
    setSelected('');
    say(`Borrado «${p.name}».`);
  });

  const confirmText: Record<Confirm, string> = {
    load: `Lo que tenés en la calculadora se reemplaza por «${profile?.name}».`,
    overwrite: `«${profile?.name}» se reemplaza por lo que tenés ahora en la calculadora.`,
    delete: `¿Borrar el perfil «${profile?.name}»? No se puede deshacer.`,
  };
  const confirmAction: Record<Confirm, { label: string; run: (p: CalcProfile) => void }> = {
    load: { label: 'Sí, cargar', run: loadProfile },
    overwrite: { label: 'Sí, reemplazar', run: (p) => void overwrite(p) },
    delete: { label: 'Sí, borrar', run: (p) => void remove(p) },
  };

  return (
    <section className="card calc-profiles" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="calc-profiles__title">Perfiles</h2>
      <div className="calc-profiles__pick">
        <div className="field">
          <label className="field__label" htmlFor={`${id}-select`}>Perfil guardado</label>
          <select id={`${id}-select`} className="field__control" value={selected} disabled={!profiles}
            onChange={(e) => { setSelected(e.target.value); setConfirm(null); setStatus(null); }}>
            <option value="">{!profiles ? 'Cargando…' : profiles.length ? 'Elegí un perfil' : 'Todavía no guardaste perfiles'}</option>
            {profiles?.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
          </select>
        </div>
        <button type="button" className="btn btn--sm" disabled={!profile || busy}
          onClick={() => { if (profile) { if (dirty) setConfirm('load'); else loadProfile(profile); } }}>
          Cargar
        </button>
      </div>
      <div className="calc-profiles__actions">
        <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setDialog('new')}><Icon name="plus" />Guardar como perfil nuevo</button>
        <button type="button" className="btn btn--ghost btn--sm" disabled={!profile || busy} onClick={() => setConfirm('overwrite')}>Guardar sobre este</button>
        <button type="button" className="btn btn--ghost btn--sm" disabled={!profile || busy} onClick={() => setDialog('rename')}>Renombrar</button>
        <button type="button" className="btn btn--ghost btn--sm" disabled={!profile || busy} onClick={() => setConfirm('delete')}>Borrar</button>
      </div>

      {confirm && profile && (
        <div className="job__confirm" role="group" aria-label="Confirmar">
          <span>{confirmText[confirm]}</span>
          <span className="job__confirm-actions">
            <button type="button" className="btn btn--sm" disabled={busy} onClick={() => confirmAction[confirm].run(profile)}>{confirmAction[confirm].label}</button>
            <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setConfirm(null)}>No</button>
          </span>
        </div>
      )}
      {notice && (
        <p className="calc-use__warning" role="status">
          <Icon name="alert" size={18} />{notice}
        </p>
      )}
      {error && (
        <p className="field__error" role="alert">
          {error}{' '}
          {!profiles && <button type="button" className="btn btn--ghost btn--sm" onClick={load}>Reintentar</button>}
        </p>
      )}
      {status && <p className="muted" role="status">{status}</p>}

      {dialog === 'new' && (
        <FormDialog
          title="Guardar como perfil"
          fields={[{ key: 'name', label: 'Nombre del perfil', placeholder: 'Llaveros por mayor', hint: `Hasta ${MAX_PROFILE_NAME} caracteres.` }]}
          initial={{ name: '' }}
          submitLabel="Guardar perfil"
          onClose={() => setDialog(null)}
          onSubmit={async ({ name }) => {
            try {
              const saved = await createProfile({ name, input });
              replace(saved);
              setSelected(String(saved.id));
              setConfirm(null);
              say(`Guardado como «${saved.name}».`);
            } catch (err) {
              throw withInputMessage(err);
            }
          }}
        />
      )}
      {dialog === 'rename' && profile && (
        <FormDialog
          title="Renombrar perfil"
          fields={[{ key: 'name', label: 'Nombre del perfil', hint: `Hasta ${MAX_PROFILE_NAME} caracteres.` }]}
          initial={{ name: profile.name }}
          submitLabel="Renombrar"
          onClose={() => setDialog(null)}
          onSubmit={async ({ name }) => {
            if (name === profile.name) return;
            const saved = await updateProfile(profile.id, { name });
            replace(saved);
            say(`Ahora se llama «${saved.name}».`);
          }}
        />
      )}
    </section>
  );
}
