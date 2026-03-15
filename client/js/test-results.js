/* ─────────────────────────────────────────────────────────────
   test-results.js  –  Patient test-result upload & tracking
───────────────────────────────────────────────────────────── */

'use strict';

document.getElementById('navbar').innerHTML = buildNavbar('test-results');
document.getElementById('footer').innerHTML = buildFooter();
Auth.requireAuth();

// ── State ──────────────────────────────────────────────────────
let allRecords   = [];
let activeType   = '';
let deletingId   = null;
const paramRows  = [];        // dynamic row counter
const _trendCharts = {};
let mlPredictions = null;     // cached from GET /api/analytics/predict

// ── Known parameter → ML prediction key + default unit ────────
const KNOWN_PARAMS = {
  'glucose':                  { key: 'Glucose',                  unit: 'mg/dL'  },
  'blood pressure':           { key: 'BloodPressure',            unit: 'mmHg'   },
  'bloodpressure':            { key: 'BloodPressure',            unit: 'mmHg'   },
  'skin thickness':           { key: 'SkinThickness',            unit: 'mm'     },
  'skinthickness':            { key: 'SkinThickness',            unit: 'mm'     },
  'insulin':                  { key: 'Insulin',                  unit: 'μU/mL'  },
  'bmi':                      { key: 'BMI',                      unit: 'kg/m²'  },
  'body mass index':          { key: 'BMI',                      unit: 'kg/m²'  },
  'diabetes pedigree':        { key: 'DiabetesPedigreeFunction', unit: 'score'  },
  'diabetespedigreefunction': { key: 'DiabetesPedigreeFunction', unit: 'score'  },
  'age':                      { key: 'Age',                      unit: 'years'  },
};

// ── DOM refs ───────────────────────────────────────────────────
const trList      = document.getElementById('trList');
const trLoading   = document.getElementById('trLoading');
const trEmpty     = document.getElementById('trEmpty');
const trAlert     = document.getElementById('trAlert');
const trendSec    = document.getElementById('trendSection');
const trendRow    = document.getElementById('trendChartsRow');
const recModal    = document.getElementById('recordModal');
const deleteModal = document.getElementById('deleteModal');
const modalAlert  = document.getElementById('modalAlert');
const fileInput   = document.getElementById('reportFile');
const fileLabel   = document.getElementById('fileLabel');

// ── Alert helpers ──────────────────────────────────────────────
function showAlert(el, msg, type = 'error') {
  el.textContent = msg;
  el.className   = `tr-alert ${type}`;
  el.classList.remove('hidden');
}
function hideAlert(el) { el.classList.add('hidden'); }

// ── Modal helpers ──────────────────────────────────────────────
function openModal()  { recModal.classList.remove('hidden'); }
function closeModal() {
  recModal.classList.add('hidden');
  resetForm();
}
function openDeleteModal(id)  { deletingId = id; deleteModal.classList.remove('hidden'); }
function closeDeleteModal()   { deletingId = null; deleteModal.classList.add('hidden'); }

recModal.addEventListener('click',    e => { if (e.target === recModal)    closeModal(); });
deleteModal.addEventListener('click', e => { if (e.target === deleteModal) closeDeleteModal(); });
document.getElementById('closeModal').addEventListener('click',       closeModal);
document.getElementById('cancelModal').addEventListener('click',      closeModal);
document.getElementById('closeDeleteModal').addEventListener('click', closeDeleteModal);
document.getElementById('cancelDelete').addEventListener('click',     closeDeleteModal);

// ── Type config ────────────────────────────────────────────────
const TYPE_CFG = {
  lab_result:   { label: 'Lab Result',   cls: 'rec-lab',    icon: '🧪' },
  diagnosis:    { label: 'Diagnosis',    cls: 'rec-diag',   icon: '🩺' },
  prescription: { label: 'Prescription', cls: 'rec-rx',     icon: '💊' },
  vital_signs:  { label: 'Vital Signs',  cls: 'rec-vital',  icon: '❤️' },
  vaccination:  { label: 'Vaccination',  cls: 'rec-vax',    icon: '💉' },
  surgery:      { label: 'Surgery',      cls: 'rec-surg',   icon: '🏥' },
  allergy:      { label: 'Allergy',      cls: 'rec-allergy',icon: '⚠️' },
  other:        { label: 'Other',        cls: 'rec-other',  icon: '📋' },
};

