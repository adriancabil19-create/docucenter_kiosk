import { getTransactions } from '@/lib/api';
import type { Transaction } from '@/lib/types';
import { TransactionsTable } from '@/components/transactions-table';

export const dynamic = 'force-dynamic';

export default async function TransactionsPage() {
  let transactions: Transaction[] = [];
  try {
    const res = await getTransactions(100);
    transactions = res.transactions;
  } catch {
    // Server unavailable at build/SSR time — the client can still refresh
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
        <p className="mt-1 text-sm text-gray-500">
          All PayMongo payment transactions recorded in the system.
        </p>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <TransactionsTable initialData={transactions} />
      </div>
    </div>
  );
}
