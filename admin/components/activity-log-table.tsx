'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  Select,
  SelectItem,
} from '@heroui/react';
import { addToast } from '@heroui/react';
import type { ActivityLog, LogLevel } from '@/lib/types';
import { getLogs, type DateRange } from '@/lib/api';
import { glassTableClassNames } from './table-styles';
import { HistoryToolbar } from './history-toolbar';

interface Props {
  initialData: ActivityLog[];
}

const LEVEL_COLORS: Record<LogLevel, 'success' | 'warning' | 'danger'> = {
  info: 'success',
  warn: 'warning',
  error: 'danger',
};

const CATEGORIES = ['all', 'payment', 'paper', 'print', 'storage', 'system'];

const LEVEL_OPTIONS = [
  { key: 'info', label: 'Info' },
  { key: 'warn', label: 'Warning' },
  { key: 'error', label: 'Error' },
];

export function ActivityLogTable({ initialData }: Props) {
  const [logs, setLogs] = useState<ActivityLog[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [range, setRange] = useState<DateRange>({});
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState('all');

  const refresh = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const res = await getLogs(1000, range);
        setLogs(res.logs);
        if (!silent)
          addToast({
            title: 'Refreshed',
            description: `${res.count} log entries loaded.`,
            color: 'success',
          });
      } catch (err) {
        if (!silent)
          addToast({ title: 'Refresh failed', description: (err as Error).message, color: 'danger' });
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [range],
  );

  useEffect(() => {
    refresh(true);
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (categoryFilter !== 'all' && l.category !== categoryFilter) return false;
      if (level !== 'all' && l.level !== level) return false;
      if (!q) return true;
      return (
        l.message.toLowerCase().includes(q) ||
        l.category.toLowerCase().includes(q) ||
        (l.metadata ?? '').toLowerCase().includes(q)
      );
    });
  }, [logs, categoryFilter, level, search]);

  return (
    <>
      <HistoryToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Message, metadata…"
        range={range}
        onRangeChange={setRange}
        statusOptions={LEVEL_OPTIONS}
        status={level}
        onStatusChange={setLevel}
        count={filtered.length}
        total={logs.length}
        loading={loading}
        onRefresh={() => refresh()}
      >
        <Select
          aria-label="Filter by category"
          size="sm"
          className="w-44"
          selectedKeys={[categoryFilter]}
          onSelectionChange={(keys) => {
            const val = Array.from(keys)[0] as string;
            if (val) setCategoryFilter(val);
          }}
        >
          {CATEGORIES.map((c) => (
            <SelectItem key={c}>{c === 'all' ? 'All categories' : c}</SelectItem>
          ))}
        </Select>
      </HistoryToolbar>

      <Table aria-label="Activity log" isStriped classNames={glassTableClassNames}>
        <TableHeader>
          <TableColumn className="w-16">Level</TableColumn>
          <TableColumn className="w-28">Category</TableColumn>
          <TableColumn>Message</TableColumn>
          <TableColumn className="w-44">Time</TableColumn>
        </TableHeader>
        <TableBody emptyContent="No log entries match these filters.">
          {filtered.map((log) => (
            <TableRow key={log.id}>
              <TableCell>
                <Chip
                  size="sm"
                  color={LEVEL_COLORS[log.level as LogLevel] ?? 'default'}
                  variant="flat"
                >
                  {log.level}
                </Chip>
              </TableCell>
              <TableCell className="text-xs font-medium text-slate-600">{log.category}</TableCell>
              <TableCell>
                <span className="text-sm text-slate-800">{log.message}</span>
                {log.metadata && (
                  <pre className="mt-0.5 overflow-x-auto text-xs text-slate-400">
                    {(() => {
                      try {
                        return JSON.stringify(JSON.parse(log.metadata), null, 2);
                      } catch {
                        return log.metadata;
                      }
                    })()}
                  </pre>
                )}
              </TableCell>
              <TableCell className="text-xs text-slate-400">
                {new Date(log.created_at).toLocaleString('en-PH', {
                  dateStyle: 'short',
                  timeStyle: 'medium',
                })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </>
  );
}