const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

// ── Load records ───────────────────────────────────────────────
async function loadRecords() {
  trLoading.style.display = 'flex';
  trList.innerHTML = '';
  trEmpty.classList.add('hidden');
  trendSec.classList.add('hidden');

  const qs  = activeType ? `?type=${activeType}` : '';
  const res = await api.get(`/records${qs}`);
  trLoading.style.display = 'none';

  if (!res?.ok) {
    showAlert(trAlert, res?.data?.message || 'Failed to load records.');
    return;
  }

  allRecords = res.data.records || [];
  renderList();
  renderTrends();
}

// ── Render records list ────────────────────────────────────────
function renderList() {
  if (!allRecords.length) {
    trEmpty.classList.remove('hidden');
    trList.innerHTML = '';
    return;
  }
  trEmpty.classList.add('hidden');

  trList.innerHTML = allRecords.map(r => {
    const cfg = TYPE_CFG[r.type] || TYPE_CFG.other;

    const valHtml = (r.testValues?.length)
      ? `<div class="tr-values">
          ${r.testValues.map(tv => {
            const hasRange = tv.refMin !== undefined || tv.refMax !== undefined;
            const outOfRange = hasRange && (
              (tv.refMin !== undefined && tv.value < tv.refMin) ||
              (tv.refMax !== undefined && tv.value > tv.refMax)
            );
            return `
              <div class="tr-val-chip ${outOfRange ? 'tr-val-high' : ''}">
                <span class="tr-val-name">${escHtml(tv.name)}</span>
                <span class="tr-val-num">${tv.value}${tv.unit ? ' ' + escHtml(tv.unit) : ''}</span>
                ${hasRange ? `<span class="tr-val-ref">${tv.refMin ?? ''}–${tv.refMax ?? ''}</span>` : ''}
              </div>
            `;
          }).join('')}
        </div>`
      : '';

    const fileHtml = (r.attachments?.length)
      ? `<div class="tr-file-link">
          ${r.attachments.map(a =>
            `<a href="http://localhost:5001${a.path}" target="_blank" class="tr-attach-link">📎 ${escHtml(a.filename)}</a>`
          ).join('')}
        </div>`
      : '';

    return `
      <div class="tr-card" data-id="${r._id}">
        <div class="tr-card-top">
          <div class="tr-card-left">
            <span class="dp-rec-badge ${cfg.cls}">${cfg.icon} ${cfg.label}</span>
            <h3 class="tr-card-title">${escHtml(r.title)}</h3>
          </div>
          <div class="tr-card-right">
            <span class="tr-card-date">${fmtDate(r.date)}</span>
            <button class="btn-icon tr-del-btn" data-id="${r._id}" title="Delete">🗑</button>
          </div>
        </div>
        ${r.doctor || r.facility ? `
          <div class="tr-card-meta">
            ${r.doctor   ? `<span>Dr. ${escHtml(r.doctor)}</span>` : ''}
            ${r.facility ? `<span>${escHtml(r.facility)}</span>`   : ''}
          </div>` : ''}
        ${r.description ? `<p class="tr-card-desc">${escHtml(r.description)}</p>` : ''}
        ${valHtml}
        ${fileHtml}
      </div>
    `;
  }).join('');

  trList.querySelectorAll('.tr-del-btn').forEach(btn => {
    btn.addEventListener('click', () => openDeleteModal(btn.dataset.id));
  });
}

