# DocuCenter Kiosk

Self-service document **printing, scanning, and photocopying** kiosk with a
cashless (PayMongo) payment flow, a campus backend, and a staff admin console.

**Nature:** undergraduate thesis prototype, piloted at the University of Cebu –
Lapu-Lapu and Mandaue Campus. Not a commercial service.

**Developer / Operator:** Charles Adrian L. Cabil — <adriancabil12@gmail.com>

## Components

| Path | What it is |
|---|---|
| `lib/` | Flutter kiosk app (Windows / Android) |
| `backend/` | Node/TypeScript API — storage, printing, scanning, PayMongo, paper tracker |
| `admin/` | Next.js + HeroUI staff admin console |
| `web/` | Flutter web shell |

## Legal, privacy & compliance

- **Policies:** [`docs/legal/`](docs/legal/) — Privacy Policy, Terms &
  Conditions, Cookie / Local-Storage Policy, Refund Policy, and the in-kiosk
  Consent Notice. These are surfaced in-app on the kiosk **Legal** screen and in
  the admin console at `/legal`.
- **Philippine legal review:** [`docs/PH_COMPLIANCE.md`](docs/PH_COMPLIANCE.md)
  — RA 10173 (Data Privacy), RA 7394 (Consumer Act), RA 8792, RA 8293, RA 9995,
  RA 11967, BIR receipting, PWD/BP 344 accessibility, and a prioritised action
  list.
- **Assets & licences:** [`docs/COPYRIGHT_AND_ASSETS.md`](docs/COPYRIGHT_AND_ASSETS.md).
- **Accessibility:** [`docs/ACCESSIBILITY.md`](docs/ACCESSIBILITY.md).

### Known open items (see `docs/PH_COMPLIANCE.md` §11)

1. Ship the automatic 24-hour purge of the local document store.
2. Persist the payment-screen consent flag with each transaction record.
3. Before any commercial (non-thesis) operation: DTI + Mayor's permit + BIR
   registration and receipting, and a lawyer review of `docs/legal/`.

## Getting started

See `INTEGRATION_SETUP.md`, `FLUTTER_INTEGRATION_GUIDE.md`, and
`backend/API_DOCUMENTATION.md`.
