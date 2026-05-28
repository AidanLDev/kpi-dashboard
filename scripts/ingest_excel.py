import pandas as pd
import awswrangler as wr
import re

SKIP_ROW_NAMES = {"(add rows as necessary)", "sum"}
DURATION_SECTION_KEYWORDS = {"average time", "session duration"}

METRIC_NAME_MAP = {
    "Number of Sessions": "sessions",
    "Total Views": "total_views",
    "Session Duration (mins:secs)": "avg_session_duration",
    "Unique Users": "unique_users",
    # Per-page average engagement time
    "Average time - Admin": "avg_time_admin",
    "Average time - Analytics": "avg_time_analytics",
    "Average time - Home": "avg_time_home",
    "Average time - Locations": "avg_time_locations",
    "Average time - Orders": "avg_time_orders",
    "Average time - OverVu": "avg_time_overvu",
    "Average time - Reports": "avg_time_reports",
    "Average time - Settings": "avg_time_settings",
    "Average time - Survey": "avg_time_survey",
    "Average time - locations/(location)": "avg_time_location_detail",
    "Average time - on_boarding(user)": "avg_time_onboarding",
    # Overall and per-page load times
    "Page Loading Times": "page_load_time_avg",
    "Page Loading Times - Home": "page_load_time_home",
    "Page Loading Times - Admin": "page_load_time_admin",
    "Page Loading Times - Analytics": "page_load_time_analytics",
    "Page Loading Times - Locations": "page_load_time_locations",
    "Page Loading Times - locations/(location)": "page_load_time_location_detail",
    "Page Loading Times - Notifications": "page_load_time_notifications",
    "Page Loading Times - on_boarding": "page_load_time_onboarding",
    "Page Loading Times - Orders": "page_load_time_orders",
    "Page Loading Times - OverVu": "page_load_time_overvu",
    "Page Loading Times - Reports": "page_load_time_reports",
    "Page Loading Times - Settings": "page_load_time_settings",
    "Page Loading Times - Survey": "page_load_time_survey",
    # Per-page view counts
    "Page Views - Admin": "page_views_admin",
    "Page Views - Analytics": "page_views_analytics",
    "Page Views - Home": "page_views_home",
    "Page Views - Locations": "page_views_locations",
    "Page Views - Orders": "page_views_orders",
    "Page Views - OverVu": "page_views_overvu",
    "Page Views - Reports": "page_views_reports",
    "Page Views - Settings": "page_views_settings",
    "Page Views - Survey": "page_views_survey",
    "Page Views - locations/(location)": "page_views_location_detail",
    "Page Views - on_boarding(user)": "page_views_onboarding",
    # Feature metrics
    "Crash Free Sessions (%)": "crash_free_rate",
    "User Engagement Rate (Bounce Rate)": "bounce_rate",
    "Error Rate (Sessions Crashed %)": "error_rate",
    "Desktop Usage (vs mobile)": "desktop_usage_rate",
}


def get_row_label(row):
    """Returns (label, col0_present). Checks col0 first, falls back to col1."""
    col0 = row.iloc[0]
    col1 = row.iloc[1]
    if not pd.isna(col0) and str(col0).strip():
        return str(col0).strip(), True
    if not pd.isna(col1) and str(col1).strip():
        return str(col1).strip(), False
    return None, False


def is_section_parent(data_frame, row_idx, columns_map):
    """True if this row is followed by >=2 consecutive col1-only data rows.

    Distinguishes a data row that also heads a per-page breakdown (e.g.
    'Page Loading Times') from a plain standalone metric.
    """
    count = 0
    for i in range(row_idx + 1, len(data_frame)):
        row = data_frame.iloc[i]
        label0 = "" if pd.isna(row.iloc[0]) else str(row.iloc[0]).strip()
        label1 = "" if pd.isna(row.iloc[1]) else str(row.iloc[1]).strip()
        if label0:
            break
        if label1:
            if label1.lower() in SKIP_ROW_NAMES:
                break
            if any(not pd.isna(row[c]) for c in columns_map):
                count += 1
    return count >= 2


def to_measure_value(val):
    """Convert raw_value to float for Timestream. HH:MM:SS strings → total seconds."""
    s = str(val).strip()
    m = re.match(r"^(\d{1,2}):(\d{2}):(\d{2})$", s)
    if m:
        return float(int(m.group(1)) * 3600 + int(m.group(2)) * 60 + int(m.group(3)))
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


def parse_duration(value):
    """Normalize any time/duration cell to HH:MM:SS string."""
    if pd.isna(value):
        return None
    if isinstance(value, pd.Timestamp):
        return value.strftime("%H:%M:%S")
    if isinstance(value, pd.Timedelta):
        total = int(value.total_seconds())
        h, rem = divmod(abs(total), 3600)
        m, s = divmod(rem, 60)
        return f"{h:02d}:{m:02d}:{s:02d}"
    s = str(value).strip()
    # "1900-01-01 HH:MM:SS" pandas timestamp string
    match = re.search(r"(\d{2}:\d{2}:\d{2})$", s)
    if match:
        return match.group(1)
    if re.match(r"^\d{1,2}:\d{2}:\d{2}$", s):
        h, mi, sec = s.split(":")
        return f"{int(h):02d}:{mi}:{sec}"
    if re.match(r"^\d{1,2}:\d{2}$", s):
        mi, sec = s.split(":")
        return f"00:{int(mi):02d}:{sec}"
    return s


