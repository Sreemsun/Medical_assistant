/* ─────────────────────────────────────────────────────────────
   doctor-profile.js  –  Manage doctor profiles
───────────────────────────────────────────────────────────── */

'use strict';

document.getElementById('navbar').innerHTML = buildNavbar('doctors');
document.getElementById('footer').innerHTML = buildFooter();
Auth.requireAuth();

// ── State ──────────────────────────────────────────────────────
let doctors    = [];
let editingId  = null;   // null = add mode, string = edit mode
let deletingId = null;

// ── DOM refs ───────────────────────────────────────────────────
const grid          = document.getElementById('doctorsGrid');
const loading       = document.getElementById('doctorsLoading');
const empty         = document.getElementById('doctorsEmpty');
const alertBar      = document.getElementById('dpAlert');
const formError     = document.getElementById('formError');
const modal         = document.getElementById('doctorModal');
const deleteModal   = document.getElementById('deleteModal');
const modalTitle    = document.getElementById('doctorModalTitle');
const saveDoctorBtn = document.getElementById('saveDoctorBtn');
const confirmDel    = document.getElementById('confirmDeleteBtn');

// ── Alert helper ───────────────────────────────────────────────
function showAlert(msg, type = 'success') {
  alertBar.textContent = msg;
  alertBar.className   = `dp-alert ${type}`;
  alertBar.classList.remove('hidden');
  setTimeout(() => alertBar.classList.add('hidden'), 4000);
}

// ── Modal helpers ──────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});
document.querySelectorAll('.modal-overlay').forEach(ov => {
  ov.addEventListener('click', e => { if (e.target === ov) closeModal(ov.id); });
});

// ── Load doctors ───────────────────────────────────────────────
async function loadDoctors() {
  loading.style.display = 'block';
  grid.innerHTML        = '';
  empty.classList.add('hidden');

  const res = await api.get('/doctors');
  loading.style.display = 'none';

  if (!res?.ok) { showAlert('Failed to load doctors.', 'error'); return; }

  doctors = res.data.doctors || [];
  renderGrid();
}

// ── Render grid ────────────────────────────────────────────────
const DAY_SHORT = { Monday:'Mon',Tuesday:'Tue',Wednesday:'Wed',Thursday:'Thu',Friday:'Fri',Saturday:'Sat',Sunday:'Sun' };

function renderGrid() {
  if (!doctors.length) {
    empty.classList.remove('hidden');
    grid.innerHTML = '';
    return;
  }
  empty.classList.add('hidden');

  grid.innerHTML = doctors.map(doc => `
    <div class="doc-card">
      <div class="doc-card-top">
        <div class="doc-avatar">👨‍⚕️</div>
        <div class="doc-info">
          <div class="doc-name">${escHtml(doc.name)}</div>
          <span class="doc-specialty">${escHtml(doc.specialty)}</span>
        </div>
        <div class="doc-actions">
          <button class="doc-btn edit" data-id="${doc._id}" title="Edit">✏️</button>
          <button class="doc-btn del"  data-id="${doc._id}" data-name="${escHtml(doc.name)}" title="Remove">🗑️</button>
        </div>
      </div>

      <div class="doc-meta">
        ${doc.experience ? `<div class="doc-meta-row">🏅 ${doc.experience} year${doc.experience !== 1 ? 's' : ''} experience</div>` : ''}
        ${doc.email  ? `<div class="doc-meta-row">✉️ ${escHtml(doc.email)}</div>`  : ''}
        ${doc.phone  ? `<div class="doc-meta-row">📞 ${escHtml(doc.phone)}</div>`  : ''}
      </div>

      ${doc.availability?.length ? `
        <div class="doc-days">
          ${doc.availability.map(d => `<span class="day-badge">${DAY_SHORT[d] || d}</span>`).join('')}
        </div>
      ` : ''}

      ${doc.bio ? `<div class="doc-bio">${escHtml(doc.bio)}</div>` : ''}

      <div class="doc-slots-count">
        ${doc.slots?.length ? `${doc.slots.length} time slot${doc.slots.length !== 1 ? 's' : ''} available` : 'No time slots set'}
      </div>
      <button class="btn-video doc-video-btn vc-request-btn"
              data-docid="${doc._id}" data-docname="${escHtml(doc.name)}">
        🎥 Request Video Consult
      </button>
    </div>
  `).join('');

  // Wire edit / delete buttons
  grid.querySelectorAll('.doc-btn.edit').forEach(btn =>
    btn.addEventListener('click', () => openEditModal(btn.dataset.id))
  );
  grid.querySelectorAll('.doc-btn.del').forEach(btn =>
    btn.addEventListener('click', () => openDeleteModal(btn.dataset.id, btn.dataset.name))
  );

  // Wire video consult request buttons
  grid.querySelectorAll('.vc-request-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const doctorId   = btn.dataset.docid;
      const doctorName = btn.dataset.docname;

      btn.disabled    = true;
      btn.textContent = 'Sending request...';

      const res = await api.post('/video/request', { doctorId, doctorName });

      if (res && res.ok) {
        Toast.success('Video consultation request sent! Waiting for doctor to join...');
        btn.textContent = '⏳ Request Sent';

        // Patient joins the room and waits
        setTimeout(() => {
          window.location.href =
            `/video-consult?room=${encodeURIComponent(res.data.roomName)}&doctorName=${encodeURIComponent(doctorName)}&requestId=${res.data.requestId}`;
        }, 1500);
      } else {
        Toast.error(res?.data?.message || 'Failed to send request.');
        btn.disabled    = false;
        btn.textContent = '🎥 Request Video Consult';
      }
    });
  });
} // end renderGrid

