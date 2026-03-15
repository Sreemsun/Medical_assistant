/* ─────────────────────────────────────────────────────────────
   video-consult.js  –  Jitsi Meet video consultation
───────────────────────────────────────────────────────────── */

'use strict';

document.getElementById('navbar').innerHTML = buildNavbar('');
document.getElementById('footer').innerHTML = buildFooter();
Auth.requireAuth();

// ── Read URL params ────────────────────────────────────────────
const params     = new URLSearchParams(window.location.search);
const roomParam  = params.get('room');
const doctorName = params.get('doctorName') || 'Your Doctor';

if (!roomParam) window.location.href = 'doctor-profile.html';

const user        = Auth.getUser();
const displayName = user?.fullName || user?.name || 'User';
const roomName    = roomParam.replace(/[^a-zA-Z0-9_-]/g, '-');
const jitsiUrl    = `https://meet.jit.si/${roomName}`;
const shareUrl    = `${window.location.origin}/video-consult?room=${encodeURIComponent(roomParam)}&doctorName=${encodeURIComponent(doctorName)}`;

// ── Populate pre-join screen ───────────────────────────────────
document.getElementById('vcDoctorName').textContent  = `Consultation with ${doctorName}`;
document.getElementById('vcRoomDisplay').textContent = roomName;
document.getElementById('vcUserName').textContent    = displayName;
document.getElementById('vcShareUrl').value          = shareUrl;
document.getElementById('vcRoomTitle').textContent   = `Consultation with ${doctorName}`;

// ── Copy link ──────────────────────────────────────────────────
function copyLink(btnId) {
  navigator.clipboard.writeText(shareUrl).then(() => {
    const btn  = document.getElementById(btnId);
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = orig; }, 2000);
  });
}
document.getElementById('vcCopyBtn').addEventListener('click',       () => copyLink('vcCopyBtn'));
document.getElementById('vcCopyInCallBtn').addEventListener('click', () => copyLink('vcCopyInCallBtn'));

// ── Join — open Jitsi in a new tab ─────────────────────────────
document.getElementById('vcJoinBtn').addEventListener('click', () => {
  window.open(jitsiUrl, '_blank');

  document.getElementById('prejoinScreen').classList.add('hidden');
  document.getElementById('videoRoom').classList.remove('hidden');
  document.getElementById('vcFrame').innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                height:100%;gap:16px;color:#fff;text-align:center;padding:24px;">
      <div style="font-size:4rem;">🎥</div>
      <h3 style="margin:0;">Video call opened in a new tab</h3>
      <p style="opacity:0.7;margin:0;">Your consultation with <strong>${doctorName}</strong> is running in a new browser tab.</p>
      <p style="opacity:0.6;margin:0;font-size:0.85rem;">Share this link with the other participant:</p>
      <div style="display:flex;gap:8px;max-width:500px;width:100%;">
        <input value="${jitsiUrl}" readonly
               style="flex:1;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);
                      color:#fff;border-radius:8px;padding:8px 12px;font-size:0.8rem;" />
        <button onclick="navigator.clipboard.writeText('${jitsiUrl}').then(()=>{this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',2000)})"
                style="background:rgba(255,255,255,0.15);border:none;color:#fff;border-radius:8px;
                       padding:8px 14px;cursor:pointer;">Copy</button>
      </div>
      <a href="${jitsiUrl}" target="_blank"
         style="background:#2563eb;color:#fff;border:none;border-radius:8px;padding:10px 20px;
                text-decoration:none;margin-top:8px;">Re-open Call Tab</a>
    </div>`;
});

// ── Leave ──────────────────────────────────────────────────────
document.getElementById('vcLeaveBtn').addEventListener('click', () => {
  document.getElementById('videoRoom').classList.add('hidden');
  document.getElementById('prejoinScreen').classList.remove('hidden');
});
