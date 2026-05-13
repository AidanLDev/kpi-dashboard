import { getSentryMetrics } from "@/lib/sentry";

export async function GET() {
  try {
    const data = await getSentryMetrics();
    return Response.json(data);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
