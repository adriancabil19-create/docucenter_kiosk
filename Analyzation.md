# Repository Analysis — DOCUCENTER Kiosk

**Date analyzed:** April 2, 2026  
**Repository:** `docucenter_kiosk`  
**Analyst:** Claude Sonnet 4.6 (AI-assisted full-repo audit)  
**Last git pull commit:** `7339bbb` — "Mao nani" (Apr 2 2026)

---

## 1. Project Overview

DOCUCENTER Kiosk is a self-service document processing station for University of Cebu — Lapu-Lapu and Mandaue (UCLM), built as a BSCpE thesis project.

**Tech stack:**

| Layer | Technology |
|-------|-----------|
| Frontend | Flutter 3 / Dart — Windows + Android |
| Backend | Node.js / Express / TypeScript |
| Database | SQLite (`better-sqlite3`) — `docucenter.db` at project root |
| Payment | GCash (fully simulated for thesis) |
| Printing | `pdf-to-printer` (SumatraPDF) + PDFKit text→PDF renderer |
| File Transfer | USB export, Bluetooth (`flutter_blue_plus`, `win_ble`), WiFi hotspot |
| Scanning | WIA (Windows Image Acquisition) via PowerShell subprocess |

**Runtime topology:** Everything runs on the same Windows machine. Flutter UI calls `http://localhost:5000`. No internet required except for real GCash (not implemented).

---

## 2. Architecture

```
[User / Kiosk Touchscreen]
         │
         ▼
[Flutter App]  ──── HTTP REST ────  [Node.js/Express :5000]
   navigation                              │
   payment UI                    ┌─────────┼──────────┐
   QR display                    │         │          │
   settings UI              GCash svc   Print svc  Storage svc
         │                  (in-mem)   (PDFKit +   (Uploads/)
         │                             SumatraPDF)
         ▼
[Printer / Scanner / Disk]        [SQLite docucenter.db]
```

**Navigation model:** String-based (`_currentPage` in `main.dart`). Pages: `home`, `services`, `about`, `payment`. Simple but fragile — no type safety.

**Cross-page state:** `GCashPaymentPageState` static fields carry print job data between pages. This is an anti-pattern but functional if cleared correctly.

---

## 3. Build Status

| Target | Status | Notes |
|--------|--------|-------|
| **Backend `npm run build`** | ✅ CLEAN | Zero errors after `pdf-lib` installed |
| **Flutter `flutter analyze`** | ⚠️ 37 issues | All infos/warnings — zero errors. See §6. |

**`pdf-lib` was missing from node_modules** on this machine — `npm install` resolves it. Listed in `package.json` dependencies, so clean install (`npm ci`) will include it.

---

## 4. Flutter Modules

### `lib/main.dart`
- Entry point; hosts `Header`, `HomePage`, page routing
- **Issue (LOW):** `debugPrint('Main called - Platform.isWindows: ...')` left in at line 8 — remove before defense

### `lib/config.dart`
- All API URLs, timeouts, payment config in one place
- **Issue (MEDIUM):** `UiConfig.showDevelopmentTools = true` — the "Simulate Success/Failure/Test Printer" dev buttons are always visible. Set to `false` for a clean thesis demo.
- **Issue (LOW):** Naming convention violations (`FLUTTER_APP_VERSION`, `BACKEND_URL`, etc.) — analyzer infos only

### `lib/services.dart`
- Main service router: printing, scanning, photocopying, storage panels
- Manages `TransferManager`, document list, selected docs for printing
- `_transferManager.initializeAll()` at line 29 — method **does exist** at `transfer_service.dart:1155` ✅

### `lib/storage_service.dart`
- HTTP client for `/api/storage/*` endpoints
- Handles upload (multipart), list, download, delete
- **Fixed:** 60-second upload timeout added
- **Issue (LOW):** `getStorageStats()` implemented but UI never displays it

