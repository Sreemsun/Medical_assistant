/* ─────────────────────────────────────────────────────────────
   doctor-patients.js  –  Doctor's patient list and profile view
───────────────────────────────────────────────────────────── */

'use strict';

document.getElementById('navbar').innerHTML = buildNavbar('doctor-patients');
document.getElementById('footer').innerHTML = buildFooter();
Auth.requireAuth();

const currentUser = Auth.getUser();
const doctorName  = currentUser?.fullName || 'Doctor';
if (!currentUser || currentUser.role !== 'doctor') {
  window.location.href = 'dashboard.html';
}

// ── DOM refs ───────────────────────────────────────────────────
const listView   = document.getElementById('listView');
const detailView = document.getElementById('detailView');
const dpGrid     = document.getElementById('dpGrid');
const dpLoading  = document.getElementById('dpLoading');
const dpEmpty    = document.getElementById('dpEmpty');
const dpAlert    = document.getElementById('dpAlert');
const searchBox  = document.getElementById('patientSearch');
const backBtn    = document.getElementById('backBtn');

let allPatients = [];

// ── Alert helper ───────────────────────────────────────────────
function showAlert(msg, type = 'error') {
  dpAlert.textContent = msg;
  dpAlert.className   = `dp-alert ${type}`;
  dpAlert.classList.remove('hidden');
}

// ── Load patient list ──────────────────────────────────────────
async function loadPatients() {
  dpLoading.style.display = 'flex';
  dpGrid.innerHTML = '';
  dpEmpty.classList.add('hidden');

  const res = await api.get('/doctors/my-patients');
  dpLoading.style.display = 'none';

  if (!res?.ok) {
    showAlert(res?.data?.message || 'Failed to load patients.');
    return;
  }

  allPatients = res.data.patients || [];
  renderGrid(allPatients);
}

// ── Render patient cards ───────────────────────────────────────
function renderGrid(list) {
  if (!list.length) {
    dpEmpty.classList.remove('hidden');
    dpGrid.innerHTML = '';
    return;
  }
  dpEmpty.classList.add('hidden');

  dpGrid.innerHTML = list.map(p => {
    const lastAppt  = p.lastAppointment ? new Date(p.lastAppointment).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No visits';
    const initial   = p.fullName.charAt(0).toUpperCase();
    const conditions = (p.chronicConditions || []).slice(0, 3).join(', ') || '—';
    const statusCls  = { pending: 'status-pending', confirmed: 'status-confirmed', completed: 'status-completed', cancelled: 'status-cancelled' };

    return `
      <div class="dp-card" data-id="${p._id}">
        <div class="dp-card-top">
          <div class="dp-avatar">${initial}</div>
          <div class="dp-patient-info">
            <div class="dp-patient-name">${escHtml(p.fullName)}</div>
            <div class="dp-patient-meta">${escHtml(p.email || '')}</div>
            <div class="dp-patient-meta">
              ${p.age ? `Age ${p.age}` : ''}
              ${p.gender ? ` · ${capitalize(p.gender)}` : ''}
              ${p.bloodType ? ` · ${p.bloodType}` : ''}
            </div>
          </div>
        </div>

        <div class="dp-card-row">
          <span class="dp-card-label">Conditions</span>
          <span class="dp-card-val">${escHtml(conditions)}</span>
        </div>
        <div class="dp-card-row">
          <span class="dp-card-label">Appointments</span>
          <span class="dp-card-val">${p.appointmentCount}</span>
        </div>
        <div class="dp-card-row">
          <span class="dp-card-label">Last Visit</span>
          <span class="dp-card-val">${lastAppt}
            ${p.lastStatus ? `<span class="dp-status-chip ${statusCls[p.lastStatus] || ''}">${capitalize(p.lastStatus)}</span>` : ''}
          </span>
        </div>

        <button class="btn btn-primary btn-sm dp-view-btn" data-id="${p._id}">View Profile →</button>
        <a href="/video-consult?room=consult-${p._id}&doctorName=${encodeURIComponent(doctorName)}" class="btn btn-success btn-sm" style="margin-top:6px;display:block;text-align:center;">🎥 Video Consult</a>
      </div>
    `;
  }).join('');

  dpGrid.querySelectorAll('.dp-view-btn').forEach(btn => {
    btn.addEventListener('click', () => openPatient(btn.dataset.id));
  });
}

