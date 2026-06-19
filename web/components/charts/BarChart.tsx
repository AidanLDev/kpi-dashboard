"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

export interface BarChartDataPoint {
  date: string;
  sessions: number;
  uniqueUsers: number;
}

interface UserSessionsBarChartProps {
  data: BarChartDataPoint[];
  title?: string;
}

export function UserSessionsBarChart({ data, title }: UserSessionsBarChartProps) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
      {title && (
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-4">
          {title}
        </h2>
      )}
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#71717a" strokeOpacity={0.3} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#71717a" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#71717a" }}
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: "8px",
              color: "#f4f4f5",
              fontSize: 12,
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, color: "#71717a", paddingTop: 8 }}
          />
          <Bar dataKey="uniqueUsers" name="Unique Users" fill="#3b82f6" radius={[2, 2, 0, 0]} />
          <Bar dataKey="sessions" name="Sessions" fill="#ef4444" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
