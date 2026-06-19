import { createSign } from "crypto";

async function getAccessToken(): Promise<string> {
  const clientEmail = process.env.GA_CLIENT_EMAIL;
  const privateKey = process.env.GA_PRIVATE_KEY;

  if (!clientEmail || !privateKey) {
    throw new Error("GA_CLIENT_EMAIL and GA_PRIVATE_KEY env vars must be set");
  }

  const key = privateKey.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);

  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" })
  ).toString("base64url");

  const payload = Buffer.from(
    JSON.stringify({
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/analytics.readonly",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  ).toString("base64url");

  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(key, "base64url");

  const jwt = `${header}.${payload}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GA OAuth2 ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export interface GAMetrics {
  totalViews: number;
  avgEngagementSeconds: number;
  pageAvgTimes: Record<string, number>; // pagePath → avg engagement seconds per view
  pageViews: Record<string, number>; // pagePath → view count
  sessionsByDate: Record<string, number>; // "YYYYMMDD" → session count
  bounceRate: number; // 0–100
  deviceBreakdown: { desktop: number; mobile: number; tablet: number }; // percentages
}

export async function getGAMetrics(
  startDate: string,
  endDate: string,
): Promise<GAMetrics> {
  const propertyId = process.env.GA_PROPERTY_ID;
  if (!propertyId) {
    throw new Error("GA_PROPERTY_ID env var must be set");
  }

  const accessToken = await getAccessToken();

  const runReport = (body: object) =>
    fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

  const dateRanges = [{ startDate, endDate }];

  const [summaryRes, pageRes, deviceRes, dateRes] = await Promise.all([
    runReport({
      dateRanges,
      metrics: [
        { name: "screenPageViews" },
        { name: "userEngagementDuration" },
        { name: "activeUsers" },
        { name: "bounceRate" },
      ],
    }),
    runReport({
      dateRanges,
      dimensions: [{ name: "pagePath" }],
      metrics: [
        { name: "userEngagementDuration" },
        { name: "screenPageViews" },
      ],
    }),
    runReport({
      dateRanges,
      dimensions: [{ name: "deviceCategory" }],
      metrics: [{ name: "sessions" }],
    }),
    runReport({
      dateRanges,
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }],
    }),
  ]);

  if (!summaryRes.ok) {
    const body = await summaryRes.text().catch(() => "");
    throw new Error(`GA Data API ${summaryRes.status}: ${body.slice(0, 300)}`);
  }
  if (!pageRes.ok) {
    const body = await pageRes.text().catch(() => "");
    throw new Error(`GA Data API (pages) ${pageRes.status}: ${body.slice(0, 300)}`);
  }
  if (!deviceRes.ok) {
    const body = await deviceRes.text().catch(() => "");
    throw new Error(`GA Data API (devices) ${deviceRes.status}: ${body.slice(0, 300)}`);
  }
  if (!dateRes.ok) {
    const body = await dateRes.text().catch(() => "");
    throw new Error(`GA Data API (dates) ${dateRes.status}: ${body.slice(0, 300)}`);
  }

  const summaryData = (await summaryRes.json()) as GASummaryResponse;
  const pageData = (await pageRes.json()) as GAPageResponse;
  const deviceData = (await deviceRes.json()) as GADeviceResponse;
  const dateData = (await dateRes.json()) as GADateResponse;

  const values = summaryData.rows?.[0]?.metricValues;
  const totalViews = Number(values?.[0]?.value ?? "0");
  const userEngagementDuration = Number(values?.[1]?.value ?? "0");
  const activeUsers = Number(values?.[2]?.value ?? "0");
  const bounceRate = Number(values?.[3]?.value ?? "0") * 100;
  const avgEngagementSeconds =
    activeUsers > 0 ? userEngagementDuration / activeUsers : 0;

  const pageAvgTimes: Record<string, number> = {};
  const pageViews: Record<string, number> = {};
  for (const row of pageData.rows ?? []) {
    const path = row.dimensionValues[0].value;
    const duration = Number(row.metricValues[0].value);
    const views = Number(row.metricValues[1].value);
    if (views > 0) pageAvgTimes[path] = duration / views;
    pageViews[path] = views;
  }

  const sessionsByDate: Record<string, number> = {};
  for (const row of dateData.rows ?? []) {
    const date = row.dimensionValues[0].value;
    sessionsByDate[date] = Number(row.metricValues[0].value);
  }

  const deviceSessions: Record<string, number> = {};
  for (const row of deviceData.rows ?? []) {
    deviceSessions[row.dimensionValues[0].value] = Number(row.metricValues[0].value);
  }
  const totalSessions = Object.values(deviceSessions).reduce((a, b) => a + b, 0);
  const pct = (key: string) =>
    totalSessions > 0 ? (deviceSessions[key] ?? 0) / totalSessions * 100 : 0;
  const deviceBreakdown = {
    desktop: pct("desktop"),
    mobile: pct("mobile"),
    tablet: pct("tablet"),
  };

  return { totalViews, avgEngagementSeconds, pageAvgTimes, pageViews, sessionsByDate, bounceRate, deviceBreakdown };
}

interface GASummaryResponse {
  rows?: Array<{ metricValues: Array<{ value: string }> }>;
}

interface GAPageResponse {
  rows?: Array<{
    dimensionValues: Array<{ value: string }>;
    metricValues: Array<{ value: string }>;
  }>;
}

interface GADeviceResponse {
  rows?: Array<{
    dimensionValues: Array<{ value: string }>;
    metricValues: Array<{ value: string }>;
  }>;
}

interface GADateResponse {
  rows?: Array<{
    dimensionValues: Array<{ value: string }>;
    metricValues: Array<{ value: string }>;
  }>;
}
