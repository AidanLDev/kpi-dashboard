import json
import os
import time
import datetime
import urllib.request
import urllib.parse
import urllib.error

import boto3
from google.oauth2 import service_account
from google.auth.transport.requests import Request

TIMESTREAM_DATABASE = os.environ["TIMESTREAM_DATABASE"]
TIMESTREAM_TABLE = os.environ["TIMESTREAM_TABLE"]
GA_PROPERTY_ID = os.environ["GA_PROPERTY_ID"]
SENTRY_AUTH_TOKEN = os.environ["SENTRY_AUTH_TOKEN"]
SENTRY_ORG = os.environ["SENTRY_ORG"]
SENTRY_PROJECT = os.environ["SENTRY_PROJECT"]

PAGE_PATH_TO_METRIC = {
    "/": "avg_time_home",
    "/admin": "avg_time_admin",
    "/analytics": "avg_time_analytics",
    "/locations": "avg_time_locations",
    "/orders": "avg_time_orders",
    "/overvu": "avg_time_overvu",
    "/reports": "avg_time_reports",
    "/settings": "avg_time_settings",
    "/survey": "avg_time_survey",
    "/on_boarding": "avg_time_onboarding",
}

GA_SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"]


def get_ga_token() -> str:
    client_email = os.environ["GA_CLIENT_EMAIL"]
    private_key = os.environ["GA_PRIVATE_KEY"].replace("\\n", "\n")

    creds = service_account.Credentials.from_service_account_info(
        {
            "type": "service_account",
            "client_email": client_email,
            "private_key": private_key,
            "token_uri": "https://oauth2.googleapis.com/token",
        },
        scopes=GA_SCOPES,
    )
    creds.refresh(Request())
    return creds.token


