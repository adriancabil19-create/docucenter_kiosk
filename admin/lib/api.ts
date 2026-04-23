import type {
  StatsResponse,
  TransactionsResponse,
  PrintJobsResponse,
  StorageResponse,
  PaperTraysResponse,
  LogsResponse,
  KioskStatusResponse,
  HealthResponse,
} from './types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:5000';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
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

export const getTransactions = (limit = 50): Promise<TransactionsResponse> =>
  apiFetch<TransactionsResponse>(`/api/monitoring/transactions?limit=${limit}`);

export const getPrintJobs = (limit = 50): Promise<PrintJobsResponse> =>
  apiFetch<PrintJobsResponse>(`/api/monitoring/jobs?limit=${limit}`);

export const cancelTransaction = (id: string): Promise<{ success: boolean; message: string }> =>
  apiFetch(`/api/monitoring/transactions/${encodeURIComponent(id)}/cancel`, { method: 'POST' });

export const getLogs = (limit = 100): Promise<LogsResponse> =>
  apiFetch<LogsResponse>(`/api/monitoring/logs?limit=${limit}`);

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
  paperSize?: string,
): Promise<{ success: boolean; message: string }> =>
  apiFetch(`/api/paper-tracker/paper-trays/${encodeURIComponent(trayName)}`, {
    method: 'PUT',
    body: JSON.stringify({
      currentCount,
      ...(threshold !== undefined ? { threshold } : {}),
      ...(paperSize !== undefined ? { paperSize } : {}),
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
