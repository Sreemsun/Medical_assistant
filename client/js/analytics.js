/* ─────────────────────────────────────────────────────────────
   analytics.js  –  Monthly Trend Analytics with feature filter
───────────────────────────────────────────────────────────── */

'use strict';

// ── Bootstrap ─────────────────────────────────────────────────
document.getElementById('navbar').innerHTML = buildNavbar('analytics');
document.getElementById('footer').innerHTML = buildFooter();
Auth.requireAuth();

// ── Access control: this page is only for the patient "Afnan" ─
const _analyticsUser = Auth.getUser();
if (!_analyticsUser || !_analyticsUser.fullName.toLowerCase().includes('afnan')) {
  window.location.href = 'dashboard.html';
}

// ── Colours ────────────────────────────────────────────────────
const COL_DIABETIC = '#ef4444';
const COL_HEALTHY  = '#10b981';
const FEAT_COLORS  = [
  '#6366f1', '#0ea5e9', '#f59e0b', '#ec4899',
  '#10b981', '#f97316', '#14b8a6',
];

// ── Feature selection state ────────────────────────────────────
let selectedFeatures = new Set(); // filled after data loads

// ── Selected trend feature (single-chart selector) ────────────
let selectedTrendFeature = null;

// ── Selected overview feature (explicit selector — no auto-render) ──
let selectedOverviewFeature = null;

// ── Chart instance cache ───────────────────────────────────────
const _charts = {};
function makeChart(id, type, data, options = {}) {
  if (_charts[id]) { _charts[id].destroy(); delete _charts[id]; }
  const ctx = document.getElementById(id);
  if (!ctx) return;
  _charts[id] = new Chart(ctx, { type, data, options });
}

// ── Theme helpers ──────────────────────────────────────────────
function theme() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  return {
    grid:    dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)',
    tick:    dark ? '#94a3b8' : '#64748b',
    legend:  dark ? '#cbd5e1' : '#475569',
    tipBg:   dark ? '#1e293b' : '#fff',
    tipText: dark ? '#f1f5f9' : '#1e293b',
    tipBorder: dark ? '#334155' : '#e2e8f0',
  };
}

function scaleOpts(t) {
  return {
    grid:  { color: t.grid, drawBorder: false },
    ticks: { color: t.tick, font: { size: 11 } },
    border:{ display: false },
  };
}

// ── User Reading state (persisted in localStorage) ────────────
const LS_READING_KEY = 'medassist_analytics_reading';
let userReadings = JSON.parse(localStorage.getItem(LS_READING_KEY) || '{}');

function getTodayLocalISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function updateReadingDateLabel() {
  const dateEl = document.getElementById('readingDate');
  if (!dateEl) return;
  const todayIso = getTodayLocalISO();
  dateEl.textContent = `Current date: ${DateFmt.long(todayIso)}`;
}

