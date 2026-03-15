import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import r2_score
import joblib

# Load dataset
data = pd.read_csv("../dataset/health_timeseries_6years.csv")

# Convert Date column
data["Date"] = pd.to_datetime(data["Date"])

# Create numeric time index
data["time_index"] = range(len(data))

# Input feature
X = data[["time_index"]]

# Target features (what we want to predict)
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
model = RandomForestRegressor(
    n_estimators=200,
    random_state=42
)

model.fit(X, y)

# Check model accuracy
pred = model.predict(X)
score = r2_score(y, pred)

print("Model R² Score:", score)

# Save trained model
joblib.dump(model, "health_forecast_model.pkl")

print("Model saved as health_forecast_model.pkl")