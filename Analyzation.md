# Repository Analysis - Current Code Status

Date analyzed: March 17, 2026
Repository: `docucenter_kiosk`

## Purpose

This repository is a kiosk-oriented document service system built around a Flutter frontend and a Node.js/Express TypeScript backend.

The intended product is a self-service document kiosk that supports:

- Printing
- Scanning
- Photocopying
- Local storage of uploaded/scanned files
- File transfer via USB, Bluetooth, WiFi hotspot, and QR
- PAYMONGO payment flow
- Backend-managed print dispatching
- QR verification through an optional Aiven/Postgres integration

The project is partially real and partially simulated. Some subsystems are structurally present and usable, while others are still demo-mode, mocked, or only represented at the UI level.

## Analysis Scope

This analysis is based on the repository contents present during review, plus local verification steps run against the codebase.

Reviewed areas:

- Flutter app structure and UI flow
- Backend architecture and API surface
- Frontend/backend integration
- Storage and printing paths
- Payment flow and contract compatibility
- Documentation accuracy
- Tooling, buildability, and test coverage
- Security and operational concerns

Verification performed:

- Inspected all primary source directories
- Built backend with `npm run build`
- Attempted backend linting with `npm run lint`
- Attempted Flutter analysis, but Flutter tooling was not available in this environment

## High-Level Status

### Overall assessment

Current state: prototype / thesis demo with some real infrastructure

This repository is not a blank scaffold. It has meaningful implementation work in several areas:

- The Flutter app has a complete visible UI for the kiosk experience
- The backend exposes working route groups for storage, print, payment, and QR verification
- File upload and retrieval flow is substantially implemented
- Backend TypeScript compiles successfully

However, it is also not production-ready in its current form.

The largest blockers are:

- Broken frontend/backend payment contract
- Demo-mode fallback masking real integration failures
- Several user-facing features are simulated rather than implemented
- Documentation claims exceed actual behavior
- Weak file-path safety checks
- Missing automated tests
- Missing lint configuration despite lint scripts

## Repository Shape

### Top-level structure

- `lib/`: Flutter application source
- `backend/`: Node.js + Express + TypeScript backend
- `android/`, `windows/`, `linux/`, `web/`: Flutter platform scaffolding
- `Uploads/`: stored uploaded documents
- `PrintSimulation/`: committed sample/simulated output PDFs
- `tools/`: small utility scripts
- `README.md`: still the default Flutter template
- `INTEGRATION_COMPLETE.md`, `INTEGRATION_SETUP.md`, `FLUTTER_INTEGRATION_GUIDE.md`: integration-focused docs

### Quick repo stats

- Total tracked files discovered: 104
- Main source and implementation focus is concentrated in `lib/` and `backend/src/`
- Primary source file types:
  - TypeScript: 19
  - Dart: 7
  - Markdown: 8
  - PDF: 6

### Largest implementation hotspots

- `lib/services.dart`: ~2702 lines
- `lib/main.dart`: ~843 lines
- `lib/about.dart`: ~489 lines
- `lib/payment_service.dart`: ~475 lines
- `backend/src/services/print.service.ts`: ~428 lines
- `lib/transfer_service.dart`: ~398 lines
- `backend/src/services/storage.service.ts`: ~389 lines
- `backend/src/controllers/PAYMONGO.ts`: ~326 lines

Interpretation:

- Flutter UI logic is heavily concentrated in a few very large files
- Backend is somewhat better separated, but still mixes concerns in several service modules
- `lib/services.dart` is the biggest maintenance hotspot in the repository

## Frontend Analysis

## Frontend architecture

The Flutter app uses a simple in-app page switching model rather than a router.

Primary entrypoint:

- `lib/main.dart`

Important behavior:

- App starts with `MainApp`
- Navigation state is stored in `_currentPage`
- Header buttons switch among `home`, `services`, `about`
- A hidden route-like state also handles `payment`

This is workable for a kiosk prototype, but it is not modular enough for a growing application.

### Frontend strengths

- The app has a coherent visual flow
- It is already shaped like a kiosk UI rather than a dev-only prototype screen
- It includes separate experiences for home, services, about, storage, and payment
- The service UX is understandable for a demo or thesis presentation

