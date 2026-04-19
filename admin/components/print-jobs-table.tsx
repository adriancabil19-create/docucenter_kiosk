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
  addToast,
} from '@heroui/react';
import { getPrintJobs } from '@/lib/api';
import type { PrintJob } from '@/lib/types';
import { StatusChip } from './status-chip';

interface Props {
  initialData: PrintJob[];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function PrintJobsTable({ initialData }: Props) {
  const [rows, setRows] = useState<PrintJob[]>(initialData);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getPrintJobs(100);
      setRows(res.jobs);
      addToast({
        title: 'Refreshed',
        description: `${res.count} print job(s) loaded.`,
        color: 'success',
      });
    } catch (err) {
      addToast({
        title: 'Refresh failed',
        description: err instanceof Error ? err.message : 'Could not reach the server.',
        color: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{rows.length} record(s)</p>
        <Button size="sm" variant="flat" color="primary" isLoading={loading} onPress={refresh}>
          Refresh
        </Button>
      </div>

      <Table aria-label="Print jobs table" removeWrapper>
        <TableHeader>
          <TableColumn>Job ID</TableColumn>
          <TableColumn>Files</TableColumn>
          <TableColumn>Paper</TableColumn>
          <TableColumn>Copies</TableColumn>
          <TableColumn>Status</TableColumn>
          <TableColumn>Method</TableColumn>
          <TableColumn>Mode</TableColumn>
          <TableColumn>Created</TableColumn>
        </TableHeader>
        <TableBody emptyContent="No print jobs found.">
          {rows.map((job) => (
            <TableRow key={job.id}>
              <TableCell className="max-w-[120px] truncate font-mono text-xs">{job.id}</TableCell>
              <TableCell className="max-w-[160px]">
                <div className="space-y-0.5">
                  {job.filenames.map((f) => (
                    <p key={f} className="truncate text-xs text-gray-600">
                      {f}
                    </p>
                  ))}
                </div>
              </TableCell>
              <TableCell className="text-xs">{job.paper_size}</TableCell>
              <TableCell className="text-center text-xs">{job.copies}</TableCell>
              <TableCell>
                <StatusChip status={job.status} />
              </TableCell>
              <TableCell className="text-xs text-gray-500">{job.method ?? '—'}</TableCell>
              <TableCell>
                <Chip size="sm" variant="flat" color={job.simulated ? 'warning' : 'success'}>
                  {job.simulated ? 'Simulated' : 'Real'}
                </Chip>
              </TableCell>
              <TableCell className="text-xs">{formatDate(job.created_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
