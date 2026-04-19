import type {
  StatsResponse,
  TransactionsResponse,
  PrintJobsResponse,
  StorageResponse,
  HealthResponse,
} from './types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:5000';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    // Disable Next.js static caching — always fresh data in the admin console
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

// ─── Storage ──────────────────────────────────────────────────────────────────

export const getDocuments = (): Promise<StorageResponse> =>
  apiFetch<StorageResponse>('/api/storage/documents');

export const deleteDocument = (id: string): Promise<{ success: boolean; message: string }> =>
  apiFetch(`/api/storage/${id}`, { method: 'DELETE' });

// ─── Health ───────────────────────────────────────────────────────────────────

export const getHealth = (): Promise<HealthResponse> => apiFetch<HealthResponse>('/health');
