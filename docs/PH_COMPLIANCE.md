# Philippine Legal Compliance Review — DocuCenter Kiosk

**Prepared:** 7 September 2026
**Scope:** DocuCenter Kiosk (Flutter app), campus backend, Railway transfer/payment relay, Next.js admin console
**Operating status assumed:** undergraduate thesis prototype, piloted at the University of Cebu – Lapu-Lapu and Mandaue Campus, with real peso payments taken through PayMongo
**Operator:** Charles Adrian L. Cabil — adriancabil12@gmail.com

> This is an internal engineering compliance review by the development team, not
> formal legal advice. Before any commercial (non-thesis) operation, have it
> reviewed by a Philippine lawyer and, where indicated, register with the
> relevant agencies.

---

## 0. Executive summary

| Area | Law | Status | Priority action |
|---|---|---|---|
| Data privacy notice &amp; consent | RA 10173 | **Addressed** — policy + in-app consent added | Keep policy in sync with features |
| Automatic deletion of documents | RA 10173 (storage limitation) | **Partial** — transfer relay auto-expires (30 min); local store purge is manual | Implement scheduled purge job (see §2.3) |
| NPC registration / DPO | RA 10173, NPC Circular 17-01 / 2022-04 | **Likely not required** at pilot scale; monitor thresholds | Re-assess if ≥1,000 subjects or commercial |
| Cookie consent | RA 10173 + NPC guidance | **Not required** — no tracking present | Re-check on every new dependency |
| Consumer transparency (pricing, refunds) | RA 7394 | **Addressed** — prices shown pre-payment; Refund Policy added | Show a clear printed/e-acknowledgement every time |
| Electronic transactions validity | RA 8792 | **OK** — click-consent + electronic records are valid | None |
| Official receipts / tax | NIRC §237, TRAIN, EOPT Act (RA 11976) | **Deferred** — thesis pilot, not a registered business | Required before commercial launch (see §5) |
| Internet Transactions Act | RA 11967 | **Mostly N/A** at pilot scale (on-campus, not an online marketplace) | Applies if it becomes an online commercial service |
| Copyrighted-document reproduction | RA 8293 | **Addressed via Terms** — user responsibility + prohibited-use clause | Add on-screen reminder at print step |
| Voyeurism / private images via scanner | RA 9995 | **Addressed via Terms + scan notice** | Keep scan retention minimal |
| CSAEM | RA 9775 | **Prohibited-use clause added**; report obligation noted | Staff briefing |
| Accessibility of the Kiosk (PWD) | RA 7277 / RA 10754, BP 344, RA 11967 §6 | **Improved** (this pass) + physical placement is a deployment concern | Ensure step-free physical access, reachable screen height |
| Cybercrime baseline | RA 10175 | Covered by acceptable-use + security measures | None |
| Payment card security | BSP / PCI-DSS | **Delegated to PayMongo** — no card data touches the Kiosk | Never add card capture to the Kiosk |

---

## 1. Data Privacy Act of 2012 (RA 10173)

### 1.1 Roles
- **Personal Information Controller (PIC):** Charles Adrian L. Cabil (the Operator).
- **Personal Information Processors:** PayMongo Philippines, Inc. (payments);
  Railway (hosting of the short-lived transfer/payment relay).
- **Host institution:** University of Cebu — receives only aggregated,
  non-identifying data.

### 1.2 Personal data actually processed
- **Document files and file names** (uploaded, scanned, transferred). Must be
  treated as possibly containing **sensitive personal information** (IDs,
  medical, education, financial records).
- **Transaction metadata**: internal reference number, amount, status, service
  type, timestamps. *(No name/email/phone stored in the Kiosk DB — confirmed in
  `backend/src/database.ts`: tables `transactions`, `print_jobs`, `paper_trays`,
  `activity_logs`, `sync_*` — none has a customer-identity column.)*
- **Admin credentials**: staff username + hashed password + session cookie.
- **PayMongo-side**: payer name/contact/payment instrument — controlled by
  PayMongo, not us.

### 1.3 Compliance checklist

| Requirement | Where handled | Gap / action |
|---|---|---|
| Privacy notice (right to be informed) | `docs/legal/privacy-policy.md`; short notice `docs/legal/consent-notice.md`; in-app Legal screen + consent checkbox | Keep the on-screen short notice visible at upload/scan/pay |
| Lawful basis (§12/§13) | Documented in Privacy Policy §3 (contract necessity + consent; consent for sensitive data) | — |
| Consent — freely given, specific, informed, evidenced | In-app checkbox gating payment; logged as part of the transaction record | Ensure the consent state is persisted with the job record |
| Data minimisation | Kiosk stores only job metadata; no identity fields | Keep it that way; do **not** add "enter your email for a receipt" without updating the policy |
| Storage limitation | Transfer relay: 30-min TTL (implemented, `transfer.service.ts`). Local document store: **manual purge only** | **Action:** add scheduled purge (cron / `setInterval`) deleting files in the storage dir older than 24 h; log deletions |
| Security measures (§20, NPC Circular 16-01) | On-prem processing, auth on admin, hashed passwords, signed cookies, CORS restriction, no card data | Document the org/physical/technical measures in a one-page security memo before commercial use |
| Breach notification (NPC Circular 16-03) | Privacy Policy §6 commits to 72-hour NPC + data-subject notification | Prepare a one-page incident runbook |
| Data-subject rights handling | Privacy Policy §7; mailbox adriancabil12@gmail.com; 15-working-day response | Keep a simple request log |
| Contractual safeguards with processors | PayMongo ToS; Railway ToS/DPA | Save copies; for commercial use sign a proper Data Sharing / Outsourcing Agreement |