// ── Trend charts ───────────────────────────────────────────────
function renderTrends() {
  // Collect all test values across all records (all types loaded)
  const paramMap = {}; // name → [{date, value, unit}]
  allRecords.forEach(r => {
    (r.testValues || []).forEach(tv => {
      if (tv.name && tv.value !== undefined) {
        const key = tv.name.trim().toLowerCase();
        if (!paramMap[key]) paramMap[key] = { displayName: tv.name, unit: tv.unit || '', points: [] };
        paramMap[key].points.push({ date: new Date(r.date), value: tv.value });
      }
    });
  });

  // Only show parameters with 2+ readings
  const chartable = Object.values(paramMap).filter(p => p.points.length >= 2);

  if (!chartable.length) { trendSec.classList.add('hidden'); return; }

  trendSec.classList.remove('hidden');
  trendRow.innerHTML = '';

  // Destroy old charts
  Object.values(_trendCharts).forEach(c => c.destroy());
  Object.keys(_trendCharts).forEach(k => delete _trendCharts[k]);

  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
  const tickColor = dark ? '#94a3b8' : '#64748b';

  const COLORS = ['#6366f1', '#0ea5e9', '#f59e0b', '#ec4899', '#10b981', '#f97316'];

  chartable.forEach((p, ci) => {
    p.points.sort((a, b) => a.date - b.date);
    const labels  = p.points.map(pt => pt.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
    const values  = p.points.map(pt => pt.value);
    const color   = COLORS[ci % COLORS.length];
    const canvasId = `trendChart_${ci}`;

    const wrapper = document.createElement('div');
    wrapper.className = 'tr-trend-card';
    wrapper.innerHTML = `
      <div class="tr-trend-card-title">${escHtml(p.displayName)}${p.unit ? ` <span class="tr-trend-unit">(${escHtml(p.unit)})</span>` : ''}</div>
      <div class="tr-trend-wrap"><canvas id="${canvasId}"></canvas></div>
    `;
    trendRow.appendChild(wrapper);

    requestAnimationFrame(() => {
      const ctx = document.getElementById(canvasId);
      if (!ctx) return;
      _trendCharts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            data: values,
            borderColor: color,
            backgroundColor: color + '20',
            fill: true,
            borderWidth: 2.5,
            pointRadius: 5,
            pointHoverRadius: 7,
            tension: 0.35,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: { label: ctx => ` ${ctx.raw} ${p.unit}` },
            },
          },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 } } },
            y: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 } } },
          },
        },
      });
    });
  });
}

// ── Tab switching ──────────────────────────────────────────────
document.querySelectorAll('.tr-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tr-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeType = tab.dataset.type;
    loadRecords();
  });
});

// ── Add button ─────────────────────────────────────────────────
document.getElementById('addRecordBtn').addEventListener('click', openModal);
document.getElementById('emptyAddBtn').addEventListener('click', openModal);

// ── File input display ─────────────────────────────────────────
fileInput.addEventListener('change', () => {
  fileLabel.textContent = fileInput.files[0]
    ? `📎 ${fileInput.files[0].name}`
    : '📎 Click to choose file or drag and drop';
});

// ── Dynamic parameter rows ────────────────────────────────────
let rowCount = 0;

function addParamRow(name = '', value = '', unit = '', refMin = '', refMax = '') {
  rowCount++;
  const id = `prow_${rowCount}`;
  const div = document.createElement('div');
  div.className = 'tv-row';
  div.id = id;
  div.innerHTML = `
    <input type="text"   class="form-control tv-name"   placeholder="e.g. Glucose" value="${escHtml(name)}">
    <input type="number" class="form-control tv-value"  placeholder="120"           value="${escHtml(String(value))}">
    <input type="text"   class="form-control tv-unit"   placeholder="mg/dL"         value="${escHtml(unit)}">
    <div class="tv-range">
      <input type="number" class="form-control tv-refmin" placeholder="Min" value="${escHtml(String(refMin))}">
      <span>–</span>
      <input type="number" class="form-control tv-refmax" placeholder="Max" value="${escHtml(String(refMax))}">
    </div>
    <button type="button" class="btn-icon tv-remove" data-id="${id}">×</button>
  `;
  document.getElementById('testValuesContainer').appendChild(div);

  div.querySelector('.tv-remove').addEventListener('click', () => div.remove());
}