// ── Search filter ──────────────────────────────────────────────
searchBox.addEventListener('input', () => {
  const q = searchBox.value.toLowerCase().trim();
  if (!q) { renderGrid(allPatients); return; }
  renderGrid(allPatients.filter(p =>
    p.fullName.toLowerCase().includes(q) ||
    (p.email || '').toLowerCase().includes(q)
  ));
});

// ── Open patient detail ────────────────────────────────────────
async function openPatient(patientId) {
  listView.classList.add('hidden');
  detailView.classList.remove('hidden');

  const detailLoading = document.getElementById('detailLoading');
  const detailContent = document.getElementById('detailContent');
  detailLoading.classList.remove('hidden');
  detailContent.innerHTML = '';

  const res = await api.get(`/doctors/my-patients/${patientId}`);
  detailLoading.classList.add('hidden');

  if (!res?.ok) {
    detailContent.innerHTML = `<div class="dp-alert error">${escHtml(res?.data?.message || 'Failed to load patient.')}</div>`;
    return;
  }

  renderPatientDetail(res.data.patient, res.data.appointments);
}

// ── Back button ────────────────────────────────────────────────
backBtn.addEventListener('click', () => {
  detailView.classList.add('hidden');
  listView.classList.remove('hidden');
  document.getElementById('detailContent').innerHTML = '';
});

