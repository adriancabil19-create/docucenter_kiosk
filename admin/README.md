# DocuCenter Admin Console

A Next.js admin dashboard for monitoring the DocuCenter Kiosk backend in real time.

Built with **Next.js 14**, **HeroUI**, and **Tailwind CSS**.

---

## Pages

| Page | URL | Description |
|---|---|---|
| Dashboard | `/` | Stats overview + recent transactions and print jobs |
| Transactions | `/transactions` | Full table of PayMongo payment transactions |
| Print Jobs | `/print-jobs` | Full table of print/photocopy jobs |
| Storage | `/storage` | Files stored on the backend; supports deletion |

---

## Prerequisites

- Node.js 18+
- The [docucenter-kiosk backend](../backend/README.md) running locally or on Railway

---

## Development Setup

### 1. Install dependencies

```bash
cd admin
npm install
```

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and set at least:

| Var | Purpose |
|---|---|
| `ADMIN_USERNAME` | Login username |
| `ADMIN_PASSWORD` | Login password (no user DB — this var *is* the password) |
| `SESSION_SECRET` | 32+ random chars; signs the session cookie |
| `API_URL` | URL of the running kiosk backend |
| `ADMIN_API_TOKEN` | Only if the backend requires a bearer token |

`API_URL` and `ADMIN_API_TOKEN` are **server-side only**. The browser talks to
the backend exclusively through the session-gated proxy at `/api/backend/*`
([app/api/backend/[...path]/route.ts](app/api/backend/%5B...path%5D/route.ts)),
so the token is never in the client bundle. Server Components import
[lib/backend.ts](lib/backend.ts) directly; Client Components use
[lib/api.ts](lib/api.ts), which hits the proxy.

> The legacy `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_ADMIN_API_TOKEN` names are
> still read as a fallback but are deprecated — they leak the token to the
> browser. Migrate to `API_URL` / `ADMIN_API_TOKEN`.

### 3. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The admin console fetches all data from the backend API. Make sure the backend is running before opening the console.

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server on port 3000 with hot reload |
| `npm run build` | Build for production |
| `npm start` | Start production server (requires build first) |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Run ESLint with auto-fix |
| `npm run format` | Format all source files with Prettier |
| `npm run format:check` | Check formatting without writing |

---

## Production Deploy on Railway

Create a Railway service from this repository with:

- **Root Directory**: `admin`
- **Build Command**: `npm ci && npm run build`
- **Start Command**: `npm start`
- `NEXT_PUBLIC_API_URL`: the public URL of the Railway backend service

Railway supplies `PORT` automatically; the production start command uses it.

Set these service variables: `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET`,
`API_URL`, and `ADMIN_API_TOKEN` (if the backend uses one).

---

## Credential rotation

There is no "change password" screen — the credentials live entirely in
environment variables. If `ADMIN_PASSWORD` (or the backend token) is exposed:

1. **Rotate `ADMIN_PASSWORD`** in the deployment environment (Railway → Variables,
   or `.env.local` on a self-hosted box).
2. **Rotate `SESSION_SECRET` at the same time** with a fresh 32+ char random
   string. Changing only the password does *not* end sessions that are already
   signed in — they stay valid for up to 8 h. Changing `SESSION_SECRET` makes
   every existing cookie fail to verify, forcing everyone to log in again.
3. **If `ADMIN_API_TOKEN` was also exposed**, rotate it on the backend and here
   together.
4. Redeploy / restart. No migration or code change is needed.

---

## Tech Stack

- [Next.js 14](https://nextjs.org) — App Router, server components
- [HeroUI](https://heroui.com) — Component library (Table, Card, Chip, Modal, Button, Toast)
- [Tailwind CSS 3](https://tailwindcss.com) — Utility-first CSS
- TypeScript — End-to-end type safety

---

## Toast Notifications

Toasts are used throughout the admin console via HeroUI's `addToast`:

```tsx
import { addToast } from '@heroui/react';

addToast({ title: 'Refreshed', description: 'Data updated.', color: 'success' });
addToast({ title: 'Error', description: 'Failed to reach server.', color: 'danger' });
```

---

## Project Structure

```
admin/
├── app/
│   ├── layout.tsx          # Root layout (sidebar + providers)
│   ├── page.tsx            # Dashboard
│   ├── providers.tsx       # HeroUIProvider
│   ├── globals.css
│   ├── transactions/page.tsx
│   ├── print-jobs/page.tsx
│   └── storage/page.tsx
├── components/
│   ├── nav-sidebar.tsx     # Left navigation
│   ├── stat-card.tsx       # KPI card
│   ├── status-chip.tsx     # Coloured status badge
│   ├── transactions-table.tsx
│   ├── print-jobs-table.tsx
│   └── storage-table.tsx
└── lib/
    ├── api.ts              # All fetch calls to the backend
    └── types.ts            # Shared TypeScript types
```
