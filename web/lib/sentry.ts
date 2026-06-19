function getSentryBase(): string {
  const token = process.env.SENTRY_AUTH_TOKEN ?? "";
  if (token.startsWith("sntrys_")) {
    try {
      const b64 = token.slice(7, token.lastIndexOf("_"));
      const payload = JSON.parse(
        Buffer.from(b64, "base64").toString()
      ) as { region_url?: string };
      if (payload.region_url) return `${payload.region_url}/api/0`;
    } catch {
      // fall through to default
    }
  }
  return process.env.SENTRY_BASE_URL ?? "https://sentry.io/api/0";
}

async function sentryFetch<T>(
  path: string,
  params: Array<[string, string]> = []
): Promise<T> {
  const token = process.env.SENTRY_AUTH_TOKEN;
  if (!token) throw new Error("SENTRY_AUTH_TOKEN is not set");

  const url = new URL(`${getSentryBase()}${path}`);
  for (const [key, val] of params) {
    url.searchParams.append(key, val);
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Sentry ${res.status} at ${path}: ${body.slice(0, 300)}`);
  }

  return res.json() as Promise<T>;
}

async function getProjectNumericId(org: string, slug: string): Promise<string> {
  const data = await sentryFetch<{ id: string | number }>(
    `/projects/${org}/${slug}/`
  );
  return String(data.id);
}

export interface SentryMetrics {
  totalErrors: number;
  crashFreePercent: number;
  transactions: Array<{ transaction: string; p50ms: number; count: number }>;
}

export async function getSentryMetrics(
  startDate: string,
  endDate: string,
): Promise<SentryMetrics> {
  const org = process.env.SENTRY_ORG;
  const projectSlug = process.env.SENTRY_PROJECT;

  if (!org || !projectSlug) {
    throw new Error("SENTRY_ORG and SENTRY_PROJECT env vars must be set");
  }

  const projectId = await getProjectNumericId(org, projectSlug);

  // Sentry expects ISO 8601 datetimes for start/end
  const start = `${startDate}T00:00:00`;
  const end = `${endDate}T23:59:59`;

  const [errorsResult, sessionsResult, eventsResult] = await Promise.allSettled([
    sentryFetch<StatsV2Response>(`/organizations/${org}/stats_v2/`, [
      ["category", "error"],
      ["interval", "1d"],
      ["start", start],
      ["end", end],
      ["outcome", "accepted"],
      ["field", "sum(quantity)"],
      ["project", projectId],
    ]),
    sentryFetch<SessionsResponse>(`/organizations/${org}/sessions/`, [
      ["project", projectId],
      ["field", "sum(session)"],
      ["groupBy", "session.status"],
      ["interval", "1d"],
      ["start", start],
      ["end", end],
    ]),
    sentryFetch<EventsResponse>(`/organizations/${org}/events/`, [
      ["field", "transaction"],
      ["field", "p50(transaction.duration)"],
      ["field", "count()"],
      ["query", `event.type:transaction transaction.op:navigation project:${projectSlug}`],
      ["start", start],
      ["end", end],
      ["sort", "-count()"],
      ["per_page", "20"],
    ]),
  ]);

  let totalErrors = 0;
  if (errorsResult.status === "fulfilled") {
    const series = errorsResult.value.groups?.[0]?.series?.["sum(quantity)"] ?? [];
    totalErrors = series.reduce((sum, n) => sum + n, 0);
  }

  let crashFreePercent = 100;
  if (sessionsResult.status === "fulfilled") {
    const groups = sessionsResult.value.groups ?? [];
    const total = groups.reduce((sum, g) => sum + (g.totals?.["sum(session)"] ?? 0), 0);
    const crashed =
      groups.find((g) => g.by?.["session.status"] === "crashed")?.totals?.["sum(session)"] ?? 0;
    if (total > 0) {
      crashFreePercent = ((total - crashed) / total) * 100;
    }
  } else {
    console.error("[Sentry sessions error]", sessionsResult.reason);
  }

  let transactions: SentryMetrics["transactions"] = [];
  if (eventsResult.status === "fulfilled") {
    transactions = (eventsResult.value.data ?? []).map((row) => ({
      transaction: String(row.transaction),
      p50ms: Number(row["p50(transaction.duration)"]),
      count: Number(row["count()"]),
    }));
  }

  return { totalErrors, crashFreePercent, transactions };
}

interface StatsV2Response {
  groups?: Array<{
    series: { "sum(quantity)": number[] };
    totals: { "sum(quantity)": number };
  }>;
}

interface SessionsResponse {
  groups?: Array<{
    by?: { "session.status"?: string };
    totals?: { "sum(session)"?: number };
  }>;
}

interface EventsResponse {
  data?: Array<Record<string, unknown>>;
}
