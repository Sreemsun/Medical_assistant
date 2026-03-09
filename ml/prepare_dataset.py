import pandas as pd

# Load original dataset
data = pd.read_csv("../dataset/diabetes.csv")

# Remove unwanted columns
data = data.drop(columns=["Pregnancies", "Age"])

# Create sequential dates (example: daily records)
data["Date"] = pd.date_range(start="2024-01-01", periods=len(data), freq="D")

# Move Date column to the front
cols = ["Date"] + [col for col in data.columns if col != "Date"]
data = data[cols]

# Save new dataset
data.to_csv("../dataset/health_timeseries.csv", index=False)

print("New dataset created: health_timeseries.csv")