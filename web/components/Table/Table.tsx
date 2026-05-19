import TableHead from "./TableHead";
import TableBody from "./TableBody";
import type { TableColumn } from "./types";

export type { TableColumn };

interface TableProps<T> {
  title: string;
  subtitle?: string;
  columns: TableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string | number;
  emptyMessage?: string;
}

export default function Table<T>({
  title,
  subtitle,
  columns,
  rows,
  getRowKey,
  emptyMessage = "No data available.",
}: TableProps<T>) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
        <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </h2>
        {subtitle && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            {subtitle}
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
          {emptyMessage}
        </div>
      ) : (
        <table className="w-full text-sm">
          <TableHead columns={columns} />
          <TableBody rows={rows} columns={columns} getRowKey={getRowKey} />
        </table>
      )}
    </div>
  );
}