// ── Clinical reference thresholds ─────────────────────────────
const THRESHOLDS = {
  Glucose: {
    ranges: [
      { level: 'normal', max: 99,  text: 'Normal fasting glucose (< 100 mg/dL)' },
      { level: 'medium', min: 100, max: 125, text: 'Pre-diabetic range (100–125 mg/dL)' },
      { level: 'severe', min: 126, text: 'Diabetic range (≥ 126 mg/dL)' },
    ],
    advice: {
      normal: 'Your blood glucose is within the healthy range.',
      medium: 'Your blood glucose indicates pre-diabetes. Consider dietary changes and consult a healthcare provider.',
      severe: 'Your blood glucose is in the diabetic range. Immediate medical consultation is recommended.',
    },
  },
  BloodPressure: {
    ranges: [
      { level: 'normal', max: 79, text: 'Normal diastolic BP (< 80 mmHg)' },
      { level: 'medium', min: 80, max: 89, text: 'Elevated diastolic BP (80–89 mmHg)' },
      { level: 'severe', min: 90, text: 'High blood pressure (≥ 90 mmHg)' },
    ],
    advice: {
      normal: 'Your diastolic blood pressure is normal.',
      medium: 'Your blood pressure is elevated. Monitor regularly and reduce sodium intake.',
      severe: 'Your blood pressure is high. Consult a healthcare provider promptly.',
    },
  },
  SkinThickness: {
    ranges: [
      { level: 'normal', max: 23, text: 'Normal skin fold thickness (≤ 23 mm)' },
      { level: 'medium', min: 24, max: 35, text: 'Slightly elevated skin thickness (24–35 mm)' },
      { level: 'severe', min: 36, text: 'High skin fold thickness (> 35 mm)' },
    ],
    advice: {
      normal: 'Your skin thickness is within the normal range.',
      medium: 'Your skin thickness is slightly above average, which may indicate higher body fat.',
      severe: 'Your skin thickness is significantly elevated, correlating with higher body fat levels.',
    },
  },
  Insulin: {
    ranges: [
      { level: 'normal', max: 166, text: 'Normal 2-hr serum insulin (≤ 166 μU/mL)' },
      { level: 'medium', min: 167, max: 250, text: 'Elevated insulin (167–250 μU/mL)' },
      { level: 'severe', min: 251, text: 'High insulin levels (> 250 μU/mL)' },
    ],
    advice: {
      normal: 'Your insulin level is within the normal range.',
      medium: 'Your insulin level is elevated, which may indicate insulin resistance.',
      severe: 'Your insulin level is significantly high, suggesting severe insulin resistance.',
    },
  },
  BMI: {
    ranges: [
      { level: 'normal', max: 24.9, text: 'Healthy weight (BMI < 25)' },
      { level: 'medium', min: 25,   max: 29.9, text: 'Overweight (BMI 25–29.9)' },
      { level: 'severe', min: 30,   text: 'Obese (BMI ≥ 30)' },
    ],
    advice: {
      normal: 'Your BMI is in the healthy range.',
      medium: 'Your BMI indicates you are overweight. Regular exercise and a balanced diet are recommended.',
      severe: 'Your BMI indicates obesity, which significantly increases diabetes risk.',
    },
  },
  DiabetesPedigreeFunction: {
    ranges: [
      { level: 'normal', max: 0.4,  text: 'Low genetic risk (≤ 0.4)' },
      { level: 'medium', min: 0.41, max: 0.7, text: 'Moderate genetic risk (0.41–0.7)' },
      { level: 'severe', min: 0.71, text: 'High genetic risk (> 0.7)' },
    ],
    advice: {
      normal: 'Your diabetes pedigree score indicates low hereditary risk.',
      medium: 'Your diabetes pedigree score indicates moderate hereditary risk. Regular screening is advised.',
      severe: 'Your diabetes pedigree score indicates high hereditary risk. Consult a healthcare provider.',
    },
  },
};

function classifyReading(key, val) {
  const t = THRESHOLDS[key];
  if (!t) return null;
  for (const r of t.ranges) {
    const aboveMin = r.min === undefined || val >= r.min;
    const belowMax = r.max === undefined || val <= r.max;
    if (aboveMin && belowMax) return { level: r.level, text: r.text };
  }
  return null;
}

function compareToDataset(key, val, stats) {
  const s = stats[key];
  if (!s) return null;
  const healthyMean  = parseFloat(s.healthy.mean);
  const diabeticMean = parseFloat(s.diabetic.mean);
  const closer = Math.abs(val - healthyMean) <= Math.abs(val - diabeticMean) ? 'healthy' : 'diabetic';
  return { healthyMean, diabeticMean, closer };
}

