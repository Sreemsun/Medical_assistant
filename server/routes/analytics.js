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

// ── Linear regression (OLS) ───────────────────────────────────
function linreg(xs, ys) {
  const pts = xs.map((x, i) => [x, ys[i]]).filter(([, y]) => y !== null && !isNaN(y));
  if (pts.length < 2) return { slope: 0, intercept: pts.length === 1 ? pts[0][1] : 0, r2: 0 };
  const n     = pts.length;
  const sumX  = pts.reduce((s, [x])   => s + x,     0);
  const sumY  = pts.reduce((s, [, y]) => s + y,     0);
  const sumXY = pts.reduce((s, [x, y]) => s + x * y, 0);
  const sumX2 = pts.reduce((s, [x])   => s + x * x,  0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 };
  const slope     = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const yMean  = sumY / n;
  const ssTot  = pts.reduce((s, [, y]) => s + (y - yMean) ** 2, 0);
  const ssRes  = pts.reduce((s, [x, y]) => s + (y - (intercept + slope * x)) ** 2, 0);
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);
  return { slope, intercept, r2 };
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
    ];

    const diabetic = rows.filter(r => r.Outcome === 1);
    const healthy  = rows.filter(r => r.Outcome === 0);

    const stats = {};
    COLS.forEach(({ key }) => {
      // Zero values in Glucose/BP/SkinThickness/Insulin/BMI are missing => exclude
      const zeroOK  = (key === 'DiabetesPedigreeFunction');
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

    // Synthesise Jan/Feb 2025 monthly averages (months 24–25) via linear regression
    // fitted on Jul–Dec 2024 (months 18–23, 0-indexed)
    const SYNTH_MS = 32;
    const syntheticMonthlyAvgs = {};
    COLS.forEach(({ key }) => {
      const zeroOK = key === 'DiabetesPedigreeFunction';
      const avgs = [];
      for (let m = 0; m < 24; m++) {
        const chunk = rows.slice(m * SYNTH_MS, (m + 1) * SYNTH_MS);
        const valid = (zeroOK ? chunk : chunk.filter(r => r[key] > 0)).map(r => r[key]);
        avgs.push(valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null);
      }
      const xs6 = [18, 19, 20, 21, 22, 23];
      const ys6 = xs6.map(i => avgs[i]);
      const reg = linreg(xs6, ys6);
      syntheticMonthlyAvgs[key] = [
        +Math.max(0, reg.intercept + reg.slope * 24).toFixed(2), // Jan 2025
        +Math.max(0, reg.intercept + reg.slope * 25).toFixed(2), // Feb 2025
      ];
    });

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
      syntheticMonthlyAvgs,
    });
  } catch (err) {
    logger.error('analytics/diabetes error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to process dataset.' });
  }
});

// ── GET /api/analytics/predict ────────────────────────────────
router.get('/predict', (req, res) => {
  try {
    const csvPath = path.join(__dirname, '../../diabetes.csv');
    if (!fs.existsSync(csvPath)) {
      return res.status(404).json({ success: false, message: 'diabetes.csv not found.' });
    }

    const rows       = parseCSV(fs.readFileSync(csvPath, 'utf-8'));
    const MONTH_SIZE = 32;
    const RAW_MONTHS = Math.ceil(rows.length / MONTH_SIZE); // 24

    const COLS = [
      { key: 'Glucose',                  label: 'Glucose',          unit: 'mg/dL'  },
      { key: 'BloodPressure',            label: 'Blood Pressure',   unit: 'mmHg'   },
      { key: 'SkinThickness',            label: 'Skin Thickness',   unit: 'mm'     },
      { key: 'Insulin',                  label: 'Insulin',          unit: 'μU/mL'  },
      { key: 'BMI',                      label: 'BMI',              unit: 'kg/m²'  },
      { key: 'DiabetesPedigreeFunction', label: 'Diabetes Pedigree',unit: 'score'  },
    ];

    const diabeticRows = rows.filter(r => r.Outcome === 1);
    const healthyRows  = rows.filter(r => r.Outcome === 0);

    // Compute 26-month averages: 24 raw + 2 synthetic (Jan/Feb 2025)
    // Synthetic months extrapolated via linear regression on Jul–Dec 2024 (months 18–23)
    function monthlyAvgs26(rws, key) {
      const zeroOK = key === 'DiabetesPedigreeFunction';
      const avgs = [];
      for (let m = 0; m < RAW_MONTHS; m++) {
        const chunk = rws.slice(m * MONTH_SIZE, (m + 1) * MONTH_SIZE);
        const valid = (zeroOK ? chunk : chunk.filter(r => r[key] > 0)).map(r => r[key]);
        avgs.push(valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null);
      }
      const xs6 = [18, 19, 20, 21, 22, 23];
      const ys6 = xs6.map(i => avgs[i]);
      const ext = linreg(xs6, ys6);
      avgs.push(+Math.max(0, ext.intercept + ext.slope * 24).toFixed(2)); // Jan 2025
      avgs.push(+Math.max(0, ext.intercept + ext.slope * 25).toFixed(2)); // Feb 2025
      return avgs; // 26 values (months 0–25)
    }

    // Train on Jan 2024 – Feb 2025 (months 12–25), predict month 26 = Mar 2025
    const trainXs = Array.from({ length: 14 }, (_, i) => i + 12); // [12..25]
    const PRED_X  = 26;

    const predictions = {};
    COLS.forEach(({ key }) => {
      const aAll = monthlyAvgs26(rows,        key);
      const aDia = monthlyAvgs26(diabeticRows, key);
      const aHlt = monthlyAvgs26(healthyRows,  key);

      const buildPred = (reg, avgs) => {
        const value     = +Math.max(0, reg.intercept + reg.slope * PRED_X).toFixed(2);
        const lastValid = [...avgs.slice(0, 26)].reverse().find(v => v !== null) ?? 0;
        const change    = +(value - lastValid).toFixed(2);
        return {
          value,
          lastMonth: +lastValid.toFixed(2),
          change,
          r2:    +reg.r2.toFixed(3),
          trend: reg.slope > 0.01 ? 'up' : reg.slope < -0.01 ? 'down' : 'stable',
        };
      };

      predictions[key] = {
        overall:  buildPred(linreg(trainXs, trainXs.map(i => aAll[i])), aAll),
        diabetic: buildPred(linreg(trainXs, trainXs.map(i => aDia[i])), aDia),
        healthy:  buildPred(linreg(trainXs, trainXs.map(i => aHlt[i])), aHlt),
      };
    });

    res.json({ success: true, predictions, columns: COLS, predictMonth: 'Mar 2025' });
  } catch (err) {
    logger.error('analytics/predict error:', err.message);
    res.status(500).json({ success: false, message: 'Prediction failed.' });
  }
});

module.exports = router;
