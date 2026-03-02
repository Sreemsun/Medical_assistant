/* ═══════════════════════════════════════════════════════════════
   MedAssist — Dashboard JavaScript
   ═══════════════════════════════════════════════════════════════ */

document.getElementById('navbar-placeholder').innerHTML = buildNavbar('dashboard');
Auth.requireAuth();

let userData = null;
let symptomPage = 1;
let _hvCharts = []; // active Chart.js instances inside the vitals modal

// ── Initialization ────────────────────────────────────────────
async function init() {
  Loader.showPage();
  try {
    const res = await api.get('/user/profile');
    if (res && res.ok && res.data.success) {
      userData = res.data.user;
      renderAll();
    } else {
      Toast.error('Failed to load profile. Please refresh.');
    }
  } catch (err) {
    Toast.error('Network error. Please check your connection.');
  } finally {
    Loader.hidePage();
  }
  setupSidebarToggle();
  setupModalCloseHandlers();
  loadSymptomHistory();
  document.getElementById('seedVitalsBtn')?.addEventListener('click', seedVitalSigns);
}

// ── Render All ────────────────────────────────────────────────
function renderAll() {
  renderSidebar();
  renderOverview();
  renderProfile();
  renderVitals();
  renderMedications();
  renderAllergies();
  renderMedicalRecords();
}

// ── Sidebar ───────────────────────────────────────────────────
function renderSidebar() {
  const u = userData;
  document.getElementById('sidebarName').textContent = u.fullName;
  document.getElementById('sidebarEmail').textContent = u.email;
  document.getElementById('sidebarAvatar').textContent = u.fullName.charAt(0).toUpperCase();
}

// ── Overview ──────────────────────────────────────────────────
function renderOverview() {
  const u = userData;
  document.getElementById('welcome-title').textContent = `Welcome back, ${u.fullName.split(' ')[0]}!`;

  document.getElementById('stat-medications').textContent = u.currentMedications?.length || 0;
  document.getElementById('stat-allergies').textContent = u.allergies?.length || 0;

  const latestVital = u.vitalSigns?.slice(-1)[0];
  const vitalsCount = u.vitalSigns?.length || 0;
  document.getElementById('stat-bp').textContent = vitalsCount
    ? `${vitalsCount} reading${vitalsCount > 1 ? 's' : ''} recorded`
    : 'No data yet';

  // Overview vitals
  if (latestVital) {
    document.getElementById('overview-vitals').innerHTML = `
      <div class="vitals-grid">
        ${latestVital.bloodPressureSystolic ? vitCard('🫀', `${latestVital.bloodPressureSystolic}/${latestVital.bloodPressureDiastolic}`, 'mmHg', 'Blood Pressure') : ''}
        ${latestVital.heartRate ? vitCard('❤️', latestVital.heartRate, 'bpm', 'Heart Rate') : ''}
        ${latestVital.temperature ? vitCard('🌡️', latestVital.temperature, '°F', 'Temperature') : ''}
        ${latestVital.weight ? vitCard('⚖️', latestVital.weight, 'lbs', 'Weight') : ''}
        ${latestVital.oxygenSaturation ? vitCard('💨', latestVital.oxygenSaturation, '%', 'SpO2') : ''}
      </div>
      <p class="text-xs text-muted mt-2">Recorded ${DateFmt.relative(latestVital.date)}</p>
    `;
  }

  // Overview records
  const recentRecords = u.medicalRecords?.slice(-3).reverse() || [];
  if (recentRecords.length) {
    document.getElementById('overview-records').innerHTML = `
      <div class="timeline">${recentRecords.map(r => recordTimelineItem(r)).join('')}</div>
    `;
  }
}

const vitCard = (icon, val, unit, label) => `
  <div class="vital-card">
    <div class="vital-icon">${icon}</div>
    <div class="vital-value">${val}</div>
    <div class="vital-unit">${unit}</div>
    <div class="vital-label">${label}</div>
  </div>`;

