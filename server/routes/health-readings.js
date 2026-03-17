const express = require('express');
const path = require('path');
const fs = require('fs');
const { protect } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();
router.use(protect);

// ── POST /api/health-readings/save ──────────────────────────────────────
// Save today's health readings to the dataset CSV
router.post('/save', async (req, res) => {
  try {
    const { Glucose, BloodPressure, SkinThickness, Insulin, BMI, DiabetesPedigreeFunction, Outcome } = req.body;

    // Validate all required fields
    const required = ['Glucose', 'BloodPressure', 'SkinThickness', 'Insulin', 'BMI', 'DiabetesPedigreeFunction', 'Outcome'];
    const missing = required.filter(field => req.body[field] === undefined || req.body[field] === null);
    
    if (missing.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Missing required fields: ${missing.join(', ')}` 
      });
    }

    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];

    // Path to CSV
    const csvPath = path.join(__dirname, '../../dataset/health_timeseries_6years.csv');

    // Read current CSV
    let csvContent = fs.readFileSync(csvPath, 'utf-8');

    // Check if today's data already exists (to avoid duplicates)
    const lines = csvContent.trim().split('\n');
    const lastLine = lines[lines.length - 1];
    const lastDate = lastLine.split(',')[0];

    if (lastDate === dateStr) {
      return res.status(400).json({
        success: false,
        message: `Today's reading (${dateStr}) already exists. Update instead of creating new.`
      });
    }

    // Append new row
    const newRow = `${dateStr},${Glucose},${BloodPressure},${SkinThickness},${Insulin},${BMI},${DiabetesPedigreeFunction},${Outcome}`;
    csvContent += '\n' + newRow;

    // Write back to CSV
    fs.writeFileSync(csvPath, csvContent, 'utf-8');

    logger.info(`Health reading saved for ${dateStr} by user ${req.user._id}`);

    res.json({
      success: true,
      message: `Today's reading saved successfully (${dateStr})`,
      data: {
        date: dateStr,
        readings: { Glucose, BloodPressure, SkinThickness, Insulin, BMI, DiabetesPedigreeFunction }
      }
    });

  } catch (err) {
    logger.error('Failed to save health reading:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to save health reading.' 
    });
  }
});

// ── GET /api/health-readings/latest ──────────────────────────────────────
// Get today's reading if exists
router.get('/latest', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const csvPath = path.join(__dirname, '../../dataset/health_timeseries_6years.csv');
    
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.trim().split('\n');
    const lastLine = lines[lines.length - 1];
    const [date, Glucose, BloodPressure, SkinThickness, Insulin, BMI, DiabetesPedigreeFunction, Outcome] = lastLine.split(',');

    if (date === today) {
      res.json({
        success: true,
        hasToday: true,
        data: {
          date,
          Glucose: parseFloat(Glucose),
          BloodPressure: parseFloat(BloodPressure),
          SkinThickness: parseFloat(SkinThickness),
          Insulin: parseFloat(Insulin),
          BMI: parseFloat(BMI),
          DiabetesPedigreeFunction: parseFloat(DiabetesPedigreeFunction),
          Outcome: parseInt(Outcome)
        }
      });
    } else {
      res.json({
        success: true,
        hasToday: false,
        message: 'No reading entered for today yet'
      });
    }
  } catch (err) {
    logger.error('Failed to fetch latest reading:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch latest reading.' });
  }
});

module.exports = router;
