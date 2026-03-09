/* ─────────────────────────────────────────────────────────────
   video-consult.js  –  Jitsi Meet video consultation page
───────────────────────────────────────────────────────────── */

'use strict';

document.getElementById('navbar').innerHTML = buildNavbar('');
document.getElementById('footer').innerHTML = buildFooter();
Auth.requireAuth();

// ── Read URL params ────────────────────────────────────────────
const params     = new URLSearchParams(window.location.search);
const roomParam  = params.get('room');
const doctorName = params.get('doctorName') || 'Your Doctor';

// Redirect if no room provided
if (!roomParam) {
  window.location.href = 'doctor-profile.html';
}

const user        = Auth.getUser();
const displayName = user?.fullName || user?.name || 'Patient';
const roomName    = roomParam;
const shareUrl    = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomName)}&doctorName=${encodeURIComponent(doctorName)}`;

// ── Populate pre-join screen ───────────────────────────────────
document.getElementById('vcDoctorName').textContent  = `Consultation with ${doctorName}`;
document.getElementById('vcRoomDisplay').textContent = roomName;
document.getElementById('vcUserName').textContent    = displayName;
document.getElementById('vcShareUrl').value          = shareUrl;
document.getElementById('vcRoomTitle').textContent   = `Consultation with ${doctorName}`;

// ── Copy link (pre-join) ───────────────────────────────────────
document.getElementById('vcCopyBtn').addEventListener('click', () => copyToClipboard('vcCopyBtn'));

// ── Copy link (in-call) ───────────────────────────────────────
document.getElementById('vcCopyInCallBtn').addEventListener('click', () => copyToClipboard('vcCopyInCallBtn'));

function copyToClipboard(btnId) {
  navigator.clipboard.writeText(shareUrl).then(() => {
    const btn = document.getElementById(btnId);
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = original; }, 2000);
  }).catch(() => {
    // Fallback for browsers without clipboard API
    const input = document.getElementById('vcShareUrl');
    input.select();
    document.execCommand('copy');
  });
}

// ── Join button ────────────────────────────────────────────────
document.getElementById('vcJoinBtn').addEventListener('click', startCall);

// ── Leave button ───────────────────────────────────────────────
document.getElementById('vcLeaveBtn').addEventListener('click', endCall);

// ── Start the call ─────────────────────────────────────────────
function startCall() {
  document.getElementById('prejoinScreen').classList.add('hidden');
  document.getElementById('videoRoom').classList.remove('hidden');

  // Dynamically load Jitsi External API script
  if (window.JitsiMeetExternalAPI) {
    initJitsi();
    return;
  }

  const script  = document.createElement('script');
  script.src    = 'https://meet.jit.si/external_api.js';
  script.onload = initJitsi;
  script.onerror = () => {
    document.getElementById('vcFrame').innerHTML = `
      <div class="vc-load-error">
        <p>Failed to load the video conference module.</p>
        <p>Please check your internet connection and try again.</p>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>`;
  };
  document.head.appendChild(script);
}

// ── Initialise Jitsi ───────────────────────────────────────────
function initJitsi() {
  const container = document.getElementById('vcFrame');
  container.innerHTML = '';

  window._jitsiApi = new JitsiMeetExternalAPI('meet.jit.si', {
    roomName,
    width:      '100%',
    height:     '100%',
    parentNode: container,

    userInfo: {
      displayName,
      email: user?.email || '',
    },

    configOverwrite: {
      startWithAudioMuted:  false,
      startWithVideoMuted:  false,
      prejoinPageEnabled:   false,
      disableDeepLinking:   true,
    },

    interfaceConfigOverwrite: {
      TOOLBAR_BUTTONS: [
        'microphone', 'camera', 'closedcaptions', 'desktop',
        'fullscreen', 'fodeviceselection', 'hangup', 'chat',
        'tileview', 'videobackgroundblur', 'raisehand',
      ],
      SHOW_JITSI_WATERMARK:       false,
      SHOW_WATERMARK_FOR_GUESTS:  false,
      DEFAULT_BACKGROUND:         '#1e293b',
    },
  });

  // Auto-return to pre-join when the user hangs up inside the meeting
  window._jitsiApi.addEventListener('videoConferenceLeft', endCall);
  window._jitsiApi.addEventListener('readyToClose',        endCall);
}

// ── End the call ───────────────────────────────────────────────
function endCall() {
  if (window._jitsiApi) {
    try { window._jitsiApi.dispose(); } catch (_) {}
    window._jitsiApi = null;
  }
  document.getElementById('videoRoom').classList.add('hidden');
  document.getElementById('prejoinScreen').classList.remove('hidden');
}

// ── Clean up on page unload ────────────────────────────────────
window.addEventListener('beforeunload', () => {
  if (window._jitsiApi) {
    try { window._jitsiApi.dispose(); } catch (_) {}
  }
});