### `lib/payment_service.dart`
- GCash payment creation, polling, cancellation
- Print wrappers: `printReceipt`, `printFromStorage`, `printTestPage`
- `PaymentPollingManager`: `startPolling()`, `stopPolling()`, `_cancelled` guard
- **Issue (LOW):** Dead method `PaymentPollingManager.printFiles()` at line 575 — never called, should be removed
- `printFromStorage` now accepts `colorMode` and `quality` params ✅

### `lib/transfer_service.dart` (1238 lines — major change in git pull)

| Method | Class | Status | Issues |
|--------|-------|--------|--------|
| USB export | `USBTransferService` | ✅ WORKING | Exports to `WebDoc_Export` folder |
| Cross-platform BT | `BluetoothTransferService` | ⚠️ PARTIAL | `flutter_blue_plus` — deprecated API (`id` → `remoteId`, `name` → `platformName`, `isAvailable` → `isSupported`) |
| Windows BT | `WindowsBluetoothTransferService` | ⚠️ PARTIAL | `win_ble` + `win32` FFI — unsafe pointer ops, no null guards |
| WiFi Hotspot | `WindowsWiFiHotspotTransferService` | ❌ INCOMPLETE | `netsh` requires Admin, HTTP server not complete |
| QR Code | `QRTransferService` | ❌ STUB | Only debug prints, no actual transfer |

**Known issues in `transfer_service.dart`:**
- Line 196: `isAvailable` deprecated → `isSupported`
- Line 334, 364: `device.id.id` → `device.remoteId.str`; `device.name` → `device.platformName`
- Line 578: Unnecessary null comparison (always false) — `win32` handle
- Line 656: Hardcoded WiFi password `'WebDoc1234'` in source — move to config
- Lines 316–337, 352–360: `@override` annotations missing on `discoverDevices`, `connectToDevice`, `connectToDefaultDevice`

### `lib/pages/printing_page.dart`
- File picker → upload to backend → cost calculation → payment flow
- Print settings: paper size, color mode, quality, copies (max 20)
- **Fixed:** Copies expansion (filenames × N), `colorMode` + `quality` forwarded to backend
- **Fixed:** Copies capped at 20 to prevent oversized requests

### `lib/pages/scanning_page.dart`
- **DEMO MODE** — no real scanner hardware
- Settings: color mode, DPI, paper size, quality, output format (PDF/JPG/PNG), double-sided
- Simulates scan workflow; saves fake placeholder bytes to storage
- **Fixed:** ASCII-only receipt, proper `await` on `_printScanReceipt()`, output format in filename

### `lib/pages/photocopying_page.dart`
- **DEMO MODE** — no real copier hardware
- Settings: copies, color mode, paper size, quality, collate, brightness, contrast
- All settings captured and shown on receipt
- **Fixed:** Copies capped at 20, curly braces lint resolved
- **Reason for demo:** Requires ADF scanner + print pipeline integration (WIA + hardware driver)

### `lib/pages/storage_page.dart`
- Lists stored documents; delete, print, Bluetooth/WiFi transfer actions
- **New in pull:** Significantly expanded (272 lines added) — transfer dialogs, Bluetooth discovery
- **Issue (MEDIUM):** `use_build_context_synchronously` on lines 62, 65, 87, 89, 106, 112, 129, 203 — `ScaffoldMessenger.of(context)` and `Navigator.of(context)` used after `await` without pre-capture

### `lib/pages/payment_page.dart`
- GCash payment UI: QR code, countdown timer, status polling
- Handles: payment success → print receipt → print pending receipt → print files → navigate
- Dev tools: Simulate Success/Failure, Test Printer
- **Fixed:** `_simulateSuccess()` now calls `_handlePaymentSuccess()` directly (no double-print, works in demo mode)
- **Fixed:** `printFiles` static cleared after payment; snackbar shows print result; navigation awaits prints
- **Issue (INFO):** `use_build_context_synchronously` on lines 83, 90, 98 — in the `onPaymentComplete` async callback inside `GCashPaymentPage.build()`, `ScaffoldMessenger.of(context)` used after `await`