function renderReadingAlerts(readings, data) {
  const section = document.getElementById('readingAlerts');
  if (!Object.keys(readings).length) { section.style.display = 'none'; return; }

  const LEVEL = {
    normal: { color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.3)',  badge: 'Normal',   icon: '✓' },
    medium: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.3)',  badge: 'Moderate', icon: '⚠' },
    severe: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.3)',   badge: 'Severe',   icon: '✕' },
  };

  const results = [];
  data.columns.forEach(col => {
    const val = readings[col.key];
    if (val === undefined) return;
    const classification = classifyReading(col.key, val);
    const comparison     = compareToDataset(col.key, val, data.stats);
    if (classification) results.push({ col, val, classification, comparison });
  });

  const severeCount = results.filter(r => r.classification.level === 'severe').length;
  const mediumCount = results.filter(r => r.classification.level === 'medium').length;

  let summaryColor = '#10b981';
  let summaryText  = 'All entered values are within normal ranges.';
  if (severeCount > 0) {
    summaryColor = '#ef4444';
    summaryText  = `${severeCount} value${severeCount > 1 ? 's' : ''} in the severe range — consult a healthcare provider.`;
  } else if (mediumCount > 0) {
    summaryColor = '#f59e0b';
    summaryText  = `${mediumCount} value${mediumCount > 1 ? 's' : ''} in the moderate range — consider scheduling a check-up.`;
  }

  const cards = results.map(({ col, val, classification, comparison }) => {
    const cfg    = LEVEL[classification.level];
    const advice = THRESHOLDS[col.key]?.advice?.[classification.level] || '';

    const compHTML = comparison ? `
      <div class="ra-comparison">
        <span>Dataset avg — Non-diabetic: <strong>${comparison.healthyMean}</strong> · Diabetic: <strong>${comparison.diabeticMean}</strong> ${col.unit}</span>
        <span class="ra-closer" style="color:${comparison.closer === 'healthy' ? '#10b981' : '#ef4444'}">
          Closer to ${comparison.closer === 'healthy' ? 'non-diabetic' : 'diabetic'} average
        </span>
      </div>` : '';

    const predVal = _predictedValues?.[col.key] ?? null;
    let predCompHTML = '';
    if (predVal !== null) {
      const diff      = +(val - predVal).toFixed(2);
      const diffSign  = diff > 0 ? '+' : '';
      const diffColor = diff > 0 ? '#ef4444' : diff < 0 ? '#10b981' : '#64748b';
      const diffLabel = diff > 0 ? 'above prediction' : diff < 0 ? 'below prediction' : 'matches prediction';
      predCompHTML = `
        <div class="ra-comparison" style="margin-top:6px;border-top:1px solid rgba(128,128,128,0.15);padding-top:6px;">
          <span>ML predicted (next month): <strong>${predVal}</strong>${col.unit ? ' ' + col.unit : ''}</span>
          <span class="ra-closer" style="color:${diffColor}">
            Your reading is <strong>${diffSign}${diff}</strong> ${col.unit} ${diffLabel}
          </span>
        </div>`;
    }

    return `
      <div class="ra-card" style="border-color:${cfg.border};background:${cfg.bg}">
        <div class="ra-card-top">
          <div class="ra-feature">
            <span class="ra-feature-name">${col.label}</span>
            <span class="ra-feature-val" style="color:${cfg.color}">${val}${col.unit ? ' ' + col.unit : ''}</span>
          </div>
          <span class="ra-badge" style="background:${cfg.bg};color:${cfg.color};border:1px solid ${cfg.border}">
            ${cfg.icon} ${cfg.badge}
          </span>
        </div>
        <p class="ra-range-text">${classification.text}</p>
        <p class="ra-advice">${advice}</p>
        ${compHTML}
        ${predCompHTML}
      </div>`;
  }).join('');

  section.innerHTML = `
    <div class="ra-header">
      <h3 class="ra-title">Health Reading Analysis</h3>
      <p class="ra-summary" style="color:${summaryColor}">${summaryText}</p>
    </div>
    <p class="ra-disclaimer">For informational purposes only — not a substitute for professional medical advice.</p>
    <div class="ra-grid">${cards}</div>`;
  section.style.display = 'block';

  // Show doctor popup only for severe values
  if (severeCount > 0) showDoctorModal(results);
}

// ── Doctor consultation modal ──────────────────────────────────
function initDoctorModal() {
  const overlay = document.getElementById('doctorModal');
  const dismiss = document.getElementById('doctorModalDismiss');
  if (!overlay || !dismiss) return;

  dismiss.addEventListener('click', () => overlay.classList.remove('open'));
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') overlay.classList.remove('open'); });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDoctorModal);
} else {
  initDoctorModal();
}

function showDoctorModal(results) {
  const severeItems = results.filter(r => r.classification.level === 'severe');
  const mediumItems = results.filter(r => r.classification.level === 'medium');
  const isSevere    = severeItems.length > 0;

  const iconWrap = document.getElementById('doctorModalIconWrap');
  const title    = document.getElementById('doctorModalTitle');
  const body     = document.getElementById('doctorModalBody');
  const flags    = document.getElementById('doctorModalFlags');

  iconWrap.className = `dm-icon-wrap ${isSevere ? 'severe' : 'medium'}`;

  if (isSevere) {
    title.textContent = 'Medical Attention Recommended';
    body.textContent  = 'One or more of your readings fall in the severe range. We strongly recommend consulting a healthcare provider as soon as possible.';
  } else {
    title.textContent = 'Consider a Health Check-Up';
    body.textContent  = 'Some of your readings are elevated. While not immediately critical, scheduling a check-up with your doctor is advisable.';
  }

  const allFlagged = [...severeItems, ...mediumItems];
  flags.innerHTML = allFlagged.map(({ col, val, classification }) => `
    <li class="dm-flag-item ${classification.level}">
      <span>${classification.level === 'severe' ? '✕' : '⚠'}</span>
      <span>${col.label}: <strong>${val}${col.unit ? ' ' + col.unit : ''}</strong> — ${classification.text}</span>
    </li>`).join('');

  document.getElementById('doctorModal').classList.add('open');
}
document.getElementById('readingToggle').addEventListener('click', () => {
  const body  = document.getElementById('readingBody');
  const arrow = document.getElementById('readingArrow');
  const open  = !body.classList.contains('hidden');
  body.classList.toggle('hidden', open);
  arrow.classList.toggle('open', !open);
});

