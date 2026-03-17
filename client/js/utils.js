/* ═══════════════════════════════════════════════════════════════
   MedAssist — Shared Utilities & API Client
   ═══════════════════════════════════════════════════════════════ */

const API_BASE = '/api';

// ── Token Management ──────────────────────────────────────────
const Auth = {
  getToken: () => localStorage.getItem('medassist_token') || sessionStorage.getItem('medassist_token'),
  setToken: (token, remember = false) => {
    if (remember) localStorage.setItem('medassist_token', token);
    else sessionStorage.setItem('medassist_token', token);
  },
  removeToken: () => {
    localStorage.removeItem('medassist_token');
    sessionStorage.removeItem('medassist_token');
    localStorage.removeItem('medassist_user');
    sessionStorage.removeItem('medassist_user');
  },
  getUser: () => {
    const raw = localStorage.getItem('medassist_user') || sessionStorage.getItem('medassist_user');
    try { return raw ? JSON.parse(raw) : null; } catch { return null; }
  },
  setUser: (user, remember = false) => {
    const str = JSON.stringify(user);
    if (remember) localStorage.setItem('medassist_user', str);
    else sessionStorage.setItem('medassist_user', str);
  },
  isLoggedIn: () => !!Auth.getToken(),
  logout: () => {
    console.log('Logout initiated...');
    // Clear local tokens immediately
    Auth.removeToken();
    // Call logout endpoint to invalidate token on server (non-blocking)
    api.post('/auth/logout').then(res => {
      console.log('Server logout successful:', res);
    }).catch(err => {
      console.warn('Logout API call failed (still logging out locally):', err);
    });
    // Redirect to login immediately after clearing tokens
    setTimeout(() => {
      window.location.replace('/login.html');
    }, 100);
  },
  requireAuth: () => {
    if (!Auth.isLoggedIn()) window.location.replace('/login.html');
  },
  redirectIfLoggedIn: () => {
    if (Auth.isLoggedIn()) window.location.replace('/dashboard.html');
  },
};

// ── HTTP Client ───────────────────────────────────────────────
const api = {
  async request(method, endpoint, body = null, isFormData = false) {
    const headers = {};
    const token = Auth.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!isFormData) headers['Content-Type'] = 'application/json';

    const options = { method, headers };
    if (body) options.body = isFormData ? body : JSON.stringify(body);

    try {
      const controller = new AbortController();
      const timeoutId  = setTimeout(() => controller.abort(), 60000); // 60 s timeout (allows for cold start)

      const res = await fetch(`${API_BASE}${endpoint}`, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      const data = await res.json();

      if (res.status === 401) {
        Auth.removeToken();
        window.location.replace('/login.html');
        return null;
      }

      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      console.error('API request failed:', err);
      const isTimeout = err.name === 'AbortError';
      return { ok: false, status: 0, data: { success: false, message: isTimeout ? 'Request timed out. Please check the server is running.' : 'Network error. Please check your connection.' } };
    }
  },
  get: (endpoint) => api.request('GET', endpoint),
  post: (endpoint, body) => api.request('POST', endpoint, body),
  put: (endpoint, body) => api.request('PUT', endpoint, body),
  patch: (endpoint, body) => api.request('PATCH', endpoint, body),
  delete: (endpoint) => api.request('DELETE', endpoint),
  postForm: (endpoint, formData) => api.request('POST', endpoint, formData, true),
};

