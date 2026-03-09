/* ─────────────────────────────────────────────────────────────
   appointments.js  –  Appointment booking page logic
───────────────────────────────────────────────────────────── */

'use strict';

// ── Bootstrap ─────────────────────────────────────────────────
document.getElementById('navbar').innerHTML = buildNavbar('appointments');
document.getElementById('footer').innerHTML = buildFooter();
Auth.requireAuth();

// ── State ─────────────────────────────────────────────────────
let allDoctors  = [];
let currentFilter = 'all';

// ── DOM refs ──────────────────────────────────────────────────
const doctorsGrid      = document.getElementById('doctorsGrid');
const doctorSearch     = document.getElementById('doctorSearch');
const specialtyFilter  = document.getElementById('specialtyFilter');
const appointmentsList = document.getElementById('appointmentsList');

// Modal
const bookingModal  = document.getElementById('bookingModal');
const bookingForm   = document.getElementById('bookingForm');
const modalClose    = document.getElementById('modalClose');
const cancelModal   = document.getElementById('cancelModal');
const fieldDoctorId = document.getElementById('fieldDoctorId');
const fieldDate     = document.getElementById('fieldDate');
const fieldSlot     = document.getElementById('fieldSlot');
const fieldReason   = document.getElementById('fieldReason');
const fieldNotes    = document.getElementById('fieldNotes');
const bookingAlert  = document.getElementById('bookingAlert');
const reasonCount   = document.getElementById('reasonCount');
const availHint     = document.getElementById('availabilityHint');
const submitBtn     = document.getElementById('submitBooking');

// Toast
const toastEl = document.getElementById('successToast');

// ── Avatar colour pool ────────────────────────────────────────
const AVATAR_COLORS = [
  'linear-gradient(135deg,#6366f1,#8b5cf6)',
  'linear-gradient(135deg,#0ea5e9,#6366f1)',
  'linear-gradient(135deg,#10b981,#0ea5e9)',
  'linear-gradient(135deg,#f59e0b,#ef4444)',
  'linear-gradient(135deg,#ec4899,#8b5cf6)',
  'linear-gradient(135deg,#14b8a6,#10b981)',
  'linear-gradient(135deg,#f97316,#eab308)',
  'linear-gradient(135deg,#6366f1,#ec4899)',
];

function avatarColor(idx) {
  return AVATAR_COLORS[idx % AVATAR_COLORS.length];
}

function initials(name) {
  return name.replace(/^Dr\.\s*/i, '').split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

// ── Show toast ────────────────────────────────────────────────
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 3500);
}

// ── Min date helper (today) ───────────────────────────────────
function todayISO() {
  return new Date().toISOString().split('T')[0];
}

// ── Fetch & render doctors ────────────────────────────────────
async function loadDoctors() {
  const res = await api.get('/appointments/doctors');
  if (!res?.ok) {
    doctorsGrid.innerHTML = `<div class="no-doctors"><p>Failed to load doctors. Please refresh the page.</p></div>`;
    return;
  }
  allDoctors = res.data.doctors;
  populateSpecialtyFilter(allDoctors);
  renderDoctors(allDoctors);
}

function populateSpecialtyFilter(doctors) {
  const specialties = [...new Set(doctors.map(d => d.specialty))].sort();
  specialties.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    specialtyFilter.appendChild(opt);
  });
}

function buildDoctorCard(doc, colorIdx) {
  return `
    <div class="doctor-card">
      <div class="doctor-card-top">
        <div class="doctor-avatar" style="background:${avatarColor(colorIdx)}">${initials(doc.name)}</div>
        <div>
          <p class="doctor-info-name">${doc.name}</p>
          <span class="doctor-specialty-badge">${doc.specialty}</span>
        </div>
      </div>
      <p class="doctor-description">${doc.description}</p>
      <div class="doctor-availability">
        ${doc.availability.map(d => `<span class="avail-day">${d.slice(0,3)}</span>`).join('')}
      </div>
      <div class="doctor-card-btns">
        <button class="btn btn-primary doctor-card-btn" data-docid="${doc.id}">Book Appointment</button>
        <a href="video-consult.html?room=medassist-${encodeURIComponent(doc.id)}&doctorName=${encodeURIComponent(doc.name)}" class="btn-video">🎥 Video Consult</a>
      </div>
    </div>`;
}