// ── Render reading input fields ────────────────────────────────
function renderReadingForm(data) {
  updateReadingDateLabel();
  document.getElementById('readingInputs').innerHTML = data.columns.map(col => `
    <div class="reading-field">
      <label>
        ${col.label}
        <span class="reading-unit">(${col.unit})</span>
      </label>
      <input
        type="number"
        id="ri_${col.key}"
        class="form-control"
        step="any" min="0"
        placeholder="Your value"
        value="${userReadings[col.key] !== undefined ? userReadings[col.key] : ''}"
      />
    </div>
  `).join('');
}

// ── Plot button ────────────────────────────────────────────────
document.getElementById('plotReadingBtn').addEventListener('click', async () => {
  if (!_cachedData) return;
  const readings = {};
  _cachedData.columns.forEach(col => {
    const val = parseFloat(document.getElementById(`ri_${col.key}`)?.value);
    if (!isNaN(val) && val >= 0) readings[col.key] = +val.toFixed(2);
  });
  userReadings = readings;
  localStorage.setItem(LS_READING_KEY, JSON.stringify(userReadings));
  refreshCharts(_cachedData);
  renderReadingAlerts(readings, _cachedData);

  const count = Object.keys(readings).length;
  const fb = document.getElementById('readingFeedback');
  if (count === 0) {
    fb.textContent = 'No valid values entered. Please fill in at least one field.';
    fb.style.color = '#f59e0b';
    fb.style.display = 'block';
    clearTimeout(fb._hideTimer);
    fb._hideTimer = setTimeout(() => { fb.style.display = 'none'; }, 4000);
    return;
  }

  // Save to dataset only when all required fields are provided.
  const requiredKeys = ['Glucose', 'BloodPressure', 'SkinThickness', 'Insulin', 'BMI', 'DiabetesPedigreeFunction'];
  const hasAllRequired = requiredKeys.every(k => readings[k] !== undefined);

  let saveMessage = '';
  let savedToDataset = false;
  if (hasAllRequired) {
    const payload = {
      ...readings,
      Outcome: readings.Glucose >= 126 ? 1 : 0,
      Date: getTodayLocalISO(),
    };
    const saveRes = await api.post('/health-readings/save', payload);
    if (saveRes?.ok) {
      savedToDataset = true;
      saveMessage = ' Saved to dataset for today.';
    } else {
      saveMessage = ` Save failed: ${saveRes?.data?.message || 'Unable to persist reading.'}`;
    }
  } else {
    saveMessage = ' Fill all fields to also save this reading to the dataset.';
  }

  fb.textContent = `Your reading plotted as a highlighted dot at ${_cachedData.predictLabel} on ${count} chart${count > 1 ? 's' : ''}.${saveMessage}`;
  fb.style.color = hasAllRequired ? '#10b981' : '#f59e0b';
  fb.style.display = 'block';
  clearTimeout(fb._hideTimer);
  fb._hideTimer = setTimeout(() => { fb.style.display = 'none'; }, 6000);

  // Pull latest dataset so stats/charts/predictions reflect the saved reading immediately.
  if (savedToDataset) {
    await loadAnalytics();
    renderReadingAlerts(userReadings, _cachedData);
  }
});

// ── Clear button ───────────────────────────────────────────────
document.getElementById('clearReadingBtn').addEventListener('click', () => {
  userReadings = {};
  localStorage.removeItem(LS_READING_KEY);
  document.getElementById('readingAlerts').style.display = 'none';
  document.getElementById('readingFeedback').style.display = 'none';
  if (_cachedData) {
    _cachedData.columns.forEach(col => {
      const el = document.getElementById(`ri_${col.key}`);
      if (el) el.value = '';
    });
    refreshCharts(_cachedData);
  }
});

// ── Summary cards ──────────────────────────────────────────────
function renderSummary(data) {
  const pct = ((data.diabetic / data.total) * 100).toFixed(1);
  document.getElementById('summaryCards').innerHTML = `
    <div class="sum-card total">
      <div class="sum-label">Total Readings</div>
      <div class="sum-value">${data.total}</div>
      <p class="sum-desc">${data.monthlyLabels.length} months of data</p>
    </div>
    <div class="sum-card diabetic">
      <div class="sum-label">Diabetic Readings</div>
      <div class="sum-value">${data.diabetic}</div>
      <p class="sum-desc">${pct}% of readings</p>
    </div>
    <div class="sum-card healthy">
      <div class="sum-label">Non-Diabetic</div>
      <div class="sum-value">${data.healthy}</div>
      <p class="sum-desc">${(100 - pct).toFixed(1)}% of readings</p>
    </div>
    <div class="sum-card ratio">
      <div class="sum-label">Features Active</div>
      <div class="sum-value" id="activeFeatureCount">${selectedFeatures.size}</div>
      <p class="sum-desc">of ${data.columns.length} available</p>
    </div>
  `;
}

