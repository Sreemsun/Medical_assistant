/* ═══════════════════════════════════════════════════════════════
   MedAssist — Symptom Analyzer JavaScript
   ═══════════════════════════════════════════════════════════════ */

document.getElementById('navbar-placeholder').innerHTML = buildNavbar('analyzer');
document.getElementById('footer-placeholder').innerHTML = buildFooter();
Auth.requireAuth();

let currentQueryId = null;
let selectedSeverity = null;

// ── Init ──────────────────────────────────────────────────────
async function init() {
  setupChips();
  setupCharCount();
  setupSeveritySelector();
  await loadRecentHistory();

  // Check if we're viewing a specific past query
  const params = new URLSearchParams(window.location.search);
  const queryId = params.get('query');
  if (queryId) {
    showLoading();
    const res = await api.get(`/symptoms/${queryId}`);
    if (res && res.ok) {
      currentQueryId = queryId;
      renderResults(res.data.query.analysis, res.data.query);
    } else {
      hideLoading();
      Toast.error('Could not load symptom query.');
    }
  }
}

// ── Symptom Chips ─────────────────────────────────────────────
function setupChips() {
  document.querySelectorAll('.symptom-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const symptom = chip.dataset.symptom;
      chip.classList.toggle('selected');
      const textarea = document.getElementById('symptoms');
      const chips = document.querySelectorAll('.symptom-chip.selected');
      const existingText = textarea.value.trim();

      // Build chip list and prepend to any manual input
      const chipText = Array.from(chips).map(c => c.dataset.symptom).join(', ');
      const lines = existingText.split('\n');
      // Remove first line if it was previously chip-generated
      if (lines[0] && lines[0].startsWith('Symptoms: ')) lines.shift();
      const manual = lines.join('\n').trim();
      textarea.value = chipText ? `Symptoms: ${chipText}${manual ? '\n\nAdditional details: ' + manual : ''}` : manual;
      updateCharCount();
    });
  });
}

function setupCharCount() {
  const ta = document.getElementById('symptoms');
  const counter = document.getElementById('char-count');
  const updateCharCount = () => { counter.textContent = ta.value.length; };
  ta.addEventListener('input', updateCharCount);
  window.updateCharCount = updateCharCount;
}

function updateCharCount() {
  document.getElementById('char-count').textContent = document.getElementById('symptoms').value.length;
}

// ── Severity Selector ─────────────────────────────────────────
function setupSeveritySelector() {
  document.querySelectorAll('.severity-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.severity-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selectedSeverity = opt.dataset.value;
      opt.querySelector('input').checked = true;
    });
  });
}

// ── Load Recent History ───────────────────────────────────────
async function loadRecentHistory() {
  const res = await api.get('/symptoms/history?page=1&limit=3');
  if (!res || !res.ok || !res.data.queries?.length) return;

  const preview = document.getElementById('history-preview');
  const list = document.getElementById('history-preview-list');
  preview.style.display = 'block';

  list.innerHTML = res.data.queries.map(q => `
    <div class="data-item" style="cursor:pointer" onclick="viewPastQuery('${q._id}')">
      <div class="data-item-icon">🔬</div>
      <div class="data-item-content">
        <div class="data-item-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:calc(100% - 40px)">${escHtml(q.symptoms.substring(0, 80))}${q.symptoms.length > 80 ? '...' : ''}</div>
        <div class="data-item-subtitle">${DateFmt.relative(q.createdAt)} ${q.analysis?.severityRating ? `· <span class="badge ${severityBadgeClass(q.analysis.severityRating)}">${q.analysis.severityRating}</span>` : ''}</div>
      </div>
    </div>`).join('');
}

async function viewPastQuery(id) {
  showLoading();
  const res = await api.get(`/symptoms/${id}`);
  if (res && res.ok) {
    currentQueryId = id;
    renderResults(res.data.query.analysis, res.data.query);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    hideLoading();
    Toast.error('Failed to load query.');
  }
}