document.getElementById('addParamRow').addEventListener('click', () => addParamRow());

// Add one blank row by default when modal opens
function resetForm() {
  document.getElementById('recTitle').value    = '';
  document.getElementById('recType').value     = 'lab_result';
  document.getElementById('recDate').value     = '';
  document.getElementById('recDoctor').value   = '';
  document.getElementById('recFacility').value = '';
  document.getElementById('recDesc').value     = '';
  fileInput.value     = '';
  fileLabel.textContent = '📎 Click to choose file or drag and drop';
  hideAlert(modalAlert);

  // Remove all param rows (keep only header row)
  document.querySelectorAll('.tv-row').forEach(r => r.remove());
  rowCount = 0;
  addParamRow(); // start with one blank row
}

// ── Save record ────────────────────────────────────────────────
document.getElementById('saveRecordBtn').addEventListener('click', async () => {
  hideAlert(modalAlert);
  const title = document.getElementById('recTitle').value.trim();
  const type  = document.getElementById('recType').value;
  if (!title) { showAlert(modalAlert, 'Title is required.'); return; }

  // Collect test values
  const testValues = [];
  document.querySelectorAll('.tv-row').forEach(row => {
    const name  = row.querySelector('.tv-name').value.trim();
    const value = row.querySelector('.tv-value').value.trim();
    if (!name || value === '') return;
    testValues.push({
      name,
      value:  parseFloat(value),
      unit:   row.querySelector('.tv-unit').value.trim(),
      refMin: row.querySelector('.tv-refmin').value !== '' ? parseFloat(row.querySelector('.tv-refmin').value) : '',
      refMax: row.querySelector('.tv-refmax').value !== '' ? parseFloat(row.querySelector('.tv-refmax').value) : '',
    });
  });

  const saveBtn = document.getElementById('saveRecordBtn');
  Loader.setBtn(saveBtn, true, 'Saving…');

  const formData = new FormData();
  formData.append('title',      title);
  formData.append('type',       type);
  formData.append('date',       document.getElementById('recDate').value);
  formData.append('doctor',     document.getElementById('recDoctor').value.trim());
  formData.append('facility',   document.getElementById('recFacility').value.trim());
  formData.append('description',document.getElementById('recDesc').value.trim());
  formData.append('testValues', JSON.stringify(testValues));
  if (fileInput.files[0]) formData.append('reportFile', fileInput.files[0]);

  const res = await api.postForm('/records', formData);
  Loader.setBtn(saveBtn, false);

  if (!res?.ok) {
    showAlert(modalAlert, res?.data?.message || 'Failed to save record.');
    return;
  }

  Toast.success('Test result saved.');
  closeModal();
  loadRecords();
});

// ── Delete record ──────────────────────────────────────────────
document.getElementById('confirmDelete').addEventListener('click', async () => {
  if (!deletingId) return;
  const btn = document.getElementById('confirmDelete');
  btn.disabled = true;
  btn.textContent = 'Deleting…';

  const res = await api.delete(`/records/${deletingId}`);
  btn.disabled = false;
  btn.textContent = 'Delete';
  closeDeleteModal();

  if (!res?.ok) { showAlert(trAlert, res?.data?.message || 'Delete failed.'); return; }
  Toast.success('Record deleted.');
  loadRecords();
});

// ── Utils ──────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Load ML predictions (non-blocking, best-effort) ────────────
async function loadMLPredictions() {
  const res = await api.get('/analytics/predict');
  if (res?.ok) mlPredictions = res.data.predictions;
}

// ── Quick Log — auto-fill unit for known parameters ────────────
document.getElementById('qlParam').addEventListener('input', function () {
  const k = this.value.trim().toLowerCase();
  const known = KNOWN_PARAMS[k];
  if (known) {
    const unitEl = document.getElementById('qlUnit');
    if (!unitEl.value) unitEl.value = known.unit;
  }
});

