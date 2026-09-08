# Monitoring & Control Plane

How the admin console sees kiosk health and controls kiosks remotely. This layer
sits on top of the existing metadata sync (`sync_outbox` → `/api/sync/*`) and
does **not** replace it — transactions and print jobs still travel through the
durable outbox.

## Instance roles

One backend codebase, three roles, selected by `INSTANCE_ROLE`:

| Role    | Runs on          | Responsibilities |
|---------|------------------|------------------|
| `kiosk` | the physical PC  | heartbeat sender, command executor, retention purge, owns the document files |
| `cloud` | Railway          | receives sync + heartbeats, serves the admin console |
| `both`  | dev / demo (default) | single process doing everything against one local DB |

Identity: `KIOSK_ID` (default `DOCUCENTER-01`) and `KIOSK_LABEL`. The Flutter app
has a matching `BackendConfig.kioskId`.

## 1. Heartbeat & liveness

The **fleet agent** (`services/fleet-agent.service.ts`, kiosk role only) emits a
heartbeat every `HEARTBEAT_INTERVAL_MS` (default 20 s):

- split deployment → `POST {SYNC_URL}/api/sync/heartbeat` with `X-Sync-Secret`
- single process → writes straight to the local `kiosks` table

Each beat carries `printer_state`, `scanner_state`, `app_version`, host metadata.
A kiosk is **OFFLINE** when its `last_seen` is older than
`KIOSK_OFFLINE_AFTER_SECONDS` (default 60). Heartbeats deliberately do **not** go
through the retrying outbox — a stale queued beat would be misleading.

Admin: **Kiosks** page (`/kiosks`), polled every 8 s.

## 2. Admin → kiosk commands

Queue table `kiosk_commands`. The admin enqueues; the kiosk pulls on its next
heartbeat (the heartbeat response carries `commands`), executes locally, and ACKs
(`POST /api/sync/commands/:id/ack`). Latency ≈ one heartbeat interval.

| Command | Effect on the kiosk |
|---|---|
| `MAINTENANCE_ON` / `_OFF` | toggles `kiosks.maintenance`; the app shows a full-screen blocking panel |
| `DISABLE_PRINTING` / `ENABLE_PRINTING` | toggles `kiosks.printing_disabled`; `/api/print/from-storage` returns **423** while set |
| `RESTART_PRINTER` | `Restart-Service Spooler -Force` — **needs the backend to run as administrator**; the ACK carries the failure reason if it can't |
| `RESTART_APP` | `taskkill /F /IM <KIOSK_PROCESS_NAME>.exe` — the `start-kiosk.bat` loop or `kiosk-watchdog.ps1` then relaunches it. With no supervisor running it just closes the app. |

Flag commands also update the roster row immediately so the console reflects
intent without waiting for the ACK. Between heartbeats the agent still polls for
commands every ~5 s, so admin actions land quickly. Each command's outcome is
recorded on `kiosk_commands.result` (visible in `GET /api/fleet/kiosks/:id`).

## 3. Incidents (Alerts)

Structured device/error events — table `incidents`
(`device`, `error_code`, `severity` ∈ `info|warning|critical`, `message`,
`metadata`, `status`).

- Kiosk app / backend → `POST /api/kiosk/incidents` → stored locally and
  forwarded to the cloud through the **outbox** (`incident` event).
- Admin **Alerts** page (`/alerts`): open/resolved tabs, one-click resolve, and a
  nav badge with the open count.

Emitters wired so far: `print_service` (PRINT_FAILED / PRINT_ERROR), the fleet
agent (RESTART_REQUESTED), the watchdog (APP_RECOVERED / BACKEND_RECOVERED).

## 4. Analytics

`GET /api/fleet/analytics?from=&to=` → `getAnalytics()` aggregates:

- revenue total, by service, by day, average transaction value
- transaction outcomes (success / failed / cancelled / pending)
- print-job mix: colour vs B&W, duplex vs single, by paper size, total sheets
- demand peaks by hour and weekday

`print_jobs` was widened with `page_count`, `color_mode`, `duplex`, `unit_price`,
`service_type` to feed this — the Flutter print call and `/api/print/from-storage`
now pass those fields.

Admin **Analytics** page (`/analytics`), range today / 7 d / 30 d / all.

## 5. Storage retention

Singleton `storage_settings` (`delete_after_print`, `retention_hours`).

- Admin edits it on the **Storage** page (`/storage`).
- The kiosk applies the current policy on every heartbeat.
- `retention.service.ts` (kiosk role) purges uploads older than the TTL hourly.
- `delete_after_print` is honoured in `/api/print/from-storage` after a
  successful job.
- Manual actions: **Purge expired now**, **Delete all files**.

## 6. Offline resilience (kiosk app)

`KioskRuntime` polls `/api/kiosk/self` every 10 s. Two consecutive misses →
non-blocking "Connection lost" banner (auto-retries). `maintenance` →
full-screen panel. `printing_disabled` → banner. The local services keep working
while the internet (payments relay) is down.

## 7. OS watchdog

`scripts/kiosk-watchdog.ps1` supervises the Node backend and the Flutter exe,
restarts whichever is down, and reports `APP_RECOVERED` / `BACKEND_RECOVERED`.
Register it as the `DocuCenter Kiosk` scheduled task (see `setup-kiosk-os.ps1`)
in place of the plain restart loop in `start-kiosk.bat`.

## Endpoint map

| Path | Auth | Used by |
|---|---|---|
| `POST /api/sync/heartbeat` | `X-Sync-Secret` | kiosk fleet agent |
| `GET  /api/sync/commands` · `POST /api/sync/commands/:id/ack` | `X-Sync-Secret` | kiosk fleet agent |
| `POST /api/sync/incident` · `/incident-resolve` | `X-Sync-Secret` | kiosk outbox |
| `GET/POST /api/fleet/*` | admin bearer | admin console (via session proxy) |
| `GET /api/kiosk/self` · `POST /api/kiosk/incidents` | kiosk token (loopback ok) | Flutter app, watchdog |