// ── Form Submit ───────────────────────────────────────────────
document.getElementById('symptom-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  Form.clearAlert('form-alert');

  const symptoms = document.getElementById('symptoms').value.trim();

  if (!symptoms || symptoms.length < 10) {
    Form.showAlert('form-alert', 'Please describe your symptoms in at least 10 characters for a meaningful analysis.', 'warning');
    return;
  }

  showLoading();

  const body = {
    symptoms,
    duration: document.getElementById('duration').value || undefined,
    severity: selectedSeverity || undefined,
    additionalInfo: document.getElementById('additionalInfo').value.trim() || undefined,
  };

  const res = await api.post('/symptoms/analyze', body);

  if (res && res.ok && res.data.success) {
    currentQueryId = res.data.queryId;
    renderResults(res.data.analysis);
    Toast.success('Analysis complete!');
  } else {
    hideLoading();
    Form.showAlert('form-alert', res?.data?.message || 'Analysis failed. Please try again.', 'error');
  }
});

// ── Loading Animation ─────────────────────────────────────────
let loadingTimer = null;

function showLoading() {
  document.getElementById('input-view').classList.add('hidden');
  document.getElementById('results-view').classList.add('hidden');
  document.getElementById('analyzing-view').classList.remove('hidden');

  const steps = ['astep-1', 'astep-2', 'astep-3', 'astep-4'];
  let i = 0;
  loadingTimer = setInterval(() => {
    if (i > 0) document.getElementById(steps[i - 1])?.classList.replace('active', 'done') || document.getElementById(steps[i - 1])?.classList.add('done');
    if (i < steps.length) {
      document.getElementById(steps[i])?.classList.add('active');
    }
    i++;
    if (i > steps.length) clearInterval(loadingTimer);
  }, 700);
}

function hideLoading() {
  clearInterval(loadingTimer);
  document.getElementById('analyzing-view').classList.add('hidden');
  document.getElementById('input-view').classList.remove('hidden');
  // Reset steps
  ['astep-1', 'astep-2', 'astep-3', 'astep-4'].forEach((id, idx) => {
    const el = document.getElementById(id);
    if (el) { el.classList.remove('active', 'done'); if (idx === 0) el.classList.add('active'); }
  });
}

