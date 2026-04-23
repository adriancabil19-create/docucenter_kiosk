/**
 * SQLite persistence layer for DOCUCENTER Kiosk.
 *
 * Tables:
 *   transactions  — every PAYMONGO payment transaction (created, completed, failed)
 *   print_jobs    — every print/copy job submitted
 *
 * Uses better-sqlite3 (synchronous API) — safe for single-process Node/Express.
 * Database file is created at <project-root>/docucenter.db on first run.
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import { logger } from './utils/logger';
import { syncEvent } from './services/sync.service';

// ─── Database location ────────────────────────────────────────────────────────
// Override with DATABASE_PATH env var for persistent disk on Render:
//   DATABASE_PATH=/data/docucenter.db
// process.cwd() is the working directory when the server is started:
//   - local dev (npm run dev from backend/):  backend/docucenter.db
//   - Docker (WORKDIR /app):                 /app/docucenter.db
const dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), 'docucenter.db');

// ─── Singleton connection ─────────────────────────────────────────────────────
let _db: Database.Database | null = null;

export const getDb = (): Database.Database => {
  if (_db) return _db;
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL'); // better concurrent read performance
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  logger.info('SQLite database opened', { path: dbPath });
  return _db;
};

// ─── Schema ───────────────────────────────────────────────────────────────────

const initSchema = (db: Database.Database): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id              TEXT    PRIMARY KEY,
      reference_number TEXT   NOT NULL,
      amount          REAL    NOT NULL,
      status          TEXT    NOT NULL DEFAULT 'PENDING',
      service_type    TEXT,
      created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      completed_at    TEXT
    );

    CREATE TABLE IF NOT EXISTS print_jobs (
      id              TEXT    PRIMARY KEY,
      transaction_id  TEXT,
      filenames       TEXT    NOT NULL,   -- JSON array of filenames
      paper_size      TEXT    NOT NULL DEFAULT 'A4',
      copies          INTEGER NOT NULL DEFAULT 1,
      status          TEXT    NOT NULL DEFAULT 'submitted',
      method          TEXT,
      simulated       INTEGER NOT NULL DEFAULT 0,  -- 1 = simulation, 0 = real print
      created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS paper_trays (
      tray_name       TEXT    PRIMARY KEY,
      current_count   INTEGER NOT NULL DEFAULT 0,
      max_capacity    INTEGER NOT NULL DEFAULT 0,
      threshold       INTEGER NOT NULL DEFAULT 20,  -- sheets remaining before low alert
      updated_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    -- Insert default trays if not exist
    INSERT OR IGNORE INTO paper_trays (tray_name, current_count, max_capacity, threshold) VALUES
      ('MP Tray', 0, 0, 20),
      ('Tray 1', 0, 0, 20),
      ('Tray 2', 0, 0, 20);

    CREATE TABLE IF NOT EXISTS activity_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      level       TEXT    NOT NULL DEFAULT 'info',
      category    TEXT    NOT NULL,
      message     TEXT    NOT NULL,
      metadata    TEXT,
      created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_status   ON transactions(status);
    CREATE INDEX IF NOT EXISTS idx_transactions_created  ON transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_print_jobs_created    ON print_jobs(created_at);
    CREATE INDEX IF NOT EXISTS idx_print_jobs_txn        ON print_jobs(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_logs_created          ON activity_logs(created_at);
  `);
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

export const insertTransaction = (row: Omit<TransactionRow, 'created_at'>): void => {
  try {
    getDb()
      .prepare(
        `
      INSERT INTO transactions (id, reference_number, amount, status, service_type)
      VALUES (@id, @reference_number, @amount, @status, @service_type)
    `,
      )
      .run(row);
    syncEvent('transaction', row);
  } catch (err) {
    logger.warn('Failed to insert transaction', { id: row.id, error: String(err) });
  }
};

export const updateTransactionStatus = (id: string, status: string, completedAt?: string): void => {
  try {
    getDb()
      .prepare(
        `
      UPDATE transactions
      SET status = @status, completed_at = @completedAt
      WHERE id = @id
    `,
      )
      .run({ id, status, completedAt: completedAt ?? null });
    syncEvent('transaction-status', { id, status, completedAt });
  } catch (err) {
    logger.warn('Failed to update transaction status', { id, error: String(err) });
  }
};

// ─── Print job helpers ────────────────────────────────────────────────────────

export interface PrintJobRow {
  id: string;
  transaction_id?: string;
  filenames: string[]; // stored as JSON
  paper_size: string;
  copies: number;
  status: string;
  method?: string;
  simulated: boolean;
}

export const insertPrintJob = (row: PrintJobRow): void => {
  try {
    getDb()
      .prepare(
        `
      INSERT INTO print_jobs (id, transaction_id, filenames, paper_size, copies, status, method, simulated)
      VALUES (@id, @transaction_id, @filenames, @paper_size, @copies, @status, @method, @simulated)
    `,
      )
      .run({
        ...row,
        filenames: JSON.stringify(row.filenames),
        transaction_id: row.transaction_id ?? null,
        method: row.method ?? null,
        simulated: row.simulated ? 1 : 0,
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

export const getMonitoringStats = (): MonitoringStats => {
  const db = getDb();

  const txRow = db
    .prepare(
      `
    SELECT
      COUNT(*)                                          AS total,
      SUM(CASE WHEN status = 'SUCCESS' THEN 1 ELSE 0 END)   AS successful,
      SUM(CASE WHEN status IN ('FAILED','EXPIRED','CANCELLED') THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN status = 'PENDING' OR status = 'PROCESSING' THEN 1 ELSE 0 END) AS pending,
      COALESCE(SUM(CASE WHEN status = 'SUCCESS' THEN amount ELSE 0 END), 0) AS revenue
    FROM transactions
  `,
    )
    .get() as {
    total: number;
    successful: number;
    failed: number;
    pending: number;
    revenue: number;
  };

  const jobRow = db
    .prepare(
      `
    SELECT
      COUNT(*)                                       AS total,
      SUM(CASE WHEN simulated = 1 THEN 1 ELSE 0 END) AS simulated,
      SUM(CASE WHEN simulated = 0 THEN 1 ELSE 0 END) AS real
    FROM print_jobs
  `,
    )
    .get() as { total: number; simulated: number; real: number };

  return {
    totalTransactions: txRow.total ?? 0,
    successfulTransactions: txRow.successful ?? 0,
    failedTransactions: txRow.failed ?? 0,
    pendingTransactions: txRow.pending ?? 0,
    totalRevenue: txRow.revenue ?? 0,
    totalPrintJobs: jobRow.total ?? 0,
    simulatedPrintJobs: jobRow.simulated ?? 0,
    realPrintJobs: jobRow.real ?? 0,
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

export const getRecentJobs = (limit = 20): RecentJob[] => {
  const rows = getDb()
    .prepare(
      `
    SELECT id, transaction_id, filenames, paper_size, copies, status, method, simulated, created_at
    FROM print_jobs
    ORDER BY created_at DESC
    LIMIT ?
  `,
    )
    .all(limit) as Array<
    Omit<RecentJob, 'filenames' | 'simulated'> & { filenames: string; simulated: number }
  >;

  return rows.map((r) => ({
    ...r,
    filenames: JSON.parse(r.filenames) as string[],
    simulated: r.simulated === 1,
  }));
};

export const getRecentTransactions = (limit = 20): TransactionRow[] => {
  return getDb()
    .prepare(
      `
    SELECT id, reference_number, amount, status, service_type, created_at, completed_at
    FROM transactions
    ORDER BY created_at DESC
    LIMIT ?
  `,
    )
    .all(limit) as TransactionRow[];
};

// ─── Paper tray helpers ───────────────────────────────────────────────────────

export interface PaperTrayRow {
  tray_name: string;
  current_count: number;
  max_capacity: number;
  threshold: number;
  updated_at: string;
}

export const getPaperTrays = (): PaperTrayRow[] => {
  return getDb()
    .prepare(
      'SELECT tray_name, current_count, max_capacity, threshold, updated_at FROM paper_trays',
    )
    .all() as PaperTrayRow[];
};

export const updatePaperTray = (
  trayName: string,
  currentCount: number,
  maxCapacity?: number,
): void => {
  try {
    const update = getDb().prepare(`
      UPDATE paper_trays
      SET current_count = @currentCount, max_capacity = COALESCE(@maxCapacity, max_capacity), updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
      WHERE tray_name = @trayName
    `);
    update.run({ trayName, currentCount, maxCapacity });
    syncEvent('paper-tray', {
      tray_name: trayName,
      current_count: currentCount,
      max_capacity: maxCapacity,
    });
  } catch (err) {
    logger.warn('Failed to update paper tray', { trayName, error: String(err) });
  }
};

export const decrementPaperTray = (trayName: string, amount: number): void => {
  try {
    getDb()
      .prepare(
        `
        UPDATE paper_trays
        SET current_count = MAX(0, current_count - @amount), updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
        WHERE tray_name = @trayName
      `,
      )
      .run({ trayName, amount });
  } catch (err) {
    logger.warn('Failed to decrement paper tray', { trayName, amount, error: String(err) });
  }
};

export const getLowPaperAlerts = (): Array<{
  tray_name: string;
  current_count: number;
  threshold: number;
}> => {
  return getDb()
    .prepare(
      `
      SELECT tray_name, current_count, threshold
      FROM paper_trays
      WHERE current_count <= threshold
    `,
    )
    .all() as Array<{ tray_name: string; current_count: number; threshold: number }>;
};

export const updatePaperTrayThreshold = (trayName: string, threshold: number): void => {
  try {
    getDb()
      .prepare(
        `UPDATE paper_trays SET threshold = @threshold, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE tray_name = @trayName`,
      )
      .run({ trayName, threshold });
  } catch (err) {
    logger.warn('Failed to update paper tray threshold', { trayName, error: String(err) });
  }
};

// ─── Transaction helpers (extended) ──────────────────────────────────────────

export const getTransactionById = (id: string): TransactionRow | null => {
  return (
    (getDb().prepare('SELECT * FROM transactions WHERE id = ?').get(id) as
      | TransactionRow
      | undefined) ?? null
  );
};

export const cancelTransactionById = (id: string): boolean => {
  try {
    const result = getDb()
      .prepare(
        `UPDATE transactions SET status = 'CANCELLED', completed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         WHERE id = ? AND status IN ('PENDING', 'PROCESSING')`,
      )
      .run(id);
    return result.changes > 0;
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

export const insertLog = (
  level: 'info' | 'warn' | 'error',
  category: string,
  message: string,
  metadata?: Record<string, unknown>,
): void => {
  try {
    getDb()
      .prepare(
        `INSERT INTO activity_logs (level, category, message, metadata) VALUES (@level, @category, @message, @metadata)`,
      )
      .run({ level, category, message, metadata: metadata ? JSON.stringify(metadata) : null });
    syncEvent('log', { level, category, message, metadata });
  } catch (err) {
    logger.warn('Failed to insert activity log', { error: String(err) });
  }
};

export const getRecentLogs = (limit = 50): ActivityLogRow[] => {
  return getDb()
    .prepare(
      `SELECT id, level, category, message, metadata, created_at FROM activity_logs ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as ActivityLogRow[];
};

// ─── Auto-cancel stale transactions ──────────────────────────────────────────

export const cancelStalePendingTransactions = (olderThanMinutes: number): string[] => {
  const db = getDb();
  const stale = db
    .prepare(
      `SELECT id FROM transactions
       WHERE status IN ('PENDING', 'PROCESSING')
         AND created_at <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-' || ? || ' minutes')`,
    )
    .all(olderThanMinutes) as { id: string }[];

  if (stale.length === 0) return [];

  db.prepare(
    `UPDATE transactions
     SET status = 'CANCELLED', completed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
     WHERE status IN ('PENDING', 'PROCESSING')
       AND created_at <= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-' || ? || ' minutes')`,
  ).run(olderThanMinutes);

  return stale.map((r) => r.id);
};

// ─── Absolute paper count setter ─────────────────────────────────────────────

export const setPaperTrayCount = (trayName: string, currentCount: number): void => {
  try {
    getDb()
      .prepare(
        `UPDATE paper_trays
         SET current_count = @currentCount,
             updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
         WHERE tray_name = @trayName`,
      )
      .run({ trayName, currentCount });
    syncEvent('paper-tray', { tray_name: trayName, current_count: currentCount });
  } catch (err) {
    logger.warn('Failed to set paper tray count', { trayName, currentCount, error: String(err) });
  }
};

// ─── Incremental paper tray refill ───────────────────────────────────────────

export const incrementPaperTray = (trayName: string, sheetsAdded: number): void => {
  try {
    // When max_capacity is 0 (never configured), treat the refill as the initial load:
    // set max_capacity = sheetsAdded and current_count = sheetsAdded.
    // When max_capacity is already set, cap current_count at max_capacity.
    getDb()
      .prepare(
        `UPDATE paper_trays
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
      )
      .run({ trayName, sheetsAdded });
  } catch (err) {
    logger.warn('Failed to increment paper tray', { trayName, sheetsAdded, error: String(err) });
  }
};
