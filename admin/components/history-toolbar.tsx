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

// Solid white field surfaces so the controls read clearly on the glass panel.
const fieldInput = {
  label: 'text-slate-500',
  inputWrapper:
    '!bg-white border border-slate-200 shadow-sm data-[hover=true]:border-slate-300 ' +
    'group-data-[focus=true]:!bg-white group-data-[focus=true]:border-accent',
};
export const fieldSelect = {
  label: 'text-slate-500',
  trigger:
    '!bg-white border border-slate-200 shadow-sm !h-8 !min-h-8 data-[hover=true]:border-slate-300 ' +
    'data-[open=true]:border-accent',
  popoverContent: 'glass-strong',
};
const fieldDate = {
  label: 'text-slate-500',
  inputWrapper:
    '!bg-white border border-slate-200 shadow-sm data-[hover=true]:border-slate-300 ' +
    'group-data-[focus=true]:border-accent',
  popoverContent: 'glass-strong',
};

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

  const presets = [
    { label: 'Today', days: 1 },
    { label: '7d', days: 7 },
    { label: '30d', days: 30 },
    { label: '90d', days: 90 },
  ];

  return (
    <div className="mb-5 rounded-2xl border border-white/50 bg-white/30 p-3 backdrop-blur-md sm:p-4">
      {/* Row 1 — inputs */}
      <div className="flex flex-wrap items-center gap-2.5">
        <Input
          size="sm"
          radius="lg"
          aria-label="Search"
          placeholder={searchPlaceholder}
          value={search}
          onValueChange={onSearchChange}
          classNames={fieldInput}
          className="w-full sm:w-64"
        />

        <DateRangePicker
          size="sm"
          radius="lg"
          aria-label="Date range"
          visibleMonths={2}
          /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
          value={rangeToValue(range) as any}
          /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
          onChange={(v: any) => onRangeChange(valueToRange(v as CalRange))}
          classNames={fieldDate}
          className="w-full sm:w-[16.5rem]"
        />

        {children}

        {statusOptions && onStatusChange && (
          <Select
            size="sm"
            radius="lg"
            aria-label="Status"
            selectedKeys={[status]}
            onSelectionChange={(keys) => {
              const val = Array.from(keys)[0] as string;
              if (val) onStatusChange(val);
            }}
            classNames={fieldSelect}
            className="w-full sm:w-40"
          >
            {[{ key: 'all', label: 'All statuses' }, ...statusOptions].map((o) => (
              <SelectItem key={o.key}>{o.label}</SelectItem>
            ))}
          </Select>
        )}

        <Button
          size="sm"
          radius="lg"
          variant="flat"
          color="primary"
          isLoading={loading}
          onPress={onRefresh}
          className="ml-auto shadow-sm"
        >
          Refresh
        </Button>
      </div>

      {/* Row 2 — quick ranges + count */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/40 pt-3 text-xs">
        <span className="mr-1 font-medium text-slate-500">Quick range</span>
        {presets.map((p) => {
          const active =
            hasRange && JSON.stringify(presetRange(p.days)) === JSON.stringify(range);
          return (
            <Button
              key={p.label}
              size="sm"
              radius="full"
              variant="flat"
              className={`h-6 min-w-0 px-2.5 text-xs shadow-sm ${
                active
                  ? 'bg-accent/15 text-accent-strong'
                  : 'bg-white/60 text-slate-600 data-[hover=true]:bg-white/80'
              }`}
              onPress={() => onRangeChange(presetRange(p.days))}
            >
              {p.label}
            </Button>
          );
        })}
        {hasRange && (
          <Button
            size="sm"
            radius="full"
            variant="light"
            className="h-6 min-w-0 px-2 text-xs text-slate-500 data-[hover=true]:text-red-600"
            onPress={() => onRangeChange({})}
          >
            Clear
          </Button>
        )}
        <span className="ml-auto text-slate-400">
          {filtered ? (
            <>
              <span className="font-semibold text-slate-600">{count}</span> of {total}
            </>
          ) : (
            <span className="font-semibold text-slate-600">{total}</span>
          )}{' '}
          record{total === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
}