// ── Profile ───────────────────────────────────────────────────
function renderProfile() {
  const u = userData;

  // Header card
  document.getElementById('profile-header-card-container').innerHTML = `
    <div class="profile-header-card">
      <div class="profile-avatar-large">${u.fullName.charAt(0).toUpperCase()}</div>
      <div>
        <div class="profile-name">${u.fullName}</div>
        <div class="profile-email">${u.email}</div>
        <div class="profile-badges">
          ${u.bloodType ? `<span class="profile-badge">🩸 ${u.bloodType}</span>` : ''}
          ${u.gender ? `<span class="profile-badge">${u.gender.replace(/_/g,' ')}</span>` : ''}
          ${u.age ? `<span class="profile-badge">Age ${u.age}</span>` : ''}
          <span class="profile-badge">${u.isEmailVerified ? '✅ Verified' : '⚠️ Unverified'}</span>
        </div>
      </div>
    </div>`;

  // Info view
  document.getElementById('profile-info-view').innerHTML = `
    <div class="profile-info-grid">
      <div class="profile-field"><div class="profile-field-label">Full Name</div><div class="profile-field-value">${u.fullName}</div></div>
      <div class="profile-field"><div class="profile-field-label">Age</div><div class="profile-field-value">${u.age || '—'}</div></div>
      <div class="profile-field"><div class="profile-field-label">Gender</div><div class="profile-field-value">${u.gender ? u.gender.replace(/_/g,' ') : '—'}</div></div>
      <div class="profile-field"><div class="profile-field-label">Blood Type</div><div class="profile-field-value">${u.bloodType || '—'}</div></div>
      <div class="profile-field"><div class="profile-field-label">Phone</div><div class="profile-field-value">${u.phoneNumber || '—'}</div></div>
      <div class="profile-field"><div class="profile-field-label">Member Since</div><div class="profile-field-value">${DateFmt.short(u.createdAt)}</div></div>
    </div>`;

  // Emergency contact
  const ec = u.emergencyContact;
  document.getElementById('emergency-contact-view').innerHTML = ec?.name ? `
    <div class="profile-info-grid">
      <div class="profile-field"><div class="profile-field-label">Name</div><div class="profile-field-value">${ec.name}</div></div>
      <div class="profile-field"><div class="profile-field-label">Relationship</div><div class="profile-field-value">${ec.relationship || '—'}</div></div>
      <div class="profile-field"><div class="profile-field-label">Phone</div><div class="profile-field-value">${ec.phone || '—'}</div></div>
    </div>` : '<p class="text-muted text-sm">No emergency contact set.</p>';
}

// ── Vitals ────────────────────────────────────────────────────
function renderVitals() {
  const vitals = userData.vitalSigns || [];
  const latest = vitals.slice(-1)[0];

  if (latest) {
    document.getElementById('vitals-latest').innerHTML = `
      <div class="card">
        <div class="card-header"><span class="card-title">📊 Latest Readings</span><span class="text-xs text-muted">${DateFmt.short(latest.date)}</span></div>
        <div class="vitals-grid">
          ${latest.bloodPressureSystolic ? vitCard('🫀', `${latest.bloodPressureSystolic}/${latest.bloodPressureDiastolic}`, 'mmHg', 'Blood Pressure') : ''}
          ${latest.heartRate ? vitCard('❤️', latest.heartRate, 'bpm', 'Heart Rate') : ''}
          ${latest.temperature ? vitCard('🌡️', latest.temperature, '°F', 'Temperature') : ''}
          ${latest.weight ? vitCard('⚖️', latest.weight, 'lbs', 'Weight') : ''}
          ${latest.bloodSugar ? vitCard('🍬', latest.bloodSugar, 'mg/dL', 'Blood Sugar') : ''}
          ${latest.oxygenSaturation ? vitCard('💨', latest.oxygenSaturation, '%', 'SpO2') : ''}
          ${latest.cholesterol ? vitCard('🔬', latest.cholesterol, 'mg/dL', 'Cholesterol') : ''}
        </div>
      </div>`;
  }

  if (!vitals.length) {
    document.getElementById('vitals-history').innerHTML = '<p class="text-muted text-sm">No vital signs recorded yet.</p>';
    return;
  }

  document.getElementById('vitals-history').innerHTML = `
    <div class="data-list">
      ${[...vitals].reverse().map(v => `
        <div class="data-item">
          <div class="data-item-icon">📅</div>
          <div class="data-item-content">
            <div class="data-item-title">${DateFmt.short(v.date)}</div>
            <div class="data-item-subtitle">
              ${v.bloodPressureSystolic ? `BP: ${v.bloodPressureSystolic}/${v.bloodPressureDiastolic} ` : ''}
              ${v.heartRate ? `HR: ${v.heartRate}bpm ` : ''}
              ${v.weight ? `Wt: ${v.weight}lbs` : ''}
            </div>
          </div>
        </div>`).join('')}
    </div>`;
}

// ── Medications ───────────────────────────────────────────────
function renderMedications() {
  const meds = userData.currentMedications || [];
  if (!meds.length) { document.getElementById('medications-list').innerHTML = '<p class="text-muted text-sm">No medications added.</p>'; return; }

  document.getElementById('medications-list').innerHTML = `
    <div class="data-list">
      ${meds.map((m, i) => `
        <div class="data-item">
          <div class="data-item-icon">💊</div>
          <div class="data-item-content">
            <div class="data-item-title">${escHtml(m.name)} ${m.dosage ? `<span class="badge badge-primary">${escHtml(m.dosage)}</span>` : ''}</div>
            <div class="data-item-subtitle">${[m.frequency, m.prescribedBy ? `Dr. ${escHtml(m.prescribedBy)}` : '', m.startDate ? `Since ${DateFmt.short(m.startDate)}` : ''].filter(Boolean).join(' · ')}</div>
          </div>
          <div class="data-item-actions">
            <button class="btn btn-ghost btn-sm" onclick="deleteMed(${i})" style="color:var(--danger)">Remove</button>
          </div>
        </div>`).join('')}
    </div>`;
}

