import type { DashboardData } from '../../../shared/dashboard';
import { request } from '../../ui/api';

/** What the home screen shows: due and late orders, low spools, service due, quotes waiting and the month in money. */
export async function fetchDashboard(): Promise<DashboardData> {
  return request<DashboardData>('/api/dashboard');
}
