import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
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

interface GAMetrics {
  totalViews: number;
  avgEngagementSeconds: number;
  pageAvgTimes: Record<string, number>;
  pageViews: Record<string, number>;
  sessionsByDate: Record<string, number>;
  bounceRate: number;
  deviceBreakdown: { desktop: number; mobile: number; tablet: number };
}

interface GASummaryResponse {
  rows?: Array<{ metricValues: Array<{ value: string }> }>;
}

interface GARowsResponse {
  rows?: Array<{
    dimensionValues: Array<{ value: string }>;
    metricValues: Array<{ value: string }>;
  }>;
}

async function getGAMetrics(startDate: string, endDate: string): Promise<GAMetrics> {
  const propertyId = process.env.GA_PROPERTY_ID;
  if (!propertyId) throw new Error("GA_PROPERTY_ID env var must be set");

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
      metrics: [{ name: "userEngagementDuration" }, { name: "screenPageViews" }],
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

  for (const [label, res] of [
    ["summary", summaryRes],
    ["pages", pageRes],
    ["devices", deviceRes],
    ["dates", dateRes],
  ] as const) {
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`GA Data API (${label}) ${res.status}: ${body.slice(0, 300)}`);
    }
  }

  const summaryData = (await summaryRes.json()) as GASummaryResponse;
  const pageData = (await pageRes.json()) as GARowsResponse;
  const deviceData = (await deviceRes.json()) as GARowsResponse;
  const dateData = (await dateRes.json()) as GARowsResponse;

  const values = summaryData.rows?.[0]?.metricValues;
  const totalViews = Number(values?.[0]?.value ?? "0");
  const userEngagementDuration = Number(values?.[1]?.value ?? "0");
  const activeUsers = Number(values?.[2]?.value ?? "0");
  const bounceRate = Number(values?.[3]?.value ?? "0") * 100;
  const avgEngagementSeconds = activeUsers > 0 ? userEngagementDuration / activeUsers : 0;

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
    sessionsByDate[row.dimensionValues[0].value] = Number(row.metricValues[0].value);
  }

  const deviceSessions: Record<string, number> = {};
  for (const row of deviceData.rows ?? []) {
    deviceSessions[row.dimensionValues[0].value] = Number(row.metricValues[0].value);
  }
  const totalSessions = Object.values(deviceSessions).reduce((a, b) => a + b, 0);
  const pct = (key: string) =>
    totalSessions > 0 ? ((deviceSessions[key] ?? 0) / totalSessions) * 100 : 0;

  return {
    totalViews,
    avgEngagementSeconds,
    pageAvgTimes,
    pageViews,
    sessionsByDate,
    bounceRate,
    deviceBreakdown: {
      desktop: pct("desktop"),
      mobile: pct("mobile"),
      tablet: pct("tablet"),
    },
  };
}

export const handler = async (
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
  const { from, to } = event.queryStringParameters ?? {};

  if (!from || !to) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "from and to query params are required" }),
    };
  }

  try {
    const data = await getGAMetrics(from, to);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    };
  } catch (err) {
    console.error("[ga handler error]", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
    };
  }
};