### Frontend weaknesses

- State is managed manually and globally across large widgets
- Navigation is string-based and brittle
- Business logic, API usage, and presentation are tightly coupled
- Several workflows use static mutable fields to move data across screens
- The main services file is too large for safe long-term maintenance

## Frontend module-by-module status

### `lib/main.dart`

Status: working UI shell

What it does:

- Creates the app shell
- Renders header, home page, footer
- Switches page content using local state

Observations:

- Easy to understand
- Acceptable for a thesis demo
- Not ideal for scalable navigation or feature isolation

### `lib/services.dart`

Status: central application behavior file, but heavily overloaded

This file currently contains:

- Services page
- Printing interface
- Scanning interface
- Photocopying interface
- Payment interface
- Storage interface
- PAYMONGO payment page wrapper

This is the main frontend implementation file and the biggest design bottleneck in the repo.

#### Printing flow

Status: partially implemented

What exists:

- UI for print options
- Cost calculation
- Integration path to payment page
- Ability to print from selected backend-stored files

What is incomplete:

- The "Choose File" button does not open a real picker
- It only adds a placeholder filename `sample_file.pdf`
- Local file uploads for printing are not actually wired through the payment-to-print path

Important behavior:

- Print cost is calculated from selected options
- Stored files can be selected from system storage
- Successful payment eventually attempts `PrintService.printFromStorage(...)`

Assessment:

- Printing from backend storage is the closest thing to a real end-to-end flow in the app
- Direct "upload then print" from the printing screen is still incomplete

#### Scanning flow

Status: mostly simulated

What exists:

- UI for scan settings
- UI for an active scanning session
- Page count tracking
- Save-to-storage action
- Printing of a scan receipt

What is simulated:

- Scanning is represented by adding placeholder page names into `_scannedPages`
- Saved scanned output is a generated byte array, not a real scan-derived PDF
- Code comments explicitly say this is mock behavior

Assessment:

- The scanning UX is present
- The actual scanning subsystem is not
- This is demo-grade behavior, not device-integrated scanning

#### Photocopying flow

Status: largely UI-driven, not truly modeled

What exists:

- Settings for copies, color mode, and paper size
- Cost computation
- Payment handoff

Issues:

- `_startPhotocopying()` calls `_printCopyingReceipt()` before the payment flow completes
- This contradicts the comment saying receipt printing should happen after payment succeeds
- There is no real photocopying hardware/control integration

Assessment:

- This is best described as a payment-and-receipt simulation for photocopying, not a real copy workflow

#### Payment interface

Status: visually complete, operationally broken against current backend contract

What exists:

- Payment initialization
- Countdown timer
- Polling manager
- Success/failure/timeout states
- Cancel payment action
- Development-only simulation buttons
- Receipt printing after success

Major issue:

- The frontend payment client and backend response format do not match
- Because of this, the app can fall back into demo mode even when the backend is available

Detailed mismatch:

- Flutter expects create-payment HTTP status `200`
- Backend returns `201`
- Flutter expects a top-level `success` boolean
- Backend returns `status: "success"` for create-payment instead
- Flutter attempts to parse `amount` from the transaction payload
- Backend create-payment response does not include `amount`

Practical result:

- Real transaction initialization is broken
- Demo-mode fallback can hide the integration problem from the operator

Additional issue:

- The payment UI shows a QR placeholder container with an icon and reference number
- It does not render the actual QR payload returned by the backend

Assessment:

- The payment screen looks complete for presentation purposes
- The real integration is not complete

#### Storage interface

Status: partially real, with a mix of functioning and simulated behaviors

What works:

- Listing stored documents
- Deleting stored documents
- Selecting stored documents for print
- Uploading files from local filesystem via `file_selector`
- Exporting files to USB using a real local folder write path in the transfer service

What is simulated or weak:

- Bluetooth flow is simulated
- WiFi hotspot flow is simulated
- QR transfer flow is simulated
- Refresh is just a UI-triggered callback with a short delay
- Document identity is unstable because backend regenerates IDs on listing

Assessment:

- Storage is one of the stronger subsystems, but not yet robust

