const express       = require('express');
const fs            = require('fs');
const path          = require('path');
const { spawnSync } = require('child_process');
const { protect }   = require('../middleware/auth');
const logger        = require('../utils/logger');

const ML_SCRIPT = path.join(__dirname, '../../ml/predict_api.py');
const ML_REQUIREMENTS = path.join(__dirname, '../../ml/requirements.txt');

function getPythonCandidates() {
  const candidates = [];
  if (process.env.PYTHON_EXECUTABLE) {
    candidates.push({ cmd: process.env.PYTHON_EXECUTABLE, prefixArgs: [] });
  }

  if (process.platform === 'win32') {
    candidates.push(
      { cmd: 'py', prefixArgs: ['-3'] },
      { cmd: 'python', prefixArgs: [] },
      { cmd: 'python3', prefixArgs: [] }
    );
  } else {
    candidates.push(
      { cmd: 'python3', prefixArgs: [] },
      { cmd: 'python', prefixArgs: [] }
    );
  }

  return candidates;
}

function parsePredictionOutput(stdout) {
  const text = (stdout || '').trim();
  if (!text) {
    throw new Error('ML script returned empty output.');
  }

  // Accept JSON in the last line to tolerate informational output above it.
  const jsonLine = text.split(/\r?\n/).reverse().find(line => line.trim().startsWith('{'));
  if (!jsonLine) {
    throw new Error(`ML script returned non-JSON output: ${text.slice(0, 200)}`);
  }

  return JSON.parse(jsonLine);
}

function needsMlDepsInstall(errorText = '') {
  const text = String(errorText).toLowerCase();
  return (
    text.includes("no module named 'joblib'") ||
    text.includes('no module named joblib') ||
    text.includes("no module named 'sklearn'") ||
    text.includes('no module named sklearn') ||
    text.includes("no module named 'numpy'") ||
    text.includes('no module named numpy') ||
    text.includes("no module named 'scipy'") ||
    text.includes('no module named scipy')
  );
}

function tryInstallMlDeps(cmd, prefixArgs) {
  if (!fs.existsSync(ML_REQUIREMENTS)) {
    return { ok: false, reason: `Missing requirements file: ${ML_REQUIREMENTS}` };
  }

  const pip = spawnSync(cmd, [...prefixArgs, '-m', 'pip', 'install', '-r', ML_REQUIREMENTS], {
    encoding: 'utf-8',
    timeout: 180000,
  });

  if (pip.error) return { ok: false, reason: pip.error.message };
  if (pip.status !== 0) {
    const out = (pip.stderr || pip.stdout || '').trim();
    return { ok: false, reason: out.slice(0, 300) || 'pip install failed' };
  }

  return { ok: true };
}

// ── ML model helper ───────────────────────────────────────────
// Spawns predict_api.py and returns
// { r2: <float|null>, predictions: { "<idx>": { Glucose, ... }, ... } }
function mlPredict(timeIndices) {
  const attempts = [];

  for (const { cmd, prefixArgs } of getPythonCandidates()) {
    let py = spawnSync(cmd, [...prefixArgs, ML_SCRIPT, ...timeIndices.map(String)], {
      encoding: 'utf-8',
      timeout: 30000,
    });

    if (py.error) {
      attempts.push(`${cmd}: ${py.error.message}`);
      continue;
    }

    if (py.status !== 0) {
      const errOut = (py.stderr || py.stdout || '').trim() || 'unknown error';

      // Self-heal once: if core ML deps are missing, install and retry this interpreter.
      if (needsMlDepsInstall(errOut)) {
        const install = tryInstallMlDeps(cmd, prefixArgs);
        if (install.ok) {
          py = spawnSync(cmd, [...prefixArgs, ML_SCRIPT, ...timeIndices.map(String)], {
            encoding: 'utf-8',
            timeout: 30000,
          });
          if (py.status === 0) {
            try {
              const result = parsePredictionOutput(py.stdout);
              if (result.error) throw new Error(result.error);
              return result;
            } catch (parseErr) {
              attempts.push(`${cmd}: retry parse failed: ${parseErr.message}`);
              continue;
            }
          }
          const retryErr = (py.stderr || py.stdout || '').trim() || 'retry failed';
          attempts.push(`${cmd}: retry failed after deps install: ${retryErr.slice(0, 220)}`);
          continue;
        }
        attempts.push(`${cmd}: deps install failed: ${install.reason}`);
        continue;
      }

      attempts.push(`${cmd}: ${errOut.slice(0, 220)}`);
      continue;
    }

    try {
      const result = parsePredictionOutput(py.stdout);
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    } catch (parseErr) {
      attempts.push(`${cmd}: ${parseErr.message}`);
    }
  }

  throw new Error(`ML model unavailable. Python launch attempts failed: ${attempts.join(' | ')}`);
}

