# Cookie &amp; Local-Storage Policy

**Service:** DocuCenter Kiosk
**Operator:** Charles Adrian L. Cabil — adriancabil12@gmail.com
**Effective date:** 7 September 2026
**Version:** 1.0

This policy explains the small amount of local storage the DocuCenter Kiosk and
its staff admin console use. It supplements the [Privacy Policy](privacy-policy.md).

---

## 1. Do we need a cookie-consent banner?

**No.** Under the **Data Privacy Act (RA 10173)** and NPC guidance, consent is
required for cookies or similar technologies that are **not strictly necessary**
— for example analytics, advertising, or cross-site tracking. The DocuCenter
Kiosk uses **none** of those. Every storage item listed below is strictly
necessary to operate the service, so no separate consent banner or opt-in is
required. A short privacy notice is still shown at the Kiosk.

We reviewed the codebase for tracking technologies and found:

- **No** Google Analytics / Tag Manager, Meta Pixel, Mixpanel, Segment,
  Hotjar, Clarity, PostHog, Sentry, or any other analytics/telemetry SDK.
- **No** advertising or marketing tags.
- **No** social-media embeds, share widgets, comment widgets, or `iframe`s
  pointing at third-party content.
- **No** fonts, scripts, or stylesheets loaded from third-party CDNs at runtime
  in the Kiosk app.

The only external service invoked is **PayMongo**, and only when you choose to
pay (see §3).

---

## 2. What we store, and why

### 2.1 Kiosk app (the touchscreen you use)

| Item | Type | Purpose | Lifetime |
|---|---|---|---|
| Current-job cache | On-device app memory / temporary files | Holds the document(s) and settings for the job you are configuring so the app can render, price, and print them | Cleared when the job finishes, is cancelled, or the session resets |
| Uploaded-file working copies | Temporary files on the Kiosk / campus backend | Needed to print or copy your document | Deleted after the job; staff purge at least daily (target max 24 h) |

The Kiosk does not set browser tracking cookies. It is a native application, not
a website.

### 2.2 Staff admin console (not used by Kiosk users)

| Cookie / item | Type | Purpose | Lifetime |
|---|---|---|---|
| Session cookie (`HttpOnly`, `SameSite`, signed) | Strictly necessary | Keeps a logged-in staff member authenticated | Session / short expiry; deleted on sign-out |

No analytics or third-party cookies are set in the admin console.

---

## 3. PayMongo payment page

When you choose to pay, the Kiosk opens a **PayMongo**-hosted checkout (QR code
or link). That page is operated by **PayMongo Philippines, Inc.** and may set
its own strictly-necessary cookies to process your payment securely. That
activity is governed by **PayMongo's** cookie and privacy policies
(<https://www.paymongo.com/privacy>). The Kiosk passes PayMongo only the amount
and an internal reference; it does not pass your identity, and it receives back
only a payment status.

---

## 4. Changes

If we ever add analytics or any non-essential storage, we will update this
policy **and** implement a compliant consent mechanism **before** activating it.

---

## 5. Contact

**Charles Adrian L. Cabil — adriancabil12@gmail.com**
