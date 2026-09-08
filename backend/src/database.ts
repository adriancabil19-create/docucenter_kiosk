/**
 * Local SQLite persistence layer for the kiosk and cloud metadata receiver.
 */

import { randomUUID } from 'crypto';
import { createClient, type Client, type ResultSet } from '@libsql/client';
import { logger } from './utils/logger';
import { syncEvent } from './services/sync.service';

// ─── Client singleton ─────────────────────────────────────────────────────────

let _client: Client | null = null;

export const getDb = (): Client => {
  if (_client) return _client;
  const localDatabasePath = process.env.DATABASE_PATH || 'docucenter.db';
  _client = createClient({
    url: localDatabasePath.startsWith('file:') ? localDatabasePath : `file:${localDatabasePath}`,
  });
  return _client;
};

// ─── Row helper ───────────────────────────────────────────────────────────────
// Maps a libSQL ResultSet to plain typed objects using column names.

function toRows<T>(result: ResultSet): T[] {
  return result.rows.map((row) => {
    const obj: Record<string, unknown> = {};
    result.columns.forEach((col: string, i: number) => { obj[col] = row[i]; });
    return obj as T;
  });
}

function firstRow<T>(result: ResultSet): T | null {
  if (result.rows.length === 0) return null;
  const obj: Record<string, unknown> = {};
  result.columns.forEach((col: string, i: number) => { obj[col] = result.rows[0][i]; });
  return obj as T;
}

// ─── Schema init ──────────────────────────────────────────────────────────────