// ── Render Results ────────────────────────────────────────────
function renderResults(analysis, query = null) {
  clearInterval(loadingTimer);
  document.getElementById('analyzing-view').classList.add('hidden');
  document.getElementById('input-view').classList.add('hidden');

  const sevClass = { Low: 'severity-low', Medium: 'severity-medium', High: 'severity-high', Critical: 'severity-critical' };
  const sevDesc = {
    Low: 'Your symptoms suggest a low-severity condition. Monitor symptoms and follow home care guidelines.',
    Medium: 'Your symptoms indicate a moderate condition. Consider consulting a doctor if symptoms persist or worsen.',
    High: 'Your symptoms suggest a high-severity condition. Please seek medical attention promptly.',
    Critical: 'Your symptoms may indicate a serious medical emergency. Seek immediate medical care.',
  };

  const conditions = analysis.potentialConditions || [];
  const riskFactors = analysis.riskFactors || [];
  const actions = analysis.recommendedActions || {};

  document.getElementById('results-container').innerHTML = `
    <!-- Header -->
    <div class="results-header-card ${sevClass[analysis.severityRating] || 'severity-medium'}">
      <div>
        <div class="text-xs font-semibold mb-1">AI Severity Assessment</div>
        <div class="severity-label" style="font-size:1.4rem">
          ${getSeverityIcon(analysis.severityRating)} Severity: ${analysis.severityRating || 'Unknown'}
        </div>
        <div class="severity-description">${sevDesc[analysis.severityRating] || ''}</div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn btn-secondary btn-sm" onclick="showNewAnalysis()">← New Analysis</button>
        ${currentQueryId ? `<button class="btn btn-ghost btn-sm" onclick="showRating()">Rate This Analysis</button>` : ''}
      </div>
    </div>

    <!-- Disclaimer -->
    <div class="disclaimer-box mb-6">
      <span style="font-size:1.2rem;flex-shrink:0">⚠️</span>
      <span><strong>Medical Disclaimer:</strong> ${analysis.disclaimer || 'This analysis is for informational purposes only and does NOT constitute medical advice, diagnosis, or treatment. Always consult a qualified healthcare professional.'}</span>
    </div>

    <!-- Potential Conditions -->
    <div class="card mb-6">
      <div class="card-header">
        <span class="card-title">🔬 Potential Conditions</span>
        <span class="badge badge-primary">${conditions.length} identified</span>
      </div>
      ${conditions.length ? conditions.map(c => `
        <div class="condition-card">
          <div class="condition-header">
            <div>
              <div class="condition-name">${escHtml(c.condition)}</div>
              ${c.icdCode ? `<div class="condition-icd">ICD Code: ${escHtml(c.icdCode)}</div>` : ''}
            </div>
            <span class="badge badge-info">${c.confidenceScore || 0}% match</span>
          </div>
          ${c.description ? `<p class="condition-desc">${escHtml(c.description)}</p>` : ''}
          <div class="confidence-bar">
            <div class="confidence-fill" style="width:${c.confidenceScore || 0}%"></div>
          </div>
          <div class="confidence-text">Confidence: ${c.confidenceScore || 0}%</div>
        </div>`).join('') : '<p class="text-muted text-sm">No specific conditions identified.</p>'}
    </div>

    <!-- Two columns: Risk Factors + Actions -->
    <div class="data-grid mb-6">
      <!-- Risk Factors -->
      <div class="card">
        <div class="card-header"><span class="card-title">⚡ Risk Factors</span></div>
        ${riskFactors.length ? `
          <ul class="actions-list">
            ${riskFactors.map(r => `
              <li class="action-item">
                <span class="action-icon">⚠️</span>
                ${escHtml(r)}
              </li>`).join('')}
          </ul>` : '<p class="text-muted text-sm">No specific risk factors identified.</p>'}
      </div>

      <!-- Home Remedies -->
      <div class="card">
        <div class="card-header"><span class="card-title">🏠 Home Care Guidelines</span></div>
        ${actions.homeRemedies?.length ? `
          <ul class="actions-list">
            ${actions.homeRemedies.map(r => `
              <li class="action-item">
                <span class="action-icon">✅</span>
                ${escHtml(r)}
              </li>`).join('')}
          </ul>` : '<p class="text-muted text-sm">No specific home remedies provided.</p>'}
      </div>
    </div>

    <!-- When to See Doctor -->
    <div class="card mb-6">
      <div class="card-header"><span class="card-title">🏥 When to See a Doctor</span></div>
      ${actions.whenToSeeDoctor?.length ? `
        <ul class="actions-list">
          ${actions.whenToSeeDoctor.map(a => `
            <li class="action-item">
              <span class="action-icon">📋</span>
              ${escHtml(a)}
            </li>`).join('')}
        </ul>` : '<p class="text-muted text-sm">See a doctor if symptoms persist or worsen.</p>'}
    </div>

    <!-- Emergency Guidance -->
    ${actions.emergencyGuidance ? `
    <div class="emergency-box mb-6">
      <span style="font-size:1.4rem;flex-shrink:0">🚨</span>
      <div>
        <div style="font-weight:700;color:var(--danger);margin-bottom:4px">Emergency Guidance</div>
        <p style="font-size:0.875rem;color:#b91c1c;line-height:1.6">${escHtml(actions.emergencyGuidance)}</p>
      </div>
    </div>` : ''}

    <!-- Rating -->
    ${currentQueryId ? `
    <div class="card" id="rating-card">
      <div class="card-header"><span class="card-title">⭐ Rate This Analysis</span></div>
      <p class="text-secondary text-sm mb-3">Was this analysis helpful? Your feedback improves the system.</p>
      <div class="rating-stars" id="rating-stars">
        ${[1,2,3,4,5].map(n => `<button class="star-btn" data-rating="${n}" title="${n} star${n>1?'s':''}">☆</button>`).join('')}
      </div>
      <div class="form-group mt-3">
        <label class="form-label">Optional Feedback</label>
        <textarea id="rating-feedback" class="form-control" rows="2" placeholder="Any additional comments..."></textarea>
      </div>
      <button class="btn btn-primary btn-sm" id="submit-rating-btn" disabled>Submit Rating</button>
    </div>` : ''}
  `;

  document.getElementById('results-view').classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Animate confidence bars
  setTimeout(() => {
    document.querySelectorAll('.confidence-fill').forEach(bar => {
      bar.style.transition = 'width 1s ease';
    });
  }, 100);

  // Setup rating if applicable
  if (currentQueryId) setupRating();
}

