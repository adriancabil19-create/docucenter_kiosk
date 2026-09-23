import { getTransactions } from '@/lib/backend';
import { StatusChip } from '@/components/status-chip';
import type { Transaction } from '@/lib/types';

export async function DashboardTransactions() {
  let transactions: Transaction[] = [];
  let ok = true;
  try {
    transactions = (await getTransactions(5)).transactions;
  } catch {
    ok = false;
  }

  return (
    <section aria-labelledby="recent-tx-heading">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="recent-tx-heading" className="text-base font-semibold text-slate-800">
          Recent Transactions
        </h2>
        <a
          href="/transactions"
          className="rounded text-xs font-medium text-accent-strong hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          View all transactions<span aria-hidden="true"> →</span>
        </a>
      </div>
      <div className="glass overflow-x-auto">
        {transactions.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">
            {ok ? 'No transactions yet.' : 'Transactions unavailable while backend is offline.'}
          </p>
        ) : (
          <table className="w-full min-w-[560px] text-sm">
            <caption className="sr-only">Five most recent payment transactions</caption>
            <thead className="border-b border-white/40 bg-white/40 backdrop-blur-md">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600">
                  Reference
                </th>
                <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600">
                  Amount
                </th>
                <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600">
                  Status
                </th>
                <th scope="col" className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/40">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-white/40">
                  <td className="px-4 py-2.5 font-mono text-xs">{tx.reference_number}</td>
                  <td className="px-4 py-2.5 font-semibold">₱{tx.amount.toFixed(2)}</td>
                  <td className="px-4 py-2.5">
                    <StatusChip status={tx.status} />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    {new Date(tx.created_at).toLocaleString('en-PH', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
