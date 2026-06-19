"use client";

import { Treemap, ResponsiveContainer, Tooltip } from "recharts";

export interface TreemapDataPoint {
  name: string;
  value: number;
}

interface PageViewsTreemapProps {
  data: TreemapDataPoint[];
  title?: string;
}

const COLORS = [
  "#f97316", // orange-500
  "#3b5bdb", // indigo-700
  "#4ade80", // green-400 (muted)
  "#a855f7", // purple-500
  "#ec4899", // pink-500
  "#06b6d4", // cyan-500
  "#eab308", // yellow-500
  "#14b8a6", // teal-500
  "#6366f1", // indigo-500
  "#f43f5e", // rose-500
];

interface CellProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  index?: number;
  value?: number;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload: { name: string; size: number } }>;
}

function TreemapTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const { name, size } = payload[0].payload;
  return (
    <div
      style={{
        backgroundColor: "#18181b",
        border: "1px solid #3f3f46",
        borderRadius: "8px",
        padding: "8px 12px",
        fontSize: 12,
        color: "#f4f4f5",
        pointerEvents: "none",
      }}
    >
      <p style={{ color: "#a1a1aa", marginBottom: 4 }}>{name}</p>
      <p>
        <span style={{ fontWeight: 600 }}>{size.toLocaleString()}</span>
        <span style={{ color: "#a1a1aa" }}> page views</span>
      </p>
    </div>
  );
}

function TreemapCell({ x = 0, y = 0, width = 0, height = 0, name = "", index = 0 }: CellProps) {
  const fill = COLORS[index % COLORS.length];
  const showLabel = width > 60 && height > 32;
  const label = name.length > 24 ? name.slice(0, 22) + "…" : name;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        stroke="#fff"
        strokeWidth={2}
        rx={4}
      />
      {showLabel && (
        <text
          x={x + width / 2}
          y={y + height / 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#fff"
          fontSize={11}
          fontWeight={500}
        >
          {label}
        </text>
      )}
    </g>
  );
}

export function PageViewsTreemap({ data, title }: PageViewsTreemapProps) {
  const treemapData = data.map((d) => ({ name: d.name, size: d.value }));

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
      {title && (
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
          {title}
        </h2>
      )}
      <ResponsiveContainer width="100%" height={400}>
        <Treemap
          data={treemapData}
          dataKey="size"
          aspectRatio={4 / 3}
          content={(props) => <TreemapCell {...(props as CellProps)} />}
        >
          <Tooltip content={<TreemapTooltip />} />
        </Treemap>
      </ResponsiveContainer>
    </div>
  );
}