const router = express.Router();
router.use(protect);

// ── CSV helpers ───────────────────────────────────────────────
function parseCSV(text) {
  const lines   = text.replace(/\r/g, '').trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = line.split(',');
    const obj  = {};
    headers.forEach((h, i) => {
      const v = (vals[i] ?? '').trim();
      // Keep the Date column as a string; parse everything else as a number
      obj[h] = h === 'Date' ? v : parseFloat(v || 0);
    });
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
  const sumX  = pts.reduce((s, [x])    => s + x,     0);
  const sumY  = pts.reduce((s, [, y])  => s + y,     0);
  const sumXY = pts.reduce((s, [x, y]) => s + x * y, 0);
  const sumX2 = pts.reduce((s, [x])    => s + x * x,  0);
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

// ── Calendar-month helpers ─────────────────────────────────────
// Build maps  ym → rows[]  for all / diabetic / healthy, plus sorted ym array
function buildMonthMaps(rows) {
  const all = new Map(), dia = new Map(), hlt = new Map();
  rows.forEach(r => {
    const ym = typeof r.Date === 'string' ? r.Date.slice(0, 7) : null;
    if (!ym) return;
    if (!all.has(ym)) { all.set(ym, []); dia.set(ym, []); hlt.set(ym, []); }
    all.get(ym).push(r);
    (r.Outcome === 1 ? dia : hlt).get(ym).push(r);
  });
  const yms = [...all.keys()].sort();
  return { all, dia, hlt, yms };
}

// "YYYY-MM"  →  "Jan '24"
function ymToLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

// Advance a "YYYY-MM" string by n calendar months
function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const total  = (y * 12 + m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

// Monthly average of `key` for rows in a given ym bucket (null = no valid data)
function avgOfGroup(map, ym, key) {
  const rs     = map.get(ym) || [];
  const zeroOK = key === 'DiabetesPedigreeFunction';
  const vals   = (zeroOK ? rs : rs.filter(r => r[key] > 0)).map(r => r[key]);
  return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null;
}

// ── GET /api/analytics/diabetes ───────────────────────────────
router.get('/diabetes', (req, res) => {
  try {
    const csvPath = path.join(__dirname, '../../dataset/health_timeseries_6years.csv');
    if (!fs.existsSync(csvPath)) {
      return res.status(404).json({ success: false, message: 'health_timeseries_6years.csv not found in dataset/ folder.' });
    }

    const rows = parseCSV(fs.readFileSync(csvPath, 'utf-8'));

    const COLS = [
      { key: 'Glucose',                  label: 'Glucose',           unit: 'mg/dL'  },
      { key: 'BloodPressure',            label: 'Blood Pressure',    unit: 'mmHg'   },
      { key: 'SkinThickness',            label: 'Skin Thickness',    unit: 'mm'     },
      { key: 'Insulin',                  label: 'Insulin',           unit: 'μU/mL'  },
      { key: 'BMI',                      label: 'BMI',               unit: 'kg/m²'  },
      { key: 'DiabetesPedigreeFunction', label: 'Diabetes Pedigree', unit: 'score'  },
    ];

    const diabetic = rows.filter(r => r.Outcome === 1);
    const healthy  = rows.filter(r => r.Outcome === 0);

    // Descriptive statistics (unchanged — used by stats table & reading alerts)
    const stats = {};
    COLS.forEach(({ key }) => {
      const zeroOK = key === 'DiabetesPedigreeFunction';
      const filter = v => zeroOK ? true : v > 0;
      const all   = rows.map(r => r[key]).filter(filter);
      const dVals = diabetic.map(r => r[key]).filter(filter);
      const hVals = healthy.map(r => r[key]).filter(filter);
      stats[key] = {
        overall:  { mean: +mean(all).toFixed(2),   median: +median(all).toFixed(2),   std: +stdDev(all).toFixed(2),   min: Math.min(...all),   max: Math.max(...all)   },
        diabetic: { mean: +mean(dVals).toFixed(2), median: +median(dVals).toFixed(2), std: +stdDev(dVals).toFixed(2), min: Math.min(...dVals), max: Math.max(...dVals) },
        healthy:  { mean: +mean(hVals).toFixed(2), median: +median(hVals).toFixed(2), std: +stdDev(hVals).toFixed(2), min: Math.min(...hVals), max: Math.max(...hVals) },
        histogram: histogram(all),
      };
    });

    // Group by actual calendar month from the Date column
    const { all: allMap, dia, hlt, yms } = buildMonthMaps(rows);

    const monthlyLabels = yms.map(ymToLabel);

    // Pre-compute monthly averages for each metric and group
    const monthlyData = {};
    COLS.forEach(({ key }) => {
      monthlyData[key] = {
        overall:  yms.map(ym => avgOfGroup(allMap, ym, key)),
        diabetic: yms.map(ym => avgOfGroup(dia,    ym, key)),
        healthy:  yms.map(ym => avgOfGroup(hlt,    ym, key)),
      };
    });

    // No synthetic months — chart only shows real data.
    // The prediction slot is the first calendar month after the dataset ends.
    const lastYm    = yms[yms.length - 1];
    const predYm    = addMonths(lastYm, 1);

    // syntheticMonthlyAvgs is empty for every column (no interpolated months in chart)
    const syntheticMonthlyAvgs = {};
    COLS.forEach(({ key }) => { syntheticMonthlyAvgs[key] = []; });

    res.json({
      success: true,
      total:           rows.length,
      diabetic:        diabetic.length,
      healthy:         healthy.length,
      columns:         COLS,
      stats,
      monthlyLabels,
      syntheticLabels: [],
      predictLabel:    ymToLabel(predYm),
      monthlyData,
      syntheticMonthlyAvgs,
      outcomeArr:      rows.map(r => r.Outcome),
    });
  } catch (err) {
    logger.error('analytics/diabetes error:', err.message);
    res.status(500).json({ success: false, message: 'Failed to process dataset.' });
  }
});

// ── GET /api/analytics/predict ────────────────────────────────
router.get('/predict', (req, res) => {
  try {
    const csvPath = path.join(__dirname, '../../dataset/health_timeseries_6years.csv');
    if (!fs.existsSync(csvPath)) {
      return res.status(404).json({ success: false, message: 'health_timeseries_6years.csv not found in dataset/ folder.' });
    }

    const rows = parseCSV(fs.readFileSync(csvPath, 'utf-8'));

    const COLS = [
      { key: 'Glucose',                  label: 'Glucose',           unit: 'mg/dL'  },
      { key: 'BloodPressure',            label: 'Blood Pressure',    unit: 'mmHg'   },
      { key: 'SkinThickness',            label: 'Skin Thickness',    unit: 'mm'     },
      { key: 'Insulin',                  label: 'Insulin',           unit: 'μU/mL'  },
      { key: 'BMI',                      label: 'BMI',               unit: 'kg/m²'  },
      { key: 'DiabetesPedigreeFunction', label: 'Diabetes Pedigree', unit: 'score'  },
    ];

    const { all: allMap, dia, hlt, yms } = buildMonthMaps(rows);

    // Use last 14 months for OLS (group-specific forecasts)
    const TRAIN_MONTHS = Math.min(14, yms.length);
    const trainYms     = yms.slice(-TRAIN_MONTHS);
    const trainXs      = trainYms.map((_, i) => i);
    const PRED_X       = TRAIN_MONTHS;

    // ML time indices: synthIdx2 = last actual data point (Feb reference), predIdx = 1 month ahead (Mar)
    const lastRowIdx = rows.length;
    const synthIdx2  = lastRowIdx - 1;    // last row of dataset → Feb reference value
    const predIdx    = lastRowIdx + 30;   // ~1 month ahead → Mar prediction
    let mlPreds = null;
    let mlFallbackReason = null;
    try {
      mlPreds = mlPredict([synthIdx2, predIdx]);
    } catch (mlErr) {
      mlFallbackReason = mlErr.message;
      logger.warn(`analytics/predict ML unavailable; using OLS fallback: ${mlErr.message}`);
    }

    const lastYm         = yms[yms.length - 1];
    const synthYm2       = lastYm;                // Mar '26 (actual last data month)
    const predYm         = lastYm;                // Mar '26 (prediction target)

    const predictions = {};
    COLS.forEach(({ key }) => {
      const aAll = trainYms.map(ym => avgOfGroup(allMap, ym, key));
      const aDia = trainYms.map(ym => avgOfGroup(dia, ym, key));
      const aHlt = trainYms.map(ym => avgOfGroup(hlt, ym, key));

      // OLS forecast for group-specific (diabetic / healthy)
      const buildPred = regVals => {
        const reg     = linreg(trainXs, regVals);
        const value   = +Math.max(0, reg.intercept + reg.slope * PRED_X).toFixed(2);
        const lastVal = [...regVals].reverse().find(v => v !== null) ?? 0;
        const change  = +(value - lastVal).toFixed(2);
        return {
          value,
          lastMonth: +lastVal.toFixed(2),
          change,
          r2:    +reg.r2.toFixed(3),
          trend: reg.slope > 0.01 ? 'up' : reg.slope < -0.01 ? 'down' : 'stable',
        };
      };

      const overallPred = mlPreds
        ? (() => {
            const mlValue     = +Math.max(0, mlPreds.predictions[String(predIdx)][key]).toFixed(2);
            const mlLastMonth = +Math.max(0, mlPreds.predictions[String(synthIdx2)][key]).toFixed(2);
            const mlChange    = +(mlValue - mlLastMonth).toFixed(2);
            return {
              value:     mlValue,
              lastMonth: mlLastMonth,
              change:    mlChange,
              r2:        mlPreds.r2,
              trend:     mlChange > 0.01 ? 'up' : mlChange < -0.01 ? 'down' : 'stable',
            };
          })()
        : buildPred(aAll);

      predictions[key] = {
        overall: overallPred,
        diabetic: buildPred(aDia),
        healthy:  buildPred(aHlt),
      };
    });

    res.json({
      success:        true,
      predictions,
      columns:        COLS,
      predictMonth:   ymToLabel(predYm),
      lastMonthLabel: ymToLabel(synthYm2),
      modelSource:    mlPreds ? 'ml' : 'ols-fallback',
      ...(mlFallbackReason ? {
        warning: `ML model unavailable in this environment. Showing statistical fallback predictions. Reason: ${mlFallbackReason.slice(0, 220)}`,
      } : {}),
    });
  } catch (err) {
    logger.error('analytics/predict error:', err.message);
    res.status(500).json({ success: false, message: 'Prediction failed.' });
  }
});

module.exports = router;
