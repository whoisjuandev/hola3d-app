import type { CalendarData, DateRange } from '../../../shared/calendar';
import { request } from '../../ui/api';

/** Due orders, projects and service tasks, and planned jobs, of the days from `from` to `to`. */
export async function fetchCalendar(range: DateRange): Promise<CalendarData> {
  return request<CalendarData>(`/api/calendar?from=${range.from}&to=${range.to}`);
}
