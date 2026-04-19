# Repository Analysis — Current Code Status

Date analyzed: April 14, 2026
Repository: `docucenter_kiosk`
Previous analysis: March 17, 2026

---

## Purpose

This repository is a kiosk-oriented document service system built around a Flutter frontend and a Node.js/Express TypeScript backend.

The intended product is a self-service document kiosk that supports:

- Printing
- Scanning
- Photocopying
- Local storage of uploaded/scanned files
- File transfer via USB, Bluetooth, WiFi hotspot, and QR
- PayMongo QR Ph payment flow
- Backend-managed print dispatching via WIA/TWAIN/SumatraPDF
- QR verification through an optional Aiven/Postgres integration
- SQLite persistence for transactions and print jobs

The project has progressed significantly since the March 17 analysis. Several previously broken or simulated systems have been replaced with real implementations.

---

## What Changed Since March 17, 2026

### Fixed (previously broken or missing)

| Issue | Status |
|---|---|
| Payment contract mismatch (HTTP 201 vs 200, `status:"success"` vs `success:true`) | Fixed — backend now returns HTTP 200 + `success:true` + `amount` |
| `verifyWebhookSignature` throws on buffer length mismatch | Fixed — length guard added before `timingSafeEqual` |
| `getAllDocuments()` generating new random UUID on every call | Fixed — now uses filename-derived UUID from `.meta.json` sidecars |
| `qr_flutter` missing from pubspec.yaml | Fixed — now declared |
| Flutter payment UI shows placeholder icon instead of QR | Fixed — base64-decodes PayMongo `qr_image` and renders it |
| `UiConfig.showDevelopmentTools = true` visible in prod | Fixed — now `false` by default |
| `lib/services.dart` at 2702 lines (unmaintainable) | Fixed — reduced to 258 lines; content split into `lib/pages/` |

### New since March 17

- **Payment system replaced** — GCash entirely removed, replaced by PayMongo QR Ph (`/api/paymongo` routes, `paymongo.ts` service, `paymongo.service.ts` service, `qrph.routes.ts`)
- **SQLite persistence** — `backend/src/database.ts` using `better-sqlite3`; `transactions` and `print_jobs` tables with monitoring stats
- **Real scanner integration** — `flutter_twain_scanner` + Dynamsoft service at `http://127.0.0.1:18622`; `scan.service.ts` with full WIA + TWAIN PowerShell scanning
- **Real photocopy workflow** — `scan.service.ts` → `photocopyDocument()`: scan via WIA → convert JPG to PDF via `pdfkit` → print via `print.service.ts`
- **PDF manipulation** — `pdf-lib` for resizing PDFs to target paper size; `pdf-to-printer` for real printing
- **New page files** — `lib/pages/{payment_page,printing_page,scanning_page,photocopying_page,storage_page}.dart`
- **Docker support** — `Dockerfile`, `docker-compose.yml`
- **New Flutter dependencies** — `qr_flutter`, `flutter_twain_scanner`, `flutter_blue_plus`, `wifi_iot`, `win_ble`, `win32`, `ffi`, `image`, `pdf`, `paymongo_sdk`, `flutter_dotenv`, `cached_network_image`

---

## Repository Shape

### Top-level structure

- `lib/` — Flutter application source
- `lib/pages/` — New: dedicated page widgets extracted from `lib/services.dart`
- `backend/` — Node.js + Express + TypeScript backend
- `android/`, `windows/`, `linux/`, `web/` — Flutter platform scaffolding
- `Uploads/` — stored uploaded documents
- `PrintSimulation/` — committed sample/simulated output PDFs
- `tools/` — small utility scripts
- `Analyzation.md` — this file
- `backend/Dockerfile`, `backend/docker-compose.yml` — containerization support
- `backend/ngrok.exe` — tunneling binary (committed to repo)

### File sizes (lines)

