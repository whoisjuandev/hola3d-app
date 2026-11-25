import type { CalendarData, DateRange } from '../../../shared/calendar';
import type { CalendarEvent } from '../../../shared/calendar-events';
import { request } from '../../ui/api';

/** Due orders, projects and service tasks, planned jobs and hand-made events, of the days from `from` to `to`. */
export async function fetchCalendar(range: DateRange): Promise<CalendarData> {
  return request<CalendarData>(`/api/calendar?from=${range.from}&to=${range.to}`);
}

export async function createEvent(input: Record<string, unknown>): Promise<CalendarEvent> {
  return (await request<{ event: CalendarEvent }>('/api/calendar/events', { method: 'POST', body: JSON.stringify(input) })).event;
}

/** Send only the fields that changed; the API keeps the rest. */
export async function updateEvent(id: number, changes: Record<string, unknown>): Promise<CalendarEvent> {
  return (await request<{ event: CalendarEvent }>(`/api/calendar/events/${id}`, { method: 'PUT', body: JSON.stringify(changes) })).event;
}

export async function deleteEvent(id: number): Promise<CalendarEvent> {
  return (await request<{ event: CalendarEvent }>(`/api/calendar/events/${id}`, { method: 'DELETE' })).event;
}
