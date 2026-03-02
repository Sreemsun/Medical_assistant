/* ─────────────────────────────────────────────────────────────
   analytics.js  –  Monthly Trend Analytics with feature filter
───────────────────────────────────────────────────────────── */

'use strict';

// ── Bootstrap ─────────────────────────────────────────────────
document.getElementById('navbar').innerHTML = buildNavbar('analytics');
document.getElementById('footer').innerHTML = buildFooter();
Auth.requireAuth();

// ── Monthly grouping config ────────────────────────────────────
// Treat 768 readings as 24 months of data (32 readings/month ≈ ~1 reading/day)
const MONTH_SIZE = 32;
const NUM_MONTHS = Math.ceil(768 / MONTH_SIZE); // 24 months

function makeMonthLabels() {
  const base = new Date(2023, 0); // Jan 2023
  return Array.from({ length: NUM_MONTHS }, (_, i) => {
    const d = new Date(base.getFullYear(), base.getMonth() + i);
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  });
}

// Group raw values into monthly averages
// zeroOK = false means zeros are missing data and should be excluded
function groupByMonth(values, zeroOK = false) {
  const months = [];
  for (let i = 0; i < values.length; i += MONTH_SIZE) {
    const chunk = values.slice(i, i + MONTH_SIZE);
    const valid = zeroOK ? chunk : chunk.filter(v => v > 0);
    const avg   = valid.length
      ? +(valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(2)
      : null; // null = no valid data that month
    months.push(avg);
  }
  return months;
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

// ── Summary cards ──────────────────────────────────────────────
function renderSummary(data) {
  const pct = ((data.diabetic / data.total) * 100).toFixed(1);
  document.getElementById('summaryCards').innerHTML = `
    <div class="sum-card total">
      <div class="sum-label">Total Readings</div>
      <div class="sum-value">${data.total}</div>
      <p class="sum-desc">${NUM_MONTHS} months of data</p>
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

// ── Overview: normalised monthly multi-line ────────────────────
function renderOverview(data) {
  const t      = theme();
  const labels = makeMonthLabels();
  const activeCols = data.columns.filter(c => selectedFeatures.has(c.key));

  const datasets = activeCols.map((col, ci) => {
    const zeroOK = col.key === 'Age' || col.key === 'DiabetesPedigreeFunction';
    const monthly = groupByMonth(data.series[col.key], zeroOK);
    const valid   = monthly.filter(v => v !== null);
    const mn      = Math.min(...valid);
    const mx      = Math.max(...valid);
    const range   = mx - mn || 1;
    const norm    = monthly.map(v => v === null ? null : +((v - mn) / range).toFixed(3));

    const globalIdx = data.columns.findIndex(c => c.key === col.key);
    const color = FEAT_COLORS[globalIdx % FEAT_COLORS.length];

    return {
      label: col.label,
      data: norm,
      borderColor: color,
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 3,
      pointHoverRadius: 5,
      tension: 0.35,
      spanGaps: true,
    };
  });

  makeChart('chartOverview', 'line', { labels, datasets }, {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 300 },
    plugins: {
      legend: {
        labels: {
          color: t.legend, font: { size: 12 },
          boxWidth: 20, padding: 16,
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
            ? ` ${ctx.dataset.label}: ${ctx.raw.toFixed(2)} (normalised)`
            : ` ${ctx.dataset.label}: no data`,
        },
      },
    },
    scales: {
      x: {
        ...scaleOpts(t),
        ticks: { ...scaleOpts(t).ticks, maxRotation: 45, maxTicksLimit: 12 },
      },
      y: {
        ...scaleOpts(t),
        min: 0, max: 1,
        ticks: { ...scaleOpts(t).ticks, callback: v => v.toFixed(1) },
        title: { display: true, text: 'Normalised value (0–1)', color: t.tick, font: { size: 11 } },
      },
    },
  });
}

// ── Individual monthly trend charts ───────────────────────────
function renderTrendCharts(data) {
  const grid   = document.getElementById('trendsGrid');
  const labels = makeMonthLabels();

  // Remove cards for de-selected features
  const activeCols = data.columns.filter(c => selectedFeatures.has(c.key));

  grid.innerHTML = '';

  activeCols.forEach((col) => {
    const s        = data.stats[col.key];
    const zeroOK   = col.key === 'Age' || col.key === 'DiabetesPedigreeFunction';
    const canvasId = `trendChart_${col.key}`;
    const globalIdx = data.columns.findIndex(c => c.key === col.key);
    const color    = FEAT_COLORS[globalIdx % FEAT_COLORS.length];

    const card = document.createElement('div');
    card.className = 'trend-card';
    card.innerHTML = `
      <div class="trend-card-header">
        <h4 class="trend-card-title">${col.label}</h4>
        <span class="trend-card-unit">${col.unit}</span>
      </div>
      <div class="trend-stats">
        <span class="trend-stat"><strong>Overall mean</strong> ${s.overall.mean}</span>
        <span class="trend-stat" style="color:${COL_DIABETIC};font-weight:600">
          Diabetic avg ${s.diabetic.mean}
        </span>
        <span class="trend-stat" style="color:${COL_HEALTHY};font-weight:600">
          Non-diabetic avg ${s.healthy.mean}
        </span>
      </div>
      <div class="trend-wrap"><canvas id="${canvasId}"></canvas></div>
    `;
    grid.appendChild(card);
  });

  requestAnimationFrame(() => {
    const t = theme();

    activeCols.forEach((col) => {
      const zeroOK   = col.key === 'Age' || col.key === 'DiabetesPedigreeFunction';
      const canvasId = `trendChart_${col.key}`;
      const globalIdx = data.columns.findIndex(c => c.key === col.key);
      const color    = FEAT_COLORS[globalIdx % FEAT_COLORS.length];

      // Monthly averages — overall, diabetic-only, healthy-only
      const overallMonthly  = groupByMonth(data.series[col.key], zeroOK);

      // Separate series by outcome to see diabetic vs healthy monthly trend
      const diabeticVals = data.series[col.key].map((v, i) =>
        data.outcomeArr[i] === 1 ? v : null
      );
      const healthyVals = data.series[col.key].map((v, i) =>
        data.outcomeArr[i] === 0 ? v : null
      );

      const diabeticMonthly = groupByMonthNullable(diabeticVals, zeroOK);
      const healthyMonthly  = groupByMonthNullable(healthyVals, zeroOK);

      makeChart(canvasId, 'line', {
        labels,
        datasets: [
          {
            label: 'Overall',
            data: overallMonthly,
            borderColor: color,
            backgroundColor: color + '18',
            fill: true,
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
            tension: 0.35,
            spanGaps: true,
          },
          {
            label: 'Diabetic avg',
            data: diabeticMonthly,
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
            data: healthyMonthly,
            borderColor: COL_HEALTHY,
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            borderDash: [5, 3],
            pointRadius: 2,
            pointHoverRadius: 4,
            tension: 0.35,
            spanGaps: true,
          },
        ],
      }, {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        plugins: {
          legend: {
            labels: {
              color: t.legend, font: { size: 11 },
              boxWidth: 14, padding: 10,
              usePointStyle: true, pointStyle: 'circle',
            },
          },
          tooltip: {
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
            ticks: { ...scaleOpts(t).ticks, maxRotation: 45, maxTicksLimit: 8 },
          },
          y: { ...scaleOpts(t), beginAtZero: false, spanGaps: true },
        },
      });
    });
  });
}

// Group values into monthly averages, treating null/missing differently
function groupByMonthNullable(values, zeroOK = false) {
  const months = [];
  for (let i = 0; i < values.length; i += MONTH_SIZE) {
    const chunk = values.slice(i, i + MONTH_SIZE).filter(v => v !== null);
    const valid = zeroOK ? chunk : chunk.filter(v => v > 0);
    const avg   = valid.length
      ? +(valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(2)
      : null;
    months.push(avg);
  }
  return months;
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

// ── Full render ────────────────────────────────────────────────
function renderAll(data) {
  // Initialise all features as selected
  selectedFeatures = new Set(data.columns.map(c => c.key));

  document.getElementById('anContent').style.display = 'block';
  renderSummary(data);
  renderFeatureFilter(data);

  requestAnimationFrame(() => {
    renderOverview(data);
    renderTrendCharts(data);
    renderStatsTable(data);
  });
}

// ── Fetch ──────────────────────────────────────────────────────
let _cachedData = null;

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