| File | Lines |
|---|---|
| `lib/transfer_service.dart` | 1312 |
| `lib/pages/scanning_page.dart` | 1094 |
| `lib/pages/payment_page.dart` | 1080 |
| `lib/main.dart` | 880 |
| `lib/payment_service.dart` | 624 |
| `lib/pages/photocopying_page.dart` | 623 |
| `lib/pages/storage_page.dart` | 554 |
| `lib/about.dart` | 507 |
| `lib/pages/printing_page.dart` | 443 |
| `lib/services.dart` | 258 (down from ~2702) |
| `backend/src/services/scan.service.ts` | ~846 |
| `backend/src/services/print.service.ts` | ~428 |
| `backend/src/services/storage.service.ts` | ~389 |
| `backend/src/controllers/paymongo.ts` | ~393 |

---

## Frontend Analysis

### Architecture

The Flutter app uses a simple in-app page switching model with `_currentPage` state in `main.dart`.

Navigation pages: `home`, `services`, `about`, `payment`

The services page dispatches to:
- `PrintingInterface` (`lib/pages/printing_page.dart`)
- `ScanningInterface` (`lib/pages/scanning_page.dart`)
- `PhotocopyingInterface` (`lib/pages/photocopying_page.dart`)
- `StorageInterface` (`lib/pages/storage_page.dart`)
- `PAYMONGOPaymentPage` (`lib/pages/payment_page.dart`)

**Improvement**: The original `lib/services.dart` monolith (2702 lines) has been refactored into five focused page files. This is the most significant structural improvement since March 17.

---

### `lib/config.dart`

Status: clean and consistent

- `UiConfig.showDevelopmentTools = false` — dev buttons hidden by default
- `BackendConfig.serverUrl = 'http://localhost:5000'`
- API URL paths are centralized and no longer duplicated across service files
- Error/success message constants are defined and available

### `lib/payment_service.dart`

Status: aligned with backend contract

The payment client has been updated to match the PayMongo backend:

- `PaymentTransaction.fromJson()` parses `transactionId`, `referenceNumber`, `qrCode`, `expiresIn`, `amount`, `status` — all match backend response shape
- `PAYMONGOPaymentService.createPayment()` posts to `/api/paymongo/create-payment`; parses `success:true` + `data.*`
- `checkPaymentStatus()` polls `/api/paymongo/check-payment/:id`; maps `status`, `amount`, `referenceNumber`, `completedAt`

The previous contract mismatch is fully resolved.

### `lib/pages/payment_page.dart`

Status: functionally complete with real QR rendering

Key improvements over March 17:

- **QR rendering**: `_decodeQRCodeImage()` attempts to decode `data:image/...;base64,...` from the backend `qr_image` payload. If successful, renders via `Image.memory()`; falls back to `QrImageView(data: qrCode)` from `qr_flutter` for plain string codes
- **Print flow**: On payment success, calls `PrintService.printScannedImages()` or `PrintService.printFromStorage()` depending on the type of queued files, then `PrintService.printReceipt()`
- **Pending receipt**: `PAYMONGOPaymentPageState.pendingReceiptContent` allows the photocopying/scanning flow to queue a receipt that is printed after payment succeeds
- Dev tools are hidden (`UiConfig.showDevelopmentTools = false`)

Remaining concern:

- `_transaction!.qrCode` is set from the backend `qrCode` field, which comes from PayMongo's `qr_image`. If the real PayMongo API returns a data-URI it renders correctly. If PayMongo is unavailable and the app falls into demo mode, the demo transaction uses a placeholder string `'code_8T7GbSP9ztU2tQUJ5WQyJ5Cn'` which renders as a `QrImageView` — this is a valid fallback.

### `lib/pages/printing_page.dart`

Status: file picker is now real and wired through to payment

Key improvements:

- `_pickAndUploadFiles()` uses `file_selector`, reads file bytes, calls `StorageService.uploadFile()`, and adds returned `StorageDocument` to `_uploadedFiles`
- Cost calculation uses actual page counts from uploaded documents
- On "Proceed to Payment", sets `PAYMONGOPaymentPageState.printFiles`, `paperSize`, `colorMode`, `quality`, then navigates to `payment`

The "choose file then pay to print" flow is now end-to-end wired.

### `lib/pages/scanning_page.dart`

Status: uses real Dynamsoft/TWAIN scanner, but with hardcoded license key

New compared to March 17:

