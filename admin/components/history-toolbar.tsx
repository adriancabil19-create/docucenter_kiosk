'use client';

import type { ReactNode } from 'react';
import { DateRangePicker, Input, Select, SelectItem, Button } from '@heroui/react';
import { CalendarDate } from '@internationalized/date';
import type { DateRange } from '@/lib/api';

type CalRange = { start: CalendarDate; end: CalendarDate } | null;

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO range -> HeroUI DateRangePicker value */
function rangeToValue(range: DateRange): CalRange {
  const parse = (iso?: string) => {
    if (!iso) return null;
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return null;
    return new CalendarDate(y, m, d);
  };
  const start = parse(range.from);
  const end = parse(range.to);
  return start && end ? { start, end } : null;
}

/** HeroUI DateRangePicker value -> ISO range (full-day bounds, UTC) */
function valueToRange(v: CalRange): DateRange {
  if (!v?.start || !v?.end) return {};
  const s = v.start;
  const e = v.end;
  return {
    from: `${s.year}-${pad(s.month)}-${pad(s.day)}T00:00:00Z`,
    to: `${e.year}-${pad(e.month)}-${pad(e.day)}T23:59:59Z`,
  };
}

/** Last `days` calendar days, ending today. */
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

export interface HistoryToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  range: DateRange;
  onRangeChange: (range: DateRange) => void;
  /** When provided, renders a status dropdown ('all' + these keys). */
  statusOptions?: { key: string; label: string }[];
  status?: string;
  onStatusChange?: (value: string) => void;
  /** Extra controls rendered before the status dropdown (e.g. a category filter). */
  children?: ReactNode;
  count: number;
  total: number;
  loading?: boolean;
  onRefresh: () => void;
}

export function HistoryToolbar({
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  range,
  onRangeChange,
  statusOptions,
  status = 'all',
  onStatusChange,
  children,
  count,
  total,
  loading,
  onRefresh,
}: HistoryToolbarProps) {
  const hasRange = Boolean(range.from || range.to);
  const filtered = count !== total;

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <Input
          size="sm"
          aria-label="Search"
          placeholder={searchPlaceholder}
          value={search}
          onValueChange={onSearchChange}
          startContent={<span className="text-sm text-slate-400">⌕</span>}
          className="w-full max-w-xs"
        />

        <DateRangePicker
          size="sm"
          aria-label="Date range"
          label="Date range"
          labelPlacement="outside-left"
          visibleMonths={2}
          /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
          value={rangeToValue(range) as any}
          /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
          onChange={(v: any) => onRangeChange(valueToRange(v as CalRange))}
          className="w-full max-w-[19rem]"
        />

        {children}

        {statusOptions && onStatusChange && (
          <Select
            size="sm"
            aria-label="Status"
            className="w-40"
            selectedKeys={[status]}
            onSelectionChange={(keys) => {
              const val = Array.from(keys)[0] as string;
              if (val) onStatusChange(val);
            }}
          >
            {[{ key: 'all', label: 'All statuses' }, ...statusOptions].map((o) => (
              <SelectItem key={o.key}>{o.label}</SelectItem>
            ))}
          </Select>
        )}

        <Button size="sm" variant="flat" color="primary" isLoading={loading} onPress={onRefresh}>
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">Quick range:</span>
        {[
          { label: 'Today', days: 1 },
          { label: '7 days', days: 7 },
          { label: '30 days', days: 30 },
          { label: '90 days', days: 90 },
        ].map((p) => (
          <Button
            key={p.label}
            size="sm"
            variant="flat"
            className="h-6 min-w-0 px-2 text-xs"
            onPress={() => onRangeChange(presetRange(p.days))}
          >
            {p.label}
          </Button>
        ))}
        {hasRange && (
          <Button
            size="sm"
            variant="light"
            color="danger"
            className="h-6 min-w-0 px-2 text-xs"
            onPress={() => onRangeChange({})}
          >
            Clear dates
          </Button>
        )}
        <span className="ml-auto text-slate-400">
          {filtered ? `${count} of ${total}` : `${total}`} record{total === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
}