// ── Toast Notifications ────────────────────────────────────────
const Toast = {
  container: null,
  init() {
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
  },
  show(message, type = 'info', duration = 4000) {
    this.init();
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${icons[type] || icons.info}</span><span>${message}</span>`;
    this.container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 300);
    }, duration);

    return toast;
  },
  success: (msg, dur) => Toast.show(msg, 'success', dur),
  error: (msg, dur) => Toast.show(msg, 'error', dur),
  warning: (msg, dur) => Toast.show(msg, 'warning', dur),
  info: (msg, dur) => Toast.show(msg, 'info', dur),
};

// ── Loading States ─────────────────────────────────────────────
const Loader = {
  setBtn(btn, loading, loadingText = 'Loading...') {
    if (loading) {
      btn.disabled = true;
      btn._originalText = btn.innerHTML;
      btn.innerHTML = `<span>${loadingText}</span>`;
      btn.classList.add('btn-loading');
    } else {
      btn.disabled = false;
      btn.innerHTML = btn._originalText || btn.innerHTML;
      btn.classList.remove('btn-loading');
    }
  },
  showPage() {
    let loader = document.getElementById('page-loader');
    if (!loader) {
      loader = document.createElement('div');
      loader.id = 'page-loader';
      loader.className = 'page-loader';
      loader.innerHTML = '<div class="loader-spinner"></div>';
      document.body.appendChild(loader);
    }
    loader.style.display = 'flex';
  },
  hidePage() {
    const loader = document.getElementById('page-loader');
    if (loader) loader.style.display = 'none';
  },
};

// ── Form Helpers ───────────────────────────────────────────────
const Form = {
  showError(field, message) {
    const input = typeof field === 'string' ? document.getElementById(field) : field;
    if (!input) return;
    input.classList.add('is-invalid');
    const existing = input.parentElement.querySelector('.form-error');
    if (existing) existing.remove();
    const err = document.createElement('p');
    err.className = 'form-error';
    err.textContent = message;
    input.parentElement.appendChild(err);
  },
  clearErrors(form) {
    form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
    form.querySelectorAll('.form-error').forEach(el => el.remove());
  },
  showAlert(container, message, type = 'error') {
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    if (typeof container === 'string') container = document.getElementById(container);
    if (!container) return;
    container.innerHTML = `
      <div class="alert alert-${type}">
        <span>${icons[type]}</span>
        <span>${message}</span>
      </div>`;
  },
  clearAlert(container) {
    if (typeof container === 'string') container = document.getElementById(container);
    if (container) container.innerHTML = '';
  },
};

// ── Date Formatting ────────────────────────────────────────────
const DateFmt = {
  short: (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—',
  long: (d) => d ? new Date(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '—',
  relative: (d) => {
    if (!d) return '—';
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return DateFmt.short(d);
  },
};

// ── Password Strength ──────────────────────────────────────────
const PasswordStrength = {
  check(password) {
    let score = 0;
    const checks = {
      length: password.length >= 8,
      longLength: password.length >= 12,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      numbers: /\d/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(password),
    };
    Object.values(checks).forEach(v => v && score++);
    if (score <= 2) return { score, label: 'Weak', color: '#dc2626' };
    if (score <= 4) return { score, label: 'Fair', color: '#d97706' };
    if (score <= 5) return { score, label: 'Good', color: '#2563eb' };
    return { score, label: 'Strong', color: '#16a34a' };
  },
  attach(inputId, barId, textId) {
    const input = document.getElementById(inputId);
    const bar = document.getElementById(barId);
    const text = document.getElementById(textId);
    if (!input || !bar || !text) return;
    input.addEventListener('input', () => {
      const result = PasswordStrength.check(input.value);
      const pct = Math.min((result.score / 6) * 100, 100);
      bar.style.width = `${pct}%`;
      bar.style.background = result.color;
      text.textContent = input.value ? `Strength: ${result.label}` : '';
      text.style.color = result.color;
    });
  },
};

// ── Navbar Builder ─────────────────────────────────────────────
const _logoSVG = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect x="7" y="1" width="4" height="16" rx="1.5" fill="white"/>
  <rect x="1" y="7" width="16" height="4" rx="1.5" fill="white"/>
</svg>`;

const _hamburgerSVG = `<svg width="18" height="14" viewBox="0 0 18 14" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <rect width="18" height="2" rx="1"/>
  <rect y="6" width="13" height="2" rx="1"/>
  <rect y="12" width="18" height="2" rx="1"/>
</svg>`;

const _moonSVG = `<svg class="icon-moon" width="15" height="15" viewBox="0 0 15 15" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M5.5 1a6.5 6.5 0 1 0 0 13 5.5 5.5 0 1 1 0-13z"/>
</svg>`;

const _sunSVG = `<svg class="icon-sun" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <circle cx="8" cy="8" r="3" fill="currentColor"/>
  <line x1="8" y1="0.5" x2="8" y2="3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  <line x1="8" y1="13" x2="8" y2="15.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  <line x1="0.5" y1="8" x2="3" y2="8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  <line x1="13" y1="8" x2="15.5" y2="8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  <line x1="2.93" y1="2.93" x2="4.7" y2="4.7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  <line x1="11.3" y1="11.3" x2="13.07" y2="13.07" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  <line x1="11.3" y1="4.7" x2="13.07" y2="2.93" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
  <line x1="2.93" y1="13.07" x2="4.7" y2="11.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
</svg>`;

function buildNavbar(activePage = '') {
  const isLoggedIn = Auth.isLoggedIn();
  const user       = Auth.getUser();
  const isDoctor   = user?.role === 'doctor';

  const navLinks = isLoggedIn
    ? `<a href="dashboard.html" class="nav-link ${activePage === 'dashboard' ? 'active' : ''}">Dashboard</a>
       <a href="analyzer.html" class="nav-link ${activePage === 'analyzer' ? 'active' : ''}">Symptom Analyzer</a>
       <a href="appointments.html" class="nav-link ${activePage === 'appointments' ? 'active' : ''}">Appointments</a>
       ${isDoctor ? `<a href="doctor-appointments.html" class="nav-link ${activePage === 'doctor-appointments' ? 'active' : ''}">My Schedule</a>` : ''}
       ${isDoctor
         ? `<a href="doctor-patients.html" class="nav-link ${activePage === 'doctor-patients' ? 'active' : ''}">Patients</a>`
         : `<a href="analytics.html" class="nav-link ${activePage === 'analytics' ? 'active' : ''}">Analytics</a>`}
       ${!isDoctor ? `<a href="test-results.html" class="nav-link ${activePage === 'test-results' ? 'active' : ''}">Test Results</a>` : ''}
       <a href="doctor-profile.html" class="nav-link ${activePage === 'doctors' ? 'active' : ''}">Doctors</a>
       <button class="btn btn-ghost btn-sm" onclick="Auth.logout()">Log Out</button>`
    : `<a href="login.html" class="nav-link ${activePage === 'login' ? 'active' : ''}">Log In</a>
       <a href="register.html" class="btn btn-primary btn-sm">Get Started</a>`;

  return `
    <nav class="navbar">
      <div class="nav-inner">
        <a href="index.html" class="nav-logo">
          <div class="nav-logo-icon">${_logoSVG}</div>
          MedAssist
        </a>
        <div class="nav-links" id="navLinks">
          <a href="index.html" class="nav-link ${activePage === 'home' ? 'active' : ''}">Home</a>
          ${navLinks}
        </div>
        <div class="nav-controls">
          <button class="theme-toggle" id="themeToggle" aria-label="Toggle dark mode">${_moonSVG}${_sunSVG}</button>
          <button class="nav-menu-toggle" id="menuToggle" aria-label="Toggle navigation menu">${_hamburgerSVG}</button>
        </div>
      </div>
    </nav>
  `;
}

function buildFooter() {
  return `
    <footer class="footer">
      <div class="container">
        <div class="footer-grid">
          <div class="footer-brand">
            <div class="footer-logo">
              <div class="footer-logo-icon">${_logoSVG}</div>
              MedAssist
            </div>
            <p class="footer-desc">Your personalized medical companion. Track your health, analyze symptoms, and manage your medical history — all in one place.</p>
          </div>
          <div>
            <h4 class="footer-heading">Features</h4>
            <ul class="footer-links">
              <li><a href="dashboard.html">Dashboard</a></li>
              <li><a href="analyzer.html">Symptom Analyzer</a></li>
              <li><a href="appointments.html">Book Appointment</a></li>
              <li><a href="analytics.html">Diabetes Analytics</a></li>
              <li><a href="dashboard.html#medical-records">Medical Records</a></li>
              <li><a href="dashboard.html#vitals">Vital Signs</a></li>
            </ul>
          </div>
          <div>
            <h4 class="footer-heading">Account</h4>
            <ul class="footer-links">
              <li><a href="login.html">Login</a></li>
              <li><a href="register.html">Register</a></li>
              <li><a href="dashboard.html#profile">Profile</a></li>
            </ul>
          </div>
          <div>
            <h4 class="footer-heading">Legal</h4>
            <ul class="footer-links">
              <li><a href="#">Privacy Policy</a></li>
              <li><a href="#">Terms of Service</a></li>
              <li><a href="#">HIPAA Notice</a></li>
            </ul>
          </div>
        </div>
        <div class="footer-disclaimer">
          ⚠️ <strong>Medical Disclaimer:</strong> MedAssist is for informational purposes only and does NOT provide medical advice, diagnosis, or treatment. Always consult a qualified healthcare professional for medical concerns. In case of emergency, call 911 immediately.
        </div>
        <div class="footer-bottom">
          <p style="font-size:0.8rem">© ${new Date().getFullYear()} MedAssist. All rights reserved.</p>
          <p style="font-size:0.8rem">Built with ❤️ for better health management.</p>
        </div>
      </div>
    </footer>
  `;
}

// ── Theme Management ───────────────────────────────────────────
const Theme = {
  STORAGE_KEY: 'medassist_theme',
  apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(this.STORAGE_KEY, theme);
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
  },
  toggle() {
    const current = document.documentElement.getAttribute('data-theme');
    this.apply(current === 'dark' ? 'light' : 'dark');
  },
  init() {
    const saved = localStorage.getItem(this.STORAGE_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    this.apply(saved || (prefersDark ? 'dark' : 'light'));
  },
};

// Apply theme immediately to avoid flash of unstyled content
Theme.init();

// ── Mobile Nav toggle ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Wire up theme toggle button (injected by buildNavbar)
  const themeBtn = document.getElementById('themeToggle');
  if (themeBtn) themeBtn.addEventListener('click', () => Theme.toggle());

  // Mobile menu toggle
  const toggle = document.getElementById('menuToggle');
  const links = document.getElementById('navLinks');
  if (toggle && links) {
    toggle.addEventListener('click', () => links.classList.toggle('open'));
    document.addEventListener('click', (e) => {
      if (!toggle.contains(e.target) && !links.contains(e.target)) {
        links.classList.remove('open');
      }
    });
  }
});