- Uses `flutter_twain_scanner` package and `DynamsoftService` pointing to `http://127.0.0.1:18622`
- Has a real Dynamsoft license key hardcoded in source at line 49
- Scanned pages come back as actual `Uint8List` image data, not placeholder names
- On scan start, calls the backend `/api/scan/` endpoint to acquire from WIA or TWAIN hardware
- ADF status check reads from backend `/api/scan/adf-status`

**Security concern**: The Dynamsoft license key is hardcoded in source. It should be in a `.env` or assets file excluded from git.

**UI concern**: The green "Scanner Connected — ADF Ready" badge is hardcoded in the settings widget and is always shown regardless of real hardware state.

### `lib/pages/photocopying_page.dart`

Status: uses Dynamsoft for scanning, scan-to-print flow wired to backend

- Uses same `DynamsoftService` pattern as scanning page
- Same hardcoded Dynamsoft license key (line 41)
- On copy start: calls backend `/api/scan/photocopy` with options; backend's `photocopyDocument()` handles the full scan → PDF → print cycle
- Cost: ₱2.00 per copy (color), ₱1.00 per copy (B/W)
- Payment flow: sets `PAYMONGOPaymentPageState.pendingAmount` and navigates to payment page; post-payment the photocopy job is dispatched

### `lib/pages/storage_page.dart`

Status: reasonable and mostly functional

- Upload, list, download, delete, select for print
- USB export via local file write
- Bluetooth and WiFi transfers still reference `transfer_service.dart`

### `lib/transfer_service.dart`

Status: grown to 1312 lines — largest file in repo

This file has ballooned with Bluetooth (`flutter_blue_plus`, `win_ble`) and WiFi (`wifi_iot`) implementation attempts. The architecture is present but actual transfer behaviors remain largely facade-level. USB export remains the only meaningfully real transfer path.

---

## Backend Analysis

### Architecture

Backend is an Express application on port 5000 with the following route groups:

| Route | Source |
|---|---|
| `POST/GET /api/paymongo/*` | `routes/paymongo.ts` → `controllers/paymongo.ts` |
| `POST /api/payment/qrph/create` | `routes/qrph.routes.ts` (secondary QR Ph generator) |
| `GET /api/payment/qrph/status/:id` | `routes/qrph.routes.ts` |
| `POST /webhook/paymongo` | `routes/qrph.routes.ts` |
| `POST/GET /api/print/*` | `routes/print.ts` |
| `POST/GET /api/storage/*` | `routes/storage.ts` |
| `GET /api/monitoring/*` | `routes/monitoring.ts` |
| `POST/GET /api/scan/*` | `routes/scan.ts` |
| `GET /api/qr/*` | `routes/qr.ts` (legacy QR verification) |
| `GET /health` | inline |
| `GET /api/status` | inline |

### `backend/src/database.ts`

Status: real SQLite persistence — a significant upgrade from the March 17 in-memory approach

- `better-sqlite3` with synchronous API; WAL journal mode; foreign keys on
- `transactions` table: `id`, `reference_number`, `amount`, `status`, `service_type`, `created_at`, `completed_at`
- `print_jobs` table: `id`, `transaction_id`, `filenames` (JSON array), `paper_size`, `copies`, `status`, `method`, `simulated`
- `getMonitoringStats()`, `getRecentJobs()`, `getRecentTransactions()` for monitoring dashboard
- DB file written to `docucenter.db` at the project root

**Remaining gap**: Active payment sessions are tracked in `PayMongoService`'s in-memory `Map<string, PaymentTransaction>`. If the server restarts while a payment is in flight, `checkPaymentStatus()` returns 404 even though the SQLite row exists. There is no reconciliation path from DB back to the in-memory map on startup.

### Two PayMongo service files

There are now two separate PayMongo service classes:

- `backend/src/services/paymongo.ts` — used by `controllers/paymongo.ts`. Calls `/qrph/generate`, holds in-memory transaction map, exposes simulate methods. This is the primary payment lifecycle service.
- `backend/src/services/paymongo.service.ts` — used by `routes/qrph.routes.ts` only. Lower-level direct API wrapper: `createQRPhSource()`, `getSourceStatus()`, `createCharge()`, `validateWebhookSignature()`.

Both export a singleton named `paymongoService`. They are separate instances and do not share state. This naming collision is a maintainability hazard.

