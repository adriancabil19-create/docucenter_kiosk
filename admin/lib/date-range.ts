// Shared date-range helpers — used by every history table (via
// HistoryToolbar) and by the Analytics panel, so "Today"/"7d"/"30d" mean
// the same thing everywhere in the admin console.

import type { DateRange } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Last `days` calendar days, ending today — as UTC calendar-day bounds
 * with NO milliseconds.
 *
 * The no-milliseconds part matters: the backend stores `created_at` via
 * SQLite's `strftime('%Y-%m-%dT%H:%M:%SZ', 'now')`, which has no `.mmm`
 * component, and the range filter compares it lexicographically
 * (`created_at <= @to`), not as parsed dates. A `to` bound built from
 * `Date.toISOString()` (which always includes `.000`) sorts as *less than*
 * a same-second `created_at` with no milliseconds — e.g. `'...10Z'` >
 * `'...10.000Z'` character-by-character — so the most recent rows at query
 * time were silently dropped from every range. Matching the stored format
 * exactly avoids that.
 */
export function presetRange(days: number): DateRange {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  const iso = (d: Date, endOfDay: boolean) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${
      endOfDay ? '23:59:59' : '00:00:00'
    }Z`;
  return { from: iso(start, false), to: iso(end, true) };
}