// ── Render patient detail page ────────────────────────────────
function renderPatientDetail(p, appointments) {
  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  const allergies  = (p.allergies || []).map(a => `<span class="dp-tag">${escHtml(a.allergen || a)}</span>`).join('') || '<em>None recorded</em>';
  const conditions = (p.chronicConditions || []).map(c => `<span class="dp-tag">${escHtml(c)}</span>`).join('') || '<em>None recorded</em>';

  // Vital signs — last 5 entries
  const vitals = (p.vitalSigns || []).slice(-5).reverse();
  const vitalsHtml = vitals.length
    ? vitals.map(v => `
      <tr>
        <td>${fmtDate(v.date)}</td>
        <td>${v.bloodPressureSystolic ? `${v.bloodPressureSystolic}/${v.bloodPressureDiastolic}` : '—'}</td>
        <td>${v.heartRate || '—'}</td>
        <td>${v.bloodSugar || '—'}</td>
        <td>${v.weight || '—'}</td>
        <td>${v.oxygenSaturation || '—'}</td>
      </tr>
    `).join('')
    : `<tr><td colspan="6" class="dp-empty-td">No vital signs recorded</td></tr>`;

  // Appointment history
  const apptStatusCls = { pending: 'status-pending', confirmed: 'status-confirmed', completed: 'status-completed', cancelled: 'status-cancelled' };
  const apptsHtml = appointments.length
    ? appointments.map(a => `
      <tr>
        <td>${fmtDate(a.date)}</td>
        <td>${escHtml(a.timeSlot)}</td>
        <td>${escHtml(a.reason)}</td>
        <td><span class="da-status-badge ${apptStatusCls[a.status] || ''}">${capitalize(a.status)}</span></td>
      </tr>
    `).join('')
    : `<tr><td colspan="4" class="dp-empty-td">No appointments</td></tr>`;

  // ── Medical records / test results ──────────────────────────
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

  // Sort newest first
  const records = [...(p.medicalRecords || [])].sort((a, b) => new Date(b.date) - new Date(a.date));

  // Separate lab results for the highlighted section
  const labResults = records.filter(r => r.type === 'lab_result');
  const otherRecs  = records.filter(r => r.type !== 'lab_result');

  const buildRecordRow = r => {
    const cfg = TYPE_CFG[r.type] || TYPE_CFG.other;

    // Structured test parameter chips
    const valHtml = (r.testValues?.length)
      ? `<div class="dp-rec-values">
          ${r.testValues.map(tv => {
            const hasRange   = tv.refMin !== undefined || tv.refMax !== undefined;
            const outOfRange = hasRange && (
              (tv.refMin !== undefined && tv.value < tv.refMin) ||
              (tv.refMax !== undefined && tv.value > tv.refMax)
            );
            return `<div class="dp-tv-chip ${outOfRange ? 'dp-tv-high' : ''}">
              <span class="dp-tv-name">${escHtml(tv.name)}</span>
              <span class="dp-tv-num">${tv.value}${tv.unit ? ' ' + escHtml(tv.unit) : ''}</span>
              ${hasRange ? `<span class="dp-tv-ref">${tv.refMin ?? ''}–${tv.refMax ?? ''}</span>` : ''}
            </div>`;
          }).join('')}
        </div>`
      : '';

    // File attachment links
    const fileHtml = (r.attachments?.length)
      ? `<div class="dp-rec-files">
          ${r.attachments.map(a =>
            `<a href="http://localhost:5001${a.path}" target="_blank" class="dp-rec-attach">📎 ${escHtml(a.filename)}</a>`
          ).join('')}
        </div>`
      : '';

    return `
      <div class="dp-rec-item">
        <div class="dp-rec-top">
          <span class="dp-rec-badge ${cfg.cls}">${cfg.icon} ${cfg.label}</span>
          <span class="dp-rec-date">${fmtDate(r.date)}</span>
        </div>
        <div class="dp-rec-title">${escHtml(r.title)}</div>
        ${r.description ? `<div class="dp-rec-desc">${escHtml(r.description)}</div>` : ''}
        ${valHtml}
        ${fileHtml}
        <div class="dp-rec-meta">
          ${r.doctor   ? `<span>Dr. ${escHtml(r.doctor)}</span>` : ''}
          ${r.facility ? `<span>${escHtml(r.facility)}</span>` : ''}
        </div>
      </div>
    `;
  };

  const labHtml   = labResults.length
    ? labResults.map(buildRecordRow).join('')
    : '<p class="dp-rec-empty">No lab results on record</p>';

  const historyHtml = otherRecs.length
    ? otherRecs.map(buildRecordRow).join('')
    : '<p class="dp-rec-empty">No other records on record</p>';

  document.getElementById('detailContent').innerHTML = `
    <!-- Patient header -->
    <div class="dp-detail-hero">
      <div class="dp-detail-avatar">${p.fullName.charAt(0).toUpperCase()}</div>
      <div>
        <h2 class="dp-detail-name">${escHtml(p.fullName)}</h2>
        <p class="dp-detail-sub">
          ${p.email ? escHtml(p.email) : ''}
          ${p.phoneNumber ? ` · ${escHtml(p.phoneNumber)}` : ''}
        </p>
        <p class="dp-detail-sub">
          ${p.age ? `Age ${p.age}` : ''}
          ${p.gender ? ` · ${capitalize(p.gender)}` : ''}
          ${p.bloodType ? ` · Blood type <strong>${p.bloodType}</strong>` : ''}
          ${p.dateOfBirth ? ` · DOB ${fmtDate(p.dateOfBirth)}` : ''}
        </p>
        <a href="/video-consult?room=consult-${p._id}&doctorName=${encodeURIComponent(doctorName)}"
           class="btn btn-success btn-sm" style="margin-top:10px;display:inline-block;">
          🎥 Start Video Consultation
        </a>
      </div>
    </div>

    <!-- Two-column info -->
    <div class="dp-detail-grid">

      <!-- Medical Profile -->
      <div class="dp-detail-card">
        <h3 class="dp-detail-card-title">Medical Profile</h3>
        <div class="dp-detail-row">
          <span class="dp-detail-label">Chronic Conditions</span>
          <div class="dp-tag-row">${conditions}</div>
        </div>
        <div class="dp-detail-row">
          <span class="dp-detail-label">Allergies</span>
          <div class="dp-tag-row">${allergies}</div>
        </div>
        ${p.emergencyContact?.name ? `
        <div class="dp-detail-row">
          <span class="dp-detail-label">Emergency Contact</span>
          <span>${escHtml(p.emergencyContact.name)}
            ${p.emergencyContact.relationship ? ` (${escHtml(p.emergencyContact.relationship)})` : ''}
            ${p.emergencyContact.phone ? ` · ${escHtml(p.emergencyContact.phone)}` : ''}
          </span>
        </div>` : ''}
        <div class="dp-detail-row">
          <span class="dp-detail-label">Patient since</span>
          <span>${fmtDate(p.createdAt)}</span>
        </div>
      </div>

      <!-- Vital Signs (latest) -->
      <div class="dp-detail-card">
        <h3 class="dp-detail-card-title">Latest Vital Signs</h3>
        <div class="dp-table-wrap">
          <table class="dp-table">
            <thead>
              <tr>
                <th>Date</th><th>BP (mmHg)</th><th>HR (bpm)</th>
                <th>Sugar (mg/dL)</th><th>Weight (kg)</th><th>SpO₂ (%)</th>
              </tr>
            </thead>
            <tbody>${vitalsHtml}</tbody>
          </table>
        </div>
      </div>

    </div>

    <!-- ── Test Results (Lab Reports) ─────────────────────────── -->
    <div class="dp-detail-card dp-rec-card" style="margin-top:20px;">
      <h3 class="dp-detail-card-title">🧪 Test Results (Lab Reports)</h3>
      <div class="dp-rec-list">${labHtml}</div>
    </div>

    <!-- ── Other Medical Records ──────────────────────────────── -->
    <div class="dp-detail-card dp-rec-card" style="margin-top:20px;">
      <h3 class="dp-detail-card-title">📋 Medical History</h3>
      <div class="dp-rec-list">${historyHtml}</div>
    </div>

    <!-- ── Appointment history ─────────────────────────────────── -->
    <div class="dp-detail-card" style="margin-top:20px;">
      <h3 class="dp-detail-card-title">Appointment History with You</h3>
      <div class="dp-table-wrap">
        <table class="dp-table">
          <thead>
            <tr><th>Date</th><th>Time</th><th>Reason</th><th>Status</th></tr>
          </thead>
          <tbody>${apptsHtml}</tbody>
        </table>
      </div>
    </div>
  `;
}

