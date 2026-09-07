import { Card, CardBody } from '@heroui/react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: string;
  sub?: string;
  color?: 'default' | 'success' | 'warning' | 'danger' | 'primary';
}

const colorMap = {
  default: 'bg-slate-500/15 text-slate-600',
  primary: 'bg-accent/15 text-accent-strong',
  success: 'bg-green-500/15 text-green-600',
  warning: 'bg-amber-500/15 text-amber-600',
  danger: 'bg-red-500/15 text-red-600',
};

export function StatCard({ label, value, icon, sub, color = 'default' }: StatCardProps) {
  return (
    <Card shadow="none" className="glass">
      <CardBody className="flex flex-row items-center gap-4 p-5">
        <div
          aria-hidden="true"
          className={`flex h-12 w-12 items-center justify-center rounded-xl text-2xl ${colorMap[color]}`}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-600">
            {label}
          </p>
          <p className="mt-0.5 text-2xl font-bold text-slate-800">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
        </div>
      </CardBody>
    </Card>
  );
}
