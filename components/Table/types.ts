import type { ReactNode } from "react";

export interface TableColumn<T> {
  header: string;
  align?: "left" | "right";
  cell: (row: T) => ReactNode;
}
