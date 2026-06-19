"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { getSession, signOut } from "@/lib/auth";
import { StatCard } from "@/components/stat-card";
import { TransactionTable } from "@/components/transaction-table";
import { DateRangePicker } from "@/components/date-range-picker";
import { ChevronLeft, SentryIcon } from "@/assets/icons/icons";
import { UserSessionsBarChart, BarChartDataPoint } from "@/components/charts/BarChart";
import { PageViewsTreemap, TreemapDataPoint } from "@/components/charts/TreemapChart";

interface SentryMetrics {
  totalErrors: number;
  crashFreePercent: number;
  transactions: Array<{ transaction: string; p50ms: number; count: number }>;
}

interface GAMetrics {
  totalViews: number;
  avgEngagementSeconds: number;
  pageAvgTimes: Record<string, number>;
  pageViews: Record<string, number>;
  sessionsByDate: Record<string, number>;
  bounceRate: number;
  deviceBreakdown: { desktop: number; mobile: number; tablet: number };
}

interface TimestreamMetrics {
  rows: Array<{ userId: string }>;
  byDate: Record<string, number>;
}

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

function gaDateToISO(gaDate: string): string {
  return `${gaDate.slice(0, 4)}-${gaDate.slice(4, 6)}-${gaDate.slice(6, 8)}`;
}

function formatDisplayDate(isoDate: string): string {
  const d = new Date(isoDate + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function PortalPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const today = new Date();
  const defaultTo = toISODate(today);
  const defaultFrom = toISODate(new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000));

  const from = searchParams.get("from") ?? defaultFrom;
  const to = searchParams.get("to") ?? defaultTo;

  const [sentry, setSentry] = useState<SentryMetrics | null>(null);
  const [ga, setGa] = useState<GAMetrics | null>(null);
  const [timestream, setTimestream] = useState<TimestreamMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [sentryResult, gaResult, timestreamResult] = await Promise.allSettled([
      apiFetch<SentryMetrics>("/sentry", { from, to }),
      apiFetch<GAMetrics>("/ga", { from, to }),
      apiFetch<TimestreamMetrics>("/timestream", { from, to }),
    ]);

    if (sentryResult.status === "fulfilled") setSentry(sentryResult.value);
    else setError(sentryResult.reason instanceof Error ? sentryResult.reason.message : "Failed to load Sentry data");

    if (gaResult.status === "fulfilled") setGa(gaResult.value);
    if (timestreamResult.status === "fulfilled") setTimestream(timestreamResult.value);

    setLoading(false);
  }, [from, to]);

  useEffect(() => {
    getSession()
      .then(() => fetchData())
      .catch(() => router.push("/login"));
  }, [fetchData, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="max-w-lg w-full text-center p-8">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-3">
            Failed to load data
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

  const { totalErrors = 0, crashFreePercent = 100, transactions = [] } = sentry ?? {};

  const sessionsByDateISO: Record<string, number> = {};
  for (const [k, v] of Object.entries(ga?.sessionsByDate ?? {})) {
    sessionsByDateISO[gaDateToISO(k)] = v;
  }
  const uniqueUsersByDate = timestream?.byDate ?? {};
  const allDates = Array.from(
    new Set([...Object.keys(sessionsByDateISO), ...Object.keys(uniqueUsersByDate)])
  ).sort();
  const barChartData: BarChartDataPoint[] = allDates.map((d) => ({
    date: formatDisplayDate(d),
    sessions: sessionsByDateISO[d] ?? 0,
    uniqueUsers: uniqueUsersByDate[d] ?? 0,
  }));

  const groupedPageViews: Record<string, number> = {};
  for (const [p, views] of Object.entries(ga?.pageViews ?? {})) {
    const key = /^\/locations\/[^/]+$/.test(p)
      ? "/locations/[locationId]"
      : /^\/on_boarding\/[^/]+$/.test(p)
      ? "/on_boarding/[userId]"
      : p;
    groupedPageViews[key] = (groupedPageViews[key] ?? 0) + views;
  }
  const treemapData: TreemapDataPoint[] = Object.entries(groupedPageViews)
    .map(([name, value]) => ({ name, value }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
          >
            <ChevronLeft />
            Home
          </Link>
          <button
            onClick={() => { signOut(); router.push("/login"); }}
            className="text-sm text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors"
          >
            Sign out
          </button>
        </div>

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
            value={(ga?.totalViews ?? 0).toLocaleString()}
            description="Page views"
          />
          <StatCard
            label="Avg. Engagement Time"
            value={formatDuration(ga?.avgEngagementSeconds ?? 0)}
            description="Per active user"
          />
          <StatCard
            label="Non PV users"
            value={String(timestream?.rows.length ?? 0)}
            description="Unique non PV users that have logged in"
          />
          <StatCard
            label="Bounce Rate"
            value={`${(ga?.bounceRate ?? 0).toFixed(1)}%`}
            description="Sessions with no engagement"
            valueColor={
              (ga?.bounceRate ?? 0) <= 40
                ? "text-green-600 dark:text-green-400"
                : (ga?.bounceRate ?? 0) <= 60
                  ? "text-yellow-600 dark:text-yellow-400"
                  : "text-red-600 dark:text-red-400"
            }
          />
          <StatCard
            label="Mobile vs Desktop"
            value={`${(ga?.deviceBreakdown.mobile ?? 0).toFixed(0)}% / ${(ga?.deviceBreakdown.desktop ?? 0).toFixed(0)}%`}
            description="Mobile · Desktop share"
          />
        </div>

        <TransactionTable
          from={from}
          to={to}
          transactions={transactions.map((t) => ({
            ...t,
            avgTimeSeconds: ga ? lookupAvgTime(t.transaction, ga.pageAvgTimes) : undefined,
          }))}
        />

        {barChartData.length > 0 && (
          <div className="mt-4">
            <UserSessionsBarChart
              data={barChartData}
              title="Unique Users (NON PV) and Number of Sessions"
            />
          </div>
        )}

        {treemapData.length > 0 && (
          <div className="mt-4">
            <PageViewsTreemap data={treemapData} title="Page Views" />
          </div>
        )}
      </div>
    </div>
  );
}
