import pandas as pd
from sklearn.ensemble import RandomForestRegressor
import joblib

# Load dataset
data = pd.read_csv("../dataset/health_timeseries.csv")

# Convert date
data["Date"] = pd.to_datetime(data["Date"])

# Create numeric time index
data["time_index"] = range(len(data))

# Input feature
X = data[["time_index"]]

# Targets we want to predict
y = data[
    [
        "Glucose",
        "BloodPressure",
        "SkinThickness",
        "Insulin",
        "BMI",
        "DiabetesPedigreeFunction",
    ]
]

# Train model
model = RandomForestRegressor(n_estimators=200)

model.fit(X, y)

# Save model
joblib.dump(model, "health_forecast_model.pkl")

print("Multi-output model trained successfully")