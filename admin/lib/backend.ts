// SERVER-ONLY. Talks to the kiosk backend with the privileged bearer token.
// Never import this from a Client Component — the token would end up in the
// browser bundle. Client code goes through `lib/api.ts`, which calls the
// session-gated proxy at `/api/backend/*`.

if (typeof window !== 'undefined') {
  throw new Error(
    'lib/backend.ts is server-only and must not be imported into client code — use lib/api.ts instead.',
  );
}

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
  AnalyticsResponse,
  FleetSummaryResponse,
  CommandQueuedResponse,
  MutationResponse,
  KioskCommandName,
} from './types';

export type { DateRange };

/**
 * Backend base URL and admin token. Prefer the server-only names; fall back to
 * the legacy `NEXT_PUBLIC_*` names so existing deployments keep working until
 * they migrate (see admin/README.md → Environment).
 */
export const BACKEND_URL = (
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:5000'
).replace(/\/$/, '');

const BACKEND_TOKEN = process.env.ADMIN_API_TOKEN || process.env.NEXT_PUBLIC_ADMIN_API_TOKEN || '';

function withRange(path: string, limit: number, range?: DateRange): string {
  const params = new URLSearchParams({ limit: String(limit) });
  if (range?.from) params.set('from', range.from);
  if (range?.to) params.set('to', range.to);
  return `${path}?${params.toString()}`;
}

/** Low-level fetch to the backend. Exported for the proxy route handler. */
export async function backendFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(BACKEND_TOKEN ? { Authorization: `Bearer ${BACKEND_TOKEN}` } : {}),
      ...init?.headers,
    },
    cache: 'no-store',
  });
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await backendFetch(path, init);

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
