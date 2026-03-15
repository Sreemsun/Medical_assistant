import pandas as pd
import numpy as np

# Load dataset
data = pd.read_csv("../dataset/health_timeseries_6years.csv")

# Convert Date column
data["Date"] = pd.to_datetime(data["Date"])

# Target end date: 6 years from today (2026-03-15)
target_end = pd.to_datetime("2032-03-15")

# Get last date
last_date = data["Date"].max()

# Columns to generate
cols = [
    "Glucose",
    "BloodPressure",
    "SkinThickness",
    "Insulin",
    "BMI",
    "DiabetesPedigreeFunction",
]

# Use last 60 days average
recent_avg = data.tail(60)[cols].mean()

new_rows = []

current_date = last_date + pd.Timedelta(days=1)

while current_date <= target_end:

    row = {"Date": current_date}

    row["Glucose"] = int(np.random.normal(recent_avg["Glucose"], 10))
    row["BloodPressure"] = int(np.random.normal(recent_avg["BloodPressure"], 5))
    row["SkinThickness"] = int(np.random.normal(recent_avg["SkinThickness"], 4))
    row["Insulin"] = int(np.random.normal(recent_avg["Insulin"], 30))
    row["BMI"] = round(np.random.normal(recent_avg["BMI"], 1.5), 1)
    row["DiabetesPedigreeFunction"] = round(
        np.random.normal(recent_avg["DiabetesPedigreeFunction"], 0.05), 3
    )

    # Determine diabetes outcome
    row["Outcome"] = 1 if row["Glucose"] > 140 else 0

    new_rows.append(row)

    current_date += pd.Timedelta(days=1)

# Create dataframe
new_data = pd.DataFrame(new_rows)

# Merge with original dataset
extended_data = pd.concat([data, new_data], ignore_index=True)

# Save dataset
extended_data.to_csv("../dataset/health_timeseries_6years.csv", index=False)

print("6-year dataset created successfully")
print("Total rows:", len(extended_data))