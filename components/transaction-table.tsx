import Table, { TableColumn } from "./Table";

interface Transaction {
  transaction: string;
  p50ms: number;
  count: number;
  avgTimeSeconds?: number;
}

function p50Color(ms: number): string {
  if (ms < 1000) return "text-green-600 dark:text-green-400";
  if (ms < 2000) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function formatP50(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function formatAvgTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

const columns: TableColumn<Transaction>[] = [
  {
    header: "Transaction",
    align: "left",
    cell: (row) => (
      <span className="font-mono text-zinc-700 dark:text-zinc-300">
        {row.transaction}
      </span>
    ),
  },
  {
    header: "P50",
    align: "right",
    cell: (row) => (
      <span
        className={`font-mono font-medium tabular-nums ${p50Color(row.p50ms)}`}
      >
        {formatP50(row.p50ms)}
      </span>
    ),
  },
  {
    header: "Avg. Time on Page",
    align: "right",
    cell: (row) => (
      <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
        {row.avgTimeSeconds != null ? formatAvgTime(row.avgTimeSeconds) : "—"}
      </span>
    ),
  },
  {
    header: "Requests",
    align: "right",
    cell: (row) => (
      <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
        {row.count.toLocaleString()}
      </span>
    ),
  },
];

export function TransactionTable({
  transactions,
}: {
  transactions: Transaction[];
}) {
  const sorted = [...transactions].sort((a, b) =>
    a.transaction.localeCompare(b.transaction),
  );

  return (
    <Table
      title="Page Speed & Engagement"
      subtitle="Load time (P50) · Avg. time on page · Last 7 days"
      columns={columns}
      rows={sorted}
      getRowKey={(row) => row.transaction}
      emptyMessage="No transaction data found. Ensure performance monitoring is enabled in Sentry."
    />
  );
}