// ── Helpers ────────────────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

// ── Boot ───────────────────────────────────────────────────────
loadPatients();

// ── Video Request Notifications (doctor polling) ────────────────
(function initVideoNotifications() {
  // Only run for doctor role
  if (!currentUser || currentUser.role !== 'doctor') return;

  const banner     = document.getElementById('vcNotifBanner');
  const notifText  = document.getElementById('vcNotifText');
  const joinBtn    = document.getElementById('vcNotifJoinBtn');
  const dismissBtn = document.getElementById('vcNotifDismissBtn');

  if (!banner) return;

  let currentRequest  = null;
  let dismissed       = false;
  let lastRequestId   = null;

  async function pollVideoRequests() {
    const res = await api.get('/video/requests/pending');
    if (!res?.ok || !res.data?.requests?.length) {
      // No pending requests — hide banner
      banner.style.display = 'none';
      currentRequest = null;
      dismissed = false;
      lastRequestId = null;
      return;
    }

    const req = res.data.requests[0]; // Most recent pending request

    // If it's a new request reset dismissed flag
    if (req._id !== lastRequestId) {
      dismissed = false;
      lastRequestId = req._id;
    }

    if (dismissed) return;

    currentRequest = req;
    notifText.textContent = `📹 ${req.patientName} is requesting a video consultation`;
    banner.style.display = 'flex';
  }

  joinBtn.addEventListener('click', async () => {
    if (!currentRequest) return;
    joinBtn.disabled    = true;
    joinBtn.textContent = 'Joining…';

    const res = await api.put(`/video/request/${currentRequest._id}/accept`);
    if (res?.ok) {
      banner.style.display = 'none';
      const url = `/video-consult?room=${encodeURIComponent(res.data.roomName)}&doctorName=${encodeURIComponent(doctorName)}`;
      window.location.href = url;
    } else {
      joinBtn.disabled    = false;
      joinBtn.textContent = 'Join';
      Toast.error(res?.data?.message || 'Failed to join consultation.');
    }
  });

  dismissBtn.addEventListener('click', () => {
    dismissed = true;
    banner.style.display = 'none';
  });

  // Poll every 5 seconds
  pollVideoRequests();
  setInterval(pollVideoRequests, 5000);
})();