data_frame = pd.read_excel(
    "KPI_Metrics_Tracking_Template.xlsx", sheet_name="KPI Metrics (2)", header=None
)

# --- Step 1: Map column indices to week-ending dates ---
date_row = data_frame.iloc[1, 1:]
columns_map = {}
unmatched = []

for col_idx, cell_value in date_row.items():
    if pd.isna(cell_value):
        continue
    raw = str(cell_value).strip()

    m = re.search(r"to\s+(\d{2}-\d{2}-\d{4})", raw)
    if m:
        columns_map[col_idx] = pd.to_datetime(m.group(1), format="%d-%m-%Y")
        continue
    m = re.search(r"to\s+(\d{4}-\d{2}-\d{2})", raw)
    if m:
        columns_map[col_idx] = pd.to_datetime(m.group(1), format="%Y-%m-%d")
        continue
    m = re.search(r"->\s*(\d{2}-\d{2}-\d{4})", raw)
    if m:
        columns_map[col_idx] = pd.to_datetime(m.group(1), format="%d-%m-%Y")
        continue
    unmatched.append((col_idx, repr(raw)))

week_dates = sorted(columns_map.values())
print(f"Weeks found ({len(week_dates)}): {[str(d.date()) for d in week_dates]}")
if unmatched:
    print("Unmatched date cells:")
    for col_idx, raw in unmatched:
        print(f"  col {col_idx}: {raw}")

# --- Step 2: Pre-compute which col0-data-rows also act as section parents ---
section_parent_rows = set()
for row_idx in range(2, len(data_frame)):
    row = data_frame.iloc[row_idx]
    col0 = row.iloc[0]
    if pd.isna(col0) or not str(col0).strip():
        continue
    if any(not pd.isna(row[c]) for c in columns_map):
        if is_section_parent(data_frame, row_idx, columns_map):
            section_parent_rows.add(row_idx)

# --- Step 3: Parse metric rows into long format ---
records = []
current_section = None

for row_idx in range(2, len(data_frame)):
    row = data_frame.iloc[row_idx]

    label, col0_present = get_row_label(row)
    if label is None:
        continue

    if label.lower() in SKIP_ROW_NAMES:
        if label.lower() == "sum":
            current_section = None
        continue

    values = {
        col_idx: row[col_idx] for col_idx in columns_map if not pd.isna(row[col_idx])
    }

    if not values:
        current_section = label
        continue

    if col0_present:
        full_name = label
        if row_idx in section_parent_rows:
            current_section = full_name
    else:
        full_name = f"{current_section} - {label}" if current_section else label

    is_duration = any(k in full_name.lower() for k in DURATION_SECTION_KEYWORDS)

    for col_idx, value in values.items():
        records.append(
            {
                "time": columns_map[col_idx],
                "metric_name": full_name,
                "raw_value": parse_duration(value) if is_duration else value,
            }
        )

df_long = pd.DataFrame(records)

# --- Step 4: Apply name mapping ---
df_long["metric_name"] = (
    df_long["metric_name"].map(METRIC_NAME_MAP).fillna(df_long["metric_name"])
)

unmapped = sorted(
    df_long.loc[
        ~df_long["metric_name"].isin(METRIC_NAME_MAP.values()), "metric_name"
    ].unique()
)
if unmapped:
    print(f"\nWarning — unmapped metrics (raw names kept): {unmapped}")

# Drop placeholder "no data" entries — Timestream requires a real value
before = len(df_long)
df_long = df_long[df_long["raw_value"].astype(str).str.strip() != "-"]
dropped = before - len(df_long)
if dropped:
    print(f"Dropped {dropped} records with no data ('-')")

# --- Step 5: Print the mapping ---
print(f"\nMetrics found ({df_long['metric_name'].nunique()}):")
for m in sorted(df_long["metric_name"].unique()):
    print(f"  {m}")

print(f"\nFull mapping ({len(df_long)} records):")
pd.set_option("display.max_rows", None)
pd.set_option("display.max_colwidth", 80)
print(df_long.sort_values(["metric_name", "time"]).to_string(index=False))

# --- Step 6: Ingest into Timestream ---
df_ingest = df_long.copy()
df_ingest["measure_value"] = df_ingest["raw_value"].apply(to_measure_value)

non_numeric = df_ingest[df_ingest["measure_value"].isna()]["metric_name"].value_counts()
if not non_numeric.empty:
    print(f"\nSkipping {non_numeric.sum()} non-numeric records:")
    for metric, count in non_numeric.items():
        print(f"  {metric}: {count}")

df_ingest = df_ingest.dropna(subset=["measure_value"])[
    ["time", "metric_name", "measure_value"]
]
df_ingest["time"] = df_ingest["time"].dt.tz_localize("UTC")

print(f"\nWriting {len(df_ingest)} records to Timestream...")
rejected = wr.timestream.write(
    df=df_ingest,
    database="KpiDashboardDatabase",
    table="KpiMetrics",
    time_col="time",
    measure_col="measure_value",
    dimensions_cols=["metric_name"],
)

if rejected:
    print(f"Rejected {len(rejected)} records:")
    print(rejected)
else:
    print("All records written successfully.")
