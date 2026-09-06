# DocuCenter Kiosk Backend

Node.js + Express backend for the DocuCenter Kiosk — handles QR Ph payments via PayMongo, file uploads, print job dispatch, and SQLite persistence.

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### 1. Install dependencies

```bash
cd backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
NODE_ENV=development
PORT=5000

# PayMongo QR Ph
PAYMONGO_SECRET_KEY=sk_test_...

# CORS — comma-separated list of allowed origins
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001

# SQLite path (optional — defaults to ./database/docucenter.db)
DATABASE_PATH=./database/docucenter.db
```

### 3. Start dev server

```bash
npm run dev
```

Server starts on `http://localhost:5000`.

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start with ts-node-dev (hot reload) |
| `npm run build` | Compile TypeScript → `dist/` |
| `npm start` | Run compiled `dist/index.js` |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Run ESLint with auto-fix |
| `npm run format` | Format all source files with Prettier |
| `npm run format:check` | Check formatting without writing |

---

## API Endpoints

### Health

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Server liveness check |

### Transactions (PayMongo QR Ph)

| Method | Path | Description |
|---|---|---|
| POST | `/qrph/generate` | Create a QR Ph payment source |
| GET | `/qrph/status/:referenceNumber` | Poll payment status |
| POST | `/qrph/webhook` | PayMongo webhook (payment.paid event) |

### Print Jobs

| Method | Path | Description |
|---|---|---|
| POST | `/print` | Submit a print job (triggers real or simulated print) |
| POST | `/photocopy` | Submit a photocopy job |
| GET | `/print/jobs` | List print jobs (query: `?limit=N`) |
| GET | `/print/jobs/:id` | Get single print job |

### File Storage

| Method | Path | Description |
|---|---|---|
| POST | `/upload` | Upload a file (multipart/form-data) |
| GET | `/documents` | List stored documents |
| DELETE | `/documents/:id` | Delete a document by ID |

### Admin / Monitoring

| Method | Path | Description |
|---|---|---|
| GET | `/admin/stats` | Aggregate stats (transactions, revenue, print jobs) |
| GET | `/admin/transactions` | All transactions (query: `?limit=N`) |
| GET | `/admin/print-jobs` | All print jobs (query: `?limit=N`) |

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `NODE_ENV` | `development` or `production` | `development` |
| `PORT` | HTTP port | `5000` |
| `PAYMONGO_SECRET_KEY` | PayMongo secret key | — |
| `PAYMONGO_WEBHOOK_SECRET` | Webhook signature secret | — |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | `http://localhost:3000` |
| `DATABASE_PATH` | Absolute or relative path to SQLite file | `./database/docucenter.db` |

---

## Production Deploy on Railway

Create a Railway service from this repository with:

- **Root Directory**: `backend`
- **Builder**: Dockerfile
- **Dockerfile path**: `backend/Dockerfile`
- **Healthcheck path**: `/health`

Railway supplies `PORT` automatically. Configure these variables in the Railway service:

- `NODE_ENV=production`
- `ALLOWED_ORIGINS` — include the public URL of the admin service
- `PAYMONGO_SECRET_KEY`
- `PAYMONGO_WEBHOOK_SECRET`
- `SYNC_SECRET` — shared with the local kiosk

Set `DATABASE_PATH=/data/docucenter.db` on the Railway metadata receiver if you attach a persistent volume. The kiosk keeps its authoritative SQLite database and document files locally; Railway receives synchronized metadata only.

On the kiosk PC, use:

```env
DATABASE_PATH=./database/docucenter.db
UPLOADS_PATH=./Uploads
SYNC_URL=https://your-railway-backend.up.railway.app
SYNC_SECRET=shared_secret
```

The local sync outbox retries failed events and sends an idempotency event ID. Railway should use a persistent volume for its metadata copy.

### Docker

A multi-stage `Dockerfile` is included:

```bash
docker build -t docucenter-backend .
docker run -p 5000:5000 --env-file .env docucenter-backend
```

---

## Caveats

- **Printing and scanning are Windows-only.** The WIA/TWAIN print driver integration only works on the local Windows kiosk. On Railway (Linux), print jobs are logged as simulated and no physical print occurs.
- **Cloud files need persistent storage.** Railway service filesystems are ephemeral unless a volume is attached.

---

## Project Structure

```
backend/
├── src/
│   ├── controllers/      # Route handlers
│   ├── services/         # Business logic (PayMongo, print, storage)
│   ├── routes/           # Express router definitions
│   ├── middleware/        # CORS, auth, error handling
│   ├── types/            # TypeScript interfaces
│   ├── utils/
│   │   ├── config.ts     # Centralised env config
│   │   ├── helpers.ts    # Shared utilities
│   │   └── logger.ts     # Console logger
│   ├── database.ts       # better-sqlite3 setup and migrations
│   └── index.ts          # Express server entry point
├── dist/                  # Compiled output (generated)
├── Dockerfile
├── .env.example
├── .eslintrc.json
├── .prettierrc
├── tsconfig.json
└── package.json
```