### 1.4 NPC registration &amp; Data Protection Officer

Mandatory registration of the data processing system and DPO appointment applies
mainly where the PIC/PIP:
- has **at least 250 employees**, **or**
- processes personal data of **at least 1,000 individuals**, **or**
- processes **sensitive personal information of at least 1,000 individuals**, **or**
- the processing is likely to pose a risk to rights and freedoms (e.g., large
  scale, systematic monitoring).

At **thesis-pilot scale** (a single on-campus kiosk, short pilot window)
registration is **likely not triggered**. However, because scanned documents can
contain sensitive personal information, the safe course is:

- **Now:** designate the Operator as the **de facto DPO / privacy contact**
  (done — adriancabil12@gmail.com), keep a processing-activities record (this
  document + the Privacy Policy), and enforce the 24-hour purge.
- **Track:** number of distinct users during the pilot. If it approaches 1,000,
  or if the service continues past the thesis as a real offering, **register
  with the NPC** (<https://register.privacy.gov.ph>) and formally appoint a DPO.

### 1.5 Cross-border processing
PayMongo and Railway may run infrastructure outside the Philippines. This is
permitted under the DPA where the PIC remains accountable and the processor is
contractually bound. Disclosed in Privacy Policy §5. The Kiosk and its local
document store remain on-campus.

---

## 2. Cookies, analytics, tracking, third-party embeds

### 2.1 Findings (code audit, this pass)
- **No** analytics/telemetry/advertising SDKs anywhere in `lib/`, `admin/`,
  `web/`, or `backend/` (searched: gtag, Google Analytics/GTM, Meta Pixel,
  Mixpanel, Segment, Hotjar, Clarity, PostHog, Sentry).
- **No** third-party `iframe`s, social embeds, share/comment widgets.
- **No** runtime third-party CDN fonts/scripts/styles in the Kiosk.
- `cached_network_image` is a listed dependency but is **not referenced** in
  `lib/` — consider removing it from `pubspec.yaml` to shrink the trust surface.
- Only third-party runtime call: **PayMongo** hosted checkout, invoked only on
  user action, receiving amount + reference only.

### 2.2 Conclusion on cookie consent
No cookie-consent banner is legally required. All local storage is strictly
necessary (admin session cookie; Kiosk current-job cache). Documented in
`docs/legal/cookie-policy.md`. **Re-audit whenever a dependency is added.**

### 2.3 Action — enforce document retention
Add an automatic purge for the local storage directory used by
`backend/src/services/storage.service.ts` (and any scan output dir that is not
already `os.tmpdir()`):

```
// pseudo — run on an interval, e.g. hourly
for (const f of listFiles(STORAGE_DIR))
  if (ageOf(f) > 24h) { unlink(f); unlink(sidecarOf(f)); log('retention-purge', f); }
```

Until shipped, staff must purge at least daily and record it.

---

## 3. Consumer Act (RA 7394) &amp; fair-trading

| Duty | Status |
|---|---|
| Display price before purchase, in PHP | **Done** — printing/photocopy screens show an itemised estimate and the payment screen shows the exact total |
| No deceptive or misleading claims | **Fixed this pass** — removed "24/7", "revolutionizing", and unimplemented "real-time IoT monitoring" claims from marketing copy |
| Service performed with due care; remedy if not | **Refund Policy** added (`docs/legal/refund-policy.md`) |
| Proof of transaction | On-screen acknowledgement + optional printed slip with reference number. For commercial operation this must become a BIR-registered receipt (see §5) |
| Complaints handling | Single contact channel (email) + on-site staff during pilot |

---

## 4. Electronic Commerce Act (RA 8792)

- Electronic documents, the on-screen consent tick, and electronic transaction
  records are legally recognised. The consent checkbox + logged transaction
  record are an adequate electronic "signature" of assent for a low-value
  self-service transaction.
- Keep transaction records reasonably retrievable for the pilot period.

---

## 5. Tax / official receipts (NIRC §237 as amended by TRAIN &amp; EOPT Act RA 11976)

**Deferred while this is a non-commercial thesis pilot.** If DocuCenter is run
as an actual business (fees retained as income by an operator, not just
cost-recovery within a sanctioned university project):

1. Register the business — **DTI** business name (sole proprietorship
   "DocuCenter"), Mayor's/Business permit, **BIR Form 1901** registration.
2. Issue **BIR-registered invoices/official receipts** (or an
   Accredited/authorised electronic receipting system) for every sale, per
   customer, per EOPT rules.
3. Register the **point-of-sale / kiosk software** with the BIR if it issues
   receipts.
4. File and pay the applicable percentage tax / VAT and income tax.
5. Display "This establishment is required to issue a receipt/invoice".

Talk to a CPA/lawyer before charging the public outside the thesis context.

---

## 6. Internet Transactions Act of 2023 (RA 11967)

Primarily regulates **online businesses, e-marketplaces, and e-retailers**
serving consumers over the internet, under DTI oversight. A single on-campus
self-service kiosk taking payment for a physical print is **not** an online
marketplace, so most obligations do not attach at pilot scale. Note for the
future: if a web ordering front-end is added (upload + pay online, collect
later), the Act's consumer-protection, disclosure, and redress obligations, and
the DTI online-business registration, would apply. §6 of the Act also reinforces
**accessibility** obligations.

---

## 7. Intellectual Property Code (RA 8293)

- Users can easily use the Kiosk to photocopy/print copyrighted works. The
  Operator's exposure is limited by:
  - **Terms §5** — user warrants they own/are licensed/permitted (fair use,
    §185) to copy each document, and indemnifies the Operator.
  - **Prohibited-use clause** and the right to refuse a job.
  - **No retention** of document contents.
- **Action:** show a one-line reminder on the print/upload screen: *"You are
  responsible for having the right to copy these files."* (Added to the in-app
  consent notice.)
