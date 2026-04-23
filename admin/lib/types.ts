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