// ── Feature filter chips ───────────────────────────────────────
function renderFeatureFilter(data) {
  const wrap = document.getElementById('featureFilter');
  wrap.innerHTML = data.columns.map((col, ci) => {
    const active = selectedFeatures.has(col.key);
    const color  = FEAT_COLORS[ci % FEAT_COLORS.length];
    return `
      <button
        class="feat-chip ${active ? 'active' : ''}"
        data-key="${col.key}"
        style="--chip-color:${color}"
      >${col.label}</button>
    `;
  }).join('');

  wrap.querySelectorAll('.feat-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      if (selectedFeatures.has(key)) {
        if (selectedFeatures.size === 1) return; // keep at least one
        selectedFeatures.delete(key);
        btn.classList.remove('active');
      } else {
        selectedFeatures.add(key);
        btn.classList.add('active');
      }
      document.getElementById('activeFeatureCount').textContent = selectedFeatures.size;
      refreshCharts(_cachedData);
    });
  });
}

// ── Overview chart: explicit feature selector (no auto-render) ─
function renderOverview(data) {
  const selectorWrap = document.getElementById('overviewSelectorWrap');
  const emptyState   = document.getElementById('overviewEmptyState');
  const chartArea    = document.getElementById('overviewChartArea');

  const activeCols = data.columns.filter(c => selectedFeatures.has(c.key));

  // Validate selectedOverviewFeature against current active features
  if (selectedOverviewFeature && !activeCols.find(c => c.key === selectedOverviewFeature)) {
    selectedOverviewFeature = null;
  }

  // Build selector buttons
  selectorWrap.innerHTML = `
    <span class="trend-selector-label">Select feature</span>
    <div class="trend-sel-btns" id="overviewSelBtns">
      ${activeCols.map(col => {
        const gi    = data.columns.findIndex(c => c.key === col.key);
        const color = FEAT_COLORS[gi % FEAT_COLORS.length];
        return `<button
          class="trend-sel-btn ${col.key === selectedOverviewFeature ? 'active' : ''}"
          data-key="${col.key}"
          style="--sel-color:${color}"
        >${col.label}</button>`;
      }).join('')}
    </div>
  `;

  selectorWrap.querySelectorAll('.trend-sel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedOverviewFeature = btn.dataset.key;
      selectorWrap.querySelectorAll('.trend-sel-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderOverviewChart(data);
    });
  });

  if (selectedOverviewFeature) {
    emptyState.classList.add('hidden');
    chartArea.classList.remove('hidden');
    renderOverviewChart(data);
  } else {
    emptyState.classList.remove('hidden');
    chartArea.classList.add('hidden');
  }
}

