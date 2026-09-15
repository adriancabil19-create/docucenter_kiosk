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
  getPricingSettings,
  updatePricingSettings,
  pricingSignature,
  setKioskFlags,
  setKioskReload,
  insertIncident,
  insertLog,
  listStaffRoster,
  upsertStaffFromRoster,
  applyPinResetDecision,
  getPaperTrays,
  applyPaperTrayFromCloud,
  type DeviceState,
  type KioskCommandRow,
  type KioskCommandName,
  type PricingSettings,
  type StaffRow,
  type PaperTrayRow,
} from '../database';
import { purgeExpiredDocuments, deleteAllDocuments } from './storage.service';

const { url: SYNC_URL, secret: SYNC_SECRET } = config.sync;
const cloudMode = !!SYNC_URL && !!SYNC_SECRET;
const KIOSK_ID = config.kioskId;

let started = false;
let lastPrinterState: DeviceState = 'OFFLINE';

// Device probe is expensive (spawns PowerShell) — cache it and only re-probe
// once a minute so it doesn't contend with itself and flap.
let deviceProbeAt = 0;
let deviceProbeValue: DeviceState = 'OFFLINE';

/**
 * Probe the Brother MFC-J2730DW (printer + scanner in one unit). Result is
 * strictly ONLINE / OFFLINE — there is no "unknown" state.
 *
 * ONLINE means: the device is installed AND Windows does not have it flagged
 * WorkOffline AND it is not reporting an error/paper-out condition. A powered-off
 * or unplugged unit reports WorkOffline (or PrinterStatus 1) and comes back
 * OFFLINE. On a non-Windows host, or a transient PowerShell failure, the last
 * known value is kept (starts OFFLINE) rather than flapping.
 */
const probeDeviceState = (): DeviceState => {
  if (os.platform() !== 'win32') return deviceProbeValue;

  const now = Date.now();
  if (now - deviceProbeAt < 55_000) return deviceProbeValue;
  deviceProbeAt = now;

  try {
    // One line per printer: "Name|WorkOffline|PrinterStatus|DetectedErrorState".
    // Single quotes only inside the -Command string so it survives cmd.exe.
    const out = execSync(
      "powershell -NoProfile -Command \"Get-CimInstance -ClassName Win32_Printer | " +
        "ForEach-Object { $_.Name + '|' + $_.WorkOffline + '|' + $_.PrinterStatus + '|' + $_.DetectedErrorState }\"",
      { encoding: 'utf8', timeout: 12000, windowsHide: true },
    );

    const rows = out
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((line) => {
        const [name, workOffline, printerStatus, errState] = line.split('|');
        return {
          name: (name ?? '').toLowerCase(),
          workOffline: /true/i.test(workOffline ?? ''),
          // Win32_Printer.PrinterStatus: 1 = Other, 2 = Unknown, 3 = Idle/Ready,
          // 4 = Printing, 5 = Warmup. DetectedErrorState: 2 = No Error.
          printerStatus: Number(printerStatus ?? '0'),
          errState: Number(errState ?? '2'),
        };
      })
      .filter((r) => r.name && !/pdf|xps|fax|onenote|microsoft print/i.test(r.name));

    const configured = config.print.printerName.trim().toLowerCase();
    const candidates = configured
      ? rows.filter((r) => r.name.includes(configured) || configured.includes(r.name))
      : rows;

    const anyOnline = (candidates.length ? candidates : rows).some(
      (r) => !r.workOffline && r.printerStatus !== 1 && (r.errState === 2 || r.errState === 0),
    );

    deviceProbeValue = anyOnline ? 'ONLINE' : 'OFFLINE';
    return deviceProbeValue;
  } catch {
    // Timeout / PowerShell contention — keep whatever we last knew.
    return deviceProbeValue;
  }
};

interface DownlinkReply {
  commands: KioskCommandRow[];
  settings?: {
    storage?: { delete_after_print: boolean; retention_hours: number };
    pricing?: PricingSettings;
    staff?: StaffRow[];
    paperTrays?: PaperTrayRow[];
  };
}

