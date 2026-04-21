'use client';

import { useState, useCallback } from 'react';
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Button,
  Chip,
  Select,
  SelectItem,
} from '@heroui/react';
import { addToast } from '@heroui/react';
import type { ActivityLog, LogLevel } from '@/lib/types';
import { getLogs } from '@/lib/api';

interface Props {
  initialData: ActivityLog[];
}

const LEVEL_COLORS: Record<LogLevel, 'success' | 'warning' | 'danger'> = {
  info: 'success',
  warn: 'warning',
  error: 'danger',
};

const CATEGORIES = ['all', 'payment', 'paper', 'print', 'storage', 'system'];

export function ActivityLogTable({ initialData }: Props) {
  const [logs, setLogs] = useState<ActivityLog[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getLogs(200);
      setLogs(res.logs);
      addToast({
        title: 'Refreshed',
        description: `${res.count} log entries loaded.`,
        color: 'success',
      });
    } catch (err) {
      addToast({ title: 'Refresh failed', description: (err as Error).message, color: 'danger' });
    } finally {
      setLoading(false);
    }
  }, []);

  const filtered =
    categoryFilter === 'all' ? logs : logs.filter((l) => l.category === categoryFilter);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
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

        <span className="ml-auto text-xs text-gray-400">{filtered.length} entries</span>

        <Button size="sm" variant="flat" onPress={refresh} isLoading={loading}>
          Refresh
        </Button>
      </div>

      <Table aria-label="Activity log" isStriped>
        <TableHeader>
          <TableColumn className="w-16">Level</TableColumn>
          <TableColumn className="w-28">Category</TableColumn>
          <TableColumn>Message</TableColumn>
          <TableColumn className="w-44">Time</TableColumn>
        </TableHeader>
        <TableBody emptyContent="No log entries found.">
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
              <TableCell className="text-xs font-medium text-gray-600">{log.category}</TableCell>
              <TableCell>
                <span className="text-sm text-gray-800">{log.message}</span>
                {log.metadata && (
                  <pre className="mt-0.5 overflow-x-auto text-xs text-gray-400">
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
              <TableCell className="text-xs text-gray-400">
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
