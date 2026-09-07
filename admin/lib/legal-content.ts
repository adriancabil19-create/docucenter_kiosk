// Plain-language legal summaries shown in the admin console at /legal.
// The authoritative full texts live in the project repository under
// `docs/legal/`. Keep this file in sync with `lib/legal_page.dart`.

export const LEGAL_EFFECTIVE = 'Effective 7 September 2026 · Version 1.0';

export interface LegalSection {
  id: string;
  title: string;
  body: string;
}

export const OPERATOR_DETAILS: { label: string; value: string }[] = [
  { label: 'Service', value: 'DocuCenter — Self-Service Document Processing Kiosk' },
  { label: 'Developer / Operator', value: 'Charles Adrian L. Cabil' },
  { label: 'Contact e-mail', value: 'adriancabil12@gmail.com' },
  { label: 'Data-privacy contact', value: 'adriancabil12@gmail.com' },
  {
    label: 'Nature',
    value:
      'Undergraduate thesis prototype, piloted at the University of Cebu – Lapu-Lapu and Mandaue Campus',
  },
  { label: 'Payment processor', value: 'PayMongo Philippines, Inc.' },
];

export const LEGAL_SECTIONS: LegalSection[] = [
  {
    id: 'privacy',
    title: 'Privacy Policy',
    body: `We follow the Data Privacy Act of 2012 (Republic Act No. 10173).

WHAT WE PROCESS
• The document files a user uploads or scans. These may contain personal or sensitive information, so every file is protected.
• A payment record for each job: internal reference number, amount in pesos, status, and time. We do NOT store the user's name, e-mail, phone number, or the contents of their documents.
• Admin console: staff username, hashed password, and a sign-in session cookie.

WHY
To carry out the print, scan, copy, storage, or transfer job the user asked for, and to take payment for it. Sensitive documents are processed only with consent.

RETENTION
Job files are used only to complete the job and are then deleted; staff also run a scheduled purge (max 24 hours). Phone-to-kiosk transfer sessions self-delete after 30 minutes. Transaction and print-job metadata are kept for the pilot period, then deleted or anonymised.

SHARING
Payment is handled by PayMongo Philippines, Inc. under its own privacy policy. Data is otherwise shared only when the law requires it. No data is sold; there is no advertising or tracking.

RIGHTS
Data subjects may request access, correction, deletion, or object to processing, and may complain to the National Privacy Commission (privacy.gov.ph). Requests go to adriancabil12@gmail.com.`,
  },
  {
    id: 'terms',
    title: 'Terms & Conditions',
    body: `Use of the kiosk is governed by Philippine law.

THE SERVICE
Self-service printing, scanning, photocopying, temporary storage, and payment. An undergraduate thesis prototype piloted at the University of Cebu – Lapu-Lapu and Mandaue Campus; it may change or be unavailable at any time.

PRICING & PAYMENT
Prices are shown on screen before payment, in pesos. Payment is processed by PayMongo. A job starts only after payment is confirmed; if it is not confirmed in time the job is cancelled and no charge is made.

USER RESPONSIBILITIES
Users are responsible for their documents and must not use the kiosk to copy material they have no right to copy (RA 8293), reproduce private images of a person without consent (RA 9995), handle child sexual abuse material (RA 9775), or create forgeries or other unlawful content. Staff may refuse or stop a job reasonably believed to be unlawful.

"AS IS"
The kiosk is a prototype provided "as is". Operator liability for a failed job is limited to a refund of what was paid for it. Statutory consumer rights are unaffected.`,
  },
  {
    id: 'cookies',
    title: 'Cookie / Local-Storage Policy',
    body: `A cookie-consent banner is NOT required.

Under the Data Privacy Act and NPC guidance, consent is needed only for non-essential technologies such as analytics, advertising, or cross-site tracking. This system uses none. A code audit found no Google Analytics, Meta Pixel, Mixpanel, Segment, Hotjar, Sentry, or any other analytics/telemetry tool; no advertising tags; and no third-party embeds or iframes.

WHAT IS STORED
• Kiosk: a short-lived cache of the job currently being set up.
• Admin console: one strictly-necessary sign-in cookie (HttpOnly, SameSite, signed).

PAYMONGO
When a user pays, PayMongo's own secure page opens and may set its own strictly-necessary cookies to process the payment, under PayMongo's policies.

If analytics or any non-essential storage is ever added, this policy will be updated and a compliant consent mechanism implemented before it is switched on.`,
  },
  {
    id: 'refund',
    title: 'Refund Policy',
    body: `Consistent with the Consumer Act of the Philippines (RA 7394).

FULL REFUND (or free re-run) WHEN:
• the printer jammed, ran out of paper or ink, or failed during the job;
• power was lost or the software crashed before the job finished;
• the user was charged but got no output, or clearly defective output not caused by their own file;
• the user was charged more than the amount shown, or charged twice for one job.

USUALLY NO REFUND WHEN:
• output matches the file and chosen settings but the user is unhappy with their own document;
• the user picked the wrong settings and the kiosk printed exactly what was selected (goodwill re-run possible during the pilot);
• scanning or photocopying was completed and delivered.

PROCESS
The user notes the reference number and e-mails adriancabil12@gmail.com within 7 days (date, time, amount, what went wrong), or tells on-site staff. Approved refunds return to the original payment method through PayMongo, normally submitted within 3 working days; the bank or e-wallet then takes a few more days. No fee for a valid refund.`,
  },
  {
    id: 'consent',
    title: 'User Consent Notice',
    body: `Shown at the kiosk before a paid job and before a document is uploaded, scanned, or transferred:

To do the job the kiosk briefly processes the file(s) provided or scanned. Files are used only to complete the job and are deleted afterwards (within 24 hours at the latest). A payment record is kept — reference number, amount, status, time — not the user's name and not the document's contents. Payment is handled by PayMongo on its own secure page. No tracking, no analytics.

The user ticks a box on the payment screen confirming they have read the Terms & Conditions, Privacy Policy, and Refund Policy, that they are allowed to copy the document(s) submitted, and that they consent to this processing. Payment cannot proceed until the box is ticked. Pressing Cancel discards the files.`,
  },
];
