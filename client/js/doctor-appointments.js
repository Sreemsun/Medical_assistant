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

// ══════════════════════════════════════════════════════════════
// DOCTOR MESSAGING MODULE
// ══════════════════════════════════════════════════════════════

let activePatientId   = null;  // patient whose thread is open
let activePatientName = '';

async function initDoctorMessaging() {
  await loadDoctorConversations();
  document.getElementById('da-msgs-refresh-btn').addEventListener('click', loadDoctorConversations);
  document.getElementById('da-thread-back-btn').addEventListener('click', closeDoctorThread);
  document.getElementById('da-thread-refresh-btn').addEventListener('click', () => {
    if (activePatientId) openDoctorConversation(activePatientId, activePatientName);
  });
  document.getElementById('da-reply-send-btn').addEventListener('click', sendDoctorReply);
}

// ── Load all patient conversations ────────────────────────────
async function loadDoctorConversations() {
  const loadingEl = document.getElementById('da-convs-loading');
  const listEl    = document.getElementById('da-convs-list');
  loadingEl.style.display = 'block';
  listEl.innerHTML = '';

  const res = await api.get('/messages/doctor-conversations');
  loadingEl.style.display = 'none';

  if (!res || !res.ok) {
    listEl.innerHTML = '<p style="color:var(--text-muted);font-size:.875rem">Could not load messages.</p>';
    return;
  }

  const convs = res.data.conversations || [];
  if (!convs.length) {
    listEl.innerHTML = '<p style="color:var(--text-muted);font-size:.875rem">No patient messages yet.</p>';
    return;
  }

  listEl.innerHTML = convs.map(c => {
    const pName  = escHtml(c.patient?.fullName || 'Unknown Patient');
    const email  = c.patient?.email ? escHtml(c.patient.email) : '';
    const last   = c.lastMessage ? escHtml(c.lastMessage.content.substring(0, 70)) + (c.lastMessage.content.length > 70 ? '…' : '') : '';
    const time   = c.lastMessage ? DateFmt.relative(c.lastMessage.createdAt) : '';
    const unread = c.unreadCount > 0 ? `<span class="da-unread-badge">${c.unreadCount}</span>` : '';
    const pid    = escHtml(c.patient?._id || c.patient?.id || '');
    return `
      <div class="da-conv-item" data-patient-id="${pid}" data-patient-name="${pName}">
        <div class="da-conv-avatar">${pName.charAt(0).toUpperCase()}</div>
        <div class="da-conv-body">
          <div class="da-conv-name">${pName}</div>
          ${email ? `<div class="da-conv-email">${email}</div>` : ''}
          <div class="da-conv-preview">${last}</div>
        </div>
        <div class="da-conv-meta">
          <span class="da-conv-time">${time}</span>
          ${unread}
        </div>
      </div>`;
  }).join('');

  listEl.querySelectorAll('.da-conv-item').forEach(item => {
    item.addEventListener('click', () => {
      openDoctorConversation(item.dataset.patientId, item.dataset.patientName);
    });
  });
}

// ── Open a patient conversation ───────────────────────────────
async function openDoctorConversation(patientId, patientName) {
  activePatientId   = patientId;
  activePatientName = patientName;
  document.getElementById('da-thread-title').textContent = patientName;
  document.getElementById('da-convs-wrapper').classList.add('hidden');
  document.getElementById('da-thread-wrapper').classList.remove('hidden');

  const thread = document.getElementById('da-thread');
  thread.innerHTML = '<p style="color:var(--text-muted);font-size:.875rem;padding:16px">Loading…</p>';

  const res = await api.get(`/messages/doctor-conversation/${patientId}`);
  if (!res || !res.ok) {
    thread.innerHTML = '<p style="color:var(--text-muted);font-size:.875rem;padding:16px">Could not load messages.</p>';
    return;
  }
  renderDoctorThread(res.data.messages || []);
}

// ── Close thread, go back to list ─────────────────────────────
function closeDoctorThread() {
  activePatientId   = null;
  activePatientName = '';
  document.getElementById('da-thread-wrapper').classList.add('hidden');
  document.getElementById('da-convs-wrapper').classList.remove('hidden');
  loadDoctorConversations();
}

// ── Send a reply to a patient ─────────────────────────────────
async function sendDoctorReply() {
  if (!activePatientId) return;
  const content = document.getElementById('da-reply-content').value.trim();
  if (!content) return;
  const btn = document.getElementById('da-reply-send-btn');
  btn.disabled = true;
  btn.textContent = 'Sending…';

  const res = await api.post('/messages/reply', { patientId: activePatientId, content });
  btn.disabled = false;
  btn.textContent = 'Send Reply';

  if (res && res.ok) {
    document.getElementById('da-reply-content').value = '';
    openDoctorConversation(activePatientId, activePatientName);
  } else {
    showAlert(res?.data?.message || 'Failed to send reply.', 'error');
  }
}

// ── Render thread bubbles ─────────────────────────────────────
function renderDoctorThread(messages) {
  const thread = document.getElementById('da-thread');
  if (!messages.length) {
    thread.innerHTML = '<p style="color:var(--text-muted);font-size:.875rem;padding:16px;text-align:center">No messages in this conversation.</p>';
    return;
  }
  thread.innerHTML = messages.map(m => {
    const isMine = m.senderRole === 'doctor';
    const time   = DateFmt.relative(m.createdAt);
    return `
      <div class="da-bubble-row ${isMine ? 'da-mine' : 'da-theirs'}">
        <div class="da-bubble ${isMine ? 'da-bubble-mine' : 'da-bubble-theirs'}">
          <div class="da-bubble-content">${escHtml(m.content)}</div>
          <div class="da-bubble-time">${time}</div>
        </div>
      </div>`;
  }).join('');
  thread.scrollTop = thread.scrollHeight;
}

// ── Boot ───────────────────────────────────────────────────────
loadAppointments();
initDoctorMessaging();
