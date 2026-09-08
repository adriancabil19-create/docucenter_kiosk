// CLIENT-SAFE. Every call goes to the same-origin proxy at `/api/backend/*`,
// which checks the admin session and adds the backend bearer token server-side.
// No backend URL or token is shipped to the browser. Server Components should
// import `lib/backend.ts` directly instead of going through this HTTP hop.

import type {
  StatsResponse,
  TransactionsResponse,
  PrintJobsResponse,
  StorageResponse,
  PaperTraysResponse,
  LogsResponse,
  KioskStatusResponse,
  HealthResponse,
  DateRange,
  KiosksResponse,
  KioskDetailResponse,
  IncidentsResponse,
  StorageSettingsResponse,
  StorageDocumentsResponse,
  AnalyticsResponse,
  FleetSummaryResponse,
  CommandQueuedResponse,
  MutationResponse,
  KioskCommandName,
} from './types';

export type { DateRange };

/** Same-origin proxy mount point (see app/api/backend/[...path]/route.ts). */
const BASE_URL = '/api/backend';

function withRange(path: string, limit: number, range?: DateRange): string {
  const params = new URLSearchParams({ limit: String(limit) });
  if (range?.from) params.set('from', range.from);
  if (range?.to) params.set('to', range.to);
  return `${path}?${params.toString()}`;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ─── Monitoring ───────────────────────────────────────────────────────────────

export const getStats = (): Promise<StatsResponse> =>
  apiFetch<StatsResponse>('/api/monitoring/stats');

export const getTransactions = (limit = 50, range?: DateRange): Promise<TransactionsResponse> =>
  apiFetch<TransactionsResponse>(withRange('/api/monitoring/transactions', limit, range));

export const getPrintJobs = (limit = 50, range?: DateRange): Promise<PrintJobsResponse> =>
  apiFetch<PrintJobsResponse>(withRange('/api/monitoring/jobs', limit, range));

export const cancelTransaction = (id: string): Promise<{ success: boolean; message: string }> =>
  apiFetch(`/api/monitoring/transactions/${encodeURIComponent(id)}/cancel`, { method: 'POST' });

export const getLogs = (limit = 100, range?: DateRange): Promise<LogsResponse> =>
  apiFetch<LogsResponse>(withRange('/api/monitoring/logs', limit, range));

export const getKioskStatus = (): Promise<KioskStatusResponse> =>
  apiFetch<KioskStatusResponse>('/api/monitoring/kiosk-status');

// ─── Paper Trays ──────────────────────────────────────────────────────────────

export const getPaperTrays = (): Promise<PaperTraysResponse> =>
  apiFetch<PaperTraysResponse>('/api/paper-tracker/paper-trays');

export const getPaperAlerts = (): Promise<{
  success: boolean;
  data: Array<{ tray_name: string; current_count: number; threshold: number }>;
}> => apiFetch('/api/paper-tracker/paper-trays/alerts');

export const updatePaperTray = (
  trayName: string,
  maxCapacity: number,
  threshold?: number,
): Promise<{ success: boolean; message: string }> =>
  apiFetch(`/api/paper-tracker/paper-trays/${encodeURIComponent(trayName)}`, {
    method: 'PUT',
    body: JSON.stringify({ maxCapacity, ...(threshold !== undefined ? { threshold } : {}) }),
  });

export const setTrayCount = (
  trayName: string,
  currentCount: number,
  threshold?: number,
): Promise<{ success: boolean; message: string }> =>
  apiFetch(`/api/paper-tracker/paper-trays/${encodeURIComponent(trayName)}`, {
    method: 'PUT',
    body: JSON.stringify({
      currentCount,
      ...(threshold !== undefined ? { threshold } : {}),
    }),
  });

export const updatePaperTrayThreshold = (
  trayName: string,
  threshold: number,
): Promise<{ success: boolean; message: string }> =>
  apiFetch(`/api/paper-tracker/paper-trays/${encodeURIComponent(trayName)}`, {
    method: 'PUT',
    body: JSON.stringify({ threshold }),
  });

// ─── Storage ──────────────────────────────────────────────────────────────────

export const getDocuments = (): Promise<StorageResponse> =>
  apiFetch<StorageResponse>('/api/storage/documents');

export const deleteDocument = (filename: string): Promise<{ success: boolean; message: string }> =>
  apiFetch(`/api/storage/documents/${encodeURIComponent(filename)}`, { method: 'DELETE' });

// ─── Health ───────────────────────────────────────────────────────────────────

export const getHealth = (): Promise<HealthResponse> => apiFetch<HealthResponse>('/health');

// ─── Fleet ────────────────────────────────────────────────────────────────────

export const getKiosks = (): Promise<KiosksResponse> =>
  apiFetch<KiosksResponse>('/api/fleet/kiosks');

export const getKiosk = (id: string): Promise<KioskDetailResponse> =>
  apiFetch<KioskDetailResponse>(`/api/fleet/kiosks/${encodeURIComponent(id)}`);

export const sendKioskCommand = (
  id: string,
  command: KioskCommandName,
  params?: Record<string, unknown>,
): Promise<CommandQueuedResponse> =>
  apiFetch<CommandQueuedResponse>(`/api/fleet/kiosks/${encodeURIComponent(id)}/commands`, {
    method: 'POST',
    body: JSON.stringify({ command, ...(params ? { params } : {}) }),
  });

export const getIncidents = (
  status?: 'open' | 'resolved',
  limit = 100,
): Promise<IncidentsResponse> => {
  const params = new URLSearchParams({ limit: String(limit) });
  if (status) params.set('status', status);
  return apiFetch<IncidentsResponse>(`/api/fleet/incidents?${params.toString()}`);
};

export const resolveIncident = (id: string): Promise<MutationResponse> =>
  apiFetch<MutationResponse>(`/api/fleet/incidents/${encodeURIComponent(id)}/resolve`, {
    method: 'POST',
  });

export const getStorageSettings = (): Promise<StorageSettingsResponse> =>
  apiFetch<StorageSettingsResponse>('/api/fleet/storage-settings');

export const getStorageDocuments = (limit = 500): Promise<StorageDocumentsResponse> =>
  apiFetch<StorageDocumentsResponse>(`/api/fleet/storage-documents?limit=${limit}`);

export const updateStorageSettings = (patch: {
  delete_after_print?: boolean;
  retention_hours?: number;
}): Promise<StorageSettingsResponse> =>
  apiFetch<StorageSettingsResponse>('/api/fleet/storage-settings', {
    method: 'PUT',
    body: JSON.stringify(patch),
  });

export const purgeStorage = (): Promise<MutationResponse> =>
  apiFetch<MutationResponse>('/api/fleet/storage/purge', { method: 'POST' });

export const deleteAllStorage = (): Promise<MutationResponse> =>
  apiFetch<MutationResponse>('/api/fleet/storage/delete-all', { method: 'POST' });

export const getAnalytics = (range?: DateRange): Promise<AnalyticsResponse> => {
  const params = new URLSearchParams();
  if (range?.from) params.set('from', range.from);
  if (range?.to) params.set('to', range.to);
  const qs = params.toString();
  return apiFetch<AnalyticsResponse>(`/api/fleet/analytics${qs ? `?${qs}` : ''}`);
};

export const getFleetSummary = (): Promise<FleetSummaryResponse> =>
  apiFetch<FleetSummaryResponse>('/api/fleet/summary');
