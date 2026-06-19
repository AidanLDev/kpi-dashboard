"use client";

import { useRouter } from "next/navigation";

interface DateRangePickerProps {
  from: string;
  to: string;
}

const DATA_START = "2024-12-23";

const PRESETS = [
  { label: "1W", days: 7 },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
] as const;

function toISODate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function DateRangePicker({ from, to }: DateRangePickerProps) {
  const router = useRouter();
  const today = toISODate(new Date());

  function navigate(nextFrom: string, nextTo: string) {
    const params = new URLSearchParams({ from: nextFrom, to: nextTo });
    router.push(`?${params.toString()}`);
  }

  function handleChange(key: "from" | "to", value: string) {
    if (!value) return;
    navigate(key === "from" ? value : from, key === "to" ? value : to);
  }

  function applyPreset(days: number) {
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    // clamp start to data beginning
    const clampedStart = toISODate(start) < DATA_START ? DATA_START : toISODate(start);
    navigate(clampedStart, toISODate(end));
  }

  function isActivePreset(days: number): boolean {
    const end = new Date();
    const start = new Date(end.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    const clampedStart = toISODate(start) < DATA_START ? DATA_START : toISODate(start);
    return from === clampedStart && to === toISODate(end);
  }

  return (
    <div className="flex items-center gap-3 flex-wrap justify-end">
      <div className="flex items-center gap-1">
        {PRESETS.map(({ label, days }) => (
          <button
            key={label}
            onClick={() => applyPreset(days)}
            className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              isActivePreset(days)
                ? "bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300"
                : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="date"
          value={from}
          min={DATA_START}
          max={to}
          onChange={(e) => handleChange("from", e.target.value)}
          className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 text-sm px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
        <span className="text-sm text-zinc-400">to</span>
        <input
          type="date"
          value={to}
          min={from}
          max={today}
          onChange={(e) => handleChange("to", e.target.value)}
          className="rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 text-sm px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>
    </div>
  );
}
