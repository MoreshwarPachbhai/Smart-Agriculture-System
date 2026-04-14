import os
import time
import random
import sqlite3
import threading
from flask import Flask, render_template, jsonify, request

app = Flask(__name__)

# Database Configuration
DATABASE_FILE = "agriculture.db"

# Global State for Irrigation (can also be saved in DB if persistence is needed)
irrigation_status = "OFF"
manual_override = False

def init_db():
    conn = sqlite3.connect(DATABASE_FILE)
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sensors_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            temperature REAL,
            humidity REAL,
            soil_moisture REAL
        )
    """)
    conn.commit()
    conn.close()

def insert_sensor_data(temp, hum, soil):
    conn = sqlite3.connect(DATABASE_FILE)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO sensors_data (temperature, humidity, soil_moisture) VALUES (?, ?, ?)",
        (temp, hum, soil)
    )
    conn.commit()
    conn.close()

def sensor_simulation_loop():
    """Background thread function to simulate sensor readings every 5 seconds."""
    global irrigation_status, manual_override

    # Starting values for a realistic simulation
    temp = 25.0
    hum = 50.0
    soil = 45.0

    while True:
        # Simulate slight random variations
        temp += random.uniform(-0.5, 0.5)
        hum += random.uniform(-1.0, 1.0)
        
        # If irrigation is ON, soil moisture increases. Otherwise, it decreases naturally.
        if irrigation_status == "ON":
            soil += random.uniform(1.0, 3.0) 
        else:
            soil -= random.uniform(0.2, 0.8)

        # Clamp values to realistic bounds
        temp = max(10.0, min(temp, 45.0))
        hum = max(20.0, min(hum, 90.0))
        soil = max(5.0, min(soil, 95.0))

        # Insert into DB
        insert_sensor_data(round(temp, 2), round(hum, 2), round(soil, 2))

        # Evaluate Irrigation Logic ONLY if manual_override is false
        if not manual_override:
            if soil < 30.0:
                irrigation_status = "ON"
            elif soil > 60.0:
                irrigation_status = "OFF"

        time.sleep(5) # Wait for 5 seconds


# Weather Mock Integration
def get_weather_data():
    """
    Mock function representing OpenWeather API call. 
    You can replace this with an actual requests.get() to OpenWeather later.
    """
    conditions = ["Clear", "Sunny", "Partly Cloudy", "Rain", "Overcast"]
    return {
        "temperature": random.randint(20, 35),
        "condition": random.choice(conditions),
        "city": "Metropolis"
    }

# --- FLASK ROUTES ---

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/data", methods=["GET"])
def get_latest_data():
    """Fetch the single latest reading for real-time updates."""
    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM sensors_data ORDER BY id DESC LIMIT 1")
    row = cursor.fetchone()
    conn.close()

    if row:
        data = dict(row)
        data['irrigation_status'] = irrigation_status
        data['manual_override'] = manual_override
        # Add mock weather
        data['weather'] = get_weather_data()
        
        # Determine predictions based on mock weather
        if data['weather']['condition'] == "Rain":
            data['prediction'] = "Rain expected, consider reducing irrigation."
        elif data['weather']['temperature'] > 30 and data['humidity'] < 40:
            data['prediction'] = "Hot and dry conditions expected, increased irrigation needed."
        else:
            data['prediction'] = "Weather conditions are stable."
            
        return jsonify(data)
    else:
        return jsonify({"error": "No data available"}), 404

@app.route("/api/history", methods=["GET"])
def get_historical_data():
    """Fetch the last 10 readings for graph rendering."""
    conn = sqlite3.connect(DATABASE_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    # Bring the latest 10, then reverse them so the oldest of the 10 is first
    cursor.execute("SELECT * FROM (SELECT * FROM sensors_data ORDER BY id DESC LIMIT 10) ORDER BY id ASC")
    rows = cursor.fetchall()
    conn.close()

    return jsonify([dict(row) for row in rows])

@app.route("/api/toggle_irrigation", methods=["POST"])
def toggle_irrigation():
    """Manual override for irrigation system."""
    global irrigation_status, manual_override
    
    req = request.get_json()
    action = req.get('action') # 'ON' or 'OFF' or 'AUTO'
    
    if action in ['ON', 'OFF']:
        irrigation_status = action
        manual_override = True
        return jsonify({"status": "success", "irrigation": irrigation_status, "mode": "MANUAL"})
    elif action == 'AUTO':
        manual_override = False
        return jsonify({"status": "success", "mode": "AUTO"})
        
    return jsonify({"error": "Invalid action"}), 400

if __name__ == "__main__":
    init_db()
    # Start the simulation thread
    sim_thread = threading.Thread(target=sensor_simulation_loop, daemon=True)
    sim_thread.start()
    
    # Run Flask server
    app.run(debug=True, use_reloader=False) # use_reloader=False prevents thread running twice
