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

const KIOSK_PROCESS = (process.env.KIOSK_PROCESS_NAME || 'web_doc').replace(/\.exe$/i, '');

// Printer probe is expensive (spawns PowerShell) — cache it and only re-probe
// once a minute so it doesn't contend with itself and flap.
let printerProbeAt = 0;
let printerProbeValue = 'UNKNOWN';

/**
 * Best-effort printer probe (Windows). Never throws, never flaps to UNKNOWN on a
 * transient failure — the last known state is kept until a probe succeeds.
 */
const probePrinterState = (): string => {
  if (os.platform() !== 'win32') return 'UNKNOWN';

  const now = Date.now();
  if (now - printerProbeAt < 55_000) return printerProbeValue;
  printerProbeAt = now;

  try {
    const out = execSync(
      'powershell -NoProfile -Command "Get-CimInstance -ClassName Win32_Printer | ' +
        'Select-Object -ExpandProperty Name"',
      { encoding: 'utf8', timeout: 12000, windowsHide: true },
    );
    const names = out.split('\n').map((s) => s.trim()).filter(Boolean);
    const configured = config.print.printerName.trim().toLowerCase();
    const configuredPresent =
      !!configured &&
      names.some(
        (n) => n.toLowerCase().includes(configured) || configured.includes(n.toLowerCase()),
      );
    const realPrinters = names.filter((n) => !/pdf|xps|fax|onenote|microsoft print/i.test(n));

    printerProbeValue = configuredPresent || realPrinters.length > 0 ? 'READY' : 'OFFLINE';
    return printerProbeValue;
  } catch {
    // Timeout / PowerShell contention — keep whatever we last knew.
    return printerProbeValue;
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
  try {
    execSync('powershell -NoProfile -Command "Restart-Service -Name Spooler -Force"', {
      encoding: 'utf8',
      timeout: 15000,
      windowsHide: true,
    });
    return 'print spooler restarted';
  } catch (err) {
    // Restarting a service needs elevation; a non-admin backend can't do it.
    throw new Error(
      `could not restart spooler — run the backend as administrator (${String(err).slice(0, 160)})`,
    );
  }
};

/**
 * Kill the kiosk app process so the supervisor (start-kiosk.bat loop /
 * kiosk-watchdog.ps1) relaunches it. With no supervisor running this simply
 * closes the app.
 */
const killKioskApp = (): string => {
  if (os.platform() !== 'win32') return 'skipped (non-Windows)';
  try {
    execSync(`taskkill /F /IM ${KIOSK_PROCESS}.exe /T`, {
      encoding: 'utf8',
      timeout: 10000,
      windowsHide: true,
    });
    return `killed ${KIOSK_PROCESS}.exe — supervisor will relaunch it`;
  } catch (err) {
    const msg = String(err);
    // taskkill exits non-zero when the process isn't running.
    if (/not found|128/i.test(msg)) {
      return `${KIOSK_PROCESS}.exe was not running — supervisor will start it`;
    }
    throw new Error(`taskkill failed: ${msg.slice(0, 160)}`);
  }
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
        result = killKioskApp();
        await insertIncident({
          kiosk_id: KIOSK_ID,
          device: 'app',
          error_code: 'RESTART_REQUESTED',
          severity: 'info',
          message: `Admin requested a kiosk application restart (${result})`,
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

const applyReply = async (reply: DownlinkReply): Promise<void> => {
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
};

/** Full heartbeat + command drain — on the heartbeat interval. */
const heartbeatTick = async (): Promise<void> => {
  try {
    await applyReply(await sendHeartbeat());
  } catch (err) {
    logger.warn('Fleet agent: heartbeat tick failed', { error: String(err) });
  }
};

/** Lightweight command-only poll between heartbeats, so admin actions land fast. */
const commandTick = async (): Promise<void> => {
  try {
    if (cloudMode) {
      const res = await fetch(
        `${SYNC_URL}/api/sync/commands?kiosk_id=${encodeURIComponent(KIOSK_ID)}`,
        {
          headers: { 'X-Sync-Secret': SYNC_SECRET },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await applyReply((await res.json()) as DownlinkReply);
    } else {
      const [commands, storage] = await Promise.all([
        claimPendingCommands(KIOSK_ID),
        getStorageSettings(),
      ]);
      await applyReply({ commands, settings: { storage } });
    }
  } catch (err) {
    logger.warn('Fleet agent: command tick failed', { error: String(err) });
  }
};

export const startFleetAgent = (): void => {
  if (started || !config.isKioskRole) return;
  started = true;
  const cmdIntervalMs = Math.min(5000, config.heartbeatIntervalMs);
  logger.info('Fleet agent started', {
    kioskId: KIOSK_ID,
    heartbeatMs: config.heartbeatIntervalMs,
    commandPollMs: cmdIntervalMs,
    transport: cloudMode ? 'cloud-http' : 'local-db',
  });
  void heartbeatTick();
  setInterval(() => void heartbeatTick(), config.heartbeatIntervalMs);
  setInterval(() => void commandTick(), cmdIntervalMs);
};

export const currentPrinterState = (): string => lastPrinterState;
