/**
 * SQLite persistence layer — powered by Turso (libSQL) in production,
 * local file DB in development.
 *
 * Set env vars for Turso:
 *   TURSO_DATABASE_URL=libsql://your-db.turso.io
 *   TURSO_AUTH_TOKEN=your-token
 *
 * Local dev falls back to: file:docucenter.db
 */

import { createClient, type Client, type ResultSet } from '@libsql/client';
import { logger } from './utils/logger';
import { syncEvent } from './services/sync.service';

// ─── Client singleton ─────────────────────────────────────────────────────────

let _client: Client | null = null;

export const getDb = (): Client => {
  if (_client) return _client;
  _client = createClient({
    url: process.env.TURSO_DATABASE_URL || 'file:docucenter.db',
    authToken: process.env.TURSO_AUTH_TOKEN,
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

    CREATE INDEX IF NOT EXISTS idx_transactions_status  ON transactions(status);
    CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_print_jobs_created   ON print_jobs(created_at);
    CREATE INDEX IF NOT EXISTS idx_print_jobs_txn       ON print_jobs(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_logs_created         ON activity_logs(created_at);
  `);

  // Step 2: Migrations (column may already exist — ignore the error)
  try {
    await db.execute(`ALTER TABLE paper_trays ADD COLUMN paper_size TEXT DEFAULT 'A4'`);
  } catch {
    // Column already exists — safe to ignore
  }

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
    url: process.env.TURSO_DATABASE_URL ? 'turso (remote)' : 'file (local)',
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
}

export const insertPrintJob = async (row: PrintJobRow): Promise<void> => {
  try {
    await getDb().execute({
      sql: `INSERT INTO print_jobs (id, transaction_id, filenames, paper_size, copies, status, method, simulated)
            VALUES (@id, @transaction_id, @filenames, @paper_size, @copies, @status, @method, @simulated)`,
      args: {
        id: row.id,
        transaction_id: row.transaction_id ?? null,
        filenames: JSON.stringify(row.filenames),
        paper_size: row.paper_size,
        copies: row.copies,
        status: row.status,
        method: row.method ?? null,
        simulated: row.simulated ? 1 : 0,
      },
    });
    syncEvent('print-job', row);
  } catch (err) {
    logger.warn('Failed to insert print job', { id: row.id, error: String(err) });
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
  created_at: string;
}

export const getRecentJobs = async (limit = 20): Promise<RecentJob[]> => {
  const result = await getDb().execute({
    sql: `SELECT id, transaction_id, filenames, paper_size, copies, status, method, simulated, created_at
          FROM print_jobs ORDER BY created_at DESC LIMIT @limit`,
    args: { limit },
  });

  return toRows<{ id: string; transaction_id: string | null; filenames: string; paper_size: string; copies: number; status: string; method: string | null; simulated: number; created_at: string }>(result)
    .map((r) => ({
      ...r,
      filenames: JSON.parse(r.filenames) as string[],
      copies: Number(r.copies),
      simulated: r.simulated === 1,
    }));
};

export const getRecentTransactions = async (limit = 20): Promise<TransactionRow[]> => {
  const result = await getDb().execute({
    sql: `SELECT id, reference_number, amount, status, service_type, created_at, completed_at
          FROM transactions ORDER BY created_at DESC LIMIT @limit`,
    args: { limit },
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

export const getRecentLogs = async (limit = 50): Promise<ActivityLogRow[]> => {
  const result = await getDb().execute({
    sql: `SELECT id, level, category, message, metadata, created_at FROM activity_logs ORDER BY created_at DESC LIMIT @limit`,
    args: { limit },
  });
  return toRows<ActivityLogRow>(result);
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
