let historyChart;

// Initialize when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    initChart();
    fetchHistoryData();
    fetchLatestData();
    
    // Poll for new data every 5 seconds
    setInterval(fetchLatestData, 5000);

    // Irrigation Control Buttons
    document.getElementById('btn-auto').addEventListener('click', () => setIrrigation('AUTO'));
    document.getElementById('btn-on').addEventListener('click', () => setIrrigation('ON'));
    document.getElementById('btn-off').addEventListener('click', () => setIrrigation('OFF'));
});

// Fetch Real-time Latest Data
async function fetchLatestData() {
    try {
        const response = await fetch('/api/data');
        if (!response.ok) return;
        const data = await response.json();

        updateDashboard(data);
        updateChartLive(data);
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

// Fetch Historical Data for Chart
async function fetchHistoryData() {
    try {
        const response = await fetch('/api/history');
        if (!response.ok) return;
        const data = await response.json();

        const labels = data.map(row => {
            let date = new Date(row.timestamp);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        });
        const tempData = data.map(row => row.temperature);
        const humData = data.map(row => row.humidity);
        const soilData = data.map(row => row.soil_moisture);

        historyChart.data.labels = labels;
        historyChart.data.datasets[0].data = tempData;
        historyChart.data.datasets[1].data = humData;
        historyChart.data.datasets[2].data = soilData;
        historyChart.update();

    } catch (error) {
        console.error('Error fetching history:', error);
    }
}

// Set Irrigation Mode
async function setIrrigation(action) {
    try {
        const response = await fetch('/api/toggle_irrigation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: action })
        });
        const result = await response.json();
        
        // Immediate UI feedback will be updated on next fetch interval anyway
        // or we can forcefully update it here, but let's let the polling handle it.
        fetchLatestData(); 
    } catch (error) {
        console.error("Error setting irrigation", error);
    }
}

// Update DOM Elements
function updateDashboard(data) {
    // Sensor Update
    document.getElementById('temp-val').textContent = data.temperature;
    document.getElementById('hum-val').textContent = data.humidity;
    document.getElementById('soil-val').textContent = data.soil_moisture;

    // Crop Health Status Logic
    const healthTextEl = document.getElementById('health-text');
    const soil = data.soil_moisture;
    let healthText = "Good";
    let healthClass = "status-good";

    if (soil < 30) {
        healthText = "Critical (Too Low)";
        healthClass = "status-critical";
    } else if (soil >= 30 && soil < 40) {
        healthText = "Warning (Low)";
        healthClass = "status-warning";
    } else if (soil >= 40 && soil <= 60) {
        healthText = "Good (Optimal)";
        healthClass = "status-good";
    } else {
        // Technically > 60 is high, maybe a warning too
        healthText = "Warning (Too High)";
        healthClass = "status-warning";
    }

    healthTextEl.textContent = healthText;
    healthTextEl.className = healthClass;

    // Alert Logic
    let alerts = [];
    if (soil < 30) alerts.push("Soil moisture is critically low!");
    if (data.temperature > 40) alerts.push("High temperature alert: Above 40°C!");

    const alertBanner = document.getElementById('alert-banner');
    const alertMsg = document.getElementById('alert-message');
    if (alerts.length > 0) {
        alertMsg.textContent = alerts.join(" | ");
        alertBanner.classList.remove('hidden');
    } else {
        alertBanner.classList.add('hidden');
    }

    // Weather Update
    if (data.weather) {
        document.getElementById('weather-condition').textContent = data.weather.condition;
        document.getElementById('weather-temp-val').textContent = data.weather.temperature;
        
        // Simple Icon Mapping
        const iconEl = document.getElementById('weather-icon');
        const cond = data.weather.condition.toLowerCase();
        if (cond.includes('sun') || cond.includes('clear')) iconEl.className = 'fa-solid fa-sun fa-2x';
        else if (cond.includes('cloud')) iconEl.className = 'fa-solid fa-cloud fa-2x';
        else if (cond.includes('rain')) iconEl.className = 'fa-solid fa-cloud-showers-heavy fa-2x';
        else iconEl.className = 'fa-solid fa-cloud-sun fa-2x';
    }

    // Prediction Update
    if (data.prediction) {
        document.getElementById('prediction-message').textContent = data.prediction;
    }

    // Irrigation Update
    const irrigationStatusEl = document.getElementById('irrigation-status-text');
    irrigationStatusEl.textContent = data.irrigation_status;
    if (data.irrigation_status === "ON") {
        irrigationStatusEl.className = "status-on";
    } else {
        irrigationStatusEl.className = "status-off";
    }

    document.getElementById('irrigation-mode-text').textContent = data.manual_override ? "MANUAL" : "AUTO";
}

// Chart.js Setup
function initChart() {
    const ctx = document.getElementById('historyChart').getContext('2d');
    historyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [], 
            datasets: [
                {
                    label: 'Temperature (°C)',
                    borderColor: '#ff9a9e',
                    backgroundColor: 'rgba(255, 154, 158, 0.1)',
                    data: [],
                    tension: 0.3,
                    fill: false
                },
                {
                    label: 'Humidity (%)',
                    borderColor: '#a1c4fd',
                    backgroundColor: 'rgba(161, 196, 253, 0.1)',
                    data: [],
                    tension: 0.3,
                    fill: false
                },
                {
                    label: 'Soil Moisture (%)',
                    borderColor: '#96e6a1',
                    backgroundColor: 'rgba(150, 230, 161, 0.1)',
                    data: [],
                    tension: 0.3,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true
                }
            },
            animation: {
                duration: 400 // Smooth fast updates
            }
        }
    });
}

// Live Chart Updating Logic (Append new data and pop old)
function updateChartLive(newData) {
    if (!historyChart || historyChart.data.labels.length === 0) return;

    let date = new Date(newData.timestamp);
    let timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // Only update if it's a new timestamp
    if (historyChart.data.labels[historyChart.data.labels.length - 1] === timeStr) return;

    historyChart.data.labels.push(timeStr);
    historyChart.data.datasets[0].data.push(newData.temperature);
    historyChart.data.datasets[1].data.push(newData.humidity);
    historyChart.data.datasets[2].data.push(newData.soil_moisture);

    // Keep only last 10 points
    if (historyChart.data.labels.length > 10) {
        historyChart.data.labels.shift();
        historyChart.data.datasets[0].data.shift();
        historyChart.data.datasets[1].data.shift();
        historyChart.data.datasets[2].data.shift();
    }

    historyChart.update('none'); // Update without animation for continuous flow
}
