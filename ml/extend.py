import pandas as pd
import numpy as np

# load dataset
data = pd.read_csv("../dataset/health_timeseries.csv")

# convert Date column
data["Date"] = pd.to_datetime(data["Date"])

# last date in dataset
last_date = data["Date"].max()

# create new dates until Feb 28
new_dates = pd.date_range(start=last_date + pd.Timedelta(days=1),
                          end="2026-02-28")

# columns to generate values for
cols = [
    "Glucose",
    "BloodPressure",
    "SkinThickness",
    "Insulin",
    "BMI",
    "DiabetesPedigreeFunction",
    "Outcome"
]

# use last 30 days average as baseline
recent_avg = data.tail(30)[cols].mean()

new_rows = []

for d in new_dates:

    row = {"Date": d}

    # generate realistic values with small variation
    row["Glucose"] = int(np.random.normal(recent_avg["Glucose"], 5))
    row["BloodPressure"] = int(np.random.normal(recent_avg["BloodPressure"], 3))
    row["SkinThickness"] = int(np.random.normal(recent_avg["SkinThickness"], 3))
    row["Insulin"] = int(np.random.normal(recent_avg["Insulin"], 20))
    row["BMI"] = round(np.random.normal(recent_avg["BMI"], 1), 1)
    row["DiabetesPedigreeFunction"] = round(
        np.random.normal(recent_avg["DiabetesPedigreeFunction"], 0.05), 3
    )

    # simple rule for outcome
    row["Outcome"] = 1 if row["Glucose"] > 140 else 0

    new_rows.append(row)

# create dataframe
new_data = pd.DataFrame(new_rows)

# merge with original dataset
updated = pd.concat([data, new_data])

# save updated dataset
updated.to_csv("../dataset/health_timeseries_extended.csv", index=False)

print("Dataset extended until Feb 28 2026")