// ── Allergies ─────────────────────────────────────────────────
function renderAllergies() {
  const allergies = userData.allergies || [];
  if (!allergies.length) { document.getElementById('allergies-list').innerHTML = '<p class="text-muted text-sm">No allergies recorded.</p>'; return; }

  const severityBadge = (s) => {
    if (!s) return '';
    const map = { mild: 'badge-success', moderate: 'badge-warning', severe: 'badge-danger' };
    return `<span class="badge ${map[s] || 'badge-info'}">${s}</span>`;
  };

  document.getElementById('allergies-list').innerHTML = `
    <div class="data-list">
      ${allergies.map((a, i) => `
        <div class="data-item">
          <div class="data-item-icon">⚠️</div>
          <div class="data-item-content">
            <div class="data-item-title">${escHtml(a.allergen)} ${severityBadge(a.severity)}</div>
            ${a.reaction ? `<div class="data-item-subtitle">Reaction: ${escHtml(a.reaction)}</div>` : ''}
          </div>
          <div class="data-item-actions">
            <button class="btn btn-ghost btn-sm" onclick="deleteAllergy(${i})" style="color:var(--danger)">Remove</button>
          </div>
        </div>`).join('')}
    </div>`;
}

// ── Medical Records ───────────────────────────────────────────
function renderMedicalRecords() {
  const records = userData.medicalRecords || [];
  if (!records.length) { document.getElementById('medical-records-timeline').innerHTML = '<p class="text-muted text-sm">No records yet.</p>'; return; }

  document.getElementById('medical-records-timeline').innerHTML = `
    <div class="timeline">
      ${[...records].reverse().map(r => recordTimelineItem(r, true)).join('')}
    </div>`;
}

const recordIcons = { diagnosis: '🔬', prescription: '💊', lab_result: '🧪', vital_signs: '❤️', vaccination: '💉', surgery: '🏥', allergy: '⚠️', other: '📋' };
const recordColors = { diagnosis: 'blue', prescription: 'purple', lab_result: 'green', vital_signs: 'green', vaccination: 'info', surgery: 'orange', allergy: 'orange', other: 'blue' };

function recordTimelineItem(r, showDelete = false) {
  const icon = recordIcons[r.type] || '📋';
  const color = recordColors[r.type] || 'blue';
  return `
    <div class="timeline-item">
      <div class="timeline-icon stat-icon ${color}">${icon}</div>
      <div class="timeline-content">
        <div class="timeline-date">${DateFmt.short(r.date)} ${r.doctor ? `· Dr. ${escHtml(r.doctor)}` : ''} ${r.facility ? `· ${escHtml(r.facility)}` : ''}</div>
        <div class="timeline-title">${escHtml(r.title)}</div>
        ${r.description ? `<div class="timeline-desc">${escHtml(r.description)}</div>` : ''}
        ${r.attachments?.length ? `<a href="${r.attachments[0].path}" target="_blank" class="btn btn-ghost btn-sm mt-2">📎 View Attachment</a>` : ''}
        ${showDelete ? `<button class="btn btn-ghost btn-sm mt-2" onclick="deleteRecord('${r._id}')" style="color:var(--danger)">Delete</button>` : ''}
      </div>
    </div>`;
}

