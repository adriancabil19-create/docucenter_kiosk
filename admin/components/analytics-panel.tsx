'use client';

import { useMemo, useState } from 'react';
import { Button } from '@heroui/react';
import type { Analytics, DateRange } from '@/lib/types';
import { getAnalytics } from '@/lib/api';
import { usePoll } from '@/lib/use-poll';
import { StatCard } from '@/components/stat-card';

const peso = (n: number) =>
  `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type RangeKey = 'today' | '7d' | '30d' | 'all';

function rangeFor(key: RangeKey): DateRange | undefined {
  if (key === 'all') return undefined;
  const now = new Date();
  const from = new Date(now);
  if (key === 'today') from.setHours(0, 0, 0, 0);
  if (key === '7d') from.setDate(now.getDate() - 6);
  if (key === '30d') from.setDate(now.getDate() - 29);
  return { from: from.toISOString(), to: now.toISOString() };
}

/**
 * Horizontal magnitude bars — length encodes value, one sequential hue.
 * Every bar is directly labelled, so it doubles as its own table.
 */
function Bars({
  rows,
  format = (n: number) => String(n),
  emptyLabel = 'No data in this range.',
}: {
  rows: Array<{ label: string; value: number; hint?: string }>;
  format?: (n: number) => string;
  emptyLabel?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) {
    return <p className="py-4 text-center text-xs text-slate-400">{emptyLabel}</p>;
  }
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-slate-600" title={r.label}>
            {r.label}
          </span>
          <span className="h-2.5 rounded-full bg-slate-900/5">
            <span
              className="block h-full rounded-full bg-accent/70"
              style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }}
            />
          </span>
          <span className="tabular-nums font-medium text-slate-700">
            {format(r.value)}
            {r.hint ? <span className="ml-1 text-xs text-slate-400">{r.hint}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass p-5">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      {children}
    </div>
  );
}

export function AnalyticsPanel({ initial }: { initial: Analytics | null }) {
  const [rangeKey, setRangeKey] = useState<RangeKey>('30d');
  const fetcher = useMemo(() => () => getAnalytics(rangeFor(rangeKey)).then((r) => r.analytics), [rangeKey]);
  const { data, error, loading, refresh, updatedAt } = usePoll<Analytics>(fetcher, 30000, initial);

  const a = data ?? initial;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {(['today', '7d', '30d', 'all'] as RangeKey[]).map((k) => (
            <Button
              key={k}
              size="sm"
              variant={rangeKey === k ? 'solid' : 'flat'}
              color={rangeKey === k ? 'primary' : 'default'}
              onPress={() => setRangeKey(k)}
            >
              {k === 'today' ? 'Today' : k === 'all' ? 'All time' : `Last ${k.replace('d', ' days')}`}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {updatedAt && <span className="text-xs text-slate-400">Updated {updatedAt}</span>}
          <Button size="sm" variant="flat" onPress={refresh} isLoading={loading}>
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="glass border-red-300/40 bg-red-500/10 p-4 text-sm text-red-700">{error}</div>
      )}

      {!a ? (
        <p className="text-sm text-slate-400">Loading analytics…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Revenue" value={peso(a.revenue.total)} icon="💰" color="success" />
            <StatCard
              label="Avg transaction"
              value={peso(a.revenue.avgTransactionValue)}
              icon="📈"
            />
            <StatCard
              label="Successful txns"
              value={a.transactions.success}
              icon="✅"
              sub={`${a.transactions.total} total`}
            />
            <StatCard
              label="Sheets printed"
              value={a.jobs.totalSheets}
              icon="📄"
              sub={`${a.jobs.totalJobs} jobs`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Section title="Revenue by service">
              <Bars
                rows={a.revenue.byService.map((s) => ({
                  label: s.service_type,
                  value: s.revenue,
                  hint: `· ${s.count}`,
                }))}
                format={peso}
              />
            </Section>

            <Section title="Revenue by day">
              <div className="max-h-64 overflow-y-auto pr-1">
                <Bars
                  rows={a.revenue.byDay.map((d) => ({ label: d.day.slice(5), value: d.revenue }))}
                  format={peso}
                />
              </div>
            </Section>

            <Section title="Transaction outcomes">
              <Bars
                rows={[
                  { label: 'Success', value: a.transactions.success },
                  { label: 'Failed', value: a.transactions.failed },
                  { label: 'Cancelled', value: a.transactions.cancelled },
                  { label: 'Pending', value: a.transactions.pending },
                ]}
              />
            </Section>

            <Section title="Print job mix">
              <Bars
                rows={[
                  { label: 'Colour', value: a.jobs.color },
                  { label: 'B&W', value: a.jobs.bw },
                  { label: 'Duplex', value: a.jobs.duplex },
                  { label: 'Single-side', value: a.jobs.simplex },
                ]}
              />
            </Section>

            <Section title="Paper size">
              <Bars
                rows={a.jobs.byPaperSize.map((p) => ({
                  label: p.paper_size,
                  value: p.count,
                  hint: `· ${p.sheets} sheets`,
                }))}
              />
            </Section>

            <Section title="Peak hours">
              <div className="max-h-64 overflow-y-auto pr-1">
                <Bars
                  rows={a.peaks.byHour.map((h) => ({
                    label: `${String(h.hour).padStart(2, '0')}:00`,
                    value: h.count,
                  }))}
                />
              </div>
            </Section>

            <Section title="Peak days">
              <Bars
                rows={a.peaks.byWeekday.map((w) => ({
                  label: WEEKDAYS[w.weekday] ?? String(w.weekday),
                  value: w.count,
                }))}
              />
            </Section>
          </div>
        </>
      )}
    </div>
  );
}