// ── Quick Log — form submit ────────────────────────────────────
document.getElementById('quickLogForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert(trAlert);

  const param = document.getElementById('qlParam').value.trim();
  const value = parseFloat(document.getElementById('qlValue').value);
  const unit  = document.getElementById('qlUnit').value.trim();
  const date  = document.getElementById('qlDate').value
    || new Date().toISOString().split('T')[0];

  if (!param || isNaN(value)) return;

  const btn = document.getElementById('qlSubmitBtn');
  Loader.setBtn(btn, true, 'Saving…');

  const formData = new FormData();
  formData.append('title',      `${param} reading`);
  formData.append('type',       'vital_signs');
  formData.append('date',       date);
  formData.append('testValues', JSON.stringify([{ name: param, value, unit }]));

  const res = await api.postForm('/records', formData);
  Loader.setBtn(btn, false);

  if (!res?.ok) {
    showAlert(trAlert, res?.data?.message || 'Failed to log value.');
    return;
  }

  Toast.success('Value logged!');
  showComparison(param, value, unit);
  loadRecords(); // refresh list + trend charts
});

// ── Quick Log — show comparison panel ─────────────────────────
function showComparison(paramName, actualValue, unit) {
  const panel = document.getElementById('qeCompare');

  const normalKey = paramName.trim().toLowerCase();
  const known     = KNOWN_PARAMS[normalKey];

  // No ML match — simple confirmation
  if (!known || !mlPredictions || !mlPredictions[known.key]) {
    panel.innerHTML = `
      <div class="qe-cmp-simple">
        <strong>${escHtml(paramName)}</strong> logged as
        <strong>${actualValue}${unit ? ' ' + escHtml(unit) : ''}</strong>.
        Your trend chart has been updated below.
      </div>
    `;
    panel.classList.remove('hidden');
    return;
  }

  const pred      = mlPredictions[known.key].overall;
  const diff      = +(actualValue - pred.value).toFixed(2);
  const sign      = diff >= 0 ? '+' : '';
  const diffCls   = diff > 0  ? 'qe-diff-up' : diff < 0 ? 'qe-diff-down' : 'qe-diff-stable';
  const trendIcon = { up: '↑', down: '↓', stable: '→' }[pred.trend] || '→';
  const hint      = Math.abs(diff) < 1
    ? 'Very close to the predicted value'
    : diff > 0
      ? 'Above the ML-predicted value'
      : 'Below the ML-predicted value';

  panel.innerHTML = `
    <div class="qe-compare-title">Logged vs Predicted Comparison — ${escHtml(paramName)}</div>
    <div class="qe-cmp-grid">
      <div class="qe-cmp-cell">
        <div class="qe-cmp-label">Your Logged Value</div>
        <div class="qe-cmp-val qe-cmp-actual">
          ${actualValue} <span class="qe-cmp-unit">${escHtml(unit || known.unit)}</span>
        </div>
      </div>
      <div class="qe-cmp-vs">vs</div>
      <div class="qe-cmp-cell">
        <div class="qe-cmp-label">ML Predicted (Jan 2025)</div>
        <div class="qe-cmp-val qe-cmp-predicted">
          ${pred.value} <span class="qe-cmp-unit">${escHtml(unit || known.unit)}</span>
        </div>
        <div class="qe-cmp-trend">
          ${trendIcon} Trend: <strong>${pred.trend}</strong>
          &nbsp;·&nbsp; R²&nbsp;<strong>${pred.r2}</strong>
        </div>
      </div>
      <div class="qe-cmp-cell">
        <div class="qe-cmp-label">Difference</div>
        <div class="qe-cmp-diff ${diffCls}">
          ${sign}${diff} <span class="qe-cmp-unit">${escHtml(unit || known.unit)}</span>
        </div>
        <div class="qe-cmp-hint">${hint}</div>
      </div>
    </div>
  `;
  panel.classList.remove('hidden');
}

// ── Boot ───────────────────────────────────────────────────────
// Set today's date as default for quick log
document.getElementById('qlDate').value = new Date().toISOString().split('T')[0];

resetForm();
loadRecords();
loadMLPredictions(); // fetch ML predictions in background
