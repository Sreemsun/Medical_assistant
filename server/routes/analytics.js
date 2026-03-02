const express = require('express');
const fs      = require('fs');
const path    = require('path');
const { protect } = require('../middleware/auth');
const logger  = require('../utils/logger');

const router = express.Router();
router.use(protect);

// ── CSV helpers ───────────────────────────────────────────────
function parseCSV(text) {
  const lines   = text.replace(/\r/g, '').trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = line.split(',');
    const obj  = {};
    headers.forEach((h, i) => { obj[h] = parseFloat(vals[i] ?? 0); });
    return obj;
  });
}

function mean(arr)   { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function median(arr) {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function stdDev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

function histogram(data, bins = 14) {
  if (!data.length) return { labels: [], counts: [] };
  const mn   = Math.min(...data);
  const mx   = Math.max(...data);
  const step = (mx - mn) / bins || 1;
  const counts = Array(bins).fill(0);
  const labels = [];
  for (let i = 0; i < bins; i++) {
    const lo = mn + i * step;
    const hi = mn + (i + 1) * step;
    labels.push(`${lo.toFixed(1)}`);
    data.forEach(v => {
      if (v >= lo && (i === bins - 1 ? v <= hi : v < hi)) counts[i]++;
    });
  }
  return { labels, counts };
}

// ── GET /api/analytics/diabetes ───────────────────────────────
router.get('/diabetes', (req, res) => {
  try {
    // CSV lives one level above the server/ folder
    const csvPath = path.join(__dirname, '../../diabetes.csv');
    if (!fs.existsSync(csvPath)) {
      return res.status(404).json({ success: false, message: 'diabetes.csv not found in project root.' });
    }

    const rows = parseCSV(fs.readFileSync(csvPath, 'utf-8'));

    // Columns to visualise — Pregnancies excluded
    const COLS = [
      { key: 'Glucose',                  label: 'Glucose',                  unit: 'mg/dL'   },
      { key: 'BloodPressure',            label: 'Blood Pressure',            unit: 'mmHg'    },
      { key: 'SkinThickness',            label: 'Skin Thickness',            unit: 'mm'      },
      { key: 'Insulin',                  label: 'Insulin',                   unit: 'μU/mL'   },
      { key: 'BMI',                      label: 'BMI',                       unit: 'kg/m²'   },
      { key: 'DiabetesPedigreeFunction', label: 'Diabetes Pedigree',         unit: 'score'   },
      { key: 'Age',                      label: 'Age',                       unit: 'years'   },
    ];

    const diabetic = rows.filter(r => r.Outcome === 1);
    const healthy  = rows.filter(r => r.Outcome === 0);

    const stats = {};
    COLS.forEach(({ key }) => {
      // Zero values in Glucose/BP/SkinThickness/Insulin/BMI are missing => exclude
      const zeroOK  = (key === 'Age' || key === 'DiabetesPedigreeFunction');
      const filter  = v => zeroOK ? true : v > 0;

      const all  = rows.map(r => r[key]).filter(filter);
      const dVals = diabetic.map(r => r[key]).filter(filter);
      const hVals = healthy.map(r => r[key]).filter(filter);

      stats[key] = {
        overall:  { mean: +mean(all).toFixed(2),   median: +median(all).toFixed(2),   std: +stdDev(all).toFixed(2),   min: Math.min(...all),   max: Math.max(...all)   },
        diabetic: { mean: +mean(dVals).toFixed(2), median: +median(dVals).toFixed(2), std: +stdDev(dVals).toFixed(2), min: Math.min(...dVals), max: Math.max(...dVals) },
        healthy:  { mean: +mean(hVals).toFixed(2), median: +median(hVals).toFixed(2), std: +stdDev(hVals).toFixed(2), min: Math.min(...hVals), max: Math.max(...hVals) },
        histogram: histogram(all),
      };
    });

    // Age distribution counts (split at 10-year bands)
    const ageBands = ['<20','20–29','30–39','40–49','50–59','60–69','70+'];
    const ageCounts = { diabetic: Array(7).fill(0), healthy: Array(7).fill(0) };
    rows.forEach(r => {
      const g = r.Outcome === 1 ? 'diabetic' : 'healthy';
      const a = r.Age;
      const i = a < 20 ? 0 : a < 30 ? 1 : a < 40 ? 2 : a < 50 ? 3 : a < 60 ? 4 : a < 70 ? 5 : 6;
      ageCounts[g][i]++;
    });

    // Build raw series arrays — each row treated as one time-point / reading
    const series = {};
    COLS.forEach(({ key }) => {
      series[key] = rows.map(r => r[key]);
    });
    const outcomeArr = rows.map(r => r.Outcome); // 0 = healthy, 1 = diabetic

    res.json({
      success: true,
      total:    rows.length,
      diabetic: diabetic.length,
      healthy:  healthy.length,
      columns:  COLS,
      stats,
      ageBands,
      ageCounts,
      series,
      outcomeArr,
    });
  } catch (err) {
    logger.error('analytics/diabetes error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to process dataset.' });
  }
});

module.exports = router;
