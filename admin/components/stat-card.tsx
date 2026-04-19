import { Card, CardBody } from '@heroui/react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: string;
  sub?: string;
  color?: 'default' | 'success' | 'warning' | 'danger' | 'primary';
}

const colorMap = {
  default: 'bg-gray-50 text-gray-700',
  primary: 'bg-blue-50 text-blue-700',
  success: 'bg-green-50 text-green-700',
  warning: 'bg-yellow-50 text-yellow-700',
  danger: 'bg-red-50 text-red-700',
};

export function StatCard({ label, value, icon, sub, color = 'default' }: StatCardProps) {
  return (
    <Card shadow="sm" className="border border-gray-100">
      <CardBody className="flex flex-row items-center gap-4 p-5">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-xl text-2xl ${colorMap[color]}`}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-gray-500">
            {label}
          </p>
          <p className="mt-0.5 text-2xl font-bold text-gray-900">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
        </div>
      </CardBody>
    </Card>
  );
}