// ── Render overview chart for the selected feature ─────────────
function renderOverviewChart(data) {
  const emptyState = document.getElementById('overviewEmptyState');
  const chartArea  = document.getElementById('overviewChartArea');
  const statsEl    = document.getElementById('overviewStats');

  const col = data.columns.find(c => c.key === selectedOverviewFeature);
  if (!col) return;

  emptyState.classList.add('hidden');
  chartArea.classList.remove('hidden');

  const s         = data.stats[col.key];
  const zeroOK    = col.key === 'DiabetesPedigreeFunction';
  const globalIdx = data.columns.findIndex(c => c.key === col.key);
  const color     = FEAT_COLORS[globalIdx % FEAT_COLORS.length];

  statsEl.innerHTML = `
    <span class="trend-stat"><strong>${col.label}</strong> <span style="color:var(--text-muted);font-weight:400">${col.unit}</span></span>
    <span class="trend-stat"><strong>Overall mean</strong> ${s.overall.mean}</span>
    <span class="trend-stat" style="color:${COL_DIABETIC};font-weight:600">Diabetic avg ${s.diabetic.mean}</span>
    <span class="trend-stat" style="color:${COL_HEALTHY};font-weight:600">Non-diabetic avg ${s.healthy.mean}</span>
  `;

  requestAnimationFrame(() => {
    const t      = theme();
    const labels = [...data.monthlyLabels, ...data.syntheticLabels, data.predictLabel];

    const overallMonthly  = [...data.monthlyData[col.key].overall,  ...data.syntheticMonthlyAvgs[col.key]];
    const diabeticMonthly = [...data.monthlyData[col.key].diabetic, ...Array(data.syntheticLabels.length).fill(null)];
    const healthyMonthly  = [...data.monthlyData[col.key].healthy,  ...Array(data.syntheticLabels.length).fill(null)];

    const datasets = [
      {
        label: 'Overall',
        data: [...overallMonthly, null],
        borderColor: color,
        backgroundColor: color + '20',
        fill: true,
        borderWidth: 2.5,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.35,
        spanGaps: true,
      },
      {
        label: 'Diabetic avg',
        data: [...diabeticMonthly, null],
        borderColor: COL_DIABETIC,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [5, 3],
        pointRadius: 2,
        pointHoverRadius: 4,
        tension: 0.35,
        spanGaps: true,
      },
      {
        label: 'Non-diabetic avg',
        data: [...healthyMonthly, null],
        borderColor: COL_HEALTHY,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [5, 3],
        pointRadius: 2,
        pointHoverRadius: 4,
        tension: 0.35,
        spanGaps: true,
      },
    ];

    if (userReadings[col.key] !== undefined) {
      const refVal = userReadings[col.key];
      datasets.push({
        label: `${data.predictLabel} Reading (${refVal} ${col.unit})`,
        data: [...Array(labels.length - 1).fill(null), refVal],
        borderColor: '#f59e0b',
        backgroundColor: '#f59e0b',
        borderWidth: 0,
        pointRadius: [...Array(labels.length - 1).fill(0), 10],
        pointHoverRadius: [...Array(labels.length - 1).fill(0), 12],
        pointBackgroundColor: '#f59e0b',
        pointBorderColor: '#fff',
        pointBorderWidth: 2.5,
        spanGaps: false,
      });
    }

    makeChart('chartOverview', 'line', { labels, datasets }, {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      plugins: {
        legend: {
          labels: {
            color: t.legend, font: { size: 12 },
            boxWidth: 14, padding: 12,
            usePointStyle: true, pointStyle: 'circle',
          },
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: t.tipBg,
          titleColor: t.tipText,
          bodyColor: t.tipText,
          borderColor: t.tipBorder,
          borderWidth: 1,
          callbacks: {
            label: ctx => ctx.raw !== null
              ? ` ${ctx.dataset.label}: ${ctx.raw}`
              : null,
          },
        },
      },
      scales: {
        x: {
          ...scaleOpts(t),
          ticks: { ...scaleOpts(t).ticks, maxRotation: 30 },
        },
        y: { ...scaleOpts(t), beginAtZero: false, spanGaps: true },
      },
    });
  });
}

// ── Individual monthly trend chart (single-feature, 2024 only) ─
function renderTrendCharts(data) {
  const container = document.getElementById('trendsGrid');
  const activeCols = data.columns.filter(c => selectedFeatures.has(c.key));

  // Ensure selectedTrendFeature is valid for the current active set
  if (!selectedTrendFeature || !activeCols.find(c => c.key === selectedTrendFeature)) {
    selectedTrendFeature = activeCols[0]?.key || null;
  }

  if (!selectedTrendFeature) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:.875rem">No features selected.</p>';
    return;
  }

  container.innerHTML = `
    <div class="trend-selector-wrap">
      <span class="trend-selector-label">Select feature</span>
      <div class="trend-sel-btns" id="trendSelBtns">
        ${activeCols.map(col => {
          const gi    = data.columns.findIndex(c => c.key === col.key);
          const color = FEAT_COLORS[gi % FEAT_COLORS.length];
          return `<button
            class="trend-sel-btn ${col.key === selectedTrendFeature ? 'active' : ''}"
            data-key="${col.key}"
            style="--sel-color:${color}"
          >${col.label}</button>`;
        }).join('')}
      </div>
    </div>
    <div class="trend-single-card" id="trendSingleCard"></div>
  `;

  container.querySelectorAll('.trend-sel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedTrendFeature = btn.dataset.key;
      container.querySelectorAll('.trend-sel-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderSingleTrendChart(data);
    });
  });

  renderSingleTrendChart(data);
}

