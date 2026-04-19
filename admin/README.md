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
- The [docucenter-kiosk backend](../backend/README.md) running (locally or on Render)

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

Edit `.env.local`:

```env
# Point to your running backend
NEXT_PUBLIC_API_URL=http://localhost:5000
```

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

## Production Deploy on Render

1. Push the repo to GitHub.
2. Go to [Render Dashboard](https://dashboard.render.com) → **New** → **Web Service**.
3. Connect your GitHub repo.
4. Set:
   - **Root Directory**: `admin`
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `npm start`
5. Add environment variable:
   - `NEXT_PUBLIC_API_URL` → your backend Render URL (e.g. `https://docucenter-kiosk-backend.onrender.com`)
6. Click **Deploy**.

> Alternatively, deploy both services automatically using the root-level [`render.yaml`](../render.yaml).

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
