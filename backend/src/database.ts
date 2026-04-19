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
import * as fs from 'fs';
import { logger } from './utils/logger';

// ─── Database location ────────────────────────────────────────────────────────
// Override with DATABASE_PATH env var for persistent disk on Render:
//   DATABASE_PATH=/data/docucenter.db
const dbDir = path.resolve(__dirname, '../..'); // backend/ parent = project root
const dbPath = process.env.DATABASE_PATH || path.join(dbDir, 'docucenter.db');

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

    CREATE INDEX IF NOT EXISTS idx_transactions_status   ON transactions(status);
    CREATE INDEX IF NOT EXISTS idx_transactions_created  ON transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_print_jobs_created    ON print_jobs(created_at);
    CREATE INDEX IF NOT EXISTS idx_print_jobs_txn        ON print_jobs(transaction_id);
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
