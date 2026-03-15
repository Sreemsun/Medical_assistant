"""
predict_api.py — ML prediction entry point for the Node.js backend.

Usage:
    python predict_api.py <time_index1> [time_index2] ...

Outputs JSON:
    {
        "r2": <float>,
        "predictions": {
            "<time_index>": {
                "Glucose": <float>,
                "BloodPressure": <float>,
                "SkinThickness": <float>,
                "Insulin": <float>,
                "BMI": <float>,
                "DiabetesPedigreeFunction": <float>
            },
            ...
        }
    }
"""

import sys
import json
import os
import numpy as np
import joblib
import pandas as pd

KEYS = [
    "Glucose",
    "BloodPressure",
    "SkinThickness",
    "Insulin",
    "BMI",
    "DiabetesPedigreeFunction",
]

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    model_path = os.path.join(script_dir, "health_forecast_model.pkl")
    data_path  = os.path.join(script_dir, "..", "dataset", "health_timeseries_6years.csv")

    if len(sys.argv) < 2:
        print(json.dumps({"error": "No time indices provided"}))
        sys.exit(1)

    try:
        model = joblib.load(model_path)
    except Exception as e:
        print(json.dumps({"error": f"Failed to load model: {e}"}))
        sys.exit(1)

    # Compute model R² on training data
    r2_val = None
    try:
        data = pd.read_csv(data_path)
        data["time_index"] = range(len(data))
        X_train = data[["time_index"]]
        y_train = data[KEYS]
        r2_val = round(float(model.score(X_train, y_train)), 3)
    except Exception:
        pass

    try:
        time_indices = list(map(int, sys.argv[1:]))
    except ValueError as e:
        print(json.dumps({"error": f"Invalid time index: {e}"}))
        sys.exit(1)

    X = np.array([[t] for t in time_indices])
    preds = model.predict(X)

    predictions = {}
    for i, t in enumerate(time_indices):
        predictions[str(t)] = {k: round(float(v), 2) for k, v in zip(KEYS, preds[i])}

    print(json.dumps({"r2": r2_val, "predictions": predictions}))


if __name__ == "__main__":
    main()