Note: `qrph.routes.ts`'s `createQRPhSource(0, finalDescription)` hardcodes `amount = 0`. This route is not the primary payment creation path used by Flutter.

### `backend/src/services/scan.service.ts`

Status: real WIA/TWAIN integration — new capability

- `scanDocument()` — tries TWAIN first (PowerShell COM objects), then falls back to WIA
- WIA path: PowerShell enumerates WIA devices, preferring "Brother MFC", selects scanner item 2 (ADF), configures WIA properties 3093–3098, transfers and saves as JPG
- TWAIN path: tries multiple COM object names (`TWAIN.TWAINCtrl.1`, `BrTwainDS.BrTwainDS.1`, etc.), configures feeder mode and resolution
- `checkADFStatus()` — checks WIA `FEEDER_READY` (property 3095) and `DOCUMENT_HANDLING_STATUS` (3098)
- `photocopyDocument()` — scans with WIA → converts JPG to PDF with `pdfkit` → calls `printPdfFile()` N times for copies

The Brother MFC-J2730DW is still hardcoded throughout this file (device selection logic searches for "Brother" AND "MFC" in device name).

### `backend/src/services/print.service.ts`

Status: upgraded with `pdf-to-printer` and PDF resizing

- `pdf-to-printer` is now in `package.json` — the previously missing `printer` module concern is resolved
- PDF resizing via `pdf-lib`: scales content to fit A4/Folio/Letter in points
- SumatraPDF-based printing with paper size flags via `pdf-to-printer`
- `printPdfFile()` is exported and called by `scan.service.ts` for photocopy printing
- `config.print.printerName` defaults to `''` (system default); configurable via `PRINTER_NAME` env var

### `backend/src/utils/helpers.ts`

Status: webhook signature bug fixed

`verifyWebhookSignature()` now guards buffer length before `timingSafeEqual`:
```ts
if (a.length !== b.length) return false;
return crypto.timingSafeEqual(a, b);
```

### `backend/src/services/storage.service.ts`

Status: UUID stability fixed

`getAllDocuments()` now derives `fileUuid` from `path.basename(filename, ext)` — the on-disk UUID-named file — rather than generating a new random UUID. IDs are stable across calls as long as the file exists.

### `backend/src/utils/config.ts`

Status: cleaned up; printer name now configurable via env

- `PAYMONGO_SECRET_KEY` and `PAYMONGO_WEBHOOK_SECRET` validated in production
- `config.print.printerName` defaults to `''` (use system default)
- `config.print.simulationEnabled` defaults to `true` — files are copied to `PrintSimulation/`
- Security headers and CORS still opt-in via env flags; off by default

---

## Integration Analysis

### Payment flow — now substantially working

| Point | Status |
|---|---|
| HTTP status on create | ✅ Both expect/return 200 |
| Response shape `success:true` | ✅ Backend returns top-level `success:true` |
| `data.transactionId` | ✅ Present |
| `data.referenceNumber` | ✅ Present |
| `data.qrCode` | ✅ Backend returns PayMongo's `qr_image` |
| `data.expiresIn` | ✅ Backend returns `config.payment.timeoutSeconds` |
| `data.amount` | ✅ Now present in create-payment response |
| QR rendering in Flutter | ✅ Renders base64 image; falls back to `QrImageView` |
| SQLite persistence | ✅ `insertTransaction()` called on create |

**Remaining gap**: The backend's `checkPaymentStatus()` looks up only the in-memory `Map`. If the server restarts between creation and status check, lookup returns 404 even though SQLite has the record.

### PayMongo webhook — incomplete

The `webhook/paymongo` handler in `qrph.routes.ts` processes `source.chargeable` (creates a charge) but the `payment.paid` / `payment.succeeded` branch only logs the event with a `// TODO` comment. There is no code to update the in-memory transaction map or the SQLite record when a real payment is confirmed by PayMongo. For a real payment (not simulated), the kiosk will never receive SUCCESS status via webhook.

### Scanning / Photocopying — real but fragile

- Flutter scanning page connects to Dynamsoft service at `127.0.0.1:18622`
- Backend scan endpoints drive WIA/TWAIN PowerShell
- Photocopy path: scan → PDF → print is end-to-end real on the target machine
- Full stack assumes: (a) Brother MFC-J2730DW is connected, (b) Dynamsoft service is running locally, (c) Windows platform

