/**
 * Local SQLite persistence layer for the kiosk and cloud metadata receiver.
 */

import { randomUUID, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { createClient, type Client, type ResultSet } from '@libsql/client';
import { logger } from './utils/logger';
import { syncEvent } from './services/sync.service';
import { config } from './utils/config';

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

    -- Singleton (id = 1) kiosk pricing. Held as a JSON blob so the admin can
    -- retune rates (supply cost changes) without a schema migration; the kiosk
    -- picks it up on its next poll.
    CREATE TABLE IF NOT EXISTS pricing_settings (
      id         INTEGER PRIMARY KEY CHECK (id = 1),
      data       TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
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

    -- Staff accounts. PIN is never stored/logged in plaintext (see setStaffPin).
    CREATE TABLE IF NOT EXISTS staff (
      id              TEXT    PRIMARY KEY,
      name            TEXT    NOT NULL,
      username        TEXT    NOT NULL UNIQUE,
      pin_hash        TEXT    NOT NULL,
      role            TEXT    NOT NULL DEFAULT 'staff',
      status          TEXT    NOT NULL DEFAULT 'active',
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until    TEXT,
      created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      last_login_at   TEXT
    );

    -- Staff PIN-recovery requests: staff asks on the kiosk, an Admin (already
    -- authenticated in the admin console) approves/denies, staff then sets
    -- their own new PIN. No admin password ever touches the kiosk.
    CREATE TABLE IF NOT EXISTS staff_pin_reset_requests (
      id           TEXT PRIMARY KEY,
      staff_id     TEXT NOT NULL,
      username     TEXT NOT NULL,
      kiosk_id     TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'pending',
      requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      decided_at   TEXT,
      decided_by   TEXT
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
    CREATE INDEX IF NOT EXISTS idx_staff_username        ON staff(username);
    CREATE INDEX IF NOT EXISTS idx_pin_requests_status    ON staff_pin_reset_requests(status, requested_at);
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
  // kiosk_commands: re-delivery bookkeeping so a command that is claimed but
  // never ACKed (kiosk crash, lost ACK, flaky link) is handed out again instead
  // of silently stalling as 'delivered' forever.
  await addColumn(`ALTER TABLE kiosk_commands ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0`);
  // kiosks: timestamp bumped when the admin asks the app to soft-reload.
  await addColumn(`ALTER TABLE kiosks ADD COLUMN reload_at TEXT`);
  // activity_logs: how many identical lines this row represents (see insertLog).
  await addColumn(`ALTER TABLE activity_logs ADD COLUMN count INTEGER NOT NULL DEFAULT 1`);
  // Device state is now strictly ONLINE / OFFLINE — normalise any legacy values.
  try {
    await db.execute(
      `UPDATE kiosks SET printer_state = 'OFFLINE' WHERE printer_state NOT IN ('ONLINE','OFFLINE')`,
    );
    await db.execute(
      `UPDATE kiosks SET scanner_state = 'OFFLINE' WHERE scanner_state NOT IN ('ONLINE','OFFLINE')`,
    );
  } catch {
    /* fresh DB — nothing to normalise */
  }

  // Seed the storage-settings singleton.
  await db.execute(
    `INSERT OR IGNORE INTO storage_settings (id, delete_after_print, retention_hours) VALUES (1, 0, 24)`,
  );
  await db.execute(`INSERT OR IGNORE INTO pricing_settings (id, data) VALUES (1, '{}')`);

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
    // RETURNING the post-update count so the kiosk can push its own real-world
    // consumption up to the cloud immediately — without this, the admin
    // console's paper levels (and the next cloud→kiosk downlink) go stale.
    const result = await getDb().execute({
      sql: `UPDATE paper_trays
            SET current_count = MAX(0, current_count - @amount),
                updated_at    = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE tray_name = @trayName
            RETURNING current_count`,
      args: { trayName, amount },
    });
    const newCount = firstRow<{ current_count: number }>(result)?.current_count;
    if (newCount !== undefined) {
      syncEvent('paper-tray', { tray_name: trayName, current_count: Number(newCount) });
    }
  } catch (err) {
    logger.warn('Failed to decrement paper tray', { trayName, amount, error: String(err) });
  }
};

/**
 * Apply one tray's admin-controlled fields (capacity/threshold/paper size and
 * the current count) as pushed down from the cloud via the heartbeat/command
 * downlink — the same channel pricing and storage settings already use.
 * Kiosk side only; never re-echoes back up (this IS the receiving end).
 */
export const applyPaperTrayFromCloud = async (tray: PaperTrayRow): Promise<void> => {
  try {
    await getDb().execute({
      sql: `UPDATE paper_trays
            SET current_count = @currentCount,
                max_capacity  = @maxCapacity,
                threshold     = @threshold,
                paper_size    = @paperSize,
                updated_at    = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE tray_name = @trayName`,
      args: {
        trayName: tray.tray_name,
        currentCount: tray.current_count,
        maxCapacity: tray.max_capacity,
        threshold: tray.threshold,
        paperSize: tray.paper_size,
      },
    });
  } catch (err) {
    logger.warn('Failed to apply paper tray from cloud', { tray: tray.tray_name, error: String(err) });
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
  count: number;
  created_at: string;
}

/** Repeats of the same line inside this window fold into one row, not new rows. */
const LOG_COALESCE_MINUTES = 10;

export const insertLog = async (
  level: 'info' | 'warn' | 'error',
  category: string,
  message: string,
  metadata?: Record<string, unknown>,
): Promise<void> => {
  try {
    const db = getDb();
    const meta = metadata ? JSON.stringify(metadata) : null;

    // If the identical line was logged very recently, bump its count and
    // timestamp instead of inserting another row. Stops a misbehaving repeater
    // (e.g. a command that never ACKs and keeps re-running) from flooding the
    // table and the sync outbox.
    const recent = await db.execute({
      sql: `SELECT id, count FROM activity_logs
            WHERE level = @level AND category = @category AND message = @message
              AND created_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', @window)
            ORDER BY id DESC LIMIT 1`,
      args: { level, category, message, window: `-${LOG_COALESCE_MINUTES} minutes` },
    });
    const hit = firstRow<{ id: number; count: number }>(recent);

    if (hit) {
      await db.execute({
        sql: `UPDATE activity_logs
              SET count = count + 1,
                  metadata = @metadata,
                  created_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
              WHERE id = @id`,
        args: { id: hit.id, metadata: meta },
      });
      return; // already forwarded to the cloud when the first one landed
    }

    await db.execute({
      sql: `INSERT INTO activity_logs (level, category, message, metadata) VALUES (@level, @category, @message, @metadata)`,
      args: { level, category, message, metadata: meta },
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
    sql: `SELECT id, level, category, message, metadata, count, created_at FROM activity_logs${where} ORDER BY created_at DESC LIMIT @limit`,
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

/** Device liveness is strictly binary — there is no "unknown". */
export type DeviceState = 'ONLINE' | 'OFFLINE';

/** Coerce any legacy / unexpected value to ONLINE | OFFLINE. */
export const normDeviceState = (v: unknown): DeviceState =>
  String(v ?? '').toUpperCase() === 'ONLINE' ? 'ONLINE' : 'OFFLINE';

export interface KioskRow {
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
  printer_state: normDeviceState(r.printer_state),
  scanner_state: normDeviceState(r.scanner_state),
  current_job_id: (r.current_job_id as string) ?? null,
  maintenance: Number(r.maintenance) === 1,
  printing_disabled: Number(r.printing_disabled) === 1,
  reload_at: (r.reload_at as string) ?? null,
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

/**
 * Stamp `kiosks.reload_at` so the Flutter app, which polls `/api/kiosk/self`,
 * sees the value change and performs an in-app soft reload (no process kill).
 */
export const setKioskReload = async (kioskId: string): Promise<void> => {
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  await getDb().execute({
    sql: `INSERT INTO kiosks (kiosk_id, reload_at) VALUES (@kioskId, @now)
          ON CONFLICT(kiosk_id) DO UPDATE SET reload_at = @now`,
    args: { kioskId, now },
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
  | 'RESTART_APP'
  | 'PURGE_STORAGE'
  | 'DELETE_ALL_FILES'
  | 'DELETE_ALL_FILES_KEEP_META'
  | 'STAFF_PIN_REQUEST_DECIDED';

export interface KioskCommandRow {
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

/** After this many hand-outs with no ACK, a command is marked failed, not retried forever. */
const MAX_COMMAND_ATTEMPTS = 6;
/** A 'delivered' command with no ACK older than this is eligible for re-delivery (seconds). */
const COMMAND_REDELIVER_AFTER_SECONDS = 90;

/**
 * Toggle pairs. Queuing one makes an older, still-unACKed sibling meaningless —
 * without this, a stale un-ACKed MAINTENANCE_ON could be re-delivered after the
 * operator has already turned maintenance off, flipping it back on.
 */
const SUPERSEDE_GROUPS: KioskCommandName[][] = [
  ['MAINTENANCE_ON', 'MAINTENANCE_OFF'],
  ['DISABLE_PRINTING', 'ENABLE_PRINTING'],
];

export const enqueueCommand = async (
  kioskId: string,
  command: KioskCommandName,
  params?: Record<string, unknown>,
  createdBy?: string,
): Promise<string> => {
  const id = randomUUID();
  const db = getDb();
  await db.execute({
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

  // Retire any older, not-yet-ACKed command in the same toggle group so it can
  // never be replayed against the operator's newer intent.
  const group = SUPERSEDE_GROUPS.find((g) => g.includes(command));
  if (group) {
    const placeholders = group.map((_, i) => `@c${i}`).join(', ');
    const args: Record<string, string> = { kioskId, id };
    group.forEach((c, i) => (args[`c${i}`] = c));
    await db.execute({
      sql: `UPDATE kiosk_commands
            SET status = 'superseded',
                result = COALESCE(result, 'superseded by a newer command'),
                acked_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
            WHERE kiosk_id = @kioskId AND id != @id
              AND status IN ('pending', 'delivered')
              AND command IN (${placeholders})`,
      args,
    });
  }
  return id;
};

const mapCommand = (r: Record<string, unknown>): KioskCommandRow => ({
  id: String(r.id),
  kiosk_id: String(r.kiosk_id),
  command: String(r.command) as KioskCommandName,
  params: r.params ? (JSON.parse(String(r.params)) as Record<string, unknown>) : null,
  status: String(r.status) as KioskCommandRow['status'],
  result: (r.result as string) ?? null,
  attempts: Number(r.attempts ?? 0),
  created_by: (r.created_by as string) ?? null,
  created_at: String(r.created_at),
  delivered_at: (r.delivered_at as string) ?? null,
  acked_at: (r.acked_at as string) ?? null,
});

/**
 * Hand a kiosk its outstanding commands.
 *
 * Returns commands that are either brand new ('pending') or were handed out
 * before but never ACKed and have gone stale ('delivered' older than
 * COMMAND_REDELIVER_AFTER_SECONDS). Each returned row's `attempts` is bumped and
 * only *those* rows are touched — a command inserted a millisecond later is not
 * swept up and lost. Once a command has been handed out MAX_COMMAND_ATTEMPTS
 * times with no ACK it is marked 'failed' so it stops and shows up in the
 * command history instead of stalling forever.
 */
export const claimPendingCommands = async (kioskId: string): Promise<KioskCommandRow[]> => {
  const db = getDb();

  // Give up on commands that have been retried too many times.
  await db.execute({
    sql: `UPDATE kiosk_commands
          SET status = 'failed',
              result = COALESCE(result, 'no ACK after ' || attempts || ' attempts'),
              acked_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
          WHERE kiosk_id = @kioskId AND status = 'delivered'
            AND acked_at IS NULL AND attempts >= @maxAttempts`,
    args: { kioskId, maxAttempts: MAX_COMMAND_ATTEMPTS },
  });

  const result = await db.execute({
    sql: `SELECT * FROM kiosk_commands
          WHERE kiosk_id = @kioskId
            AND (
              status = 'pending'
              OR (
                status = 'delivered' AND acked_at IS NULL
                AND attempts < @maxAttempts
                AND delivered_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', @staleWindow)
              )
            )
          ORDER BY created_at ASC LIMIT 20`,
    args: {
      kioskId,
      maxAttempts: MAX_COMMAND_ATTEMPTS,
      staleWindow: `-${COMMAND_REDELIVER_AFTER_SECONDS} seconds`,
    },
  });
  const rows = toRows<Record<string, unknown>>(result).map(mapCommand);
  if (rows.length) {
    const ids = rows.map((r) => r.id);
    const placeholders = ids.map((_, i) => `@id${i}`).join(', ');
    const args: Record<string, string> = {};
    ids.forEach((id, i) => (args[`id${i}`] = id));
    await db.execute({
      sql: `UPDATE kiosk_commands
            SET status = 'delivered',
                delivered_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
                attempts = attempts + 1
            WHERE id IN (${placeholders})`,
      args,
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
    // Upsert so a missing singleton row can't silently swallow the write.
    sql: `INSERT INTO storage_settings (id, delete_after_print, retention_hours)
          VALUES (1, COALESCE(@delete_after_print, 0), COALESCE(@retention_hours, 24))
          ON CONFLICT(id) DO UPDATE SET
            delete_after_print = COALESCE(@delete_after_print, delete_after_print),
            retention_hours    = COALESCE(@retention_hours, retention_hours),
            updated_at         = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`,
    args: {
      delete_after_print:
        patch.delete_after_print === undefined ? null : patch.delete_after_print ? 1 : 0,
      retention_hours:
        patch.retention_hours === undefined ? null : Math.max(1, Math.trunc(patch.retention_hours)),
    },
  });
  return getStorageSettings();
};

// ─── Kiosk pricing ──────────────────────────────────────────────────────────

/** Per-page price for one colour mode. */
export interface TierPrice {
  bw: number;
  color: number;
}

/**
 * The complete kiosk price list. `print` has two quality tiers, `photocopy`
 * three. Scanning is free and not represented here.
 */
export interface PricingSettings {
  print: { draft: TierPrice; standard: TierPrice };
  photocopy: { draft: TierPrice; standard: TierPrice; high: TierPrice };
  updated_at: string;
}

export type PricingInput = {
  print?: { draft?: Partial<TierPrice>; standard?: Partial<TierPrice> };
  photocopy?: {
    draft?: Partial<TierPrice>;
    standard?: Partial<TierPrice>;
    high?: Partial<TierPrice>;
  };
};

/** Falls back to these when a field is missing or invalid. */
const DEFAULT_PRICING: Omit<PricingSettings, 'updated_at'> = {
  print: { draft: { bw: 1.5, color: 2 }, standard: { bw: 2, color: 3 } },
  photocopy: {
    draft: { bw: 1, color: 3 },
    standard: { bw: 2, color: 4 },
    high: { bw: 3, color: 5 },
  },
};

/** Non-negative peso amount, 2 dp; `fallback` for anything unusable. */
const money = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n * 100) / 100;
};

const mergeTier = (base: TierPrice, over: Partial<TierPrice> | undefined): TierPrice => ({
  bw: money(over?.bw, base.bw),
  color: money(over?.color, base.color),
});

const normalizePricing = (raw: PricingInput | undefined): Omit<PricingSettings, 'updated_at'> => ({
  print: {
    draft: mergeTier(DEFAULT_PRICING.print.draft, raw?.print?.draft),
    standard: mergeTier(DEFAULT_PRICING.print.standard, raw?.print?.standard),
  },
  photocopy: {
    draft: mergeTier(DEFAULT_PRICING.photocopy.draft, raw?.photocopy?.draft),
    standard: mergeTier(DEFAULT_PRICING.photocopy.standard, raw?.photocopy?.standard),
    high: mergeTier(DEFAULT_PRICING.photocopy.high, raw?.photocopy?.high),
  },
});

export const getPricingSettings = async (): Promise<PricingSettings> => {
  const result = await getDb().execute(`SELECT * FROM pricing_settings WHERE id = 1`);
  const row = firstRow<Record<string, unknown>>(result);
  let parsed: PricingInput = {};
  try {
    parsed = row?.data ? (JSON.parse(String(row.data)) as PricingInput) : {};
  } catch {
    parsed = {};
  }
  return { ...normalizePricing(parsed), updated_at: String(row?.updated_at ?? '') };
};

/** Deep-merge `patch` onto the current prices, validate, and persist. */
export const updatePricingSettings = async (patch: PricingInput): Promise<PricingSettings> => {
  const cur = await getPricingSettings();
  const merged = normalizePricing({
    print: {
      draft: { ...cur.print.draft, ...patch?.print?.draft },
      standard: { ...cur.print.standard, ...patch?.print?.standard },
    },
    photocopy: {
      draft: { ...cur.photocopy.draft, ...patch?.photocopy?.draft },
      standard: { ...cur.photocopy.standard, ...patch?.photocopy?.standard },
      high: { ...cur.photocopy.high, ...patch?.photocopy?.high },
    },
  });
  await getDb().execute({
    sql: `INSERT INTO pricing_settings (id, data, updated_at)
          VALUES (1, @data, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
          ON CONFLICT(id) DO UPDATE SET
            data = @data, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`,
    args: { data: JSON.stringify(merged) },
  });
  return getPricingSettings();
};

/** Stable JSON of the price list (no timestamp) — for change detection. */
export const pricingSignature = (p: PricingSettings | Omit<PricingSettings, 'updated_at'>): string =>
  JSON.stringify({ print: p.print, photocopy: p.photocopy });

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

/**
 * Upsert one document's metadata locally and forward it to the cloud.
 *
 * `clearDeleted` (default true) revives a tombstoned row on conflict — right for
 * a genuine local (re)upload. The cloud sync receiver passes `false`: a stale or
 * out-of-order `storage-doc` event must NOT resurrect a document the operator
 * has since deleted.
 */
export const upsertStorageDocMeta = async (
  doc: StorageDocMetaInput,
  opts: { clearDeleted?: boolean; forward?: boolean } = {},
): Promise<void> => {
  const clearDeleted = opts.clearDeleted !== false;
  const forward = opts.forward !== false;
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
              mime_type = @mime_type${clearDeleted ? ', deleted_at = NULL' : ''}`,
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
    if (forward) syncEvent('storage-doc', doc);
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

/**
 * Tombstone every live document row on this instance. Used by the admin
 * "Delete files + records" action so the metadata clears immediately on the
 * box the console reads from, independent of the kiosk's own delete + sync.
 * Returns how many rows were tombstoned.
 */
export const tombstoneAllStorageDocMetas = async (): Promise<number> => {
  const res = await getDb().execute(
    `UPDATE storage_documents
     SET deleted_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
     WHERE deleted_at IS NULL`,
  );
  return res.rowsAffected ?? 0;
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
    // Activity logs: keep 30 days …
    ['activity_logs', `DELETE FROM activity_logs WHERE created_at < strftime('%Y-%m-%dT%H:%M:%SZ','now','-30 days')`],
    // … and a hard cap so a burst can't blow up the table between prunes.
    ['activity_logs_cap', `DELETE FROM activity_logs WHERE id NOT IN (SELECT id FROM activity_logs ORDER BY id DESC LIMIT 10000)`],
    // Sync outbox: drop delivered rows after 2 days, dead-lettered rows after 1,
    // and abandon anything still unsent after a week (cloud unreachable / mis-set).
    ['sync_outbox', `DELETE FROM sync_outbox WHERE status = 'sent' AND sent_at < strftime('%Y-%m-%dT%H:%M:%SZ','now','-2 days')`],
    ['sync_outbox_failed', `DELETE FROM sync_outbox WHERE status = 'failed' AND created_at < strftime('%Y-%m-%dT%H:%M:%SZ','now','-1 days')`],
    ['sync_outbox_stale', `DELETE FROM sync_outbox WHERE status = 'pending' AND created_at < strftime('%Y-%m-%dT%H:%M:%SZ','now','-7 days')`],
    // Idempotency ledger: keep 7 days.
    ['sync_received_events', `DELETE FROM sync_received_events WHERE received_at < strftime('%Y-%m-%dT%H:%M:%SZ','now','-7 days')`],
    // Finished commands: keep 7 days.
    ['kiosk_commands', `DELETE FROM kiosk_commands WHERE status IN ('acked','failed','superseded') AND acked_at < strftime('%Y-%m-%dT%H:%M:%SZ','now','-7 days')`],
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

// ─── Staff accounts ───────────────────────────────────────────────────────────

export type StaffRole = 'admin' | 'staff';
export type StaffStatus = 'active' | 'disabled';

/** Everything except pin_hash — safe to return to any client. */
export interface StaffPublic {
  id: string;
  name: string;
  username: string;
  role: StaffRole;
  status: StaffStatus;
  created_at: string;
  last_login_at: string | null;
}

/** Full row, including the PIN hash — only used internally (login check, roster sync). */
export interface StaffRow extends StaffPublic {
  pin_hash: string;
  failed_attempts: number;
  locked_until: string | null;
}

const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_MINUTES = 2;

/** scrypt hash as 'saltHex:hashHex'. No third-party crypto dependency needed. */
export const hashPin = (pin: string): string => {
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
};

export const verifyPin = (pin: string, stored: string): boolean => {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(pin, salt, expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
};

const mapStaff = (r: Record<string, unknown>): StaffRow => ({
  id: String(r.id),
  name: String(r.name),
  username: String(r.username),
  pin_hash: String(r.pin_hash),
  role: (String(r.role) as StaffRole) === 'admin' ? 'admin' : 'staff',
  status: (String(r.status) as StaffStatus) === 'disabled' ? 'disabled' : 'active',
  failed_attempts: Number(r.failed_attempts ?? 0),
  locked_until: (r.locked_until as string) ?? null,
  created_at: String(r.created_at),
  last_login_at: (r.last_login_at as string) ?? null,
});

const toPublicStaff = (r: StaffRow): StaffPublic => ({
  id: r.id,
  name: r.name,
  username: r.username,
  role: r.role,
  status: r.status,
  created_at: r.created_at,
  last_login_at: r.last_login_at,
});

const nextStaffId = async (): Promise<string> => {
  const result = await getDb().execute(
    `SELECT id FROM staff WHERE id LIKE 'STF-%' ORDER BY id DESC LIMIT 1`,
  );
  const last = firstRow<{ id: string }>(result)?.id;
  const lastNum = last ? parseInt(last.replace('STF-', ''), 10) : 0;
  const next = (Number.isFinite(lastNum) ? lastNum : 0) + 1;
  return `STF-${String(next).padStart(3, '0')}`;
};

export interface CreateStaffInput {
  name: string;
  username: string;
  pin: string;
  role?: StaffRole;
}

export const createStaff = async (input: CreateStaffInput): Promise<StaffPublic> => {
  const id = await nextStaffId();
  const pin_hash = hashPin(input.pin);
  await getDb().execute({
    sql: `INSERT INTO staff (id, name, username, pin_hash, role, status)
          VALUES (@id, @name, @username, @pin_hash, @role, 'active')`,
    args: {
      id,
      name: input.name.trim(),
      username: input.username.trim().toLowerCase(),
      pin_hash,
      role: input.role === 'admin' ? 'admin' : 'staff',
    },
  });
  const created = await getStaffById(id);
  if (!created) throw new Error('Failed to read back created staff account');
  return created;
};

export const getStaffById = async (id: string): Promise<StaffPublic | null> => {
  const result = await getDb().execute({ sql: `SELECT * FROM staff WHERE id = @id`, args: { id } });
  const row = firstRow<Record<string, unknown>>(result);
  return row ? toPublicStaff(mapStaff(row)) : null;
};

/** Internal use only (login checks, roster sync) — includes the PIN hash. */
export const getStaffRowByUsername = async (username: string): Promise<StaffRow | null> => {
  const result = await getDb().execute({
    sql: `SELECT * FROM staff WHERE username = @username`,
    args: { username: username.trim().toLowerCase() },
  });
  const row = firstRow<Record<string, unknown>>(result);
  return row ? mapStaff(row) : null;
};

export const getStaffRowById = async (id: string): Promise<StaffRow | null> => {
  const result = await getDb().execute({ sql: `SELECT * FROM staff WHERE id = @id`, args: { id } });
  const row = firstRow<Record<string, unknown>>(result);
  return row ? mapStaff(row) : null;
};

export const listStaff = async (): Promise<StaffPublic[]> => {
  const result = await getDb().execute(`SELECT * FROM staff ORDER BY created_at ASC`);
  return toRows<Record<string, unknown>>(result).map((r) => toPublicStaff(mapStaff(r)));
};

/** Full rows (incl. pin_hash) — used only to build the cloud→kiosk roster downlink. */
export const listStaffRoster = async (): Promise<StaffRow[]> => {
  const result = await getDb().execute(`SELECT * FROM staff ORDER BY created_at ASC`);
  return toRows<Record<string, unknown>>(result).map(mapStaff);
};

/** Apply one roster row pushed down from the cloud. Kiosk side only. */
export const upsertStaffFromRoster = async (row: StaffRow): Promise<void> => {
  await getDb().execute({
    sql: `INSERT INTO staff (id, name, username, pin_hash, role, status, failed_attempts, locked_until, created_at, last_login_at)
          VALUES (@id, @name, @username, @pin_hash, @role, @status, @failed_attempts, @locked_until, @created_at, @last_login_at)
          ON CONFLICT(id) DO UPDATE SET
            name = @name, username = @username, pin_hash = @pin_hash, role = @role,
            status = @status, failed_attempts = @failed_attempts, locked_until = @locked_until,
            last_login_at = @last_login_at`,
    args: {
      id: row.id,
      name: row.name,
      username: row.username,
      pin_hash: row.pin_hash,
      role: row.role,
      status: row.status,
      failed_attempts: row.failed_attempts,
      locked_until: row.locked_until,
      created_at: row.created_at,
      last_login_at: row.last_login_at,
    },
  });
};

export interface UpdateStaffInput {
  name?: string;
  username?: string;
  role?: StaffRole;
}

export const updateStaff = async (id: string, patch: UpdateStaffInput): Promise<StaffPublic | null> => {
  await getDb().execute({
    sql: `UPDATE staff SET
            name     = COALESCE(@name, name),
            username = COALESCE(@username, username),
            role     = COALESCE(@role, role)
          WHERE id = @id`,
    args: {
      id,
      name: patch.name?.trim() ?? null,
      username: patch.username?.trim().toLowerCase() ?? null,
      role: patch.role ?? null,
    },
  });
  return getStaffById(id);
};

export const setStaffStatus = async (id: string, status: StaffStatus): Promise<void> => {
  await getDb().execute({
    sql: `UPDATE staff SET status = @status WHERE id = @id`,
    args: { id, status },
  });
};

/** Admin-initiated direct reset (rule 10) — distinct from the request/approval flow. */
export const setStaffPin = async (id: string, pin: string): Promise<void> => {
  await getDb().execute({
    sql: `UPDATE staff SET pin_hash = @pin_hash, failed_attempts = 0, locked_until = NULL WHERE id = @id`,
    args: { id, pin_hash: hashPin(pin) },
  });
};

export const bumpStaffLogin = async (id: string): Promise<void> => {
  await getDb().execute({
    sql: `UPDATE staff SET last_login_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), failed_attempts = 0, locked_until = NULL WHERE id = @id`,
    args: { id },
  });
  syncEvent('staff-login', { id });
};

/** Staff activity feed for the admin console (category='staff' rows only). */
export const getStaffActivityLogs = async (limit = 100): Promise<ActivityLogRow[]> => {
  const result = await getDb().execute({
    sql: `SELECT id, level, category, message, metadata, count, created_at FROM activity_logs
          WHERE category = 'staff' ORDER BY created_at DESC LIMIT @limit`,
    args: { limit },
  });
  return toRows<ActivityLogRow>(result);
};

export interface StaffTransactionView {
  id: string;
  created_at: string;
  service_type: string;
  page_count: number;
  copies: number;
  amount: number | null;
  payment_status: string | null;
  printing_status: string;
}

/** Trimmed transaction+job view for the Staff dashboard (no customer PII exists in this schema). */
export const getStaffTransactionsView = async (limit = 50): Promise<StaffTransactionView[]> => {
  const result = await getDb().execute({
    sql: `SELECT j.id, j.created_at, j.service_type, j.page_count, j.copies, j.status AS printing_status,
                 t.amount, t.status AS payment_status
          FROM print_jobs j
          LEFT JOIN transactions t ON t.id = j.transaction_id
          ORDER BY j.created_at DESC LIMIT @limit`,
    args: { limit },
  });
  return toRows<Record<string, unknown>>(result).map((r) => ({
    id: String(r.id),
    created_at: String(r.created_at),
    service_type: String(r.service_type ?? 'printing'),
    page_count: Number(r.page_count ?? 0),
    copies: Number(r.copies ?? 1),
    amount: r.amount == null ? null : Number(r.amount),
    payment_status: (r.payment_status as string) ?? null,
    printing_status: String(r.printing_status ?? 'submitted'),
  }));
};

/** Returns true if the account is now locked as a result of this failure. */
export const recordStaffPinFailure = async (id: string): Promise<boolean> => {
  const row = await getStaffRowById(id);
  const attempts = (row?.failed_attempts ?? 0) + 1;
  const locked = attempts >= MAX_PIN_ATTEMPTS;
  await getDb().execute({
    sql: `UPDATE staff SET failed_attempts = @attempts,
            locked_until = CASE WHEN @locked THEN strftime('%Y-%m-%dT%H:%M:%SZ', 'now', @lockWindow) ELSE locked_until END
          WHERE id = @id`,
    args: {
      id,
      attempts,
      locked: locked ? 1 : 0,
      lockWindow: `+${PIN_LOCKOUT_MINUTES} minutes`,
    },
  });
  return locked;
};

export const isStaffLocked = (row: StaffRow): boolean =>
  !!row.locked_until && row.locked_until > new Date().toISOString().replace(/\.\d+Z$/, 'Z');

// ─── Staff PIN-recovery requests ─────────────────────────────────────────────

export type PinResetStatus = 'pending' | 'approved' | 'denied' | 'completed';

export interface PinResetRequestRow {
  id: string;
  staff_id: string;
  username: string;
  kiosk_id: string;
  status: PinResetStatus;
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
}

const mapPinRequest = (r: Record<string, unknown>): PinResetRequestRow => ({
  id: String(r.id),
  staff_id: String(r.staff_id),
  username: String(r.username),
  kiosk_id: String(r.kiosk_id),
  status: String(r.status) as PinResetStatus,
  requested_at: String(r.requested_at),
  decided_at: (r.decided_at as string) ?? null,
  decided_by: (r.decided_by as string) ?? null,
});

export const createPinResetRequest = async (
  staffId: string,
  username: string,
  kioskId: string,
): Promise<PinResetRequestRow> => {
  const id = randomUUID();
  await getDb().execute({
    sql: `INSERT INTO staff_pin_reset_requests (id, staff_id, username, kiosk_id)
          VALUES (@id, @staff_id, @username, @kiosk_id)`,
    args: { id, staff_id: staffId, username, kiosk_id: kioskId },
  });
  const row = await getPinResetRequest(id);
  if (!row) throw new Error('Failed to read back PIN reset request');
  syncEvent('staff-pin-reset-request', row);
  return row;
};

/** Cloud side: idempotently ingest a request pushed up from a kiosk via sync. */
export const insertPinResetRequestFromSync = async (row: PinResetRequestRow): Promise<void> => {
  await getDb().execute({
    sql: `INSERT OR IGNORE INTO staff_pin_reset_requests
            (id, staff_id, username, kiosk_id, status, requested_at)
          VALUES (@id, @staff_id, @username, @kiosk_id, @status, @requested_at)`,
    args: {
      id: row.id,
      staff_id: row.staff_id,
      username: row.username,
      kiosk_id: row.kiosk_id,
      status: row.status,
      requested_at: row.requested_at,
    },
  });
};

/** Cloud side: ingest an already-hashed PIN pushed up from a kiosk via sync. */
export const applyStaffPinHash = async (staffId: string, pinHash: string): Promise<void> => {
  await getDb().execute({
    sql: `UPDATE staff SET pin_hash = @pin_hash, failed_attempts = 0, locked_until = NULL WHERE id = @id`,
    args: { id: staffId, pin_hash: pinHash },
  });
};

export const getPinResetRequest = async (id: string): Promise<PinResetRequestRow | null> => {
  const result = await getDb().execute({
    sql: `SELECT * FROM staff_pin_reset_requests WHERE id = @id`,
    args: { id },
  });
  const row = firstRow<Record<string, unknown>>(result);
  return row ? mapPinRequest(row) : null;
};

export const listPendingPinResetRequests = async (): Promise<PinResetRequestRow[]> => {
  const result = await getDb().execute(
    `SELECT * FROM staff_pin_reset_requests WHERE status = 'pending' ORDER BY requested_at ASC`,
  );
  return toRows<Record<string, unknown>>(result).map(mapPinRequest);
};

/** Cloud side: admin approves/denies. Caller is responsible for enqueuing the downlink command. */
export const decidePinResetRequest = async (
  id: string,
  decision: 'approved' | 'denied',
  decidedBy: string,
): Promise<PinResetRequestRow | null> => {
  await getDb().execute({
    sql: `UPDATE staff_pin_reset_requests
          SET status = @status, decided_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), decided_by = @decidedBy
          WHERE id = @id AND status = 'pending'`,
    args: { id, status: decision, decidedBy },
  });
  return getPinResetRequest(id);
};

/** Kiosk side: apply a decision received via the command downlink to the local copy. */
export const applyPinResetDecision = async (
  id: string,
  decision: 'approved' | 'denied',
  decidedBy: string,
): Promise<void> => {
  await getDb().execute({
    sql: `INSERT INTO staff_pin_reset_requests (id, staff_id, username, kiosk_id, status, decided_at, decided_by)
          VALUES (@id, '', '', @kioskId, @status, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), @decidedBy)
          ON CONFLICT(id) DO UPDATE SET
            status = @status, decided_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), decided_by = @decidedBy`,
    args: { id, status: decision, decidedBy, kioskId: config.kioskId },
  });
};

/** Kiosk side: staff sets their own new PIN after an approved request. One-time use. */
export const completePinResetRequest = async (
  id: string,
  staffId: string,
  newPin: string,
): Promise<boolean> => {
  const req = await getPinResetRequest(id);
  if (!req || req.status !== 'approved' || req.staff_id !== staffId) return false;
  await setStaffPin(staffId, newPin);
  await getDb().execute({
    sql: `UPDATE staff_pin_reset_requests SET status = 'completed' WHERE id = @id`,
    args: { id },
  });
  const row = await getStaffRowById(staffId);
  if (row) syncEvent('staff-pin-set', { id: staffId, pin_hash: row.pin_hash });
  return true;
};
