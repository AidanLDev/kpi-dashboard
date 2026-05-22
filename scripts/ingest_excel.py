import pandas as pd
import awswrangler as wr
import re

data_frame = pd.read_excel(
    "KPI_Metrics_Tracking_Template.xlsx", sheet_name="KPI Metrics (2)", header=None
)

date_row = data_frame.iloc[1, 1:]
columns_map = {}

for col_idx, cell_value in date_row.items():
    if pd.isna(cell_value):
        continue

    match = re.search(r"to\s+(\d{2}-\d{2}-\d{4})", str(cell_value))
    if match:
        end_date_str = match.group(1)
        columns_map[col_idx] = pd.to_datetime(end_date_str, format="%d-%m-%Y")

print(
    f"Successfully mapped {len(columns_map)} weeks of data from the horizontal headers."
)