### `lib/payment_service.dart`

Status: useful service layer, but out of sync with backend contract

Good aspects:

- Encapsulates payment API operations
- Defines payment models
- Includes polling manager
- Separates print-related API calls from UI widgets

Problems:

- Hardcoded backend URLs
- Create-payment parser does not match backend response format
- Success detection logic is not aligned with backend create-payment response
- Health, print, and payment URLs are all directly embedded

Assessment:

- Good direction structurally
- Needs contract alignment and configuration cleanup

### `lib/storage_service.dart`

Status: reasonably usable client wrapper

Good aspects:

- Supports upload, list, get, download, delete, and stats
- Maps backend JSON into a Flutter model cleanly

Weaknesses:

- Hardcoded backend URL
- No strong retry / timeout / error classification
- Document identity instability originates from backend behavior

### `lib/transfer_service.dart`

Status: one partially real service plus several simulated services

Implemented with meaningful behavior:

- USB export writes downloaded document bytes to an application documents directory folder

Simulated or TODO-based:

- Bluetooth initialization, discovery, connection, and transfer
- WiFi hotspot setup and transfer
- QR transfer session behavior

Assessment:

- The architecture exists, but only USB export is meaningfully real
- The rest is largely a façade for future implementation

### `lib/config.dart`

Status: partially useful, partially unused

What it contains:

- Backend URL definitions
- payment timing constants
- UI flags
- error/success messages

Issue:

- Much of this is not actually used consistently
- `UiConfig.showDevelopmentTools` is used
- Backend URL constants are duplicated elsewhere instead of centralized here

Assessment:

- Good intention, incomplete adoption

### `lib/about.dart`

Status: complete informational page

Notes:

- This is one of the more complete and self-consistent sections
- Mainly static content
- No meaningful technical risk beyond general content maintenance

## Backend Analysis

## Backend architecture

The backend is an Express application with route groups and service modules.

Primary entrypoint:

- `backend/src/index.ts`

Route groups:

- `/api/PAYMONGO`
- `/api/qr`
- `/api/print`
- `/api/storage`
- `/health`
- `/api/status`

### Backend strengths

- Reasonable separation between routes, controllers, services, and utilities
- Compiles successfully with TypeScript
- Clear route organization
- Logging and middleware structure already present

### Backend weaknesses

- Some configuration defaults disable features that docs say are implemented
- Core payment service is still in-memory and simulated
- Printing service is highly environment-specific and risky
- Storage metadata persistence is incomplete
- No effective automated tests

## Backend module-by-module status

### `backend/src/index.ts`

Status: functional app bootstrap

Good aspects:

- Validates config
- Registers middleware and route groups
- Includes graceful shutdown hooks
- Includes health/status endpoints

Important configuration behavior:

- Helmet is only enabled if `ENABLE_HELMET=true`
- CORS whitelist mode is only enabled if `ENABLE_CORS=true`
- If CORS is disabled, the custom `corsMiddleware` becomes a no-op and effectively does nothing

Assessment:

- Server bootstrap is structurally sound
- Security defaults do not match documentation claims

### `backend/src/utils/config.ts`

Status: central config object, but with risky defaults and feature toggles that are misleading in context

Good aspects:

- Collects backend env configuration in one place
- Separates payment, PAYMONGO, logging, and optional Aiven config

Problems:

- Security features are opt-in through env flags
- Docs present them as implemented by default
- Production validation only checks required PAYMONGO environment variables when `NODE_ENV=production`

Assessment:

- Useful config module
- Needs clearer defaults and documentation alignment

### `backend/src/middleware/index.ts`

Status: decent baseline middleware collection

Contains:

- rate limiting
- security header middleware
- request logging
- error handler
- not-found handler

Notable concern:

- `verifyWebhookSignature()` elsewhere uses `timingSafeEqual` without guarding against unequal buffer lengths, which can throw rather than safely return false

Assessment:

- Middleware shape is solid
- Some security edge cases remain

### `backend/src/services/PAYMONGO.ts`

Status: simulated payment engine with real structure but no real payment persistence

What exists:

- In-memory transaction map
- Create/check/cancel payment operations
- Webhook processing
- Simulated success/failure methods
- Preconfigured Axios instance for a future real API integration

What is not real:

- No live PAYMONGO API call is currently used
- No database persistence for transactions
- Process restart wipes all payment state

Assessment:

- This is a mock payment backend with real architectural intent
- It is not production payment infrastructure

### `backend/src/controllers/PAYMONGO.ts`

Status: full controller layer with one major contract mismatch

Good aspects:

- Covers create/check/cancel/webhook/health/simulate success/simulate failure
- Uses logger
- Validates request presence for required identifiers

Major problem:

- Create-payment response format differs from what the Flutter client expects

Other notes:

- Dev simulation endpoint tries to trigger printing from storage
- It conditionally returns `simulatedPaths`, but current print service implementation never actually populates them

Assessment:

- Controller coverage is good
- API contract consistency is poor

### `backend/src/routes/PAYMONGO.ts`

Status: straightforward and functional

No major architectural issues beyond inheriting controller behavior.

### `backend/src/routes/storage.ts`

Status: meaningful implementation exists

What works:

- Upload
- List documents
- Get document metadata
- Download
- Delete
- Stats

Good aspects:

- Uses `multer.memoryStorage()`
- Restricts uploads to an allowlist of MIME types
- Applies a 100 MB file-size limit

Risks:

- File safety checks rely on path prefix checks
- No persistent metadata store for original names, stable IDs, or richer attributes

Assessment:

- One of the stronger subsystems in the repo

### `backend/src/services/storage.service.ts`

Status: functional storage layer with important data-model limitations

What it does well:

- Creates `Uploads/` automatically
- Saves files to disk
- Lists files from disk
- Supports file retrieval and deletion
- Estimates PDF pages heuristically

Major design limitations:

- Metadata is reconstructed from disk each time instead of persisted
- Each list operation assigns a new random UUID to each document
- `originalName` is preserved at upload time but lost during future listings
- MIME type becomes generic on relisting

Security concern:

- File path validation uses `startsWith(uploadsDir)` after `path.join`
- This is not a sufficiently robust directory traversal defense

Assessment:

- Real enough for a prototype
- Not reliable enough for stable document identity or hardened deployment

### `backend/src/services/print.service.ts`

Status: ambitious but fragile printing implementation

What it tries to do:

- Print raw text
- Print receipts
- Print document content
- Print stored files
- Enumerate available printers via optional native printer module

Design characteristics:

- Multiple Windows fallback attempts
- Writes to `C:\PrintQueue`
- Hardcoded printer name `Brother MFC-J2730DW Printer`
- Attempts PowerShell WMI printing, `rundll32`, `print.exe`, and even spooler directory copy
- Linux/macOS use `lp`

Major concerns:

- Extremely environment-specific
- Hardcoded kiosk printer assumptions
- Some fallback behavior treats "queued to folder" as success even without confirmed printing
- `config.print.simulationEnabled` exists but is not meaningfully used in current print logic
- `simulatedPaths` are typed and referenced but not actually populated by the current implementation

Assessment:

- This is the most operationally risky backend module
- It may be workable on one exact kiosk setup, but it is not generalized or robust

### `backend/src/services/pdf-converter.service.ts`

Status: isolated utility, currently unused in the main backend flow

What it can do:

- Detect LibreOffice
- Convert office-style documents to PDF
- Copy PDFs, text, or images into output paths

Important note:

- No main route or service currently appears to integrate this conversion path into the storage-to-print workflow

Assessment:

- Potentially useful future infrastructure
- Currently not part of the actual application path

### `backend/src/services/aiven.ts`

Status: optional, lightweight integration

Behavior:

- If DB config is absent, falls back to a development-friendly mock verifier
- If DB config is present, checks `qr_verifications` table in Postgres

Assessment:

- Simple and understandable
- Good for a thesis demo
- Not deeply integrated elsewhere

### `backend/src/controllers/qr.ts` and `backend/src/routes/qr.ts`

Status: minimal but coherent

Purpose:

- Verifies QR data through the Aiven service
- Offers a health endpoint

Assessment:

- Small and acceptable
- Low complexity

