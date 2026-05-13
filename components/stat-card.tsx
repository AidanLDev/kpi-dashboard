export function StatCard({
  label,
  value,
  description,
  valueColor = "text-zinc-900 dark:text-zinc-50",
}: {
  label: string;
  value: string;
  description: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
      <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className={`text-3xl font-bold mt-1 tabular-nums ${valueColor}`}>
        {value}
      </p>
      <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1.5">
        {description}
      </p>
    </div>
  );
}