function renderDoctors(doctors) {
  if (!doctors.length) {
    doctorsGrid.innerHTML = `<div class="no-doctors"><p>No doctors match your search.</p></div>`;
    return;
  }
  doctorsGrid.innerHTML = doctors.map(doc => buildDoctorCard(doc, allDoctors.indexOf(doc))).join('');
  bindBookButtons();
}

function bindBookButtons() {
  doctorsGrid.querySelectorAll('[data-docid]').forEach(btn => {
    btn.addEventListener('click', () => {
      const doc = allDoctors.find(d => d.id === btn.dataset.docid);
      if (doc) openModal(doc);
    });
  });
}

// ── Doctor search / filter ───────────────────────────────────
function applyFilters() {
  const q  = doctorSearch.value.toLowerCase();
  const sp = specialtyFilter.value;
  const filtered = allDoctors.filter(d => {
    const matchQ  = !q  || d.name.toLowerCase().includes(q) || d.specialty.toLowerCase().includes(q);
    const matchSp = !sp || d.specialty === sp;
    return matchQ && matchSp;
  });
  renderDoctors(filtered);
}

doctorSearch.addEventListener('input', applyFilters);
specialtyFilter.addEventListener('change', applyFilters);

// ── Modal open / close ────────────────────────────────────────
function openModal(doc) {
  fieldDoctorId.value = doc.id;
  document.getElementById('modalDoctorName').textContent  = doc.name;
  document.getElementById('modalSpecialty').textContent   = doc.specialty;
  const idx = allDoctors.indexOf(doc);
  document.getElementById('modalAvatar').textContent      = initials(doc.name);
  document.getElementById('modalAvatar').style.background = avatarColor(idx);

  availHint.textContent = `Available: ${doc.availability.join(', ')}`;

  bookingForm.reset();
  reasonCount.textContent = '0';
  fieldDate.min   = todayISO();
  fieldSlot.innerHTML = '<option value="">— pick a date first —</option>';
  fieldSlot.disabled  = true;
  hideAlert();

  bookingModal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  bookingModal.classList.remove('open');
  document.body.style.overflow = '';
}

