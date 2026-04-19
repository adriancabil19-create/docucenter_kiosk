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

## Production Deploy on Render

### Using render.yaml (recommended)

A [`render.yaml`](../render.yaml) at the repo root configures both the backend and the admin console as Render web services. Push to GitHub and connect the repo on Render — both services deploy automatically.

Set these secret environment variables in the Render dashboard (they are marked `sync: false` in `render.yaml`):

- `PAYMONGO_SECRET_KEY`
- `PAYMONGO_WEBHOOK_SECRET`
- `ALLOWED_ORIGINS` — include the Render URL of your admin console (e.g. `https://docucenter-kiosk-admin.onrender.com`)

### Manual Render setup

1. Go to [Render Dashboard](https://dashboard.render.com) → **New** → **Web Service**.
2. Connect your GitHub repo.
3. Set:
   - **Root Directory**: `backend`
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `npm start`
4. Add the environment variables listed above.
5. Click **Deploy**.

### SQLite persistence on Render

Render free-tier instances have ephemeral disks — the SQLite database resets on every deploy. For persistence:

1. Add a **Disk** to the service (paid tier).
2. Mount it at `/data`.
3. Set `DATABASE_PATH=/data/docucenter.db`.

### Docker

A multi-stage `Dockerfile` is included:

```bash
docker build -t docucenter-backend .
docker run -p 5000:5000 --env-file .env docucenter-backend
```

---

## Caveats

- **Printing and scanning are Windows-only.** The WIA/TWAIN print driver integration only works on Windows. On Render (Linux), print jobs are logged as simulated and no physical print occurs.
- **SQLite is ephemeral on Render free tier.** See the persistence note above.

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
