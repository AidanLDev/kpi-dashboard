import type { TableColumn } from "./types";

export default function TableHead<T>({
  columns,
}: {
  columns: TableColumn<T>[];
}) {
  return (
    <thead>
      <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-zinc-500 dark:text-zinc-400">
        {columns.map((col, i) => (
          <th
            key={i}
            className={`px-6 py-3 font-medium${(col.align ?? (i === 0 ? "left" : "right")) === "right" ? " text-right" : ""}`}
          >
            {col.header}
          </th>
        ))}
      </tr>
    </thead>
  );
}