export const initSchema = async (): Promise<void> => {
  const db = getDb();

  // Step 1: Create tables (no INSERTs yet)
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS transactions (
      id               TEXT PRIMARY KEY,
      reference_number TEXT NOT NULL,
      amount           REAL NOT NULL,
      status           TEXT NOT NULL DEFAULT 'PENDING',
      service_type     TEXT,
      created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      completed_at     TEXT
    );

    CREATE TABLE IF NOT EXISTS print_jobs (
      id             TEXT    PRIMARY KEY,
      transaction_id TEXT,
      filenames      TEXT    NOT NULL,
      paper_size     TEXT    NOT NULL DEFAULT 'A4',
      copies         INTEGER NOT NULL DEFAULT 1,
      status         TEXT    NOT NULL DEFAULT 'submitted',
      method         TEXT,
      simulated      INTEGER NOT NULL DEFAULT 0,
      created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS paper_trays (
      tray_name     TEXT    PRIMARY KEY,
      current_count INTEGER NOT NULL DEFAULT 0,
      max_capacity  INTEGER NOT NULL DEFAULT 0,
      threshold     INTEGER NOT NULL DEFAULT 20,
      updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      level      TEXT    NOT NULL DEFAULT 'info',
      category   TEXT    NOT NULL,
      message    TEXT    NOT NULL,
      metadata   TEXT,
      created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS sync_outbox (
      id              TEXT PRIMARY KEY,
      event_type      TEXT NOT NULL,
      payload         TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'pending',
      attempts        INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT NOT NULL,
      created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      sent_at         TEXT
    );

    CREATE TABLE IF NOT EXISTS sync_received_events (
      event_id    TEXT PRIMARY KEY,
      received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    -- Fleet: one row per physical kiosk. Updated by heartbeats.
    CREATE TABLE IF NOT EXISTS kiosks (
      kiosk_id          TEXT PRIMARY KEY,
      label             TEXT,
      app_version       TEXT,
      printer_state     TEXT NOT NULL DEFAULT 'UNKNOWN',
      scanner_state     TEXT NOT NULL DEFAULT 'UNKNOWN',
      current_job_id    TEXT,
      maintenance       INTEGER NOT NULL DEFAULT 0,
      printing_disabled INTEGER NOT NULL DEFAULT 0,
      meta              TEXT,
      first_seen        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      last_seen         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    -- Structured device/error incidents surfaced on the admin Alerts view.
    CREATE TABLE IF NOT EXISTS incidents (
      id          TEXT PRIMARY KEY,
      kiosk_id    TEXT NOT NULL DEFAULT 'DOCUCENTER-01',
      device      TEXT NOT NULL DEFAULT 'kiosk',
      error_code  TEXT NOT NULL,
      severity    TEXT NOT NULL DEFAULT 'warning',
      message     TEXT NOT NULL,
      metadata    TEXT,
      status      TEXT NOT NULL DEFAULT 'open',
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      resolved_at TEXT
    );

    -- Admin -> kiosk command queue. The kiosk polls, executes, then ACKs.
    CREATE TABLE IF NOT EXISTS kiosk_commands (
      id           TEXT PRIMARY KEY,
      kiosk_id     TEXT NOT NULL,
      command      TEXT NOT NULL,
      params       TEXT,
      status       TEXT NOT NULL DEFAULT 'pending',
      result       TEXT,
      created_by   TEXT,
      created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      delivered_at TEXT,
      acked_at     TEXT
    );

    -- Singleton (id = 1) storage retention policy.
    CREATE TABLE IF NOT EXISTS storage_settings (
      id                INTEGER PRIMARY KEY CHECK (id = 1),
      delete_after_print INTEGER NOT NULL DEFAULT 0,
      retention_hours    INTEGER NOT NULL DEFAULT 24,
      updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    -- Metadata ONLY for documents uploaded on a kiosk. The file bytes never
    -- leave the kiosk — this is what the admin console lists.
    CREATE TABLE IF NOT EXISTS storage_documents (
      id            TEXT PRIMARY KEY,
      kiosk_id      TEXT NOT NULL DEFAULT 'DOCUCENTER-01',
      name          TEXT NOT NULL,
      original_name TEXT,
      format        TEXT,
      pages         INTEGER NOT NULL DEFAULT 1,
      size_bytes    INTEGER NOT NULL DEFAULT 0,
      size_label    TEXT,
      mime_type     TEXT,
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      deleted_at    TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_status  ON transactions(status);
    CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_print_jobs_created   ON print_jobs(created_at);
    CREATE INDEX IF NOT EXISTS idx_print_jobs_txn       ON print_jobs(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_logs_created         ON activity_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_sync_outbox_pending  ON sync_outbox(status, next_attempt_at, created_at);
    CREATE INDEX IF NOT EXISTS idx_incidents_status     ON incidents(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_commands_pending     ON kiosk_commands(kiosk_id, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_storage_docs_live    ON storage_documents(deleted_at, created_at);
  `);

  // Step 2: Migrations (column may already exist — ignore the error)
  const addColumn = async (sql: string): Promise<void> => {
    try {
      await db.execute(sql);
    } catch {
      // Column already exists — safe to ignore
    }
  };
  await addColumn(`ALTER TABLE paper_trays ADD COLUMN paper_size TEXT DEFAULT 'A4'`);
  // print_jobs enrichment — powers the analytics view
  await addColumn(`ALTER TABLE print_jobs ADD COLUMN page_count INTEGER NOT NULL DEFAULT 0`);
  await addColumn(`ALTER TABLE print_jobs ADD COLUMN color_mode TEXT NOT NULL DEFAULT 'bw'`);
  await addColumn(`ALTER TABLE print_jobs ADD COLUMN duplex INTEGER NOT NULL DEFAULT 0`);
  await addColumn(`ALTER TABLE print_jobs ADD COLUMN unit_price REAL NOT NULL DEFAULT 0`);
  await addColumn(`ALTER TABLE print_jobs ADD COLUMN service_type TEXT NOT NULL DEFAULT 'printing'`);

  // Seed the storage-settings singleton.
  await db.execute(
    `INSERT OR IGNORE INTO storage_settings (id, delete_after_print, retention_hours) VALUES (1, 0, 24)`,
  );

  // Step 3: Seed + enforce static paper sizes
  await db.executeMultiple(`
    INSERT OR IGNORE INTO paper_trays (tray_name, current_count, max_capacity, threshold, paper_size) VALUES
      ('MP Tray', 0, 0, 20, 'FOLIO'),
      ('Tray 1',  0, 0, 20, 'A4'),
      ('Tray 2',  0, 0, 20, 'LETTER');

    UPDATE paper_trays SET paper_size = 'FOLIO'  WHERE tray_name = 'MP Tray';
    UPDATE paper_trays SET paper_size = 'A4'     WHERE tray_name = 'Tray 1';
    UPDATE paper_trays SET paper_size = 'LETTER' WHERE tray_name = 'Tray 2';
  `);

  logger.info('Database schema initialized', {
    url: process.env.DATABASE_PATH || 'docucenter.db',
  });
};

// ─── Transaction helpers ──────────────────────────────────────────────────────

export interface TransactionRow {
  id: string;
  reference_number: string;
  amount: number;
  status: string;
  service_type?: string;
  created_at: string;
  completed_at?: string;
}

export const insertTransaction = async (row: Omit<TransactionRow, 'created_at'>): Promise<void> => {
  try {
    await getDb().execute({
      sql: `INSERT INTO transactions (id, reference_number, amount, status, service_type)
            VALUES (@id, @reference_number, @amount, @status, @service_type)`,
      args: {
        id: row.id,
        reference_number: row.reference_number,
        amount: row.amount,
        status: row.status,
        service_type: row.service_type ?? null,
      },
    });
    syncEvent('transaction', row);
  } catch (err) {
    logger.warn('Failed to insert transaction', { id: row.id, error: String(err) });
    throw err;
  }
};

export const updateTransactionStatus = async (
  id: string,
  status: string,
  completedAt?: string,
): Promise<void> => {
  try {
    await getDb().execute({
      sql: `UPDATE transactions SET status = @status, completed_at = @completedAt WHERE id = @id`,
      args: { id, status, completedAt: completedAt ?? null },
    });
    syncEvent('transaction-status', { id, status, completedAt });
  } catch (err) {
    logger.warn('Failed to update transaction status', { id, error: String(err) });
    throw err;
  }
};

// ─── Print job helpers ────────────────────────────────────────────────────────

export interface PrintJobRow {
  id: string;
  transaction_id?: string;
  filenames: string[];
  paper_size: string;
  copies: number;
  status: string;
  method?: string;
  simulated: boolean;
  /** Total source pages across all files (before the copies multiplier). */
  page_count?: number;
  color_mode?: string;
  duplex?: boolean;
  /** Price per page/copy at time of job, for revenue attribution. */
  unit_price?: number;
  service_type?: string;
}

export const insertPrintJob = async (row: PrintJobRow): Promise<void> => {
  try {
    await getDb().execute({
      sql: `INSERT INTO print_jobs
              (id, transaction_id, filenames, paper_size, copies, status, method, simulated,
               page_count, color_mode, duplex, unit_price, service_type)
            VALUES
              (@id, @transaction_id, @filenames, @paper_size, @copies, @status, @method, @simulated,
               @page_count, @color_mode, @duplex, @unit_price, @service_type)`,
      args: {
        id: row.id,
        transaction_id: row.transaction_id ?? null,
        filenames: JSON.stringify(row.filenames),
        paper_size: row.paper_size,
        copies: row.copies,
        status: row.status,
        method: row.method ?? null,
        simulated: row.simulated ? 1 : 0,
        page_count: Math.max(0, Math.trunc(row.page_count ?? 0)),
        color_mode: row.color_mode ?? 'bw',
        duplex: row.duplex ? 1 : 0,
        unit_price: row.unit_price ?? 0,
        service_type: row.service_type ?? 'printing',
      },
    });
    syncEvent('print-job', row);
  } catch (err) {
    logger.warn('Failed to insert print job', { id: row.id, error: String(err) });
    throw err;
  }
};

// ─── Monitoring queries ───────────────────────────────────────────────────────

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

export const getMonitoringStats = async (): Promise<MonitoringStats> => {
  const db = getDb();

  const txResult = await db.execute(`
    SELECT
      COUNT(*)                                                                    AS total,
      SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END)                       AS successful,
      SUM(CASE WHEN status IN ('FAILED','EXPIRED','CANCELLED') THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN status IN ('PENDING','PROCESSING') THEN 1 ELSE 0 END)       AS pending,
      COALESCE(SUM(CASE WHEN status = 'SUCCESS' THEN amount ELSE 0 END), 0)     AS revenue
    FROM transactions
  `);

  const jobResult = await db.execute(`
    SELECT
      COUNT(*)                                        AS total,
      SUM(CASE WHEN simulated = 1 THEN 1 ELSE 0 END) AS simulated,
      SUM(CASE WHEN simulated = 0 THEN 1 ELSE 0 END) AS real
    FROM print_jobs
  `);

  const tx = firstRow<{ total: number; successful: number; failed: number; pending: number; revenue: number }>(txResult) ?? { total: 0, successful: 0, failed: 0, pending: 0, revenue: 0 };
  const job = firstRow<{ total: number; simulated: number; real: number }>(jobResult) ?? { total: 0, simulated: 0, real: 0 };

  return {
    totalTransactions: Number(tx.total ?? 0),
    successfulTransactions: Number(tx.successful ?? 0),
    failedTransactions: Number(tx.failed ?? 0),
    pendingTransactions: Number(tx.pending ?? 0),
    totalRevenue: Number(tx.revenue ?? 0),
    totalPrintJobs: Number(job.total ?? 0),
    simulatedPrintJobs: Number(job.simulated ?? 0),
    realPrintJobs: Number(job.real ?? 0),
  };
};

export interface RecentJob {
  id: string;
  transaction_id: string | null;
  filenames: string[];
  paper_size: string;
  copies: number;
  status: string;
  method: string | null;
  simulated: boolean;
  page_count: number;
  color_mode: string;
  duplex: boolean;
  unit_price: number;
  service_type: string;
  created_at: string;
}

/**
 * Optional inclusive created_at range filter. Values are ISO-8601 strings
 * ('YYYY-MM-DDTHH:MM:SSZ') matching how created_at is stored, so a plain
 * lexicographic comparison is a correct chronological comparison.
 */
export interface DateRange {
  from?: string;
  to?: string;
}

const rangeClause = (
  range: DateRange | undefined,
  args: Record<string, string | number>,
): string => {
  if (!range) return '';
  const parts: string[] = [];
  if (range.from) {
    parts.push('created_at >= @from');
    args.from = range.from;
  }
  if (range.to) {
    parts.push('created_at <= @to');
    args.to = range.to;
  }
  return parts.length ? ` WHERE ${parts.join(' AND ')}` : '';
};

export const getRecentJobs = async (limit = 20, range?: DateRange): Promise<RecentJob[]> => {
  const args: Record<string, string | number> = { limit };
  const where = rangeClause(range, args);
  const result = await getDb().execute({
    sql: `SELECT id, transaction_id, filenames, paper_size, copies, status, method, simulated,
                 page_count, color_mode, duplex, unit_price, service_type, created_at
          FROM print_jobs${where} ORDER BY created_at DESC LIMIT @limit`,
    args,
  });

  return toRows<{ id: string; transaction_id: string | null; filenames: string; paper_size: string; copies: number; status: string; method: string | null; simulated: number; page_count: number; color_mode: string; duplex: number; unit_price: number; service_type: string; created_at: string }>(result)
    .map((r) => ({
      ...r,
      filenames: JSON.parse(r.filenames) as string[],
      copies: Number(r.copies),
      simulated: r.simulated === 1,
      page_count: Number(r.page_count ?? 0),
      duplex: r.duplex === 1,
      unit_price: Number(r.unit_price ?? 0),
    }));
};

export const getRecentTransactions = async (
  limit = 20,
  range?: DateRange,
): Promise<TransactionRow[]> => {
  const args: Record<string, string | number> = { limit };
  const where = rangeClause(range, args);
  const result = await getDb().execute({
    sql: `SELECT id, reference_number, amount, status, service_type, created_at, completed_at
          FROM transactions${where} ORDER BY created_at DESC LIMIT @limit`,
    args,
  });
  return toRows<TransactionRow>(result);
};

// ─── Paper tray helpers ───────────────────────────────────────────────────────

export interface PaperTrayRow {
  tray_name: string;
  current_count: number;
  max_capacity: number;
  threshold: number;
  paper_size: string;
  updated_at: string;
}

export const getPaperTrays = async (): Promise<PaperTrayRow[]> => {
  const result = await getDb().execute(
    `SELECT tray_name, current_count, max_capacity, threshold,
            COALESCE(paper_size, 'A4') AS paper_size, updated_at
     FROM paper_trays`,
  );
  return toRows<PaperTrayRow>(result).map((t) => ({
    ...t,
    current_count: Number(t.current_count),
    max_capacity: Number(t.max_capacity),
    threshold: Number(t.threshold),
  }));
};

export const updatePaperTrayPaperSize = async (trayName: string, paperSize: string): Promise<void> => {
  try {
    await getDb().execute({
      sql: `UPDATE paper_trays SET paper_size = @paperSize, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE tray_name = @trayName`,
      args: { trayName, paperSize: paperSize.toUpperCase() },
    });
    syncEvent('paper-tray', { tray_name: trayName, paper_size: paperSize.toUpperCase() });
  } catch (err) {
    logger.warn('Failed to update paper tray paper size', { trayName, paperSize, error: String(err) });
  }
};

export const updatePaperTray = async (
  trayName: string,
  currentCount: number,
  maxCapacity?: number,
): Promise<void> => {
  try {
    await getDb().execute({
      sql: `UPDATE paper_trays
            SET current_count = @currentCount,
                max_capacity  = COALESCE(@maxCapacity, max_capacity),
                updated_at    = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE tray_name = @trayName`,
      args: { trayName, currentCount, maxCapacity: maxCapacity ?? null },
    });
    syncEvent('paper-tray', { tray_name: trayName, current_count: currentCount, max_capacity: maxCapacity });
  } catch (err) {
    logger.warn('Failed to update paper tray', { trayName, error: String(err) });
  }
};

export const decrementPaperTray = async (trayName: string, amount: number): Promise<void> => {
  try {
    await getDb().execute({
      sql: `UPDATE paper_trays
            SET current_count = MAX(0, current_count - @amount),
                updated_at    = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE tray_name = @trayName`,
      args: { trayName, amount },
    });
  } catch (err) {
    logger.warn('Failed to decrement paper tray', { trayName, amount, error: String(err) });
  }
};

export const getLowPaperAlerts = async (): Promise<Array<{ tray_name: string; current_count: number; threshold: number }>> => {
  const result = await getDb().execute(
    `SELECT tray_name, current_count, threshold FROM paper_trays WHERE current_count <= threshold`,
  );
  return toRows<{ tray_name: string; current_count: number; threshold: number }>(result).map((t) => ({
    ...t,
    current_count: Number(t.current_count),
    threshold: Number(t.threshold),
  }));
};

export const updatePaperTrayThreshold = async (trayName: string, threshold: number): Promise<void> => {
  try {
    await getDb().execute({
      sql: `UPDATE paper_trays SET threshold = @threshold, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE tray_name = @trayName`,
      args: { trayName, threshold },
    });
  } catch (err) {
    logger.warn('Failed to update paper tray threshold', { trayName, error: String(err) });
  }
};

// ─── Transaction helpers (extended) ──────────────────────────────────────────

export const getTransactionById = async (id: string): Promise<TransactionRow | null> => {
  const result = await getDb().execute({
    sql: `SELECT * FROM transactions WHERE id = @id`,
    args: { id },
  });
  return firstRow<TransactionRow>(result);
};

export const cancelTransactionById = async (id: string): Promise<boolean> => {
  try {
    const result = await getDb().execute({
      sql: `UPDATE transactions
            SET status = 'CANCELLED', completed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE id = @id AND status IN ('PENDING', 'PROCESSING')`,
      args: { id },
    });
    return result.rowsAffected > 0;
  } catch (err) {
    logger.warn('Failed to cancel transaction', { id, error: String(err) });
    return false;
  }
};

// ─── Activity log helpers ─────────────────────────────────────────────────────

export interface ActivityLogRow {
  id: number;
  level: string;
  category: string;
  message: string;
  metadata: string | null;
  created_at: string;
}

export const insertLog = async (
  level: 'info' | 'warn' | 'error',
  category: string,
  message: string,
  metadata?: Record<string, unknown>,
): Promise<void> => {
  try {
    await getDb().execute({
      sql: `INSERT INTO activity_logs (level, category, message, metadata) VALUES (@level, @category, @message, @metadata)`,
      args: { level, category, message, metadata: metadata ? JSON.stringify(metadata) : null },
    });
    syncEvent('log', { level, category, message, metadata });
  } catch (err) {
    logger.warn('Failed to insert activity log', { error: String(err) });
  }
};

export const getRecentLogs = async (limit = 50, range?: DateRange): Promise<ActivityLogRow[]> => {
  const args: Record<string, string | number> = { limit };
  const where = rangeClause(range, args);
  const result = await getDb().execute({
    sql: `SELECT id, level, category, message, metadata, created_at FROM activity_logs${where} ORDER BY created_at DESC LIMIT @limit`,
    args,
  });
  return toRows<ActivityLogRow>(result);
};

/** Wipe the activity log. Returns how many rows were removed. */
export const clearActivityLogs = async (): Promise<number> => {
  const result = await getDb().execute(`DELETE FROM activity_logs`);
  return result.rowsAffected ?? 0;
};

// ─── Auto-cancel stale transactions ──────────────────────────────────────────

export const cancelStalePendingTransactions = async (olderThanMinutes: number): Promise<string[]> => {
  const db = getDb();

  const staleResult = await db.execute({
    sql: `SELECT id FROM transactions
          WHERE status IN ('PENDING', 'PROCESSING')
            AND created_at <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-' || @mins || ' minutes')`,
    args: { mins: String(olderThanMinutes) },
  });

  const stale = toRows<{ id: string }>(staleResult);
  if (stale.length === 0) return [];

  await db.execute({
    sql: `UPDATE transactions
          SET status = 'CANCELLED', completed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
          WHERE status IN ('PENDING', 'PROCESSING')
            AND created_at <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-' || @mins || ' minutes')`,
    args: { mins: String(olderThanMinutes) },
  });

  return stale.map((r) => r.id);
};

// ─── Paper count helpers ──────────────────────────────────────────────────────

export const setPaperTrayCount = async (trayName: string, currentCount: number): Promise<void> => {
  try {
    await getDb().execute({
      sql: `UPDATE paper_trays SET current_count = @currentCount, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE tray_name = @trayName`,
      args: { trayName, currentCount },
    });
    syncEvent('paper-tray', { tray_name: trayName, current_count: currentCount });
  } catch (err) {
    logger.warn('Failed to set paper tray count', { trayName, currentCount, error: String(err) });
  }
};

export const incrementPaperTray = async (trayName: string, sheetsAdded: number): Promise<void> => {
  try {
    await getDb().execute({
      sql: `UPDATE paper_trays
            SET current_count = CASE
                  WHEN max_capacity = 0 THEN current_count + @sheetsAdded
                  ELSE MIN(max_capacity, current_count + @sheetsAdded)
                END,
                max_capacity = CASE
                  WHEN max_capacity = 0 THEN current_count + @sheetsAdded
                  ELSE max_capacity
                END,
                updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE tray_name = @trayName`,
      args: { trayName, sheetsAdded },
    });
  } catch (err) {
    logger.warn('Failed to increment paper tray', { trayName, sheetsAdded, error: String(err) });
  }
};

// ─── Fleet: kiosks & heartbeats ──────────────────────────────────────────────

export interface KioskRow {
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
}

export interface HeartbeatPayload {
  kiosk_id: string;
  label?: string;
  app_version?: string;
  printer_state?: string;
  scanner_state?: string;
  current_job_id?: string | null;
  meta?: Record<string, unknown>;
}

/** Upsert a kiosk row from a heartbeat. Admin-controlled flags are preserved. */
export const recordHeartbeat = async (hb: HeartbeatPayload): Promise<void> => {
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  await getDb().execute({
    sql: `INSERT INTO kiosks
            (kiosk_id, label, app_version, printer_state, scanner_state, current_job_id, meta, first_seen, last_seen)
          VALUES
            (@kiosk_id, @label, @app_version, @printer_state, @scanner_state, @current_job_id, @meta, @now, @now)
          ON CONFLICT(kiosk_id) DO UPDATE SET
            label          = COALESCE(@label, kiosks.label),
            app_version    = COALESCE(@app_version, kiosks.app_version),
            printer_state  = COALESCE(@printer_state, kiosks.printer_state),
            scanner_state  = COALESCE(@scanner_state, kiosks.scanner_state),
            current_job_id = @current_job_id,
            meta           = COALESCE(@meta, kiosks.meta),
            last_seen      = @now`,
    args: {
      kiosk_id: hb.kiosk_id,
      label: hb.label ?? null,
      app_version: hb.app_version ?? null,
      printer_state: hb.printer_state ?? null,
      scanner_state: hb.scanner_state ?? null,
      current_job_id: hb.current_job_id ?? null,
      meta: hb.meta ? JSON.stringify(hb.meta) : null,
      now,
    },
  });
};

const mapKiosk = (r: Record<string, unknown>): KioskRow => ({
  kiosk_id: String(r.kiosk_id),
  label: (r.label as string) ?? null,
  app_version: (r.app_version as string) ?? null,
  printer_state: String(r.printer_state ?? 'UNKNOWN'),
  scanner_state: String(r.scanner_state ?? 'UNKNOWN'),
  current_job_id: (r.current_job_id as string) ?? null,
  maintenance: Number(r.maintenance) === 1,
  printing_disabled: Number(r.printing_disabled) === 1,
  meta: r.meta ? (JSON.parse(String(r.meta)) as Record<string, unknown>) : null,
  first_seen: String(r.first_seen),
  last_seen: String(r.last_seen),
});

export const getKiosks = async (): Promise<KioskRow[]> => {
  const result = await getDb().execute(`SELECT * FROM kiosks ORDER BY kiosk_id`);
  return toRows<Record<string, unknown>>(result).map(mapKiosk);
};

export const getKioskById = async (kioskId: string): Promise<KioskRow | null> => {
  const result = await getDb().execute({
    sql: `SELECT * FROM kiosks WHERE kiosk_id = @kioskId`,
    args: { kioskId },
  });
  const row = firstRow<Record<string, unknown>>(result);
  return row ? mapKiosk(row) : null;
};

/** Ensure a kiosk row exists (used by this instance for its own id at startup). */
export const ensureKiosk = async (kioskId: string, label?: string): Promise<void> => {
  await getDb().execute({
    sql: `INSERT INTO kiosks (kiosk_id, label) VALUES (@kioskId, @label)
          ON CONFLICT(kiosk_id) DO UPDATE SET label = COALESCE(kiosks.label, @label)`,
    args: { kioskId, label: label ?? null },
  });
};

/** Set admin-controlled flags on a kiosk (maintenance / printing_disabled). */
export const setKioskFlags = async (
  kioskId: string,
  flags: { maintenance?: boolean; printing_disabled?: boolean },
): Promise<void> => {
  await getDb().execute({
    sql: `INSERT INTO kiosks (kiosk_id, maintenance, printing_disabled)
          VALUES (@kioskId, COALESCE(@maintenance, 0), COALESCE(@printing_disabled, 0))
          ON CONFLICT(kiosk_id) DO UPDATE SET
            maintenance       = COALESCE(@maintenance, kiosks.maintenance),
            printing_disabled = COALESCE(@printing_disabled, kiosks.printing_disabled)`,
    args: {
      kioskId,
      maintenance: flags.maintenance === undefined ? null : flags.maintenance ? 1 : 0,
      printing_disabled:
        flags.printing_disabled === undefined ? null : flags.printing_disabled ? 1 : 0,
    },
  });
};

// ─── Incidents ───────────────────────────────────────────────────────────────

export type IncidentSeverity = 'info' | 'warning' | 'critical';

export interface IncidentRow {
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

export interface IncidentInput {
  id?: string;
  kiosk_id?: string;
  device?: string;
  error_code: string;
  severity?: IncidentSeverity;
  message: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

export const insertIncident = async (input: IncidentInput): Promise<string> => {
  const id = input.id ?? randomUUID();
  await getDb().execute({
    sql: `INSERT INTO incidents (id, kiosk_id, device, error_code, severity, message, metadata, created_at)
          VALUES (@id, @kiosk_id, @device, @error_code, @severity, @message, @metadata,
                  COALESCE(@created_at, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')))
          ON CONFLICT(id) DO NOTHING`,
    args: {
      id,
      kiosk_id: input.kiosk_id ?? 'DOCUCENTER-01',
      device: input.device ?? 'kiosk',
      error_code: input.error_code,
      severity: input.severity ?? 'warning',
      message: input.message,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      created_at: input.created_at ?? null,
    },
  });
  return id;
};

export const getIncidents = async (
  opts: { status?: 'open' | 'resolved'; limit?: number; range?: DateRange } = {},
): Promise<IncidentRow[]> => {
  const args: Record<string, string | number> = { limit: Math.min(opts.limit ?? 100, 500) };
  const clauses: string[] = [];
  if (opts.status) {
    clauses.push('status = @status');
    args.status = opts.status;
  }
  if (opts.range?.from) {
    clauses.push('created_at >= @from');
    args.from = opts.range.from;
  }
  if (opts.range?.to) {
    clauses.push('created_at <= @to');
    args.to = opts.range.to;
  }
  const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
  const result = await getDb().execute({
    sql: `SELECT * FROM incidents${where} ORDER BY created_at DESC LIMIT @limit`,
    args,
  });
  return toRows<Record<string, unknown>>(result).map((r) => ({
    id: String(r.id),
    kiosk_id: String(r.kiosk_id),
    device: String(r.device),
    error_code: String(r.error_code),
    severity: String(r.severity) as IncidentSeverity,
    message: String(r.message),
    metadata: r.metadata ? (JSON.parse(String(r.metadata)) as Record<string, unknown>) : null,
    status: String(r.status) as 'open' | 'resolved',
    created_at: String(r.created_at),
    resolved_at: (r.resolved_at as string) ?? null,
  }));
};

export const resolveIncident = async (id: string): Promise<boolean> => {
  const result = await getDb().execute({
    sql: `UPDATE incidents
          SET status = 'resolved', resolved_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
          WHERE id = @id AND status = 'open'`,
    args: { id },
  });
  return result.rowsAffected > 0;
};

export const getOpenIncidentCount = async (): Promise<number> => {
  const result = await getDb().execute(`SELECT COUNT(*) AS n FROM incidents WHERE status = 'open'`);
  return Number(firstRow<{ n: number }>(result)?.n ?? 0);
};

// ─── Admin → kiosk commands ──────────────────────────────────────────────────

export type KioskCommandName =
  | 'MAINTENANCE_ON'
  | 'MAINTENANCE_OFF'
  | 'DISABLE_PRINTING'
  | 'ENABLE_PRINTING'
  | 'RESTART_PRINTER'
  | 'RESTART_APP';

export interface KioskCommandRow {
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

export const enqueueCommand = async (
  kioskId: string,
  command: KioskCommandName,
  params?: Record<string, unknown>,
  createdBy?: string,
): Promise<string> => {
  const id = randomUUID();
  await getDb().execute({
    sql: `INSERT INTO kiosk_commands (id, kiosk_id, command, params, created_by)
          VALUES (@id, @kioskId, @command, @params, @createdBy)`,
    args: {
      id,
      kioskId,
      command,
      params: params ? JSON.stringify(params) : null,
      createdBy: createdBy ?? null,
    },
  });
  return id;
};

const mapCommand = (r: Record<string, unknown>): KioskCommandRow => ({
  id: String(r.id),
  kiosk_id: String(r.kiosk_id),
  command: String(r.command) as KioskCommandName,
  params: r.params ? (JSON.parse(String(r.params)) as Record<string, unknown>) : null,
  status: String(r.status) as KioskCommandRow['status'],
  result: (r.result as string) ?? null,
  created_by: (r.created_by as string) ?? null,
  created_at: String(r.created_at),
  delivered_at: (r.delivered_at as string) ?? null,
  acked_at: (r.acked_at as string) ?? null,
});

/** Pending commands for a kiosk, marking them 'delivered' as they are handed out. */
export const claimPendingCommands = async (kioskId: string): Promise<KioskCommandRow[]> => {
  const result = await getDb().execute({
    sql: `SELECT * FROM kiosk_commands
          WHERE kiosk_id = @kioskId AND status = 'pending'
          ORDER BY created_at ASC LIMIT 20`,
    args: { kioskId },
  });
  const rows = toRows<Record<string, unknown>>(result).map(mapCommand);
  if (rows.length) {
    await getDb().execute({
      sql: `UPDATE kiosk_commands
            SET status = 'delivered', delivered_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE kiosk_id = @kioskId AND status = 'pending'`,
      args: { kioskId },
    });
  }
  return rows;
};

export const ackCommand = async (id: string, ok: boolean, result?: string): Promise<void> => {
  await getDb().execute({
    sql: `UPDATE kiosk_commands
          SET status = @status, result = @result, acked_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
          WHERE id = @id`,
    args: { id, status: ok ? 'acked' : 'failed', result: result ?? null },
  });
};

export const getRecentCommands = async (
  kioskId?: string,
  limit = 30,
): Promise<KioskCommandRow[]> => {
  const result = await getDb().execute({
    sql: `SELECT * FROM kiosk_commands ${kioskId ? 'WHERE kiosk_id = @kioskId' : ''}
          ORDER BY created_at DESC LIMIT @limit`,
    args: kioskId ? { kioskId, limit } : { limit },
  });
  return toRows<Record<string, unknown>>(result).map(mapCommand);
};

// ─── Storage retention settings ──────────────────────────────────────────────

export interface StorageSettings {
  delete_after_print: boolean;
  retention_hours: number;
  updated_at: string;
}

export const getStorageSettings = async (): Promise<StorageSettings> => {
  const result = await getDb().execute(`SELECT * FROM storage_settings WHERE id = 1`);
  const row = firstRow<Record<string, unknown>>(result);
  return {
    delete_after_print: Number(row?.delete_after_print) === 1,
    retention_hours: Number(row?.retention_hours ?? 24),
    updated_at: String(row?.updated_at ?? ''),
  };
};

export const updateStorageSettings = async (patch: {
  delete_after_print?: boolean;
  retention_hours?: number;
}): Promise<StorageSettings> => {
  await getDb().execute({
    sql: `UPDATE storage_settings SET
            delete_after_print = COALESCE(@delete_after_print, delete_after_print),
            retention_hours    = COALESCE(@retention_hours, retention_hours),
            updated_at         = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
          WHERE id = 1`,
    args: {
      delete_after_print:
        patch.delete_after_print === undefined ? null : patch.delete_after_print ? 1 : 0,
      retention_hours:
        patch.retention_hours === undefined ? null : Math.max(1, Math.trunc(patch.retention_hours)),
    },
  });
  return getStorageSettings();
};

// ─── Storage document metadata (bytes stay on the kiosk) ─────────────────────

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

export interface StorageDocMetaInput {
  id: string;
  kiosk_id?: string;
  name: string;
  original_name?: string;
  format?: string;
  pages?: number;
  size_bytes?: number;
  size_label?: string;
  mime_type?: string;
  created_at?: string;
}

/** Upsert one document's metadata locally and forward it to the cloud. */
export const upsertStorageDocMeta = async (doc: StorageDocMetaInput): Promise<void> => {
  try {
    await getDb().execute({
      sql: `INSERT INTO storage_documents
              (id, kiosk_id, name, original_name, format, pages, size_bytes, size_label, mime_type, created_at, deleted_at)
            VALUES
              (@id, @kiosk_id, @name, @original_name, @format, @pages, @size_bytes, @size_label, @mime_type,
               COALESCE(@created_at, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), NULL)
            ON CONFLICT(id) DO UPDATE SET
              name = @name, original_name = @original_name, format = @format,
              pages = @pages, size_bytes = @size_bytes, size_label = @size_label,
              mime_type = @mime_type, deleted_at = NULL`,
      args: {
        id: doc.id,
        kiosk_id: doc.kiosk_id ?? 'DOCUCENTER-01',
        name: doc.name,
        original_name: doc.original_name ?? null,
        format: doc.format ?? null,
        pages: Math.max(1, Math.trunc(doc.pages ?? 1)),
        size_bytes: Math.max(0, Math.trunc(doc.size_bytes ?? 0)),
        size_label: doc.size_label ?? null,
        mime_type: doc.mime_type ?? null,
        created_at: doc.created_at ?? null,
      },
    });
    syncEvent('storage-doc', doc);
  } catch (err) {
    logger.warn('Failed to upsert storage doc meta', { id: doc.id, error: String(err) });
  }
};

/** Mark a document's metadata deleted (kept as a tombstone, not removed). */
export const softDeleteStorageDocMeta = async (id: string, forward = true): Promise<void> => {
  try {
    await getDb().execute({
      sql: `UPDATE storage_documents
            SET deleted_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE id = @id AND deleted_at IS NULL`,
      args: { id },
    });
    if (forward) syncEvent('storage-doc-delete', { id });
  } catch (err) {
    logger.warn('Failed to soft-delete storage doc meta', { id, error: String(err) });
  }
};

export const getStorageDocMetas = async (
  opts: { includeDeleted?: boolean; limit?: number } = {},
): Promise<StorageDocMeta[]> => {
  const limit = Math.min(opts.limit ?? 500, 2000);
  const where = opts.includeDeleted ? '' : ' WHERE deleted_at IS NULL';
  const result = await getDb().execute({
    sql: `SELECT * FROM storage_documents${where} ORDER BY created_at DESC LIMIT @limit`,
    args: { limit },
  });
  return toRows<Record<string, unknown>>(result).map((r) => ({
    id: String(r.id),
    kiosk_id: String(r.kiosk_id),
    name: String(r.name),
    original_name: (r.original_name as string) ?? null,
    format: (r.format as string) ?? null,
    pages: Number(r.pages ?? 1),
    size_bytes: Number(r.size_bytes ?? 0),
    size_label: (r.size_label as string) ?? null,
    mime_type: (r.mime_type as string) ?? null,
    created_at: String(r.created_at),
    deleted_at: (r.deleted_at as string) ?? null,
  }));
};

// ─── Housekeeping: keep the DB small on the free tier ────────────────────────

/** Delete old rows from the churny tables. Safe to run often. Returns counts. */
export const pruneOldRows = async (): Promise<Record<string, number>> => {
  const db = getDb();
  const runs: Array<[string, string]> = [
    // Activity logs: keep 30 days.
    ['activity_logs', `DELETE FROM activity_logs WHERE created_at < strftime('%Y-%m-%dT%H:%M:%SZ','now','-30 days')`],
    // Sent sync events: keep 2 days.
    ['sync_outbox', `DELETE FROM sync_outbox WHERE status = 'sent' AND sent_at < strftime('%Y-%m-%dT%H:%M:%SZ','now','-2 days')`],
    // Idempotency ledger: keep 7 days.
    ['sync_received_events', `DELETE FROM sync_received_events WHERE received_at < strftime('%Y-%m-%dT%H:%M:%SZ','now','-7 days')`],
    // Finished commands: keep 7 days.
    ['kiosk_commands', `DELETE FROM kiosk_commands WHERE status IN ('acked','failed') AND acked_at < strftime('%Y-%m-%dT%H:%M:%SZ','now','-7 days')`],
    // Deleted-document tombstones: keep 30 days.
    ['storage_documents', `DELETE FROM storage_documents WHERE deleted_at IS NOT NULL AND deleted_at < strftime('%Y-%m-%dT%H:%M:%SZ','now','-30 days')`],
    // Resolved incidents: keep 60 days.
    ['incidents', `DELETE FROM incidents WHERE status = 'resolved' AND resolved_at < strftime('%Y-%m-%dT%H:%M:%SZ','now','-60 days')`],
  ];
  const counts: Record<string, number> = {};
  for (const [table, sql] of runs) {
    try {
      const res = await db.execute(sql);
      counts[table] = res.rowsAffected ?? 0;
    } catch (err) {
      logger.warn('pruneOldRows failed for a table', { table, error: String(err) });
    }
  }
  return counts;
};

// ─── Analytics aggregation ───────────────────────────────────────────────────

export interface AnalyticsResult {
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

const analyticsWhere = (
  range: DateRange | undefined,
  args: Record<string, string | number>,
  extraLeading?: string,
): string => {
  const parts: string[] = [];
  if (extraLeading) parts.push(extraLeading);
  if (range?.from) {
    parts.push('created_at >= @from');
    args.from = range.from;
  }
  if (range?.to) {
    parts.push('created_at <= @to');
    args.to = range.to;
  }
  return parts.length ? ` WHERE ${parts.join(' AND ')}` : '';
};

export const getAnalytics = async (range?: DateRange): Promise<AnalyticsResult> => {
  const db = getDb();

  const txArgs: Record<string, string | number> = {};
  const txWhere = analyticsWhere(range, txArgs);
  const okArgs: Record<string, string | number> = {};
  const okWhere = analyticsWhere(range, okArgs, "status = 'SUCCESS'");
  const jobArgs: Record<string, string | number> = {};
  const jobWhere = analyticsWhere(range, jobArgs);

  const [txAgg, byService, byDay, jobAgg, byPaper, byHour, byWeekday] = await Promise.all([
    db.execute({
      sql: `SELECT
              COUNT(*) AS total,
              SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END) AS success,
              SUM(CASE WHEN status IN ('FAILED','EXPIRED') THEN 1 ELSE 0 END) AS failed,
              SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled,
              SUM(CASE WHEN status IN ('PENDING','PROCESSING') THEN 1 ELSE 0 END) AS pending,
              COALESCE(SUM(CASE WHEN status = 'SUCCESS' THEN amount ELSE 0 END), 0) AS revenue
            FROM transactions${txWhere}`,
      args: txArgs,
    }),
    db.execute({
      sql: `SELECT COALESCE(service_type, 'unknown') AS service_type,
                   COUNT(*) AS count, COALESCE(SUM(amount), 0) AS revenue
            FROM transactions${okWhere}
            GROUP BY service_type ORDER BY revenue DESC`,
      args: okArgs,
    }),
    db.execute({
      sql: `SELECT substr(created_at, 1, 10) AS day,
                   COUNT(*) AS count, COALESCE(SUM(amount), 0) AS revenue
            FROM transactions${okWhere}
            GROUP BY day ORDER BY day ASC`,
      args: okArgs,
    }),
    db.execute({
      sql: `SELECT
              COUNT(*) AS total_jobs,
              COALESCE(SUM(MAX(page_count, 1) * MAX(copies, 1)), 0) AS total_sheets,
              SUM(CASE WHEN color_mode = 'color' THEN 1 ELSE 0 END) AS color,
              SUM(CASE WHEN color_mode <> 'color' THEN 1 ELSE 0 END) AS bw,
              SUM(CASE WHEN duplex = 1 THEN 1 ELSE 0 END) AS duplex,
              SUM(CASE WHEN duplex = 0 THEN 1 ELSE 0 END) AS simplex
            FROM print_jobs${jobWhere}`,
      args: jobArgs,
    }),
    db.execute({
      sql: `SELECT paper_size, COUNT(*) AS count,
                   COALESCE(SUM(MAX(page_count, 1) * MAX(copies, 1)), 0) AS sheets
            FROM print_jobs${jobWhere}
            GROUP BY paper_size ORDER BY count DESC`,
      args: jobArgs,
    }),
    db.execute({
      sql: `SELECT CAST(strftime('%H', replace(created_at, 'Z', '')) AS INTEGER) AS hour,
                   COUNT(*) AS count
            FROM transactions${txWhere}
            GROUP BY hour ORDER BY hour ASC`,
      args: txArgs,
    }),
    db.execute({
      sql: `SELECT CAST(strftime('%w', replace(created_at, 'Z', '')) AS INTEGER) AS weekday,
                   COUNT(*) AS count
            FROM transactions${txWhere}
            GROUP BY weekday ORDER BY weekday ASC`,
      args: txArgs,
    }),
  ]);

  const t = firstRow<Record<string, unknown>>(txAgg) ?? {};
  const j = firstRow<Record<string, unknown>>(jobAgg) ?? {};
  const success = Number(t.success ?? 0);
  const revenue = Number(t.revenue ?? 0);

  return {
    range: range ?? {},
    revenue: {
      total: revenue,
      byService: toRows<Record<string, unknown>>(byService).map((r) => ({
        service_type: String(r.service_type),
        revenue: Number(r.revenue ?? 0),
        count: Number(r.count ?? 0),
      })),
      byDay: toRows<Record<string, unknown>>(byDay).map((r) => ({
        day: String(r.day),
        revenue: Number(r.revenue ?? 0),
        count: Number(r.count ?? 0),
      })),
      avgTransactionValue: success > 0 ? revenue / success : 0,
    },
    transactions: {
      total: Number(t.total ?? 0),
      success,
      failed: Number(t.failed ?? 0),
      cancelled: Number(t.cancelled ?? 0),
      pending: Number(t.pending ?? 0),
    },
    jobs: {
      totalJobs: Number(j.total_jobs ?? 0),
      totalSheets: Number(j.total_sheets ?? 0),
      color: Number(j.color ?? 0),
      bw: Number(j.bw ?? 0),
      duplex: Number(j.duplex ?? 0),
      simplex: Number(j.simplex ?? 0),
      byPaperSize: toRows<Record<string, unknown>>(byPaper).map((r) => ({
        paper_size: String(r.paper_size),
        count: Number(r.count ?? 0),
        sheets: Number(r.sheets ?? 0),
      })),
    },
    peaks: {
      byHour: toRows<Record<string, unknown>>(byHour).map((r) => ({
        hour: Number(r.hour ?? 0),
        count: Number(r.count ?? 0),
      })),
      byWeekday: toRows<Record<string, unknown>>(byWeekday).map((r) => ({
        weekday: Number(r.weekday ?? 0),
        count: Number(r.count ?? 0),
      })),
    },
  };
};
