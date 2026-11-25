// The form that adds a hand-made event on a day, or edits one. Marking it done and deleting it happen in the day panel.
import { EVENT_TYPE_LABEL, EVENT_TYPES, type CalendarEvent } from '../../../shared/calendar-events';
import { FormDialog, type FieldSpec } from '../../ui/FormDialog';
import { changedValues } from '../../ui/forms';
import { createEvent, updateEvent } from './api';
import { eventBody, eventDraft } from './format';

const FIELDS: FieldSpec[] = [
  { key: 'type', label: 'Tipo', type: 'select', options: EVENT_TYPES.map((t) => ({ value: t, label: EVENT_TYPE_LABEL[t] })) },
  { key: 'title', label: 'Qué', placeholder: 'Retira Sofía el topper' },
  { key: 'date', label: 'Día', type: 'date' },
  { key: 'time', label: 'Hora (opcional)', type: 'time', hint: 'Sin hora, va primero en el día.' },
  { key: 'note', label: 'Nota (opcional)', type: 'textarea', placeholder: 'Dirección, qué llevar, cuánto cobrar…' },
];

export function EventDialog({ event, date, onSaved, onClose }: {
  /** The event to edit, or null to add one on `date`. */
  event: CalendarEvent | null;
  date: string;
  onSaved: (event: CalendarEvent) => void;
  onClose: () => void;
}) {
  const initial = eventDraft(event, date);
  return (
    <FormDialog
      title={event ? 'Editar evento' : 'Nuevo evento'}
      fields={FIELDS}
      initial={initial}
      submitLabel={event ? 'Guardar cambios' : 'Agregar evento'}
      onClose={onClose}
      onSubmit={async (values) => {
        if (!event) {
          onSaved(await createEvent(eventBody(values)));
          return;
        }
        // An edit sends only what changed here, so it never undoes a change made meanwhile to the other fields.
        const changes = changedValues(values, initial);
        if (Object.keys(changes).length) onSaved(await updateEvent(event.id, eventBody(changes)));
      }}
    />
  );
}
