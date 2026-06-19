import { SentryIcon } from "@/assets/icons/icons";
import Link from "next/link";

const integrations = [
  {
    id: "portal",
    href: "/portal",
    label: "Portal",
    source: "Sentry, Google Analytics",
    description:
      "Error rates, crash-free sessions, and page-level P50 performance for the past 7 days.",
    status: "live" as const,
    icon: <SentryIcon className="w-5 h-5" />,
    iconBg: "bg-violet-100 dark:bg-violet-950",
    iconColor: "text-violet-600 dark:text-violet-400",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-5xl mx-auto px-8 pt-20 pb-24">
        {/* Header */}
        <div className="mb-14">
          <p className="text-xs font-semibold tracking-widest uppercase text-zinc-400 dark:text-zinc-500 mb-3">
            Internal Tools
          </p>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            KPI Dashboard
          </h1>
          <p className="mt-3 text-lg text-zinc-500 dark:text-zinc-400 max-w-lg">
            Engineering metrics aggregated from different sources all viewable
            in one place.
          </p>
        </div>

        {/* Integration cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {integrations.map((item) => (
            <IntegrationCard key={item.id} {...item} />
          ))}
        </div>
      </div>
    </div>
  );
}

function IntegrationCard({
  href,
  label,
  source,
  description,
  status,
  icon,
  iconBg,
  iconColor,
}: (typeof integrations)[number]) {
  const isLive = status === "live";

  const inner = (
    <>
      {/* Top row: icon + badge */}
      <div className="flex items-start justify-between mb-5">
        <div
          className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center ${iconColor}`}
        >
          {icon}
        </div>
        {isLive ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
            Live
          </span>
        ) : (
          <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded-full">
            Soon
          </span>
        )}
      </div>

      {/* Text */}
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-1">
        {source}
      </p>
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 mb-2">
        {label}
      </h2>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed flex-1">
        {description}
      </p>

      {/* CTA */}
      {isLive && (
        <div className="mt-5 flex items-center gap-1.5 text-sm font-medium text-zinc-900 dark:text-zinc-50 group-hover:gap-2.5 transition-all duration-150">
          View dashboard
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
            className="shrink-0"
          >
            <path
              d="M2.5 7h9M7.5 3l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
    </>
  );

  if (isLive && href) {
    return (
      <Link
        href={href}
        className="group relative flex flex-col bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-sm transition-all duration-150"
      >
        {inner}
      </Link>
    );
  }

  return (
    <div className="relative flex flex-col bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 opacity-50 cursor-default select-none">
      {inner}
    </div>
  );
}
