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

export type PrintBillingType = 'paid' | 'recovery' | 'staff_test' | 'admin_authorized';

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
  billing_type?: PrintBillingType;
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
  kiosk_id: string;
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
  /** How many identical lines this row represents (repeats are coalesced). */
  count: number;
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

/** Device liveness is strictly binary — there is no "unknown". */
export type DeviceState = 'ONLINE' | 'OFFLINE';

export interface Kiosk {
  kiosk_id: string;
  label: string | null;
  app_version: string | null;
  printer_state: DeviceState;
  scanner_state: DeviceState;
  current_job_id: string | null;
  maintenance: boolean;
  printing_disabled: boolean;
  reload_at: string | null;
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
  | 'DELETE_ALL_FILES'
  | 'DELETE_ALL_FILES_KEEP_META';

export interface KioskCommand {
  id: string;
  kiosk_id: string;
  command: KioskCommandName;
  params: Record<string, unknown> | null;
  status: 'pending' | 'delivered' | 'acked' | 'failed' | 'superseded';
  result: string | null;
  attempts: number;
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

// ─── Kiosk pricing ───────────────────────────────────────────────────────────

/** Per-page price for one colour mode (pesos). */
export interface TierPrice {
  bw: number;
  color: number;
}

export interface QualityTiers {
  draft: TierPrice;
  standard: TierPrice;
  high: TierPrice;
}

/** Paper sizes the kiosk offers for printing. */
export type PaperSize = 'A4' | 'Folio' | 'Letter';
export const PAPER_SIZES: PaperSize[] = ['A4', 'Folio', 'Letter'];

export interface PricingSettings {
  /** Printing is priced per paper size; photocopying is not size-dependent. */
  print: Record<PaperSize, QualityTiers>;
  photocopy: QualityTiers;
  updated_at: string;
}

export interface PricingSettingsResponse {
  success: boolean;
  settings: PricingSettings;
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
  pendingStaffPinRequests: number;
  pendingAssistanceRequests: number;
}

// ─── Customer Assistance ──────────────────────────────────────────────────────

export type AssistanceStatus = 'PENDING' | 'ACKNOWLEDGED' | 'RESOLVED' | 'CANCELLED' | 'EXPIRED';

export interface AssistanceRequest {
  id: string;
  kiosk_id: string;
  status: AssistanceStatus;
  message: string | null;
  customer_session_id: string | null;
  requested_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  escalated_at: string | null;
  created_at: string;
  updated_at: string;
}

export type NotificationStatus = 'UNREAD' | 'READ';

export interface StaffNotification {
  id: string;
  assistance_request_id: string;
  type: string;
  status: NotificationStatus;
  created_at: string;
  read_at: string | null;
  kiosk_id: string;
  request_status: AssistanceStatus;
  requested_at: string;
}

export interface AssistanceRequestsResponse {
  success: boolean;
  requests: AssistanceRequest[];
  count: number;
}

export interface AssistanceMutationResponse {
  success: boolean;
  request?: AssistanceRequest;
  error?: string;
}

export interface NotificationsResponse {
  success: boolean;
  notifications: StaffNotification[];
  count: number;
  unreadCount: number;
}

// ─── Staff ────────────────────────────────────────────────────────────────────

export type StaffRole = 'admin' | 'staff';
export type StaffStatus = 'active' | 'disabled';

export interface StaffMember {
  id: string;
  name: string;
  username: string;
  role: StaffRole;
  status: StaffStatus;
  created_at: string;
  last_login_at: string | null;
}

export type PinResetStatus = 'pending' | 'approved' | 'denied' | 'completed';

export interface PinResetRequest {
  id: string;
  staff_id: string;
  username: string;
  kiosk_id: string;
  status: PinResetStatus;
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
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
  tombstoned?: number;
  queued?: number;
  error?: string;
}

export interface StaffResponse {
  success: boolean;
  staff: StaffMember[];
  count: number;
}

export interface StaffMutationResponse {
  success: boolean;
  staff?: StaffMember;
  error?: string;
}

export interface StaffActivityResponse {
  success: boolean;
  logs: ActivityLog[];
  count: number;
}

export interface PinResetRequestsResponse {
  success: boolean;
  requests: PinResetRequest[];
  count: number;
}

export interface PinResetDecisionResponse {
  success: boolean;
  request?: PinResetRequest;
  error?: string;
}

// ─── Staff Print Recovery ──────────────────────────────────────────────────────

export type PrintRecoveryReason =
  | 'paper_jam'
  | 'printer_error'
  | 'incorrect_output'
  | 'power_interruption'
  | 'printer_offline'
  | 'other';

export type PrintRecoveryResult = 'pending' | 'success' | 'failed';

export interface PrintRecoveryAction {
  id: string;
  transaction_id: string;
  original_print_job_id: string;
  recovery_print_job_id: string | null;
  staff_id: string | null;
  staff_name: string;
  reason: PrintRecoveryReason;
  reason_note: string | null;
  pages: number;
  copies: number;
  result: PrintRecoveryResult;
  reauthorized_at: string | null;
  created_at: string;
}

export interface PrintRecoveryCounts {
  today: number;
  thisWeek: number;
  thisMonth: number;
}

export interface RecoveryActionsResponse {
  success: boolean;
  actions: PrintRecoveryAction[];
  counts: PrintRecoveryCounts;
  count: number;
}
