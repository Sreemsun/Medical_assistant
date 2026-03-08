/* ─────────────────────────────────────────────────────────────
   doctor-appointments.js  –  Doctor's appointment management page
───────────────────────────────────────────────────────────── */

'use strict';

document.getElementById('navbar').innerHTML = buildNavbar('doctor-appointments');
document.getElementById('footer').innerHTML = buildFooter();
Auth.requireAuth();

// Redirect non-doctors away
const currentUser = Auth.getUser();
if (!currentUser || currentUser.role !== 'doctor') {
  window.location.href = 'appointments.html';
}

// ── State ──────────────────────────────────────────────────────
let appointments  = [];
let activeStatus  = '';        // '' = all
let pendingUpdate = null;      // { id, status }

// ── DOM refs ───────────────────────────────────────────────────
const grid       = document.getElementById('daGrid');
const loading    = document.getElementById('daLoading');
const empty      = document.getElementById('daEmpty');
const alertBar   = document.getElementById('daAlert');
const modal      = document.getElementById('statusModal');
const modalMsg   = document.getElementById('statusModalMsg');
const modalTitle = document.getElementById('statusModalTitle');
const confirmBtn = document.getElementById('statusConfirmBtn');

// ── Alert helper ───────────────────────────────────────────────
function showAlert(msg, type = 'success') {
  alertBar.textContent = msg;
  alertBar.className   = `da-alert ${type}`;
  alertBar.classList.remove('hidden');
  setTimeout(() => alertBar.classList.add('hidden'), 4000);
}

// ── Modal helpers ──────────────────────────────────────────────
function openModal()  { modal.classList.remove('hidden'); }
function closeModal() { modal.classList.add('hidden'); pendingUpdate = null; }

modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
document.querySelectorAll('[data-close]').forEach(btn =>
  btn.addEventListener('click', () => closeModal())
);

// ── Status config ──────────────────────────────────────────────
const STATUS_CFG = {
  pending:   { label: 'Pending',   cls: 'status-pending' },
  confirmed: { label: 'Confirmed', cls: 'status-confirmed' },
  completed: { label: 'Completed', cls: 'status-completed' },
  cancelled: { label: 'Cancelled', cls: 'status-cancelled' },
};

// ── Date formatting ────────────────────────────────────────────
function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Load appointments ──────────────────────────────────────────
async function loadAppointments() {
  loading.style.display = 'flex';
  grid.innerHTML        = '';
  empty.classList.add('hidden');

  const qs  = activeStatus ? `?status=${activeStatus}` : '';
  const res = await api.get(`/appointments/doctor-appointments${qs}`);
  loading.style.display = 'none';

  if (!res?.ok) {
    showAlert(res?.data?.message || 'Failed to load appointments.', 'error');
    return;
  }

  appointments = res.data.appointments || [];
  renderGrid();
}

// ── Render grid ────────────────────────────────────────────────
function renderGrid() {
  if (!appointments.length) {
    empty.classList.remove('hidden');
    grid.innerHTML = '';
    return;
  }
  empty.classList.add('hidden');

  grid.innerHTML = appointments.map(appt => {
    const cfg      = STATUS_CFG[appt.status] || STATUS_CFG.pending;
    const patient  = appt.user?.fullName || 'Unknown Patient';
    const email    = appt.user?.email    || '';

    const canConfirm  = appt.status === 'pending';
    const canComplete = appt.status === 'confirmed';
    const canCancel   = appt.status === 'pending' || appt.status === 'confirmed';

    return `
      <div class="da-card">
        <div class="da-card-top">
          <div class="da-patient-info">
            <div class="da-patient-avatar">${patient.charAt(0).toUpperCase()}</div>
            <div>
              <div class="da-patient-name">${escHtml(patient)}</div>
              ${email ? `<div class="da-patient-email">${escHtml(email)}</div>` : ''}
            </div>
          </div>
          <span class="da-status-badge ${cfg.cls}">${cfg.label}</span>
        </div>

        <div class="da-card-details">
          <div class="da-detail"><span class="da-detail-icon">📅</span> ${fmtDate(appt.date)}</div>
          <div class="da-detail"><span class="da-detail-icon">🕐</span> ${escHtml(appt.timeSlot)}</div>
        </div>

        <div class="da-reason">
          <span class="da-reason-label">Reason:</span> ${escHtml(appt.reason)}
        </div>

        ${appt.notes ? `<div class="da-notes">${escHtml(appt.notes)}</div>` : ''}

        <div class="da-card-actions">
          ${canConfirm  ? `<button class="btn btn-sm da-btn-confirm"  data-id="${appt._id}" data-action="confirmed">✓ Confirm</button>` : ''}
          ${canComplete ? `<button class="btn btn-sm da-btn-complete" data-id="${appt._id}" data-action="completed">✔ Mark Completed</button>` : ''}
          ${canCancel   ? `<button class="btn btn-sm da-btn-cancel"   data-id="${appt._id}" data-action="cancelled">✕ Cancel</button>` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Wire action buttons
  grid.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => openStatusModal(btn.dataset.id, btn.dataset.action));
  });
}

// ── Open status update modal ───────────────────────────────────
const ACTION_LABELS = {
  confirmed: { title: 'Confirm Appointment', msg: 'Are you sure you want to confirm this appointment? The patient will be notified.' },
  completed: { title: 'Mark as Completed',   msg: 'Mark this appointment as completed?' },
  cancelled: { title: 'Cancel Appointment',  msg: 'Are you sure you want to cancel this appointment?' },
};

function openStatusModal(id, status) {
  pendingUpdate = { id, status };
  const cfg = ACTION_LABELS[status];
  modalTitle.textContent = cfg.title;
  modalMsg.textContent   = cfg.msg;
  confirmBtn.className   = `btn ${status === 'cancelled' ? 'btn-danger' : 'btn-primary'}`;
  confirmBtn.textContent = 'Confirm';
  openModal();
}

// ── Confirm button ─────────────────────────────────────────────
confirmBtn.addEventListener('click', async () => {
  if (!pendingUpdate) return;
  confirmBtn.disabled    = true;
  confirmBtn.textContent = 'Saving…';

  const res = await api.patch(`/appointments/${pendingUpdate.id}/status`, { status: pendingUpdate.status });

  confirmBtn.disabled    = false;
  confirmBtn.textContent = 'Confirm';
  closeModal();

  if (!res?.ok) {
    showAlert(res?.data?.message || 'Failed to update appointment.', 'error');
    return;
  }

  const labels = { confirmed: 'Appointment confirmed.', completed: 'Appointment marked as completed.', cancelled: 'Appointment cancelled.' };
  showAlert(labels[pendingUpdate.status] || 'Status updated.');
  await loadAppointments();
});

// ── Tab switching ──────────────────────────────────────────────
document.querySelectorAll('.da-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.da-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeStatus = tab.dataset.status;
    loadAppointments();
  });
});

// ── Utils ──────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Patch method on api (if not present) ──────────────────────
if (!api.patch) {
  api.patch = (endpoint, body) => api.request('PATCH', endpoint, body);
}

// ── Boot ───────────────────────────────────────────────────────
loadAppointments();