/** Send the heartbeat and get back commands + settings. */
const sendHeartbeat = async (): Promise<DownlinkReply> => {
  // The MFC-J2730DW is printer + scanner in one unit, so a single probe drives
  // both states.
  const deviceState = probeDeviceState();
  lastPrinterState = deviceState;
  const payload = {
    kiosk_id: KIOSK_ID,
    label: config.kioskLabel,
    app_version: process.env.APP_VERSION || '1.0.0',
    printer_state: deviceState,
    scanner_state: deviceState,
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
  const [commands, storage, staff, paperTrays] = await Promise.all([
    claimPendingCommands(KIOSK_ID),
    getStorageSettings(),
    listStaffRoster(),
    getPaperTrays(),
  ]);
  return { commands, settings: { storage, staff, paperTrays } };
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

/**
 * Restart the Windows Print Spooler service. This clears a jammed print queue and
 * recovers a "printer offline" that Windows has latched — it does NOT power-cycle
 * the Brother MFC-J2730DW itself (no standard driver/USB/network path can).
 * Restarting a service needs elevation, so the backend must run as Administrator.
 */
const restartPrintSpooler = (): string => {
  if (os.platform() !== 'win32') return 'skipped (non-Windows host)';
  try {
    execSync('powershell -NoProfile -Command "Restart-Service -Name Spooler -Force"', {
      encoding: 'utf8',
      timeout: 15000,
      windowsHide: true,
    });
    return 'Windows print spooler restarted (queue cleared)';
  } catch (err) {
    const msg = String(err);
    const elevation = /access is denied|cannot open|PermissionDenied|1722|5/i.test(msg)
      ? ' — the kiosk backend must run as Administrator to restart a service'
      : '';
    throw new Error(`could not restart the print spooler${elevation} (${msg.slice(0, 160)})`);
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
        // Soft reload: bump the reload marker the Flutter app polls. The app
        // resets itself to the home screen and re-inits — the process is not
        // killed.
        await setKioskReload(KIOSK_ID);
        result = 'app soft-reload signalled';
        await insertIncident({
          kiosk_id: KIOSK_ID,
          device: 'app',
          error_code: 'RESTART_REQUESTED',
          severity: 'info',
          message: 'Admin requested a kiosk app soft reload',
        });
        break;
      case 'PURGE_STORAGE': {
        const { retention_hours } = await getStorageSettings();
        const r = await purgeExpiredDocuments(retention_hours);
        result = `purged ${r.deleted} expired file(s)`;
        // Only worth an activity-log row when it actually removed something —
        // a re-delivered command that finds nothing to do shouldn't add noise.
        if (r.deleted > 0) {
          await insertLog('info', 'storage', `Admin purge: ${result}`, { kioskId: KIOSK_ID });
        }
        break;
      }
      case 'DELETE_ALL_FILES': {
        const r = await deleteAllDocuments();
        result = `deleted ${r.deleted} file(s) + records`;
        await insertLog('warn', 'storage', `Admin delete-all (files + records): ${result}`, {
          kioskId: KIOSK_ID,
        });
        break;
      }
      case 'DELETE_ALL_FILES_KEEP_META': {
        const r = await deleteAllDocuments({ keepMeta: true });
        result = `deleted ${r.deleted} file(s), kept records`;
        await insertLog('warn', 'storage', `Admin delete-all (files only): ${result}`, {
          kioskId: KIOSK_ID,
        });
        break;
      }
      case 'STAFF_PIN_REQUEST_DECIDED': {
        const params = cmd.params as { requestId?: string; decision?: 'approved' | 'denied' } | null;
        if (!params?.requestId || !params.decision) {
          result = 'ignored (missing params)';
          break;
        }
        await applyPinResetDecision(params.requestId, params.decision, cmd.created_by ?? 'admin');
        result = `PIN recovery request ${params.decision}`;
        break;
      }
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

  const pricing = reply.settings?.pricing;
  if (pricing) {
    const current = await getPricingSettings();
    if (pricingSignature(current) !== pricingSignature(pricing)) {
      await updatePricingSettings(pricing);
      logger.info('Fleet agent: pricing applied', {
        print: pricing.print,
        photocopy: pricing.photocopy,
      });
    }
  }

  const staff = reply.settings?.staff;
  if (staff) {
    for (const row of staff) await upsertStaffFromRoster(row);
  }

  const paperTrays = reply.settings?.paperTrays;
  if (paperTrays) {
    for (const tray of paperTrays) await applyPaperTrayFromCloud(tray);
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
      const [commands, storage, staff, paperTrays] = await Promise.all([
        claimPendingCommands(KIOSK_ID),
        getStorageSettings(),
        listStaffRoster(),
        getPaperTrays(),
      ]);
      await applyReply({ commands, settings: { storage, staff, paperTrays } });
    }
  } catch (err) {
    logger.warn('Fleet agent: command tick failed', { error: String(err) });
  }
};

export const startFleetAgent = (): void => {
  if (started || !config.isKioskRole) return;
  started = true;
  const cmdIntervalMs = Math.min(config.commandPollIntervalMs, config.heartbeatIntervalMs);
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

export const currentPrinterState = (): DeviceState => lastPrinterState;