// ── Render the single selected-feature chart ──────────────────
function renderSingleTrendChart(data) {
  const col = data.columns.find(c => c.key === selectedTrendFeature);
  if (!col) return;

  const card      = document.getElementById('trendSingleCard');
  const s         = data.stats[col.key];
  const zeroOK    = col.key === 'DiabetesPedigreeFunction';
  const canvasId  = 'trendChartSingle';
  const globalIdx = data.columns.findIndex(c => c.key === col.key);
  const color     = FEAT_COLORS[globalIdx % FEAT_COLORS.length];

  card.innerHTML = `
    <div class="trend-card-header">
      <h4 class="trend-card-title">${col.label}</h4>
      <span class="trend-card-unit">${col.unit}</span>
    </div>
    <div class="trend-stats">
      <span class="trend-stat"><strong>Overall mean</strong> ${s.overall.mean}</span>
      <span class="trend-stat" style="color:${COL_DIABETIC};font-weight:600">Diabetic avg ${s.diabetic.mean}</span>
      <span class="trend-stat" style="color:${COL_HEALTHY};font-weight:600">Non-diabetic avg ${s.healthy.mean}</span>
    </div>
    <div class="trend-wrap trend-wrap-single"><canvas id="${canvasId}"></canvas></div>
  `;

  requestAnimationFrame(() => {
    const t      = theme();
    const labels = [...data.monthlyLabels, ...data.syntheticLabels, data.predictLabel];

    const overallMonthly  = [...data.monthlyData[col.key].overall,  ...data.syntheticMonthlyAvgs[col.key]];
    const diabeticMonthly = [...data.monthlyData[col.key].diabetic, ...Array(data.syntheticLabels.length).fill(null)];
    const healthyMonthly  = [...data.monthlyData[col.key].healthy,  ...Array(data.syntheticLabels.length).fill(null)];

    const datasets = [
      {
        label: 'Overall',
        data: [...overallMonthly, null],
        borderColor: color,
        backgroundColor: color + '20',
        fill: true,
        borderWidth: 2.5,
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.35,
        spanGaps: true,
      },
      {
        label: 'Diabetic avg',
        data: [...diabeticMonthly, null],
        borderColor: COL_DIABETIC,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [5, 3],
        pointRadius: 2,
        pointHoverRadius: 4,
        tension: 0.35,
        spanGaps: true,
      },
      {
        label: 'Non-diabetic avg',
        data: [...healthyMonthly, null],
        borderColor: COL_HEALTHY,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [5, 3],
        pointRadius: 2,
        pointHoverRadius: 4,
        tension: 0.35,
        spanGaps: true,
      },
    ];

    if (userReadings[col.key] !== undefined) {
      const refVal = userReadings[col.key];
      datasets.push({
        label: `${data.predictLabel} Reading (${refVal} ${col.unit})`,
        data: [...Array(labels.length - 1).fill(null), refVal],
        borderColor: '#f59e0b',
        backgroundColor: '#f59e0b',
        borderWidth: 0,
        pointRadius: [...Array(labels.length - 1).fill(0), 10],
        pointHoverRadius: [...Array(labels.length - 1).fill(0), 12],
        pointBackgroundColor: '#f59e0b',
        pointBorderColor: '#fff',
        pointBorderWidth: 2.5,
        spanGaps: false,
      });
    }

    makeChart(canvasId, 'line', { labels, datasets }, {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      plugins: {
        legend: {
          labels: {
            color: t.legend, font: { size: 12 },
            boxWidth: 14, padding: 12,
            usePointStyle: true, pointStyle: 'circle',
          },
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          backgroundColor: t.tipBg,
          titleColor: t.tipText,
          bodyColor: t.tipText,
          borderColor: t.tipBorder,
          borderWidth: 1,
          callbacks: {
            label: ctx => ctx.raw !== null
              ? ` ${ctx.dataset.label}: ${ctx.raw}`
              : null,
          },
        },
      },
      scales: {
        x: {
          ...scaleOpts(t),
          ticks: { ...scaleOpts(t).ticks, maxRotation: 30 },
        },
        y: { ...scaleOpts(t), beginAtZero: false, spanGaps: true },
      },
    });
  });
}

// ── Stats table ────────────────────────────────────────────────
function renderStatsTable(data) {
  const tbody     = document.getElementById('statsBody');
  const activeCols = data.columns.filter(c => selectedFeatures.has(c.key));
  const rows = [];

  activeCols.forEach(col => {
    const s = data.stats[col.key];
    [
      { key: 'overall',  label: 'Overall',     cls: 'overall'  },
      { key: 'diabetic', label: 'Diabetic',     cls: 'diabetic' },
      { key: 'healthy',  label: 'Non-Diabetic', cls: 'healthy'  },
    ].forEach((g, gi) => {
      const st = s[g.key];
      rows.push(`
        <tr>
          ${gi === 0
            ? `<td class="feature-name" rowspan="3">
                 ${col.label}<br>
                 <small style="color:var(--text-muted);font-weight:400">${col.unit}</small>
               </td>`
            : ''}
          <td><span class="group-badge ${g.cls}">${g.label}</span></td>
          <td>${st.mean}</td>
          <td>${st.median}</td>
          <td>${st.std}</td>
          <td>${st.min}</td>
          <td>${st.max}</td>
        </tr>
      `);
    });
  });

  tbody.innerHTML = rows.length ? rows.join('') : `
    <tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted)">
      Select at least one feature above to view statistics.
    </td></tr>
  `;
}

// ── Refresh just the charts/table (no fetch) ──────────────────
function refreshCharts(data) {
  renderOverview(data);
  renderTrendCharts(data);
  renderStatsTable(data);
}

