interface Transaction {
  transaction: string;
  p50ms: number;
  count: number;
}

function p50Color(ms: number): string {
  if (ms < 1000) return "text-green-600 dark:text-green-400";
  if (ms < 2000) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

export function TransactionTable({
  transactions,
}: {
  transactions: Transaction[];
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
          Page Performance · P50
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
          Navigation transactions, last 7 days
        </p>
      </div>

      {transactions.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
          No transaction data found. Ensure performance monitoring is enabled in
          Sentry.
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-zinc-500 dark:text-zinc-400">
              <th className="px-6 py-3 font-medium">Transaction</th>
              <th className="px-6 py-3 text-right font-medium">P50</th>
              <th className="px-6 py-3 text-right font-medium">Requests</th>
            </tr>
          </thead>
          <tbody>
            {transactions
              .sort((a, b) => a.transaction.localeCompare(b.transaction))
              .map((t, i) => (
                <tr
                  key={t.transaction}
                  className={
                    i % 2 === 1
                      ? "bg-zinc-50/50 dark:bg-zinc-800/30"
                      : undefined
                  }
                >
                  <td className="px-6 py-3 font-mono text-zinc-700 dark:text-zinc-300">
                    {t.transaction}
                  </td>
                  <td
                    className={`px-6 py-3 text-right font-mono font-medium tabular-nums ${p50Color(t.p50ms)}`}
                  >
                    {t.p50ms < 1000
                      ? `${Math.round(t.p50ms)}ms`
                      : `${(t.p50ms / 1000).toFixed(2)}s`}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                    {t.count.toLocaleString()}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