---

## 5. Backend Modules

### `backend/src/index.ts`
Routes mounted:
- `POST/GET /api/gcash/*` — payment
- `POST/GET /api/print/*` — printing
- `POST/GET /api/storage/*` — file storage
- `GET /api/monitoring/*` — statistics
- `POST/GET /api/scan/*` — WIA scanning
- `GET /api/qr/*` — QR code (legacy)
- `GET /health` — server health

### `backend/src/utils/config.ts`
- **Fixed:** `isDevelopment` now `!== 'production'` so simulate endpoints work without a `.env` file
- `PRINT_SIMULATION_ENABLED=true` by default — files go to `PrintSimulation/` folder
- Set `PRINT_SIMULATION_ENABLED=false` and `PRINTER_NAME=<name>` for real printing

### `backend/src/database.ts`
Tables:
- `transactions` — GCash payments (id, reference, amount, status, service_type, created_at, completed_at)
- `print_jobs` — every print call (id, filenames JSON, paper_size, copies, status, method, simulated, created_at)

Functions: `insertTransaction`, `updateTransactionStatus`, `insertPrintJob`, `getMonitoringStats`, `getRecentJobs`, `getRecentTransactions` — all implemented ✅

### `backend/src/services/print.service.ts`
- **New in pull:** `pdf-lib` integration for PDF resizing to target paper size before printing
- `renderTextToPdf()` — PDFKit text→PDF (Courier 9pt)
- `resizePdfToPaperSize()` — scales PDF pages to A4/Folio/Letter/Legal using `pdf-lib`
- `printPdfFile()` — now accepts `colorMode` (`monochrome: true` for B&W) and `quality` (`printQuality: 'draft'|'high'`)
- Tray selection: A4→Tray 1, Letter→Tray 2, Folio→MP Tray (hardcoded — may not match actual printer)
- `printFilesFromStorage()` — resizes PDF then prints; cleans up temp file in `finally`
- **`printPdfFile` is exported** ✅ — used by `scan.service.ts` via dynamic import

### `backend/src/services/storage.service.ts`
- UUID-named files in `Uploads/` with `.meta.json` sidecars
- Page count estimated via PDF structure regex (fallback: 1)
- **Issue (LOW):** Uploads folder grows unbounded — no expiry/cleanup

### `backend/src/services/gcash.ts`
- In-memory transaction store (lost on server restart)
- Full mock implementation: no real GCash API calls
- Sufficient for thesis demo

### `backend/src/services/scan.service.ts`
- WIA scanning via PowerShell subprocess (90-second timeout)
- Image-to-PDF conversion via PDFKit
- Photocopy = scan + print via dynamic import of `printPdfFile`
- **Issue (MEDIUM):** TWAIN fallback just delegates to WIA — not truly different
- **Issue (MEDIUM):** PowerShell script uses user-supplied paths — needs escaping validation
- **Issue (LOW):** Tray assignment during photocopy not configurable

### `backend/src/routes/monitoring.ts`
- `GET /api/monitoring/stats` — totals: transactions, revenue, print jobs
- `GET /api/monitoring/jobs?limit=N` — recent print jobs
- `GET /api/monitoring/transactions?limit=N` — recent payment history
- All backed by SQLite ✅

### `backend/src/routes/scan.ts`
- `POST /api/scan/scan` — triggers WIA scan, returns PDF file stream
- `POST /api/scan/photocopy` — triggers WIA scan + print
- **Issue (LOW):** `multer` imported but unused

---

## 6. Issue Register

### Errors (build-breaking)
*None as of April 2, 2026 — both builds clean.*

### High Severity (runtime crash or data loss risk)

