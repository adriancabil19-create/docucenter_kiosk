/**
 * Fleet agent — runs on the kiosk-role backend.
 *
 * On a fixed interval it:
 *   1. emits a heartbeat (so the cloud/admin knows this kiosk is alive),
 *   2. pulls any pending admin → kiosk commands and executes them locally,
 *   3. applies the current storage-retention policy to the local DB.
 *
 * Transport is transparent:
 *   - split deployment (SYNC_URL set) → HTTP to the cloud `/api/sync/*`,
 *   - single-process demo (`INSTANCE_ROLE=both`, no SYNC_URL) → direct DB calls.
 */

import { execSync } from 'child_process';
import * as os from 'os';
import { config } from '../utils/config';
import { logger } from '../utils/logger';
import {
  recordHeartbeat,
  claimPendingCommands,
  ackCommand,
  getStorageSettings,
  updateStorageSettings,
  setKioskFlags,
  insertIncident,
  type KioskCommandRow,
  type KioskCommandName,
} from '../database';

const { url: SYNC_URL, secret: SYNC_SECRET } = config.sync;
const cloudMode = !!SYNC_URL && !!SYNC_SECRET;
const KIOSK_ID = config.kioskId;

let started = false;
let lastPrinterState = 'UNKNOWN';

/** Best-effort printer probe (Windows). Never throws. */
const probePrinterState = (): string => {
  if (os.platform() !== 'win32') return 'UNKNOWN';
  try {
    const out = execSync(
      'powershell -NoProfile -Command "Get-Printer | Select-Object -ExpandProperty Name"',
      { encoding: 'utf8', timeout: 5000, windowsHide: true },
    );
    const names = out.split('\n').map((s) => s.trim()).filter(Boolean);
    const real = names.filter((n) => !/pdf|xps|fax|onenote|microsoft/i.test(n));
    return real.length > 0 ? 'READY' : 'OFFLINE';
  } catch {
    return 'UNKNOWN';
  }
};

interface DownlinkReply {
  commands: KioskCommandRow[];
  settings?: { storage?: { delete_after_print: boolean; retention_hours: number } };
}

/** Send the heartbeat and get back commands + settings. */
const sendHeartbeat = async (): Promise<DownlinkReply> => {
  const printerState = probePrinterState();
  lastPrinterState = printerState;
  const payload = {
    kiosk_id: KIOSK_ID,
    label: config.kioskLabel,
    app_version: process.env.APP_VERSION || '1.0.0',
    printer_state: printerState,
    scanner_state: 'UNKNOWN',
    current_job_id: null as string | null,
    meta: { host: os.hostname(), platform: os.platform(), role: config.instanceRole },
  };

  if (cloudMode) {
    const res = await fetch(`${SYNC_URL}/api/sync/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Sync-Secret': SYNC_SECRET },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as DownlinkReply;
  }

  // Single-process: write straight to the shared local DB.
  await recordHeartbeat(payload);
  const [commands, storage] = await Promise.all([
    claimPendingCommands(KIOSK_ID),
    getStorageSettings(),
  ]);
  return { commands, settings: { storage } };
};

const ackRemote = async (id: string, ok: boolean, result: string): Promise<void> => {
  if (cloudMode) {
    await fetch(`${SYNC_URL}/api/sync/commands/${id}/ack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Sync-Secret': SYNC_SECRET },
      body: JSON.stringify({ ok, result }),
      signal: AbortSignal.timeout(8000),
    }).catch((e) => logger.warn('Fleet agent: ack POST failed', { id, error: String(e) }));
  } else {
    await ackCommand(id, ok, result);
  }
};

const restartPrintSpooler = (): string => {
  if (os.platform() !== 'win32') return 'skipped (non-Windows)';
  execSync('powershell -NoProfile -Command "Restart-Service -Name Spooler -Force"', {
    encoding: 'utf8',
    timeout: 15000,
    windowsHide: true,
  });
  return 'print spooler restarted';
};

const executeCommand = async (cmd: KioskCommandRow): Promise<void> => {
  const name = cmd.command as KioskCommandName;
  try {
    let result = 'ok';
    switch (name) {
      case 'MAINTENANCE_ON':
        await setKioskFlags(KIOSK_ID, { maintenance: true });
        result = 'maintenance mode enabled';
        break;
      case 'MAINTENANCE_OFF':
        await setKioskFlags(KIOSK_ID, { maintenance: false });
        result = 'maintenance mode disabled';
        break;
      case 'DISABLE_PRINTING':
        await setKioskFlags(KIOSK_ID, { printing_disabled: true });
        result = 'printing disabled';
        break;
      case 'ENABLE_PRINTING':
        await setKioskFlags(KIOSK_ID, { printing_disabled: false });
        result = 'printing enabled';
        break;
      case 'RESTART_PRINTER':
        result = restartPrintSpooler();
        break;
      case 'RESTART_APP':
        // The OS watchdog owns the actual relaunch. Record the intent so the
        // recovery incident on next boot has context.
        result = 'restart requested — handled by kiosk watchdog';
        await insertIncident({
          kiosk_id: KIOSK_ID,
          device: 'app',
          error_code: 'RESTART_REQUESTED',
          severity: 'info',
          message: 'Admin requested a kiosk application restart',
        });
        break;
      default:
        await ackRemote(cmd.id, false, `unknown command: ${name}`);
        return;
    }
    logger.info('Fleet agent: command executed', { id: cmd.id, command: name, result });
    await ackRemote(cmd.id, true, result);
  } catch (err) {
    logger.warn('Fleet agent: command failed', { id: cmd.id, command: name, error: String(err) });
    await ackRemote(cmd.id, false, String(err));
  }
};

const tick = async (): Promise<void> => {
  try {
    const reply = await sendHeartbeat();

    const storage = reply.settings?.storage;
    if (storage) {
      const current = await getStorageSettings();
      if (
        current.delete_after_print !== storage.delete_after_print ||
        current.retention_hours !== storage.retention_hours
      ) {
        await updateStorageSettings(storage);
        logger.info('Fleet agent: storage settings applied', storage);
      }
    }

    for (const cmd of reply.commands ?? []) {
      await executeCommand(cmd);
    }
  } catch (err) {
    logger.warn('Fleet agent: heartbeat tick failed', { error: String(err) });
  }
};

export const startFleetAgent = (): void => {
  if (started || !config.isKioskRole) return;
  started = true;
  logger.info('Fleet agent started', {
    kioskId: KIOSK_ID,
    intervalMs: config.heartbeatIntervalMs,
    transport: cloudMode ? 'cloud-http' : 'local-db',
  });
  void tick();
  setInterval(() => void tick(), config.heartbeatIntervalMs);
};

export const currentPrinterState = (): string => lastPrinterState;