def ga_run_report(token: str, body: dict) -> dict:
    url = f"https://analyticsdata.googleapis.com/v1beta/properties/{GA_PROPERTY_ID}:runReport"
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def sentry_get(path: str, params: dict) -> dict:
    base = "https://sentry.io/api/0"
    qs = urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(
        f"{base}{path}?{qs}",
        headers={"Authorization": f"Bearer {SENTRY_AUTH_TOKEN}"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def get_sentry_project_id() -> str:
    data = sentry_get(f"/projects/{SENTRY_ORG}/{SENTRY_PROJECT}/", {})
    return str(data["id"])


def collect_metrics(yesterday: str) -> dict[str, float]:
    metrics: dict[str, float] = {}

    # --- GA4 ---
    token = get_ga_token()

    summary = ga_run_report(token, {
        "dateRanges": [{"startDate": yesterday, "endDate": yesterday}],
        "metrics": [
            {"name": "screenPageViews"},
            {"name": "userEngagementDuration"},
            {"name": "activeUsers"},
            {"name": "bounceRate"},
            {"name": "sessions"},
        ],
    })
    row = (summary.get("rows") or [{}])[0]
    vals = [float(v["value"]) for v in row.get("metricValues", [0, 0, 0, 0, 0])]
    total_views, engagement_dur, active_users, bounce_rate_raw, sessions = vals

    metrics["total_views"] = total_views
    metrics["unique_users"] = active_users
    metrics["bounce_rate"] = bounce_rate_raw * 100
    metrics["avg_session_duration"] = (
        engagement_dur / active_users if active_users > 0 else 0.0
    )

    page_report = ga_run_report(token, {
        "dateRanges": [{"startDate": yesterday, "endDate": yesterday}],
        "dimensions": [{"name": "pagePath"}],
        "metrics": [{"name": "userEngagementDuration"}, {"name": "screenPageViews"}],
    })
    for row in page_report.get("rows") or []:
        path = row["dimensionValues"][0]["value"]
        dur = float(row["metricValues"][0]["value"])
        views = float(row["metricValues"][1]["value"])
        # Normalise dynamic segments e.g. /locations/abc → /locations/[location]
        normalised = path
        parts = path.split("/")
        if len(parts) == 3 and parts[1] == "locations" and parts[2]:
            normalised = "/locations/[location]"
        metric_name = PAGE_PATH_TO_METRIC.get(normalised)
        if metric_name and views > 0:
            metrics[metric_name] = dur / views

    device_report = ga_run_report(token, {
        "dateRanges": [{"startDate": yesterday, "endDate": yesterday}],
        "dimensions": [{"name": "deviceCategory"}],
        "metrics": [{"name": "sessions"}],
    })
    device_sessions: dict[str, float] = {}
    for row in device_report.get("rows") or []:
        device_sessions[row["dimensionValues"][0]["value"]] = float(row["metricValues"][0]["value"])
    total_device = sum(device_sessions.values())
    if total_device > 0:
        metrics["desktop_usage_rate"] = device_sessions.get("desktop", 0) / total_device * 100

    # --- Sentry ---
    try:
        project_id = get_sentry_project_id()

        errors_data = sentry_get(f"/organizations/{SENTRY_ORG}/stats_v2/", {
            "category": "error",
            "interval": "1d",
            "statsPeriod": "1d",
            "outcome": "accepted",
            "field": "sum(quantity)",
            "project": project_id,
        })
        series = (errors_data.get("groups") or [{}])[0].get("series", {}).get("sum(quantity)", [])
        metrics["total_errors"] = float(sum(series))

        sessions_data = sentry_get(f"/organizations/{SENTRY_ORG}/sessions/", {
            "project": project_id,
            "field": "sum(session)",
            "groupBy": "session.status",
            "statsPeriod": "1d",
        })
        groups = sessions_data.get("groups") or []
        total_sessions = sum(g["totals"]["sum(session)"] for g in groups)
        crashed = next(
            (g["totals"]["sum(session)"] for g in groups if g["by"]["session.status"] == "crashed"),
            0,
        )
        if total_sessions > 0:
            metrics["crash_free_rate"] = (total_sessions - crashed) / total_sessions * 100
            metrics["error_rate"] = crashed / total_sessions * 100
        else:
            metrics["crash_free_rate"] = 100.0
            metrics["error_rate"] = 0.0
    except Exception as e:
        print(f"Sentry fetch failed (non-fatal): {e}")

    return metrics


def write_to_timestream(metrics: dict[str, float], ts_ms: int) -> int:
    client = boto3.client("timestream-write", region_name="eu-west-1")
    records = [
        {
            "Time": str(ts_ms),
            "TimeUnit": "MILLISECONDS",
            "MeasureName": "value",
            "MeasureValue": str(v),
            "MeasureValueType": "DOUBLE",
            "Dimensions": [{"Name": "metric_name", "Value": k}],
        }
        for k, v in metrics.items()
    ]

    rejected_total = 0
    # Timestream max batch size is 100
    for i in range(0, len(records), 100):
        batch = records[i : i + 100]
        resp = client.write_records(
            DatabaseName=TIMESTREAM_DATABASE,
            TableName=TIMESTREAM_TABLE,
            Records=batch,
        )
        rejected = resp.get("RecordsIngested", {})
        rejected_total += len(batch) - rejected.get("Total", len(batch))

    return len(records) - rejected_total


def handler(event, context):
    yesterday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    # Timestamp: yesterday at midnight UTC in milliseconds
    ts_ms = int(
        datetime.datetime.combine(
            datetime.date.fromisoformat(yesterday), datetime.time.min,
            tzinfo=datetime.timezone.utc,
        ).timestamp() * 1000
    )

    print(f"Collecting metrics for {yesterday}")
    metrics = collect_metrics(yesterday)
    print(f"Collected {len(metrics)} metrics: {list(metrics.keys())}")

    written = write_to_timestream(metrics, ts_ms)
    print(f"Written {written}/{len(metrics)} records to Timestream")

    return {
        "statusCode": 200,
        "body": json.dumps({"date": yesterday, "written": written, "total": len(metrics)}),
    }
