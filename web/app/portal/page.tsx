import Link from "next/link";
import { getSentryMetrics, SentryMetrics } from "@/lib/sentry";
import { getGAMetrics, GAMetrics } from "@/lib/ga";
import { getTimestreamData, UserActivityRow } from "@/lib/aws";
import { StatCard } from "@/components/stat-card";
import { TransactionTable } from "@/components/transaction-table";
import { DateRangePicker } from "@/components/date-range-picker";
import { ChevronLeft, SentryIcon } from "@/assets/icons/icons";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function lookupAvgTime(
  transaction: string,
  pageAvgTimes: Record<string, number>
): number | undefined {
  if (transaction in pageAvgTimes) return pageAvgTimes[transaction];
  if (!transaction.includes("[")) return undefined;
  // Dynamic routes: aggregate all GA paths that match the template
  const re = new RegExp(
    "^" + transaction.replace(/\[[^\]]+\]/g, "[^/]+") + "$"
  );
  const matches = Object.entries(pageAvgTimes).filter(([p]) => re.test(p));
  if (matches.length === 0) return undefined;
  return matches.reduce((sum, [, v]) => sum + v, 0) / matches.length;
}

function toISODate(d: Date): string {
  return d.toISOString().split("T")[0];
}

export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;

  const today = new Date();
  const defaultTo = toISODate(today);
  const defaultFrom = toISODate(new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000));

  const from = typeof params.from === "string" ? params.from : defaultFrom;
  const to = typeof params.to === "string" ? params.to : defaultTo;

  let metrics: SentryMetrics | null = null;
  let error: string | null = null;
  let gaMetrics: GAMetrics | null = null;
  let timestreamMetrics: UserActivityRow[] | null = null;

  const [sentryResult, gaResult, timestreamResult] = await Promise.allSettled([
    getSentryMetrics(from, to),
    getGAMetrics(from, to),
    getTimestreamData(from, to),
  ]);

  if (timestreamResult.status === "fulfilled") {
    timestreamMetrics = timestreamResult.value;
  } else {
    console.error("[Timestream error]", timestreamResult.reason);
  }

  if (sentryResult.status === "fulfilled") {
    metrics = sentryResult.value;
  } else {
    error =
      sentryResult.reason instanceof Error
        ? sentryResult.reason.message
        : "An unknown error occurred";
  }

  if (gaResult.status === "fulfilled") {
    gaMetrics = gaResult.value;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="max-w-lg w-full text-center p-8">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-3">
            Failed to load Sentry data
          </h1>
          <pre className="text-sm text-zinc-500 dark:text-zinc-400 font-mono bg-zinc-100 dark:bg-zinc-900 rounded-lg p-4 text-left whitespace-pre-wrap break-all">
            {error}
          </pre>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 mt-6 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
          >
            <ChevronLeft />
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  const { totalErrors, crashFreePercent, transactions } = metrics!;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8">
      <div className="max-w-5xl mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 mb-6 text-sm font-medium text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
        >
          <ChevronLeft />
          Home
        </Link>

        <header className="mb-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <div className="w-6 h-6 rounded-md bg-violet-100 dark:bg-violet-950 flex items-center justify-center">
                  <SentryIcon className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                </div>
                <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                  Portal
                </h1>
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {from} – {to} · Sentry · Google Analytics · Timestream
              </p>
            </div>
            <DateRangePicker from={from} to={to} />
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-8">
          <StatCard
            label="Total Errors"
            value={totalErrors.toLocaleString()}
            description="Accepted error events"
          />
          <StatCard
            label="Crash-Free Sessions"
            value={`${crashFreePercent.toFixed(2)}%`}
            description="Sessions without a crash"
            valueColor={
              crashFreePercent >= 99.5
                ? "text-green-600 dark:text-green-400"
                : crashFreePercent >= 95
                  ? "text-yellow-600 dark:text-yellow-400"
                  : "text-red-600 dark:text-red-400"
            }
          />
          <StatCard
            label="Total Views"
            value={(gaMetrics?.totalViews ?? 0).toLocaleString()}
            description="Page views"
          />
          <StatCard
            label="Avg. Engagement Time"
            value={formatDuration(gaMetrics?.avgEngagementSeconds ?? 0)}
            description="Per active user"
          />
          <StatCard
            label="Non PV users"
            value={String(
              timestreamResult.status === "fulfilled"
                ? timestreamMetrics?.length
                : 0,
            )}
            description="Unique non PV users that have logged in"
          />
          <StatCard
            label="Bounce Rate"
            value={`${(gaMetrics?.bounceRate ?? 0).toFixed(1)}%`}
            description="Sessions with no engagement"
            valueColor={
              (gaMetrics?.bounceRate ?? 0) <= 40
                ? "text-green-600 dark:text-green-400"
                : (gaMetrics?.bounceRate ?? 0) <= 60
                  ? "text-yellow-600 dark:text-yellow-400"
                  : "text-red-600 dark:text-red-400"
            }
          />
          <StatCard
            label="Mobile vs Desktop"
            value={`${(gaMetrics?.deviceBreakdown.mobile ?? 0).toFixed(0)}% / ${(gaMetrics?.deviceBreakdown.desktop ?? 0).toFixed(0)}%`}
            description="Mobile · Desktop share"
          />
        </div>

        <TransactionTable
          from={from}
          to={to}
          transactions={transactions.map((t) => ({
            ...t,
            avgTimeSeconds: gaMetrics
              ? lookupAvgTime(t.transaction, gaMetrics.pageAvgTimes)
              : undefined,
          }))}
        />
      </div>
    </div>
  );
}
