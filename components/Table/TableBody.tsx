import type { TableColumn } from "./types";

export default function TableBody<T>({
  rows,
  columns,
  getRowKey,
}: {
  rows: T[];
  columns: TableColumn<T>[];
  getRowKey: (row: T) => string | number;
}) {
  return (
    <tbody>
      {rows.map((row, i) => (
        <tr
          key={getRowKey(row)}
          className={
            i % 2 === 1 ? "bg-zinc-50/50 dark:bg-zinc-800/30" : undefined
          }
        >
          {columns.map((col, j) => (
            <td
              key={j}
              className={`px-6 py-3${(col.align ?? (j === 0 ? "left" : "right")) === "right" ? " text-right" : ""}`}
            >
              {col.cell(row)}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}
