import { getTransactions } from '@/lib/api';
import type { Transaction } from '@/lib/types';
import { PaymentsTable } from '@/components/payments-table';

export const dynamic = 'force-dynamic';

export default async function PaymentsPage() {
  let transactions: Transaction[] = [];
  try {
    const res = await getTransactions(200);
    transactions = res.transactions;
  } catch {
    // Server unavailable at build/SSR time
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage PayMongo QR Ph transactions. Cancel pending payments from here.
        </p>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <PaymentsTable initialData={transactions} />
      </div>
    </div>
  );
}
