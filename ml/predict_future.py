import joblib
import numpy as np

model = joblib.load("health_forecast_model.pkl")

# Example future time step
future_time = np.array([[800]])

prediction = model.predict(future_time)[0]

print("Predicted Health Values")
print("Glucose:", prediction[0])
print("BloodPressure:", prediction[1])
print("SkinThickness:", prediction[2])
print("Insulin:", prediction[3])
print("BMI:", prediction[4])
print("DiabetesPedigreeFunction:", prediction[5])