import { getTransactions } from '@/lib/backend';
import { getSession } from '@/lib/auth';
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

  const session = await getSession();
  const currentAdmin = session.user?.username ?? 'admin';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Transactions</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every payment, what it was actually for, and its full recovery-reprint history — click a
          row to see the details.
        </p>
      </div>

      <div className="glass p-5">
        <TransactionsTable initialData={transactions} currentAdmin={currentAdmin} />
      </div>
    </div>
  );
}
