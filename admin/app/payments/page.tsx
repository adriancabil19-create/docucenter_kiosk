import { Suspense } from 'react';
import { getTransactions } from '@/lib/backend';
import type { Transaction } from '@/lib/types';
import { PaymentsTable } from '@/components/payments-table';
import { SectionSkeleton } from '@/components/section-skeleton';

export const dynamic = 'force-dynamic';

async function PaymentsContent() {
  let transactions: Transaction[] = [];
  try {
    const res = await getTransactions(200);
    transactions = res.transactions;
  } catch {
    // Server unavailable at build/SSR time
  }
  return (
    <div className="glass p-5">
      <PaymentsTable initialData={transactions} />
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Payments</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage PayMongo QR Ph transactions. Cancel pending payments from here.
        </p>
      </div>

      <Suspense fallback={<SectionSkeleton />}>
        <PaymentsContent />
      </Suspense>
    </div>
  );
}