// ── ML Predictions ─────────────────────────────────────────────
async function loadPredictions() {
  const sec = document.getElementById('predictSection');
  sec.style.display = 'block'; // show section with loading spinner

  const res = await api.get('/analytics/predict');
  if (!res?.ok) {
    const errMsg = res?.data?.message || 'Failed to load predictions.';
    document.getElementById('predictGrid').innerHTML =
      `<p style="color:#dc2626;font-size:0.85rem;">${errMsg}</p>`;
    return;
  }
  renderPredictions(res.data);
}

function renderPredictions({ predictions, columns, predictMonth, lastMonthLabel, warning }) {
  // Store for use in reading-vs-prediction comparison
  _predictedValues = {};
  columns.forEach(col => {
    _predictedValues[col.key] = predictions[col.key]?.overall?.value ?? null;
  });

  const grid = document.getElementById('predictGrid');

  const trendIcon  = { up: '↑', down: '↓', stable: '→' };
  const trendClass = { up: 'predict-up', down: 'predict-down', stable: 'predict-stable' };

  const cards = columns.map((col, ci) => {
    const p     = predictions[col.key];
    const color = FEAT_COLORS[ci % FEAT_COLORS.length];

    const groupRow = (label, grp) => {
      const d    = p[grp];
      const icon = trendIcon[d.trend];
      const tcls = trendClass[d.trend];
      return `
        <div class="predict-row">
          <span class="predict-row-label">${label}</span>
          <span class="predict-row-val">
            <strong>${d.value}</strong>
            <span class="predict-unit">${col.unit}</span>
          </span>
          <span class="predict-change ${tcls}">${icon} ${d.change >= 0 ? '+' : ''}${d.change}</span>
          <span class="predict-r2">R²&nbsp;${d.r2}</span>
        </div>
      `;
    };

    const overallTcls = trendClass[p.overall.trend];
    const overallIcon = trendIcon[p.overall.trend];

    return `
      <div class="predict-card" style="border-top-color:${color}">
        <div class="predict-card-header">
          <span class="predict-card-title">${col.label}</span>
          <span class="predict-card-unit">${col.unit}</span>
        </div>
        <div class="predict-main">
          <span class="predict-main-val" style="color:${color}">${p.overall.value}</span>
          <span class="predict-card-unit">${col.unit}</span>
          <span class="predict-change ${overallTcls}" style="font-size:1.05rem;margin-left:4px">
            ${overallIcon} ${p.overall.change >= 0 ? '+' : ''}${p.overall.change}
          </span>
        </div>
        <div class="predict-last">
          Last month (${lastMonthLabel}): <strong>${p.overall.lastMonth}</strong>
          &nbsp;·&nbsp; R²&nbsp;<strong>${p.overall.r2}</strong>
        </div>
        <div class="predict-rows">
          ${groupRow('Diabetic', 'diabetic')}
          ${groupRow('Non-diabetic', 'healthy')}
        </div>
      </div>
    `;
  }).join('');

  grid.innerHTML = `${warning ? `<div style="grid-column:1 / -1;padding:10px 12px;border-radius:10px;background:#fef3c7;color:#92400e;font-size:0.82rem">${warning}</div>` : ''}${cards}`;
}

// ── Full render ────────────────────────────────────────────────
function renderAll(data) {
  // Initialise all features as selected
  selectedFeatures = new Set(data.columns.map(c => c.key));

  document.getElementById('anContent').style.display = 'block';
  renderSummary(data);
  renderFeatureFilter(data);
  renderReadingForm(data);

  // Load ML predictions in parallel (non-blocking)
  loadPredictions();

  requestAnimationFrame(() => {
    renderOverview(data);
    renderTrendCharts(data);
    renderStatsTable(data);
  });
}

// ── Fetch ──────────────────────────────────────────────────────
let _cachedData = null;
let _predictedValues = null; // populated when ML predictions load

async function loadAnalytics() {
  const loading = document.getElementById('anLoading');
  const errBox  = document.getElementById('anError');
  const content = document.getElementById('anContent');

  loading.style.display = 'block';
  errBox.style.display  = 'none';
  content.style.display = 'none';

  const res = await api.get('/analytics/diabetes');
  loading.style.display = 'none';

  if (!res?.ok) {
    document.getElementById('anErrorMsg').textContent =
      res?.data?.message || 'Failed to load data. Ensure diabetes.csv is in the project root.';
    errBox.style.display = 'block';
    return;
  }

  _cachedData = res.data;
  renderAll(_cachedData);
}

loadAnalytics();

// ── Re-render on theme toggle ──────────────────────────────────
window.addEventListener('themechange', () => {
  if (!_cachedData) return;
  setTimeout(() => refreshCharts(_cachedData), 60);
});
