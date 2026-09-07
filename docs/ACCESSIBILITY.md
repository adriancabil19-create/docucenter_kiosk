# Accessibility Notes — DocuCenter Kiosk

**Updated:** 7 September 2026
Target: WCAG 2.1 level AA where practical, plus the intent of RA 7277 / RA 10754
(Magna Carta for Persons with Disability) and BP 344 (Accessibility Law).

---

## Changes made in this pass

### Flutter kiosk app

| Area | Change |
|---|---|
| Icon-only controls | Mobile nav button now has a `tooltip` ("Open/Close navigation menu"). The "remove from print job" button already had a tooltip. |
| Copies stepper (`printing_page.dart`) | `-` / `+` buttons wrapped in `Tooltip` and given `semanticsLabel` ("Decrease/Increase copies"); the copies `TextField` now has a visible `labelText` ("Number of copies") and helper text ("1 to 20"). |
| Service selector (`services.dart`) | Was a `GestureDetector` (not keyboard-focusable, no role). Now an `InkWell` wrapped in `Semantics(button: true, selected: …, label: "<title>. <subtitle>")`; the icon is `ExcludeSemantics`. |
| Emoji used as graphics | Benefit-card emoji (🎓 👨‍🏫 💼) wrapped in `ExcludeSemantics` — the visible group name is the accessible label. |
| Colour contrast | Active service-card subtitle changed from `white70` to solid `white` on the blue fill; service-card border darkened from `#E5E7EB` to `#9CA3AF` so the control's edge is visible; footer body/copyright greys chosen for ≥ 4.5:1 on the gray-900 footer; Legal screen body text is `#1F2937` on white (~13:1). |
| Legal screen (new) | Section switcher is a row of real, focusable `ChoiceChip`s with text labels; page and section titles use `Semantics(header: true)`; `SelectableText` body. |
| Consent screen (new, payment) | Uses a `CheckboxListTile` with a full text label; "Continue to payment" is disabled until the box is ticked; buttons have 48 px minimum height (touch-target size). |

### Admin console (Next.js)

| Area | Change |
|---|---|
| Login form | `<label htmlFor>` now associated with `id`ed inputs; `name` attributes added; error message is `role="alert"` and darkened to `text-red-700`; submit button gets `aria-busy`; focus-visible ring added. A public link to `/legal` was added. |
| Nav sidebar | Decorative emoji marked `aria-hidden`; `<nav aria-label="Primary">`; active link marked `aria-current="page"`; low-contrast greys bumped (`slate-400/500` → `slate-500/600/700`); focus-visible rings on links and the sign-out button; sign-out button given `type="button"`. New "Legal & Privacy" nav entry. |
| Dashboard tables | Raw `<table>`s given an `sr-only` `<caption>`, `<th scope="col">`, section `aria-labelledby`; "View all →" links given descriptive text ("View all transactions"/"…print jobs") with the arrow `aria-hidden`; date-cell and empty-state greys bumped to `slate-500`. |
| Stat cards | Icon container marked `aria-hidden`; label/sub greys bumped. |
| Global CSS | Added a universal `:focus-visible` outline fallback for any interactive element, and a `prefers-reduced-motion` block that neutralises animations/transitions. |
| Security headers | `next.config.mjs` now sends `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, and a report-only CSP (no third-party origins are used). |
| Metadata | `robots: noindex` (internal console), author, applicationName. |

### Assets / alt text

- No `<img>` elements or `Image.asset`/`Image.network` calls exist in the app UI,
  so there is no missing `alt` text to fix. All iconography is vector
  (`Icons.*`) or OS-rendered emoji, now given text alternatives or hidden from
  assistive tech as appropriate. See `docs/COPYRIGHT_AND_ASSETS.md`.

---

## Still to do

### Software
- Full contrast sweep of the remaining admin components (`history-toolbar`,
  `paper-trays-manager`, `activity-log-table`, `kiosk-status-panel`,
  `storage-table`, `transactions-table`, `print-jobs-table`) for any remaining
  `text-slate-400` / `text-slate-300` on frosted surfaces.
- Verify HeroUI `Table`, `Select`, `Modal`, `DatePicker` keyboard traps and
  focus return with a screen reader (VoiceOver / NVDA / TalkBack).
- Give every kiosk screen a logical initial focus and a visible focus indicator
  under keyboard navigation (Flutter desktop supports Tab traversal; test it).
- Kiosk: ensure text scales and the layout still works at 200% zoom / large
  system font.
- Add a "high-contrast" / larger-text toggle to the kiosk for low-vision users.
- Provide an audio or staff-assist path for users who cannot use the touch UI.

### Physical deployment (BP 344)
- Step-free approach to the kiosk; clear floor space for a wheelchair.
- Interactive screen and card/QR area reachable from a seated position
  (operable part within 380–1200 mm of the floor; unobstructed forward or side
  reach).
- Adequate, glare-free lighting on the screen.
- Staffed fallback during the pilot.