| # | File | Line | Issue |
|---|------|------|-------|
| H1 | `lib/pages/storage_page.dart` | 62, 65, 87, 89, 106, 112, 129, 203 | `use_build_context_synchronously` — `ScaffoldMessenger`/`Navigator` used after `await` without pre-capture. Triggers Flutter assertion in debug mode, undefined behaviour in release. |
| H2 | `lib/pages/payment_page.dart` | 83, 90, 98 | `use_build_context_synchronously` in `onPaymentComplete` async callback — same issue. |
| H3 | `backend/src/services/scan.service.ts` | 146 | PowerShell script receives output path from user without sanitization — path injection risk |

### Medium Severity (incorrect behaviour)

| # | File | Line | Issue |
|---|------|------|-------|
| M1 | `lib/config.dart` | 81 | `showDevelopmentTools = true` — dev buttons visible on production kiosk |
| M2 | `lib/transfer_service.dart` | 196, 334, 334, 364 | Deprecated `flutter_blue_plus` API: `isAvailable`, `device.id.id`, `device.name` — may break on newer flutter_blue_plus versions |
| M3 | `lib/transfer_service.dart` | 656 | Hardcoded WiFi hotspot password `'WebDoc1234'` in source |
| M4 | `lib/transfer_service.dart` | 578 | Unnecessary null comparison — always false; `win32` handle check wrong |
| M5 | `backend/src/services/print.service.ts` | 196–202 | Hardcoded paper tray names (Tray 1, Tray 2, MP Tray) — will mismatch if printer uses different tray names |
| M6 | `backend/src/services/gcash.ts` | 18 | Transactions in memory only — lost on backend restart |

### Low Severity (style, dead code, minor issues)

| # | File | Line | Issue |
|---|------|------|-------|
| L1 | `lib/main.dart` | 8 | `debugPrint(...)` left in production code |
| L2 | `lib/payment_service.dart` | 575–587 | Dead method `PaymentPollingManager.printFiles()` — never called |
| L3 | `lib/transfer_service.dart` | 316, 341, 383, 494, 589, 627, 867, 887, 1020, 1039 | Missing `@override` annotations on overriding methods |
| L4 | `lib/transfer_service.dart` | 989 | Unnecessary braces in string interpolation |
| L5 | `lib/transfer_service.dart` | 3 | Unused import `dart:typed_data` |
| L6 | `lib/transfer_service.dart` | 14 | Package `ffi` not listed as dependency in `pubspec.yaml` |
| L7 | `backend/src/routes/scan.ts` | 2 | Unused `multer` import |
| L8 | `lib/config.dart` | 7 | Naming convention: `FLUTTER_APP_VERSION` should be `flutterAppVersion` |
| L9 | `lib/payment_service.dart` | 10–12 | Naming convention: `BACKEND_URL`, `TIMEOUT_DURATION`, `POLLING_INTERVAL` |
| L10 | `lib/transfer_service.dart` | (multiple) | Unused private fields `_serviceName`, `_deviceAddress`, `_hotspotName`, `_hotspotPassword` |

---

## 7. Feature Completeness

| Feature | Status | Notes |
|---------|--------|-------|
| **Printing (PDF upload → print)** | ✅ WORKING | Full pipeline: upload → UUID → payment → print via SumatraPDF |
| **Printing (copies, paper size, color, quality)** | ✅ WORKING | All params forwarded to backend and to pdf-to-printer |
| **GCash payment flow** | ✅ WORKING (simulated) | Real GCash API not integrated — mock only |
| **Payment receipt printing** | ✅ WORKING | Text → PDFKit → SumatraPDF |
| **SQLite transaction logging** | ✅ WORKING | Logged on create + status change |
| **SQLite print job logging** | ✅ WORKING | Logged on every `/from-storage` call |
| **Monitoring API** | ✅ WORKING | `/api/monitoring/stats`, `/jobs`, `/transactions` |
| **File storage (upload/list/delete)** | ✅ WORKING | UUID files + `.meta.json` sidecars |
| **Scanning (demo mode)** | ⚠️ DEMO | Settings UI real; scan output is fake bytes. WIA integration in backend exists but Flutter never calls it |
| **Photocopying (demo mode)** | ⚠️ DEMO | Settings real; no hardware pipeline triggered |
| **WIA Scanner backend** | ⚠️ PARTIAL | `scan.service.ts` exists with PowerShell WIA — not yet called from Flutter |
| **USB file transfer** | ✅ WORKING | Exports to `WebDoc_Export/` folder |
| **Bluetooth file transfer** | ⚠️ PARTIAL | Deprecated APIs; Windows BT has unsafe FFI; works for basic discovery |
| **WiFi hotspot transfer** | ❌ INCOMPLETE | `netsh` hotspot starts but file HTTP server incomplete |
| **QR code transfer** | ❌ STUB | No implementation |
| **Monitoring dashboard (Flutter UI)** | ❌ MISSING | API exists; no Flutter page to display it yet |
| **Real GCash integration** | ❌ NOT IMPLEMENTED | Credentials are placeholders; all payments are simulated |

