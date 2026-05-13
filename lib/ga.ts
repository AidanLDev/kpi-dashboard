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
}

export async function getGAMetrics(): Promise<GAMetrics> {
  const propertyId = process.env.GA_PROPERTY_ID;
  if (!propertyId) {
    throw new Error("GA_PROPERTY_ID env var must be set");
  }

  const accessToken = await getAccessToken();

  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
        metrics: [
          { name: "screenPageViews" },
          { name: "userEngagementDuration" },
          { name: "activeUsers" },
        ],
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GA Data API ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as GAReportResponse;
  const values = data.rows?.[0]?.metricValues;

  const totalViews = Number(values?.[0]?.value ?? "0");
  const userEngagementDuration = Number(values?.[1]?.value ?? "0");
  const activeUsers = Number(values?.[2]?.value ?? "0");
  const avgEngagementSeconds =
    activeUsers > 0 ? userEngagementDuration / activeUsers : 0;

  return { totalViews, avgEngagementSeconds };
}

interface GAReportResponse {
  rows?: Array<{
    metricValues: Array<{ value: string }>;
  }>;
}