---

## Security Assessment

### Improvements since March 17

- ✅ `timingSafeEqual` length guard fixed
- ✅ Webhook signature in `paymongo.service.ts` uses standard HMAC comparison (no `timingSafeEqual`, no throw risk)

### Remaining concerns

#### 1. Dynamsoft license key hardcoded in source

Both `lib/pages/scanning_page.dart:49` and `lib/pages/photocopying_page.dart:41` contain the same Dynamsoft license key as a string literal committed to git.

#### 2. Webhook `payment.paid` is a TODO

Real PayMongo webhook delivery will not trigger success status. Only the "Simulate Success" dev button correctly sets status to SUCCESS.

#### 3. Security feature defaults off

`ENABLE_CORS` and `ENABLE_HELMET` default to `false`. A fresh deployment without `.env` runs without CORS restrictions or Helmet headers.

#### 4. Traversal protection still prefix-based

File access checks use `startsWith(uploadsDir)` pattern checks rather than normalized path validation.

#### 5. `ngrok.exe` committed to repository

`backend/ngrok.exe` and `backend/ngrok.zip` are large binary artifacts that do not belong in source control.

#### 6. `PAYMONGO_SECRET_KEY` only validated in production

In development mode, the server starts without `PAYMONGO_SECRET_KEY`. `PayMongoService` constructor will throw at runtime when the first real payment is attempted.

---

## Build, Tooling, and Quality Status

### Backend build

TypeScript compiles successfully; no structural issues were observed during code review.

### Backend linting

Status: still not operational — no `.eslintrc*` file found in `backend/`

`npm run lint` fails. `@typescript-eslint` devDependencies exist but there is no config file to wire them up.

### Backend tests

Status: not implemented

`jest` and `ts-jest` are in devDependencies. No test files were found. Infrastructure is declared but empty.

### Flutter dependencies

| Package | Status |
|---|---|
| `qr_flutter: ^4.1.0` | ✅ Now declared and used |
| `flutter_twain_scanner: ^2.0.1` | ✅ Real scanner integration |
| `flutter_blue_plus: ^1.6.0` | Partial — in transfer_service |
| `wifi_iot: ^0.3.19+2` | Partial — in transfer_service |
| `win_ble: ^1.1.1` | Partial — in transfer_service |
| `win32: ^5.0.0`, `ffi: ^2.2.0` | Present |
| `image: ^4.8.0` | Used in scan/photocopy pages |
| `pdf: ^3.12.0` | Used for PDF generation |
| `paymongo_sdk: ^1.0.0` | Declared but custom HTTP client used instead |
| `flutter_dotenv: ^5.1.0` | Declared but Dynamsoft key still hardcoded |
| `cached_network_image: ^3.3.0` | Present |

Platform support in `pubspec.yaml`: "Android, Windows only."

---

## Repository Hygiene

### Committed artifacts

- `Uploads/` — runtime document storage committed to repo
- `PrintSimulation/` — committed sample/simulated output PDFs
- `backend/Brother MFC-J2730DW Printer` — PDF-like binary with no extension; purpose undocumented
- `backend/ngrok.exe` and `backend/ngrok.zip` — tunneling binaries in source control

---

## What Currently Works Best

- **Payment creation + QR display** — PayMongo creates a real QR code; Flutter renders it; polling checks status; SQLite records the transaction
- **Printing from storage** — upload file → `Uploads/` → select → pay → `printFilesFromStorage()` → SumatraPDF/pdf-to-printer
- **File upload/list/download/delete** — storage subsystem is solid; stable IDs; `.meta.json` sidecars preserve original names
- **Scanning** — WIA/TWAIN PowerShell on Windows with Brother MFC; scan result uploadable to storage
- **Photocopying** — scan → PDF → print cycle is wired end-to-end in `photocopyDocument()`
- **Kiosk UI** — coherent presentation with real flows; suitable for thesis defense

## What Is Still Simulated or Incomplete