---

## 8. What Changed Since Last Analysis (git pull `7339bbb`)

1. **`lib/transfer_service.dart`** — Massively expanded (+875 lines). Windows Bluetooth (win_ble + win32 FFI), WiFi hotspot (netsh), QR transfer stubs all added.
2. **`lib/pages/storage_page.dart`** — Storage UI expanded (+272 lines). Bluetooth and WiFi transfer dialogs added. New `use_build_context_synchronously` issues introduced.
3. **`lib/pages/payment_page.dart`** — `onPaymentComplete` callback made async with print logic; static state (`colorMode`, `quality`) added. New `use_build_context_synchronously` introduced in callback.
4. **`backend/src/services/print.service.ts`** — `pdf-lib` PDF resizing added; `colorMode`/`quality` parameters threaded through to `printPdfFile`; paper tray selection added.
5. **`lib/pages/scanning_page.dart`** — Paper size chip, quality chip added.
6. **`lib/pages/photocopying_page.dart`** — Quality chip added; `colorMode`/`quality` forwarded to static state.
7. **`pubspec.yaml`** — New deps: `permission_handler`, `network_info_plus`, `flutter_blue_plus`, `wifi_iot`, `win_ble`, `win32`
8. **`backend/package.json`** — New deps: `pdf-lib`, `pdf-parse`
9. **`scripts/get_bt_devices.ps1`** — New PowerShell script for listing Bluetooth devices
10. **`.vscode/tasks.json`** — New VS Code build/run tasks added

---

## 9. Recommended Next Actions (Priority Order)

1. **FIX NOW:** `use_build_context_synchronously` in `storage_page.dart` (8 occurrences) and `payment_page.dart` (3 occurrences) — pre-capture `ScaffoldMessenger` and `Navigator` before each `await`
2. **FIX BEFORE DEFENSE:** `showDevelopmentTools = false` in `config.dart`
3. **FIX BEFORE DEFENSE:** Remove `debugPrint(...)` from `main.dart:8`
4. **FIX BEFORE DEFENSE:** Deprecated `flutter_blue_plus` API calls in `transfer_service.dart`
5. **NICE TO HAVE:** Monitoring dashboard Flutter page to display `/api/monitoring/stats`
6. **NICE TO HAVE:** Wire Flutter scanning UI to call `POST /api/scan/scan` (backend WIA integration exists, Flutter just never calls it)
7. **LONG TERM:** Real GCash API integration
8. **LONG TERM:** WiFi hotspot file server completion

---

## 10. Security Notes

- No API authentication — anyone on the local network can call the backend
- GCash webhook secret not validated (env var empty)
- PowerShell scan command uses unsanitized path — input should be validated
- Hardcoded WiFi password in source (`'WebDoc1234'`) — acceptable for thesis demo but should be configurable
- `showDevelopmentTools = true` exposes simulate/test buttons to end users

*This is a thesis demo system; security requirements are relaxed relative to a production deployment.*

---

*Analysis generated by Claude Sonnet 4.6 — April 2, 2026*