- The Kiosk's own third-party code/assets are properly licensed — see
  `docs/COPYRIGHT_AND_ASSETS.md`.

---

## 8. Anti-Photo and Video Voyeurism Act (RA 9995) &amp; Anti-OSAEC/CSAEM (RA 9775, RA 11930)

- The scanner/copier could be misused to reproduce private images of a person
  without consent, or illegal content.
- Mitigations: **Terms §5** prohibits it; the **scanning screen notice** states
  it; scans are **not retained** beyond delivery; staff will report CSAEM to
  the PNP-WCPC / NBI as required and preserve minimal evidence only as the law
  requires.

---

## 9. Accessibility (RA 7277 Magna Carta for PWD; RA 10754; BP 344 Accessibility Law; RA 11967 §6)

Software changes made this pass (see `docs/ACCESSIBILITY.md` / commit):
- Screen-reader labels (`Semantics`, `tooltip`) on icon-only controls in the
  Kiosk; emoji given text alternatives.
- Keyboard/focus operability for the service selector and forms.
- Colour-contrast fixes for low-contrast text (white-70% on blue, grey-400
  body text) to meet WCAG 2.1 AA (4.5:1).
- Admin console: form-label associations, `aria-label` on emoji-only controls,
  table header scopes, visible focus rings, contrast bumps.

Deployment-side (not code):
- Physical kiosk must allow **step-free approach**, front reach, and a screen /
  interaction zone usable from a seated position (BP 344).
- Provide a staffed fallback during the pilot for users who cannot use the
  touchscreen.

---

## 10. Other laws reviewed — brief notes

| Law | Relevance | Position |
|---|---|---|
| Cybercrime Prevention Act (RA 10175) | Misuse of the Kiosk; security of systems | Acceptable-use clause + security measures; cooperate with lawful orders |
| SIM Registration Act (RA 11934) | N/A — no SIM issuance/telco service | No action |
| Price Act (RA 7581) | Basic-necessities price control | N/A to printing services |
| Access Devices Regulation Act (RA 8484) | Card fraud | No card data handled; PayMongo bears PCI scope |
| Ease of Paying Taxes Act (RA 11976) | Receipting/invoicing modernisation | Relevant only on commercial launch — see §5 |
| Consumer product/serv. warranties (RA 7394 Title III) | Implied warranty on services | Reflected in Terms §7-8 and Refund Policy |
| Civil Code (Arts. 19-21, 1170, 2176) | Good faith, breach, quasi-delict | Reflected in Terms |

---

## 11. Prioritised action list

1. **Ship the 24-hour automatic purge** for the local document store; log
   deletions. *(Engineering — highest priority privacy gap.)*
2. Persist the **consent flag** together with each transaction/print-job record.
3. Add the **"you are responsible for copyright" one-liner** on the upload/print
   screen. *(Done in the consent notice; wire into the print screen UI.)*
4. Keep a lightweight **data-subject request log** and an **incident runbook**.
5. Track distinct pilot users; **register with NPC + appoint DPO** if it grows
   past pilot scale or continues commercially.
6. Before any commercial operation: **DTI + Mayor's permit + BIR registration
   and receipting**, and a lawyer review of all `docs/legal/` texts.
7. Remove the unused `cached_network_image` dependency, or, if kept, restrict it
   to same-origin image hosts.
8. Confirm the physical kiosk placement meets **BP 344** step-free/reach
   requirements and provide a staffed fallback.