// ── Rating System ─────────────────────────────────────────────
let selectedRating = 0;

function setupRating() {
  const stars = document.querySelectorAll('.star-btn');
  const submitBtn = document.getElementById('submit-rating-btn');

  stars.forEach(star => {
    star.addEventListener('mouseover', () => {
      const r = parseInt(star.dataset.rating);
      stars.forEach((s, i) => { s.textContent = i < r ? '★' : '☆'; s.classList.toggle('active', i < r); });
    });
    star.addEventListener('mouseout', () => {
      stars.forEach((s, i) => { s.textContent = i < selectedRating ? '★' : '☆'; s.classList.toggle('active', i < selectedRating); });
    });
    star.addEventListener('click', () => {
      selectedRating = parseInt(star.dataset.rating);
      submitBtn.disabled = false;
      stars.forEach((s, i) => { s.textContent = i < selectedRating ? '★' : '☆'; s.classList.toggle('active', i < selectedRating); });
    });
  });

  submitBtn.addEventListener('click', submitRating);
}

async function submitRating() {
  if (!selectedRating || !currentQueryId) return;
  const feedback = document.getElementById('rating-feedback').value.trim();
  const btn = document.getElementById('submit-rating-btn');
  Loader.setBtn(btn, true, 'Saving...');

  const res = await api.post(`/symptoms/${currentQueryId}/rate`, {
    helpfulnessRating: selectedRating,
    userFeedback: feedback || undefined,
  });

  if (res && res.ok) {
    document.getElementById('rating-card').innerHTML = `
      <div class="card-header"><span class="card-title">⭐ Rating Submitted</span></div>
      <p class="text-sm text-secondary">Thank you for rating this analysis! You gave it ${selectedRating}/5 stars.</p>`;
    Toast.success('Rating saved. Thank you!');
  } else {
    Loader.setBtn(btn, false);
    Toast.error('Failed to save rating.');
  }
}

// ── Show New Analysis ─────────────────────────────────────────
function showNewAnalysis() {
  currentQueryId = null;
  selectedRating = 0;
  selectedSeverity = null;
  document.getElementById('symptom-form').reset();
  document.querySelectorAll('.symptom-chip').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('.severity-option').forEach(o => o.classList.remove('selected'));
  document.getElementById('char-count').textContent = '0';
  document.getElementById('results-view').classList.add('hidden');
  document.getElementById('input-view').classList.remove('hidden');
  history.pushState(null, '', 'analyzer.html');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showRating() {
  document.getElementById('rating-card')?.scrollIntoView({ behavior: 'smooth' });
}

// ── Helpers ───────────────────────────────────────────────────
function getSeverityIcon(s) {
  const icons = { Low: '🟢', Medium: '🟡', High: '🔴', Critical: '🆘' };
  return icons[s] || '⚪';
}

const severityBadgeClasses = { Low: 'badge-success', Medium: 'badge-warning', High: 'badge-danger', Critical: 'badge-critical' };
function severityBadgeClass(s) { return severityBadgeClasses[s] || 'badge-info'; }

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Start ─────────────────────────────────────────────────────
init();
