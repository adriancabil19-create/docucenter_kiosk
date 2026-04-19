import { Chip } from '@heroui/react';
import type { TransactionStatus, PrintJobStatus } from '@/lib/types';

type Status = TransactionStatus | PrintJobStatus | 'healthy' | 'unhealthy' | string;

interface StatusChipProps {
  status: Status;
}

function resolveColor(status: Status): 'success' | 'warning' | 'danger' | 'default' | 'primary' {
  switch (status?.toUpperCase()) {
    case 'SUCCESS':
    case 'DONE':
    case 'HEALTHY':
      return 'success';
    case 'PENDING':
    case 'PROCESSING':
    case 'SUBMITTED':
    case 'PRINTING':
      return 'warning';
    case 'FAILED':
    case 'EXPIRED':
    case 'UNHEALTHY':
      return 'danger';
    case 'CANCELLED':
      return 'default';
    default:
      return 'primary';
  }
}

export function StatusChip({ status }: StatusChipProps) {
  return (
    <Chip size="sm" color={resolveColor(status)} variant="flat" className="capitalize">
      {status}
    </Chip>
  );
}