// ── Form helpers ───────────────────────────────────────────────
function getChecked(name) {
  return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(el => el.value);
}

function setChecked(name, values = []) {
  document.querySelectorAll(`input[name="${name}"]`).forEach(el => {
    el.checked = values.includes(el.value);
  });
}

function clearForm() {
  ['fName','fSpecialty','fEmail','fPhone','fBio'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('fExperience').value = '';
  setChecked('day',  []);
  setChecked('slot', []);
  formError.classList.add('hidden');
  formError.textContent = '';
}

function populateForm(doc) {
  document.getElementById('fName').value       = doc.name        || '';
  document.getElementById('fSpecialty').value  = doc.specialty   || '';
  document.getElementById('fEmail').value      = doc.email       || '';
  document.getElementById('fPhone').value      = doc.phone       || '';
  document.getElementById('fExperience').value = doc.experience  || '';
  document.getElementById('fBio').value        = doc.bio         || '';
  setChecked('day',  doc.availability || []);
  setChecked('slot', doc.slots        || []);
  formError.classList.add('hidden');
}

// ── Open Add modal ─────────────────────────────────────────────
document.getElementById('addDoctorBtn').addEventListener('click', () => {
  editingId = null;
  clearForm();
  modalTitle.textContent    = 'Add Doctor';
  saveDoctorBtn.textContent = 'Save Doctor';
  openModal('doctorModal');
});

// ── Open Edit modal ────────────────────────────────────────────
function openEditModal(id) {
  const doc = doctors.find(d => d._id === id);
  if (!doc) return;
  editingId = id;
  populateForm(doc);
  modalTitle.textContent    = 'Edit Doctor';
  saveDoctorBtn.textContent = 'Update Doctor';
  openModal('doctorModal');
}

// ── Save (create or update) ────────────────────────────────────
saveDoctorBtn.addEventListener('click', async () => {
  const name      = document.getElementById('fName').value.trim();
  const specialty = document.getElementById('fSpecialty').value.trim();

  if (!name || !specialty) {
    formError.textContent = 'Name and specialty are required.';
    formError.classList.remove('hidden');
    return;
  }

  const payload = {
    name,
    specialty,
    email:        document.getElementById('fEmail').value.trim(),
    phone:        document.getElementById('fPhone').value.trim(),
    experience:   Number(document.getElementById('fExperience').value) || 0,
    bio:          document.getElementById('fBio').value.trim(),
    availability: getChecked('day'),
    slots:        getChecked('slot'),
  };

  saveDoctorBtn.disabled    = true;
  saveDoctorBtn.textContent = 'Saving…';

  let res;
  if (editingId) {
    res = await api.put(`/doctors/${editingId}`, payload);
  } else {
    res = await api.post('/doctors', payload);
  }

  saveDoctorBtn.disabled    = false;
  saveDoctorBtn.textContent = editingId ? 'Update Doctor' : 'Save Doctor';

  if (!res?.ok) {
    formError.textContent = res?.data?.message || 'Failed to save doctor.';
    formError.classList.remove('hidden');
    return;
  }

  closeModal('doctorModal');
  showAlert(editingId ? 'Doctor updated successfully.' : 'Doctor added successfully.');
  await loadDoctors();
});

// ── Delete flow ────────────────────────────────────────────────
function openDeleteModal(id, name) {
  deletingId = id;
  document.getElementById('deleteDoctorName').textContent = name;
  openModal('deleteModal');
}

confirmDel.addEventListener('click', async () => {
  if (!deletingId) return;
  confirmDel.disabled    = true;
  confirmDel.textContent = 'Removing…';

  const res = await api.delete(`/doctors/${deletingId}`);

  confirmDel.disabled    = false;
  confirmDel.textContent = 'Remove';

  if (!res?.ok) {
    closeModal('deleteModal');
    showAlert(res?.data?.message || 'Failed to remove doctor.', 'error');
    return;
  }

  closeModal('deleteModal');
  showAlert('Doctor removed.');
  deletingId = null;
  await loadDoctors();
});

// ── Utils ──────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Boot ───────────────────────────────────────────────────────
loadDoctors();