modalClose.addEventListener('click', closeModal);
cancelModal.addEventListener('click', closeModal);
bookingModal.addEventListener('click', e => { if (e.target === bookingModal) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

// ── Load available slots on date change ───────────────────────
fieldDate.addEventListener('change', async () => {
  const date     = fieldDate.value;
  const doctorId = fieldDoctorId.value;
  if (!date || !doctorId) return;

  fieldSlot.innerHTML = '<option value="">Loading…</option>';
  fieldSlot.disabled  = true;

  const res = await api.get(`/appointments/available-slots?doctorId=${doctorId}&date=${date}`);
  if (!res?.ok) {
    fieldSlot.innerHTML = '<option value="">Error loading slots</option>';
    return;
  }

  const { slots, message } = res.data;
  if (!slots.length) {
    fieldSlot.innerHTML = `<option value="">${message || 'No slots available on this date'}</option>`;
  } else {
    fieldSlot.innerHTML = '<option value="">— select a time —</option>' +
      slots.map(s => `<option value="${s}">${s}</option>`).join('');
    fieldSlot.disabled = false;
  }
});

// ── Character counter ────────────────────────────────────────
fieldReason.addEventListener('input', () => {
  reasonCount.textContent = fieldReason.value.length;
});

// ── Alert helpers ─────────────────────────────────────────────
function showAlert(msg, type = 'error') {
  bookingAlert.textContent = msg;
  bookingAlert.className   = `form-alert ${type}`;
  bookingAlert.style.display = 'block';
}

function hideAlert() {
  bookingAlert.style.display = 'none';
}

// ── Submit booking ────────────────────────────────────────────
bookingForm.addEventListener('submit', async e => {
  e.preventDefault();
  hideAlert();

  const doctorId = fieldDoctorId.value;
  const date     = fieldDate.value;
  const timeSlot = fieldSlot.value;
  const reason   = fieldReason.value.trim();
  const notes    = fieldNotes.value.trim();

  if (!timeSlot) { showAlert('Please select a time slot.'); return; }
  if (!reason)   { showAlert('Please enter a reason for your visit.'); return; }

  submitBtn.querySelector('.btn-label').style.display   = 'none';
  submitBtn.querySelector('.btn-spinner').style.display = 'inline-block';
  submitBtn.disabled = true;

  const res = await api.post('/appointments', { doctorId, date, timeSlot, reason, notes });

  submitBtn.querySelector('.btn-label').style.display   = 'inline';
  submitBtn.querySelector('.btn-spinner').style.display = 'none';
  submitBtn.disabled = false;

  if (!res?.ok) {
    showAlert(res?.data?.message || 'Failed to book appointment. Please try again.');
    return;
  }

  closeModal();
  showToast('Appointment booked successfully!');
  loadAppointments();
});

// ── Load & render appointments ────────────────────────────────
async function loadAppointments() {
  appointmentsList.innerHTML = '<div class="loading-spinner-wrap"><div class="loading-spinner"></div></div>';
  const res = await api.get('/appointments');
  if (!res?.ok) {
    appointmentsList.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:24px">Failed to load appointments.</p>';
    return;
  }
  renderAppointments(res.data.appointments || []);
}

function renderAppointments(appointments) {
  const list = currentFilter === 'all'
    ? appointments
    : appointments.filter(a => a.status === currentFilter);

  if (!list.length) {
    appointmentsList.innerHTML = `
      <div class="appt-empty">
        <div class="appt-empty-icon">📅</div>
        <p>${currentFilter === 'all' ? 'You have no appointments yet. Book one above!' : `No ${currentFilter} appointments.`}</p>
      </div>`;
    return;
  }

  appointmentsList.innerHTML = list.map(a => {
    const idx     = allDoctors.findIndex(d => d.id === a.doctorId);
    const col     = avatarColor(idx >= 0 ? idx : 0);
    const ini     = initials(a.doctorName);
    const dateStr = new Date(a.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const canCancel = a.status === 'pending' || a.status === 'confirmed';

    return `
      <div class="appt-row" data-status="${a.status}">
        <div class="appt-row-avatar" style="background:${col}">${ini}</div>
        <div class="appt-row-body">
          <div class="appt-row-top">
            <span class="appt-row-name">${a.doctorName}</span>
            <span class="appt-row-specialty">${a.doctorSpecialty}</span>
          </div>
          <div class="appt-row-detail">${escHtml(a.reason)}</div>
        </div>
        <div class="appt-row-meta">
          <div class="appt-datetime">
            <div class="appt-date">${dateStr}</div>
            <div class="appt-time">${a.timeSlot}</div>
          </div>
          <span class="status-badge ${a.status}">${a.status}</span>
          ${canCancel ? `<button class="cancel-btn" data-apptid="${a._id}">Cancel</button>` : ''}
        </div>
      </div>`;
  }).join('');

  appointmentsList.querySelectorAll('.cancel-btn').forEach(btn => {
    btn.addEventListener('click', () => cancelAppointment(btn.dataset.apptid, btn));
  });
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Cancel appointment ────────────────────────────────────────
async function cancelAppointment(id, btn) {
  if (!confirm('Cancel this appointment?')) return;
  btn.disabled    = true;
  btn.textContent = 'Cancelling…';

  const res = await api.delete(`/appointments/${id}`);
  if (!res?.ok) {
    btn.disabled    = false;
    btn.textContent = 'Cancel';
    showToast(res?.data?.message || 'Could not cancel. Please try again.');
    return;
  }

  showToast('Appointment cancelled.');
  loadAppointments();
}

// ── Status tabs ───────────────────────────────────────────────
document.querySelectorAll('.status-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.status-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentFilter = tab.dataset.filter;
    loadAppointments();
  });
});

// ── Init ──────────────────────────────────────────────────────
loadDoctors();
loadAppointments();