// ── Symptom History ───────────────────────────────────────────
async function loadSymptomHistory(page = 1) {
  const res = await api.get(`/symptoms/history?page=${page}&limit=10`);
  if (!res || !res.ok) return;

  const { queries, pagination } = res.data;
  document.getElementById('stat-queries').textContent = pagination.total;

  if (!queries.length) return;

  document.getElementById('overview-queries').innerHTML = queries.slice(0, 2).map(q => `
    <div class="data-item" onclick="showSection('symptom-history')" style="cursor:pointer">
      <div class="data-item-icon">🤖</div>
      <div class="data-item-content">
        <div class="data-item-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">${escHtml(q.symptoms.substring(0, 60))}...</div>
        <div class="data-item-subtitle">${DateFmt.relative(q.createdAt)} · ${severityBadgeHtml(q.analysis?.severityRating)}</div>
      </div>
    </div>`).join('');

  document.getElementById('symptom-history-list').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;">
      ${queries.map(q => `
        <div class="history-item" onclick="showQueryDetail('${q._id}')">
          <div class="history-date">${DateFmt.short(q.createdAt)}</div>
          <div class="history-symptoms">${escHtml(q.symptoms)}</div>
          <div class="history-meta">
            ${severityBadgeHtml(q.analysis?.severityRating)}
            ${q.helpfulnessRating ? `<span class="text-xs text-muted">⭐ ${q.helpfulnessRating}/5</span>` : ''}
            <span class="text-xs text-muted">${q.analysis?.potentialConditions?.length || 0} condition(s) found</span>
          </div>
        </div>`).join('')}
    </div>`;

  // Pagination
  if (pagination.pages > 1) {
    let pages = '';
    for (let i = 1; i <= pagination.pages; i++) {
      pages += `<button class="btn btn-sm ${i === page ? 'btn-primary' : 'btn-ghost'}" onclick="loadSymptomHistory(${i})">${i}</button>`;
    }
    document.getElementById('symptom-pagination').innerHTML = pages;
  }
}

const severityColors = { Low: 'badge-success', Medium: 'badge-warning', High: 'badge-danger', Critical: 'badge-critical' };
const severityBadgeHtml = (s) => s ? `<span class="badge ${severityColors[s] || 'badge-info'}">${s}</span>` : '';

async function showQueryDetail(id) {
  const res = await api.get(`/symptoms/${id}`);
  if (!res || !res.ok) return;
  // Navigate to analyzer page with query ID in URL
  window.location.href = `analyzer.html?query=${id}`;
}

// ── Section Navigation ────────────────────────────────────────
function showSection(name) {
  document.querySelectorAll('.dash-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  document.getElementById(`section-${name}`)?.classList.add('active');
  document.querySelector(`[data-section="${name}"]`)?.classList.add('active');
  // Close sidebar on mobile
  closeSidebar();
}

document.querySelectorAll('[data-section]').forEach(btn => {
  btn.addEventListener('click', () => showSection(btn.dataset.section));
});

// ── Mobile Sidebar ────────────────────────────────────────────
function setupSidebarToggle() {
  const toggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');

  if (window.innerWidth <= 900) toggle.style.display = 'inline-flex';

  const openSidebar = () => { sidebar.classList.add('open'); overlay.classList.add('open'); };
  window.closeSidebar = () => { sidebar.classList.remove('open'); overlay.classList.remove('open'); };

  toggle.addEventListener('click', openSidebar);
  overlay.addEventListener('click', closeSidebar);

  window.addEventListener('resize', () => {
    toggle.style.display = window.innerWidth <= 900 ? 'inline-flex' : 'none';
  });
}

// ── Modal Helpers ─────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function setupModalCloseHandlers() {
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });
  });
}

// ── Add Vitals ────────────────────────────────────────────────
document.getElementById('addVitalsBtn').addEventListener('click', () => openModal('vitalsModal'));

document.getElementById('vitals-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('saveVitalsBtn');
  Loader.setBtn(btn, true, 'Saving...');

  const body = {
    bloodPressureSystolic: document.getElementById('v-systolic').value || undefined,
    bloodPressureDiastolic: document.getElementById('v-diastolic').value || undefined,
    heartRate: document.getElementById('v-heartrate').value || undefined,
    temperature: document.getElementById('v-temp').value || undefined,
    weight: document.getElementById('v-weight').value || undefined,
    bloodSugar: document.getElementById('v-sugar').value || undefined,
    oxygenSaturation: document.getElementById('v-o2').value || undefined,
    cholesterol: document.getElementById('v-cholesterol').value || undefined,
    creatinine: document.getElementById('v-creatinine').value || undefined,
    notes: document.getElementById('v-notes').value || undefined,
  };

  const res = await api.post('/user/vital-signs', body);
  Loader.setBtn(btn, false);

  if (res && res.ok) {
    closeModal('vitalsModal');
    Toast.success('Vital signs recorded!');
    const res2 = await api.get('/user/profile');
    if (res2?.ok) { userData = res2.data.user; renderAll(); }
  } else {
    Toast.error(res?.data?.message || 'Failed to save vitals.');
  }
});

// ── Add Medication ────────────────────────────────────────────
document.getElementById('addMedicationBtn').addEventListener('click', () => openModal('medicationModal'));

document.getElementById('medication-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('med-name').value.trim();
  if (!name) { Toast.error('Medication name is required'); return; }

  const btn = document.getElementById('saveMedBtn');
  Loader.setBtn(btn, true, 'Saving...');

  const res = await api.post('/user/medications', {
    name,
    dosage: document.getElementById('med-dosage').value.trim() || undefined,
    frequency: document.getElementById('med-frequency').value.trim() || undefined,
    prescribedBy: document.getElementById('med-doctor').value.trim() || undefined,
    startDate: document.getElementById('med-start').value || undefined,
  });

  Loader.setBtn(btn, false);
  if (res && res.ok) {
    closeModal('medicationModal');
    Toast.success('Medication added!');
    userData.currentMedications = res.data.medications;
    renderMedications();
    renderOverview();
  } else {
    Toast.error(res?.data?.message || 'Failed to add medication.');
  }
});

async function deleteMed(index) {
  if (!confirm('Remove this medication?')) return;
  const res = await api.delete(`/user/medications/${index}`);
  if (res && res.ok) {
    Toast.success('Medication removed.');
    userData.currentMedications = res.data.medications;
    renderMedications();
    renderOverview();
  } else {
    Toast.error('Failed to remove medication.');
  }
}

// ── Add Allergy ───────────────────────────────────────────────
document.getElementById('addAllergyBtn').addEventListener('click', () => openModal('allergyModal'));

document.getElementById('allergy-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const allergen = document.getElementById('allergy-name').value.trim();
  if (!allergen) { Toast.error('Allergen name is required'); return; }

  const btn = document.getElementById('saveAllergyBtn');
  Loader.setBtn(btn, true, 'Saving...');

  const res = await api.post('/user/allergies', {
    allergen,
    reaction: document.getElementById('allergy-reaction').value.trim() || undefined,
    severity: document.getElementById('allergy-severity').value || undefined,
  });

  Loader.setBtn(btn, false);
  if (res && res.ok) {
    closeModal('allergyModal');
    Toast.success('Allergy added!');
    userData.allergies = res.data.allergies;
    renderAllergies();
    renderOverview();
  } else {
    Toast.error(res?.data?.message || 'Failed to add allergy.');
  }
});

async function deleteAllergy(index) {
  if (!confirm('Remove this allergy?')) return;
  const res = await api.delete(`/user/allergies/${index}`);
  if (res && res.ok) {
    Toast.success('Allergy removed.');
    userData.allergies = res.data.allergies;
    renderAllergies();
    renderOverview();
  } else {
    Toast.error('Failed to remove allergy.');
  }
}

// ── Add Medical Record ────────────────────────────────────────
document.getElementById('addRecordBtn').addEventListener('click', () => openModal('recordModal'));

document.getElementById('record-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const type = document.getElementById('record-type').value;
  const title = document.getElementById('record-title').value.trim();
  if (!type || !title) { Toast.error('Type and title are required'); return; }

  const btn = document.getElementById('saveRecordBtn');
  Loader.setBtn(btn, true, 'Saving...');

  const formData = new FormData();
  formData.append('type', type);
  formData.append('title', title);
  const desc = document.getElementById('record-desc').value.trim();
  if (desc) formData.append('description', desc);
  const doctor = document.getElementById('record-doctor').value.trim();
  if (doctor) formData.append('doctor', doctor);
  const facility = document.getElementById('record-facility').value.trim();
  if (facility) formData.append('facility', facility);
  const date = document.getElementById('record-date').value;
  if (date) formData.append('date', date);
  const file = document.getElementById('record-file').files[0];
  if (file) formData.append('attachment', file);

  const res = await api.postForm('/user/medical-records', formData);
  Loader.setBtn(btn, false);

  if (res && res.ok) {
    closeModal('recordModal');
    Toast.success('Medical record added!');
    const res2 = await api.get('/user/profile');
    if (res2?.ok) { userData = res2.data.user; renderMedicalRecords(); renderOverview(); }
  } else {
    Toast.error(res?.data?.message || 'Failed to save record.');
  }
});

async function deleteRecord(recordId) {
  if (!confirm('Delete this medical record? This cannot be undone.')) return;
  const res = await api.delete(`/user/medical-records/${recordId}`);
  if (res && res.ok) {
    Toast.success('Record deleted.');
    const res2 = await api.get('/user/profile');
    if (res2?.ok) { userData = res2.data.user; renderMedicalRecords(); renderOverview(); }
  } else {
    Toast.error('Failed to delete record.');
  }
}

// ── Profile Edit ──────────────────────────────────────────────
document.getElementById('editProfileBtn').addEventListener('click', () => {
  const u = userData;
  document.getElementById('edit-fullName').value = u.fullName;
  document.getElementById('edit-age').value = u.age || '';
  document.getElementById('edit-gender').value = u.gender || '';
  document.getElementById('edit-bloodType').value = u.bloodType || '';
  document.getElementById('edit-phone').value = u.phoneNumber || '';
  document.getElementById('profile-info-view').classList.add('hidden');
  document.getElementById('profile-edit-form').classList.remove('hidden');
});

document.getElementById('cancelProfileEdit').addEventListener('click', () => {
  document.getElementById('profile-info-view').classList.remove('hidden');
  document.getElementById('profile-edit-form').classList.add('hidden');
});

document.getElementById('profile-edit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('saveProfileBtn');
  Loader.setBtn(btn, true, 'Saving...');

  const body = {
    fullName: document.getElementById('edit-fullName').value.trim(),
    age: document.getElementById('edit-age').value || undefined,
    gender: document.getElementById('edit-gender').value || undefined,
    bloodType: document.getElementById('edit-bloodType').value || undefined,
    phoneNumber: document.getElementById('edit-phone').value.trim() || undefined,
  };

  const res = await api.put('/user/profile', body);
  Loader.setBtn(btn, false);

  if (res && res.ok) {
    userData = res.data.user;
    Toast.success('Profile updated!');
    document.getElementById('profile-info-view').classList.remove('hidden');
    document.getElementById('profile-edit-form').classList.add('hidden');
    renderProfile();
    renderSidebar();
  } else {
    Toast.error(res?.data?.message || 'Failed to update profile.');
  }
});

// ── Change Password ───────────────────────────────────────────
document.getElementById('change-password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  Form.clearAlert('pw-alert');
  const currentPw = document.getElementById('currentPw').value;
  const newPw = document.getElementById('newPw').value;
  const confirmPw = document.getElementById('confirmPw').value;

  if (!currentPw || !newPw || !confirmPw) { Form.showAlert('pw-alert', 'All fields are required.', 'warning'); return; }
  if (newPw !== confirmPw) { Form.showAlert('pw-alert', 'New passwords do not match.', 'error'); return; }
  if (newPw.length < 8) { Form.showAlert('pw-alert', 'New password must be at least 8 characters.', 'error'); return; }

  const btn = document.getElementById('changePwBtn');
  Loader.setBtn(btn, true, 'Updating...');
  const res = await api.put('/user/change-password', { currentPassword: currentPw, newPassword: newPw });
  Loader.setBtn(btn, false);

  if (res && res.ok) {
    Form.showAlert('pw-alert', res.data.message, 'success');
    document.getElementById('change-password-form').reset();
  } else {
    Form.showAlert('pw-alert', res?.data?.message || 'Failed to update password.', 'error');
  }
});

// ── Delete Account ────────────────────────────────────────────
document.getElementById('deleteAccountBtn').addEventListener('click', async () => {
  const confirmed = confirm('⚠️ WARNING: This will permanently delete your account and ALL your health data. This action cannot be undone.\n\nAre you absolutely sure?');
  if (!confirmed) return;
  const res = await api.delete('/user/account');
  if (res && res.ok) {
    Auth.removeToken();
    Toast.success('Account deleted. Redirecting...');
    setTimeout(() => { window.location.href = 'index.html'; }, 1500);
  } else {
    Toast.error('Failed to delete account. Please try again.');
  }
});

// ── Utilities ─────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Handle URL anchor (e.g., dashboard.html#medical-records) ─
function handleHash() {
  const hash = window.location.hash.replace('#', '');
  if (hash) showSection(hash);
}

// ── Upcoming Appointments Widget ──────────────────────────────
async function loadUpcomingAppointments() {
  const el = document.getElementById('overview-appointments');
  if (!el) return;

  try {
    const res = await api.get('/appointments');
    if (!res?.ok) { el.innerHTML = '<p class="text-muted text-sm">Could not load appointments.</p>'; return; }

    const upcoming = (res.data.appointments || [])
      .filter(a => a.status !== 'cancelled' && a.status !== 'completed' && new Date(a.date) >= new Date())
      .slice(0, 3);

    if (!upcoming.length) {
      el.innerHTML = `<p class="text-muted text-sm">No upcoming appointments. <a href="appointments.html">Book one now.</a></p>`;
      return;
    }

    el.innerHTML = upcoming.map(a => {
      const d = new Date(a.date);
      const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      const statusColor = a.status === 'confirmed' ? '#10b981' : '#f59e0b';
      return `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:0.88rem;color:var(--text-primary)">${a.doctorName}</div>
            <div style="font-size:0.78rem;color:var(--text-muted)">${a.doctorSpecialty}</div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-size:0.82rem;font-weight:600;color:var(--text-primary)">${dateStr}</div>
            <div style="font-size:0.75rem;color:var(--text-muted)">${a.timeSlot}</div>
          </div>
          <span style="font-size:0.7rem;font-weight:700;padding:2px 8px;border-radius:50px;background:${statusColor}22;color:${statusColor};white-space:nowrap;">${a.status}</span>
        </div>`;
    }).join('') + `<a href="appointments.html" style="display:block;text-align:center;font-size:0.82rem;padding-top:10px;color:var(--primary)">View all appointments →</a>`;
  } catch {
    el.innerHTML = '<p class="text-muted text-sm">Could not load appointments.</p>';
  }
}

// ── Health Vitals Overview Modal ──────────────────────────────
function openHealthVitalsModal() {
  const modal  = document.getElementById('healthVitalsModal');
  const body   = document.getElementById('hvModalBody');
  const vitals = userData?.vitalSigns || [];

  // Destroy any existing chart instances before re-rendering
  _hvCharts.forEach(c => c.destroy());
  _hvCharts = [];

  if (!vitals.length) {
    body.innerHTML = `
      <p class="text-muted text-sm" style="padding:8px 0">
        No vital signs recorded yet.
        <button class="btn btn-sm btn-primary" style="margin-left:12px"
          onclick="closeModal('healthVitalsModal');showSection('vitals');document.getElementById('addVitalsBtn').click()">
          Record Now
        </button>
      </p>`;
    modal.classList.remove('hidden');
    return;
  }

  // ── Status helpers ────────────────────────────────────────
  function bpStatus(raw) {
    const s = raw.bloodPressureSystolic, d = raw.bloodPressureDiastolic;
    if (!s)             return 'normal';
    if (s >= 180 || d >= 120) return 'critical';
    if (s >= 140 || d >= 90)  return 'warning';
    return 'normal';
  }
  function hrStatus(v)    { return v > 100 || v < 60 ? 'warning' : 'normal'; }
  function sugarStatus(v) { return v > 200 ? 'critical' : v > 140 ? 'warning' : 'normal'; }
  function cholStatus(v)  { return v > 240 ? 'critical' : v > 200 ? 'warning' : 'normal'; }
  function creatStatus(v) { return v > 1.2 ? 'warning' : 'normal'; }
  function spo2Status(v)  { return v < 90 ? 'critical' : v < 95 ? 'warning' : 'normal'; }
  function tempStatus(v)  { return v > 103 ? 'critical' : v > 100.4 ? 'warning' : 'normal'; }

  // ── Latest value for each metric ─────────────────────────
  const METRICS = [
    { key: 'bp',              icon: '🫀', label: 'Blood Pressure', unit: 'mmHg',  status: bpStatus },
    { key: 'heartRate',       icon: '❤️', label: 'Heart Rate',     unit: 'bpm',   status: hrStatus },
    { key: 'bloodSugar',      icon: '🩸', label: 'Blood Sugar',    unit: 'mg/dL', status: sugarStatus },
    { key: 'cholesterol',     icon: '🧬', label: 'Cholesterol',    unit: 'mg/dL', status: cholStatus },
    { key: 'creatinine',      icon: '🔬', label: 'Creatinine',     unit: 'mg/dL', status: creatStatus },
    { key: 'oxygenSaturation',icon: '💨', label: 'SpO₂',           unit: '%',     status: spo2Status },
    { key: 'temperature',     icon: '🌡️', label: 'Temperature',    unit: '°F',    status: tempStatus },
    { key: 'weight',          icon: '⚖️', label: 'Weight',          unit: 'lbs',   status: () => 'normal' },
  ];

  function latestFor(key) {
    if (key === 'bp') {
      for (let i = vitals.length - 1; i >= 0; i--) {
        const v = vitals[i];
        if (v.bloodPressureSystolic) return { val: `${v.bloodPressureSystolic}/${v.bloodPressureDiastolic}`, date: v.date, raw: v };
      }
      return null;
    }
    for (let i = vitals.length - 1; i >= 0; i--) {
      if (vitals[i][key] != null) return { val: vitals[i][key], date: vitals[i].date, raw: vitals[i] };
    }
    return null;
  }

  const metricCards = METRICS.map(m => {
    const entry = latestFor(m.key);
    if (!entry) return `
      <div class="hv-metric-card na">
        <div class="hv-metric-icon">${m.icon}</div>
        <div class="hv-metric-value">—</div>
        <div class="hv-metric-label">${m.label}</div>
      </div>`;
    const st  = m.key === 'bp' ? m.status(entry.raw) : m.status(entry.val);
    const ago = DateFmt.relative(entry.date);
    return `
      <div class="hv-metric-card">
        <div class="hv-metric-icon">${m.icon}</div>
        <div class="hv-metric-value"><span class="hv-status ${st}"></span>${entry.val}</div>
        <div class="hv-metric-unit">${m.unit}</div>
        <div class="hv-metric-label">${m.label}</div>
        <div class="hv-metric-date">${ago}</div>
      </div>`;
  }).join('');

  // ── History table rows ────────────────────────────────────
  const rows = vitals.slice().reverse().map(v => {
    const d  = new Date(v.date).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
    const bp = v.bloodPressureSystolic ? `${v.bloodPressureSystolic}/${v.bloodPressureDiastolic}` : '—';
    return `<tr>
      <td>${d}</td><td>${bp}</td><td>${v.heartRate ?? '—'}</td>
      <td>${v.bloodSugar ?? '—'}</td><td>${v.cholesterol ?? '—'}</td>
      <td>${v.creatinine ?? '—'}</td><td>${v.oxygenSaturation ?? '—'}</td>
      <td>${v.temperature ?? '—'}</td><td>${v.weight ?? '—'}</td>
    </tr>`;
  }).join('');

  // ── Chart section (canvases — JS will fill them) ──────────
  const chartDefs = [
    { id: 'hvChart_bp',     label: 'Blood Pressure',     unit: 'mmHg' },
    { id: 'hvChart_hr',     label: 'Heart Rate',          unit: 'bpm'  },
    { id: 'hvChart_sugar',  label: 'Blood Sugar',         unit: 'mg/dL'},
    { id: 'hvChart_chol',   label: 'Cholesterol',         unit: 'mg/dL'},
    { id: 'hvChart_creat',  label: 'Creatinine',          unit: 'mg/dL'},
    { id: 'hvChart_spo2',   label: 'SpO₂',                unit: '%'    },
    { id: 'hvChart_temp',   label: 'Temperature',         unit: '°F'   },
    { id: 'hvChart_weight', label: 'Weight',              unit: 'lbs'  },
  ];

  const chartGrid = chartDefs.map(c => `
    <div class="hv-chart-item">
      <p class="hv-chart-label">${c.label} <span class="hv-chart-unit">${c.unit}</span></p>
      <div class="hv-chart-canvas-wrap"><canvas id="${c.id}"></canvas></div>
    </div>`).join('');

  body.innerHTML = `
    <p class="hv-section-title">Latest Readings</p>
    <div class="hv-metric-grid">${metricCards}</div>

    <p class="hv-section-title" style="margin-top:20px">
      Trend Analysis
      <span style="font-weight:400;text-transform:none;letter-spacing:0;margin-left:6px;color:var(--text-muted)">— last ${Math.min(vitals.length, 30)} readings</span>
    </p>
    <div class="hv-chart-grid">${chartGrid}</div>

    <p class="hv-section-title" style="margin-top:20px">All Recordings</p>
    <div class="hv-table-wrap">
      <table class="hv-history-table">
        <thead>
          <tr>
            <th>Date</th><th>BP (mmHg)</th><th>HR (bpm)</th>
            <th>Sugar</th><th>Cholesterol</th><th>Creatinine</th>
            <th>SpO₂ (%)</th><th>Temp (°F)</th><th>Weight (lbs)</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="margin-top:14px;text-align:right">
      <button class="btn btn-sm btn-secondary" onclick="closeModal('healthVitalsModal');showSection('vitals')">View Full Vitals Section</button>
    </div>`;

  modal.classList.remove('hidden');

  // Charts must initialise after the DOM is updated
  requestAnimationFrame(() => renderVitalCharts(vitals));
}

// ── Vital Trend Charts (Chart.js) ─────────────────────────
function renderVitalCharts(vitals) {
  const isDark   = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const tickColor = isDark ? '#64748b' : '#94a3b8';

  // Use the last 30 data points
  const pts    = vitals.slice(-30);
  const labels = pts.map(v =>
    new Date(v.date).toLocaleDateString('en-GB', { day:'numeric', month:'short' })
  );

  const baseOpts = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 500 },
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'index', intersect: false,
        backgroundColor: isDark ? '#1e293b' : '#fff',
        titleColor: isDark ? '#f1f5f9' : '#0f172a',
        bodyColor:  isDark ? '#94a3b8' : '#475569',
        borderColor: isDark ? '#334155' : '#e2e8f0',
        borderWidth: 1,
      },
    },
    scales: {
      x: {
        ticks: { color: tickColor, maxTicksLimit: 6, font: { size: 10 } },
        grid:  { color: gridColor },
      },
      y: {
        ticks: { color: tickColor, font: { size: 10 } },
        grid:  { color: gridColor },
      },
    },
  };

  function line(color, data, label, fill = false) {
    return {
      label, data,
      borderColor: color,
      backgroundColor: fill ? color + '18' : 'transparent',
      fill,
      tension: 0.35,
      pointRadius: pts.length > 20 ? 0 : 3,
      pointHoverRadius: 4,
      borderWidth: 2,
    };
  }

  function makeChart(id, datasets, yOpts = {}) {
    const el = document.getElementById(id);
    if (!el) return;
    const chart = new Chart(el, {
      type: 'line',
      data: { labels, datasets },
      options: {
        ...baseOpts,
        scales: {
          ...baseOpts.scales,
          y: { ...baseOpts.scales.y, ...yOpts },
        },
        plugins: {
          ...baseOpts.plugins,
          legend: { display: datasets.length > 1, labels: { color: tickColor, font: { size: 11 }, boxWidth: 12 } },
        },
      },
    });
    _hvCharts.push(chart);
  }

  // Blood Pressure (2 lines)
  const sysData = pts.map(v => v.bloodPressureSystolic  || null);
  const diaData = pts.map(v => v.bloodPressureDiastolic || null);
  if (sysData.some(Boolean)) {
    makeChart('hvChart_bp', [
      line('#6366f1', sysData, 'Systolic'),
      line('#a78bfa', diaData, 'Diastolic'),
    ]);
  }

  // Heart Rate
  const hrData = pts.map(v => v.heartRate || null);
  if (hrData.some(Boolean))
    makeChart('hvChart_hr', [line('#ef4444', hrData, 'BPM', true)], { min: 40, suggestedMax: 120 });

  // Blood Sugar
  const sugarData = pts.map(v => v.bloodSugar || null);
  if (sugarData.some(Boolean))
    makeChart('hvChart_sugar', [line('#f59e0b', sugarData, 'mg/dL', true)]);

  // Cholesterol
  const cholData = pts.map(v => v.cholesterol || null);
  if (cholData.some(Boolean))
    makeChart('hvChart_chol', [line('#0ea5e9', cholData, 'mg/dL')]);

  // Creatinine
  const creatData = pts.map(v => v.creatinine || null);
  if (creatData.some(Boolean))
    makeChart('hvChart_creat', [line('#10b981', creatData, 'mg/dL')], { suggestedMax: 2 });

  // SpO2
  const spo2Data = pts.map(v => v.oxygenSaturation || null);
  if (spo2Data.some(Boolean))
    makeChart('hvChart_spo2', [line('#06b6d4', spo2Data, '%', true)], { min: 85, max: 100 });

  // Temperature
  const tempData = pts.map(v => v.temperature || null);
  if (tempData.some(Boolean))
    makeChart('hvChart_temp', [line('#f97316', tempData, '°F')]);

  // Weight
  const weightData = pts.map(v => v.weight || null);
  if (weightData.some(Boolean))
    makeChart('hvChart_weight', [line('#8b5cf6', weightData, 'lbs')]);
}

// ── Seed Sample Vital Signs ───────────────────────────────
async function seedVitalSigns() {
  const btn = document.getElementById('seedVitalsBtn');
  if (!btn) return;
  const orig = btn.textContent;
  btn.textContent = 'Generating…';
  btn.disabled    = true;

  const res = await api.post('/user/seed-vitals', {});
  btn.textContent = orig;
  btn.disabled    = false;

  if (!res?.ok) {
    Toast.error(res?.data?.message || 'Failed to generate sample data.');
    return;
  }

  // Update local state and re-render everything
  userData.vitalSigns = res.data.vitalSigns;
  renderOverview();
  Toast.success('90 days of sample data loaded!');
  openHealthVitalsModal(); // Re-open modal with charts
}

// ── Start ─────────────────────────────────────────────────────
init().then(() => { handleHash(); loadUpcomingAppointments(); });