- **Real-time payment confirmation from PayMongo webhook** — `payment.paid` handler is a `// TODO`; only simulate buttons work
- **Bluetooth transfer** — partially implemented; facade-level actual transfer
- **WiFi hotspot transfer** — same
- **QR transfer** — same
- **Stable payment state after server restart** — in-memory map lost; SQLite has record but status check only reads memory
- **Dynamsoft service startup** — must be started separately; no startup script
- **ESLint / test suite** — not configured

---

## Primary Risks By Severity

### Critical

- **Dynamsoft license key hardcoded in source** — security exposure; scanning fails if key expires or service is not running
- **Webhook `payment.paid` event does nothing** — real PayMongo payments will never be automatically confirmed; kiosk will not advance to SUCCESS for a real user

### High

- **Two `paymongoService` singletons** — `services/paymongo.ts` and `services/paymongo.service.ts` both export `paymongoService`; different routes use different instances; easy to misuse
- **Active payment state lost on server restart** — in-memory map only; no SQLite reconciliation on startup
- **Scanner/copier hardcoded to Brother MFC-J2730DW** — will not work on different hardware
- **`qrph.routes.ts` creates QR with `amount=0`** — secondary route does not pass the real payment amount

### Medium

- **Dynamsoft service at `127.0.0.1:18622` must be started separately** — no startup script; silently fails if not running
- **ESLint config missing** — `npm run lint` fails
- **`transfer_service.dart` at 1312 lines** — largest Flutter file; maintenance hotspot
- **No automated tests** — no meaningful test files despite jest in devDependencies
- **`ngrok.exe` / `ngrok.zip` in repo** — binary artifacts in source control
- **Security feature defaults off** — CORS and Helmet require explicit env vars to enable

### Low

- **Root `README.md`** — still the default Flutter template
- **`backend/Brother MFC-J2730DW Printer`** — undocumented binary file with no extension
- **`paymongo_sdk` Flutter package declared but unused** — custom HTTP client used instead
- **Dependency list has potentially unused packages** — `provider`, `permission_handler`, `path`

---

## Recommended Priorities

### Priority 1: Fix the PayMongo webhook flow

The `payment.paid` / `payment.succeeded` event handler in `qrph.routes.ts` has a `// TODO` placeholder. For real payment confirmation:

- Map PayMongo `source.id` or `payment.id` back to the internal `transactionId`
- Update the in-memory `Map` in `paymongoService` to `SUCCESS`
- Call `updateTransactionStatus(transactionId, 'SUCCESS', ...)` on the SQLite layer

Without this, a real user scanning the QR code will pay but the kiosk will never show a success state.

### Priority 2: Move Dynamsoft license key out of source

Replace the hardcoded key in `scanning_page.dart` and `photocopying_page.dart` with a value from `flutter_dotenv` (which is already declared in `pubspec.yaml`). Add the `.env` file to `.gitignore`.

### Priority 3: Reconcile the two PayMongo service files

Either merge `paymongo.service.ts` (direct QR Ph API wrapper) into `paymongo.ts` (transaction lifecycle service), or document clearly which routes use which instance and why. Eliminate the naming collision of two `paymongoService` singletons.

### Priority 4: Add restart-resilient status lookup

In `checkPaymentStatus()` in `paymongo.ts`, add a fallback: if the transaction ID is not found in the in-memory map, query SQLite and reconstruct a minimal `PaymentTransaction` from the `transactions` row.

### Priority 5: Add ESLint and smoke tests

- Add `.eslintrc.json` wiring up `@typescript-eslint`
- Add at minimum: create-payment, check-payment, and storage upload/list smoke tests

---

## Current Verdict

This repository has matured from a demo prototype toward a more functional system since March 17. The payment contract is fixed, QR code rendering works, SQLite persistence is real, scanning and photocopying are wired to actual hardware, and the frontend has been properly decomposed into focused page files.

The most important outstanding issue is that real PayMongo payments will never be automatically confirmed — the webhook `payment.paid` handler is still a TODO. Every other success path relies on the "Simulate Success" dev button. This is acceptable for a supervised thesis demo but represents a real integration gap.

In short:

- **Good demo foundation**: yes — improved significantly
- **Real payment integration**: partially — creation works, confirmation via webhook does not
- **Real hardware integration**: yes — scanning/printing are wired to Brother MFC-J2730DW
- **Production-ready**: no — webhook gap, hardcoded license key, no tests, security defaults off