## Integration Analysis

## Frontend/backend contract status

This is currently the most important functional problem in the repository.

### Create-payment mismatch

Frontend expects:

- HTTP `200`
- top-level `success: true`
- `data.amount` available for parsing

Backend returns:

- HTTP `201`
- top-level `status: "success"`
- no `amount` in create-payment response payload

Consequence:

- Flutter payment initialization does not accept the backend response as valid
- The app falls back to demo mode with placeholder transaction data

### QR mismatch

Backend provides:

- base64-encoded QR payload content

Frontend behavior:

- does not render real QR graphics
- displays a placeholder icon box instead

Consequence:

- Even if the payment create API were fixed, the kiosk would still not provide an actually scannable QR code in the current UI

### Print simulation mismatch

Docs/UI imply:

- simulated print files may be copied to `PrintSimulation`
- `simulatedPaths` may be returned

Current code reality:

- `simulatedPaths` are referenced in response handling
- no current print path actually sets them
- `PRINT_SIMULATION_ENABLED` exists in config but is not driving visible behavior

Consequence:

- The simulation narrative in the codebase is incomplete and inconsistent

## Documentation Status

## Root documentation

Root `README.md` status: outdated

It is still the default Flutter starter README and does not describe the actual kiosk system.

Impact:

- New contributors will not understand the real project from the repo root
- The current top-level documentation undersells and misrepresents the repository

## Backend documentation

Backend docs are much more extensive, but they are not fully trustworthy.

Key issues:

- They refer to `.env.example`, but that file is not present in `backend/`
- They describe the backend as production-ready
- They describe security features as implemented, even though some are disabled by default
- They describe integration details that do not fully match the current Flutter app

Examples of drift:

- Docs mention `qr_flutter`, but `pubspec.yaml` does not include it
- Docs describe success response conventions more consistently than the code actually follows
- Docs suggest a more complete integration state than the current frontend achieves

Assessment:

- Documentation effort is strong
- Documentation accuracy is weak

## Security Assessment

## Positive aspects

- Route-level separation is decent
- Rate limiting middleware exists
- Security headers middleware exists
- Basic input validation exists for payment amounts
- MIME-type filtering exists for upload
- Webhook signature verification exists conceptually

## Concerns

### 1. Security feature defaults

Problem:

- Helmet and CORS whitelist behavior are disabled unless env flags are explicitly set

Impact:

- Real deployments could run without the protections the docs imply are present

### 2. Traversal protection

Problem:

- File access checks use `startsWith(uploadsDir)` on joined paths

Impact:

- This is weaker than a normalized/relative-path validation approach

### 3. Webhook signature robustness

Problem:

- `crypto.timingSafeEqual()` will throw if the two buffers differ in length

Impact:

- Invalid signatures may cause an exception path instead of a clean false result

### 4. Printing implementation risk

Problem:

- Writing into OS print/spool paths and using shell-based print commands is sensitive and environment-specific

Impact:

- Operational fragility
- Potential security and permission complications

### 5. Dependency health

Observed during install:

- 6 high-severity vulnerabilities were reported in the backend dependency tree

Notable package concern:

- `multer` 1.x is deprecated and explicitly warned about during install

Assessment:

- The repo shows awareness of security concepts
- Hardening is incomplete and some claims exceed actual enforcement

## Build, Tooling, and Quality Status

## Backend build

Status: passes

Command:

- `npm run build`

Result:

- TypeScript backend compiled successfully

Meaning:

- The backend source is at least internally consistent enough to build

## Backend linting

Status: configured in script, but not actually operational

Command:

- `npm run lint`

Result:

- failed because no ESLint config file exists

Meaning:

- There is no working lint process despite a lint script being present

## Backend tests

Status: no real test suite found

Observations:

- `jest` is listed in dependencies
- `npm test` exists as a script
- no meaningful repository test files were found

Meaning:

- Testing infrastructure is declared but not implemented

## Flutter analysis

Status: could not verify in this environment

Reason:

- `flutter` and `dart` were not available on PATH in the analysis environment

Meaning:

- Frontend static correctness could not be fully validated during this review

## Flutter dependencies

Current declared dependencies include:

- `http`
- `provider`
- `permission_handler`
- `path`
- `path_provider`
- `file_selector`

Observations:

- `provider`, `permission_handler`, and `path` do not appear meaningfully used in the reviewed implementation
- documentation references `qr_flutter`, but it is not actually declared

Assessment:

- Dependency list needs cleanup and alignment with actual code

## Runtime Data and Repository Hygiene

## Committed runtime/sample data

The repository includes committed files under:

- `Uploads/`
- `PrintSimulation/`

These look like runtime or demo data rather than pure source artifacts.

Assessment:

- Acceptable for demo packaging
- Not ideal for a clean application repository

## Large non-source artifact

There is a large PDF-like file with no extension:

- `backend/Brother MFC-J2730DW Printer`

Observations:

- It begins with `%PDF-1.7`
- It has no extension
- It is not clearly documented in the repo structure

Assessment:

- This should be renamed or documented if intentionally kept

## What Currently Works Best

The strongest parts of the codebase today are:

- Backend route structure
- Backend TypeScript buildability
- File upload/list/download/delete flow
- Storage-driven print selection path
- Overall kiosk UI presentation
- Optional QR verification via mock or Postgres

If the goal is a thesis demo or guided walkthrough, the project already has enough visible functionality to present a coherent system concept.

## What Is Currently Simulated or Incomplete

The most clearly simulated or incomplete areas are:

- Real PAYMONGO integration
- Real QR rendering on the Flutter side
- Direct print-file picking from the printing page
- Scanning hardware integration
- Photocopying hardware integration
- Bluetooth transfer
- WiFi hotspot transfer
- QR transfer
- Stable document metadata persistence
- End-to-end test coverage
- Working lint pipeline

## Primary Risks By Severity

## Critical

- Frontend/backend payment contract mismatch breaks real payment initialization
- Payment UI does not render a real scannable QR code

## High

- Storage and print path checks are weaker than they should be
- Printing subsystem is fragile and highly environment-specific
- Documentation significantly overstates readiness and implementation status
- Transaction state is only stored in memory

## Medium

- Metadata for stored documents is unstable and partially lost on refresh
- Several features appear implemented in UI but are actually simulated
- Security defaults are weaker than docs imply
- Lint and test workflow are incomplete

## Low

- Root README is outdated
- Some dependencies appear unused
- Generated/platform scaffolding may distract from the actual application structure

## Recommended Priorities

## Priority 1: Make payment integration real

- Unify create-payment response contract between Flutter and backend
- Return a consistent `success` field or update the Flutter parser
- Align expected HTTP status handling
- Include the fields the client model actually parses
- Render a real QR code in Flutter from backend-provided content

## Priority 2: Harden storage and file handling

- Replace prefix-based path checks with normalized/relative validation
- Persist metadata instead of regenerating IDs on each list
- Preserve original filenames and MIME types reliably

## Priority 3: Clarify simulation vs reality

- Label simulated features explicitly in UI and docs
- Remove misleading "production-ready" wording unless behavior supports it
- Either implement or strip dead simulation hooks like `simulatedPaths`

## Priority 4: Reduce frontend complexity

- Split `lib/services.dart` into focused screens/widgets/services
- Centralize configuration usage
- Remove static mutable cross-screen state where possible

## Priority 5: Add engineering guardrails

- Add ESLint config
- Add backend tests
- Add at least smoke tests for payment, storage, and print endpoints
- Add Flutter analysis/build verification to the workflow

## Current Verdict

This repository is a strong thesis/demo prototype with meaningful real code, especially in storage, UI presentation, and backend structure.

It is not yet a fully integrated production system.

The most important truth about its current state is this:

- It looks more complete than it is
- the architecture is present
- the user experience is present
- but several critical runtime paths are still mocked, mismatched, or environment-dependent

In short:

- Good demo foundation: yes
- Good codebase for continued development: yes
- Production-ready today: no

## Suggested one-sentence summary

The repository currently represents a well-presented kiosk prototype with a compilable backend and partially real storage/print infrastructure, but it still depends on mocked flows, inconsistent contracts, and incomplete hardening before it can be considered truly complete.

