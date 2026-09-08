// ─── Query helpers ────────────────────────────────────────────────────────────

/** Optional inclusive `created_at` range filter (ISO-8601 strings). */
export interface DateRange {
  from?: string;
  to?: string;
}

// ─── Payment / Transaction ────────────────────────────────────────────────────

export type TransactionStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'FAILED'
  | 'EXPIRED'
  | 'CANCELLED';

export interface Transaction {
  id: string;
  reference_number: string;
  amount: number;
  status: TransactionStatus;
  service_type: string | null;
  created_at: string;
  completed_at: string | null;
}

// ─── Print Jobs ───────────────────────────────────────────────────────────────

export type PrintJobStatus = 'submitted' | 'printing' | 'done' | 'failed';

export interface PrintJob {
  id: string;
  transaction_id: string | null;
  filenames: string[];
  paper_size: string;
  copies: number;
  status: PrintJobStatus;
  method: string | null;
  simulated: boolean;
  page_count?: number;
  color_mode?: string;
  duplex?: boolean;
  unit_price?: number;
  service_type?: string;
  created_at: string;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

export interface StorageDocument {
  id: string;
  name: string;
  originalName: string;
  format: string;
  pages: number;
  size: string;
  date: string;
  mimeType: string;
}

// ─── Paper Trays ─────────────────────────────────────────────────────────────

export interface PaperTray {
  tray_name: string;
  current_count: number;
  max_capacity: number;
  threshold: number;
  paper_size: string;
  updated_at: string;
}

// ─── Activity Logs ────────────────────────────────────────────────────────────

export type LogLevel = 'info' | 'warn' | 'error';

export interface ActivityLog {
  id: number;
  level: LogLevel;
  category: string;
  message: string;
  metadata: string | null;
  created_at: string;
}

// ─── Kiosk Status ─────────────────────────────────────────────────────────────

export interface KioskStatus {
  server: {
    online: boolean;
    uptimeSeconds: number;
    environment: string;
    version: string;
  };
  database: { connected: boolean };
  paperTrays: PaperTray[];
  lowPaperAlerts: number;
  stats: MonitoringStats;
}

// ─── Monitoring Stats ─────────────────────────────────────────────────────────

export interface MonitoringStats {
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  pendingTransactions: number;
  totalRevenue: number;
  totalPrintJobs: number;
  simulatedPrintJobs: number;
  realPrintJobs: number;
}

// ─── Fleet: kiosks ────────────────────────────────────────────────────────────

export type KioskLiveStatus = 'ONLINE' | 'OFFLINE' | 'MAINTENANCE';

export interface Kiosk {
  kiosk_id: string;
  label: string | null;
  app_version: string | null;
  printer_state: string;
  scanner_state: string;
  current_job_id: string | null;
  maintenance: boolean;
  printing_disabled: boolean;
  meta: Record<string, unknown> | null;
  first_seen: string;
  last_seen: string;
  online: boolean;
  status: KioskLiveStatus;
}

export type KioskCommandName =
  | 'MAINTENANCE_ON'
  | 'MAINTENANCE_OFF'
  | 'DISABLE_PRINTING'
  | 'ENABLE_PRINTING'
  | 'RESTART_PRINTER'
  | 'RESTART_APP'
  | 'PURGE_STORAGE'
  | 'DELETE_ALL_FILES';

export interface KioskCommand {
  id: string;
  kiosk_id: string;
  command: KioskCommandName;
  params: Record<string, unknown> | null;
  status: 'pending' | 'delivered' | 'acked' | 'failed';
  result: string | null;
  created_by: string | null;
  created_at: string;
  delivered_at: string | null;
  acked_at: string | null;
}

// ─── Incidents ────────────────────────────────────────────────────────────────

export type IncidentSeverity = 'info' | 'warning' | 'critical';

export interface Incident {
  id: string;
  kiosk_id: string;
  device: string;
  error_code: string;
  severity: IncidentSeverity;
  message: string;
  metadata: Record<string, unknown> | null;
  status: 'open' | 'resolved';
  created_at: string;
  resolved_at: string | null;
}

// ─── Storage retention ────────────────────────────────────────────────────────

export interface StorageSettings {
  delete_after_print: boolean;
  retention_hours: number;
  updated_at: string;
}

/** Document metadata synced from a kiosk — the file bytes stay on the kiosk. */
export interface StorageDocMeta {
  id: string;
  kiosk_id: string;
  name: string;
  original_name: string | null;
  format: string | null;
  pages: number;
  size_bytes: number;
  size_label: string | null;
  mime_type: string | null;
  created_at: string;
  deleted_at: string | null;
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface Analytics {
  range: DateRange;
  revenue: {
    total: number;
    byService: Array<{ service_type: string; revenue: number; count: number }>;
    byDay: Array<{ day: string; revenue: number; count: number }>;
    avgTransactionValue: number;
  };
  transactions: {
    total: number;
    success: number;
    failed: number;
    cancelled: number;
    pending: number;
  };
  jobs: {
    totalJobs: number;
    totalSheets: number;
    color: number;
    bw: number;
    duplex: number;
    simplex: number;
    byPaperSize: Array<{ paper_size: string; count: number; sheets: number }>;
  };
  peaks: {
    byHour: Array<{ hour: number; count: number }>;
    byWeekday: Array<{ weekday: number; count: number }>;
  };
}

export interface FleetSummary {
  openIncidents: number;
  kiosks: { total: number; online: number; offline: number };
}

// ─── API Wrappers ─────────────────────────────────────────────────────────────

export interface StatsResponse {
  success: boolean;
  stats: MonitoringStats;
}

export interface TransactionsResponse {
  success: boolean;
  transactions: Transaction[];
  count: number;
}

export interface PrintJobsResponse {
  success: boolean;
  jobs: PrintJob[];
  count: number;
}

export interface StorageResponse {
  success: boolean;
  documents: StorageDocument[];
  count: number;
}

export interface PaperTraysResponse {
  success: boolean;
  data: PaperTray[];
}

export interface LogsResponse {
  success: boolean;
  logs: ActivityLog[];
  count: number;
}

export interface KioskStatusResponse {
  success: boolean;
  status: KioskStatus;
}

export interface HealthResponse {
  success: boolean;
  status: string;
  timestamp: string;
}

export interface KiosksResponse {
  success: boolean;
  kiosks: Kiosk[];
  count: number;
}

export interface KioskDetailResponse {
  success: boolean;
  kiosk: Kiosk;
  commands: KioskCommand[];
}

export interface IncidentsResponse {
  success: boolean;
  incidents: Incident[];
  count: number;
}

export interface StorageSettingsResponse {
  success: boolean;
  settings: StorageSettings;
}

export interface StorageDocumentsResponse {
  success: boolean;
  documents: StorageDocMeta[];
  count: number;
}

export interface AnalyticsResponse {
  success: boolean;
  analytics: Analytics;
}

export interface FleetSummaryResponse {
  success: boolean;
  summary: FleetSummary;
}

export interface CommandQueuedResponse {
  success: boolean;
  commandId: string;
}

export interface MutationResponse {
  success: boolean;
  message?: string;
  deleted?: number;
  queued?: number;
  error?: string;
}
