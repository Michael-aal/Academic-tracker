(() => {
  const API_BASE = (window.AT_API_BASE || 'https://academic-tracker-0b2q.onrender.com').replace(/\/$/, '');
  const form = document.getElementById('auth-form');
  if (!form) return;
  const mode = document.body.dataset.mode;
  const errorBox = document.getElementById('form-error');
  const successBox = document.getElementById('form-success');
  const submit = document.getElementById('submit-button');
  const password = document.getElementById('password');
  const toggle = document.getElementById('toggle-password');
  const confirm = document.getElementById('confirm-password');
  const trackInputs = [...document.querySelectorAll('input[name="educationTrack"]')];
  const higherFields = document.getElementById('higher-fields');
  const institutionName = document.getElementById('institution-name');
  const programme = document.getElementById('programme');
  const studyLevel = document.getElementById('study-level');
  const showMessage = (box, message) => { errorBox.classList.remove('show'); successBox.classList.remove('show'); box.textContent = message; box.classList.add('show'); };
  const selectedTrack = () => trackInputs.find(input => input.checked)?.value || 'SECONDARY';
  const syncTrackFields = () => {
    const higher = selectedTrack() === 'HIGHER';
    if (higherFields) higherFields.hidden = !higher;
    [institutionName, programme, studyLevel].forEach(input => { if (input) input.required = higher; });
  };
  trackInputs.forEach(input => input.addEventListener('change', syncTrackFields));
  syncTrackFields();
  toggle?.addEventListener('click', () => {
    const visible = password.type === 'password'; password.type = visible ? 'text' : 'password';
    if (confirm) confirm.type = visible ? 'text' : 'password';
    toggle.textContent = visible ? 'Hide' : 'Show';
  });
  const adminToggle = document.getElementById('admin-setup-toggle');
  const adminFields = document.getElementById('admin-setup-fields');
  const adminSecret = document.getElementById('admin-setup-secret');
  const adminSetupSection = document.querySelector('.admin-setup-option');
  if (mode === 'register' && adminSetupSection) {
    // Keep the privileged option hidden unless the API confirms setup is open.
    adminSetupSection.hidden = true;
    fetch(API_BASE + '/api/auth/admin/bootstrap-status', {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      cache: 'no-store'
    }).then(async response => {
      if (!response.ok) return;
      const status = await response.json().catch(() => ({}));
      if (status.available === true) adminSetupSection.hidden = false;
    }).catch(() => {
      // Fail closed: normal registration remains available if status cannot be checked.
    });
  }
  adminToggle?.addEventListener('change', () => {
    if (adminFields) adminFields.hidden = !adminToggle.checked;
    if (adminSecret) adminSecret.required = adminToggle.checked;
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); errorBox.classList.remove('show'); successBox.classList.remove('show');
    const name = document.getElementById('name')?.value.trim();
    const email = document.getElementById('email').value.trim().toLowerCase();
    const pass = password.value;
    const adminSetup = mode === 'register' && adminToggle?.checked === true;
    const higher = mode === 'register' && selectedTrack() === 'HIGHER';
    if (mode === 'register' && pass !== confirm.value) return showMessage(errorBox, 'Your passwords do not match.');
    if (mode === 'register' && pass.length < 10) return showMessage(errorBox, 'Use at least 10 characters for your password.');
    if (higher && (!institutionName.value.trim() || !programme.value.trim() || !studyLevel.value)) return showMessage(errorBox, 'Enter your institution, programme, and current level.');
    if (adminSetup && (!adminSecret?.value || adminSecret.value.length < 32)) return showMessage(errorBox, 'Enter the administrator setup secret configured on the API server.');
    const body = mode === 'register' ? { name, email, password: pass, educationTrack: selectedTrack(), institutionName: institutionName?.value.trim(), programme: programme?.value.trim(), studyLevel: studyLevel?.value } : { email, password: pass };
    submit.disabled = true; submit.textContent = adminSetup ? 'Verifying one-time setup…' : mode === 'register' ? 'Creating your account…' : 'Signing you in…';
    try {
      let response;
      let data;
      if (adminSetup) {
        response = await fetch(API_BASE + '/api/auth/admin/bootstrap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Bootstrap-Secret': adminSecret.value },
          body: JSON.stringify({ email, password: pass })
        });
        data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok || !data.user) throw new Error(data.error || 'Administrator setup could not be completed.');
        // Exchange the one-time setup for an ordinary signed-in session.
        response = await fetch(API_BASE + '/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: pass })
        });
        data = await response.json().catch(() => ({}));
      } else {
        response = await fetch(API_BASE + '/api/auth/' + (mode === 'register' ? 'register' : 'login'), {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        data = await response.json().catch(() => ({}));
      }
      if (!response.ok) throw new Error(data.error || (adminSetup ? 'Administrator was set up, but sign-in could not be completed.' : 'We could not complete that request. Please try again.'));
      if (!data.token || !data.user) throw new Error('The server response was incomplete. Please try again.');
      localStorage.setItem('academic-tracker-token', data.token);
      localStorage.setItem('academic-tracker-user', JSON.stringify(data.user));
      password.value = '';
      if (confirm) confirm.value = '';
      if (adminSecret) adminSecret.value = '';
      showMessage(successBox, adminSetup ? 'Administrator created. Opening the admin dashboard…' : mode === 'register' ? 'Account created. Opening your study space…' : 'Welcome back. Opening your study space…');
      const role = String(data.user.role || '').trim().toUpperCase();
      const isAdmin = ['ADMIN', 'DEVELOPER', 'DEV'].includes(role) || data.user.isAdmin === true;
      const destination = isAdmin
        ? 'admin-dashboard.html'
        : String(data.user.educationTrack || 'SECONDARY').toUpperCase() === 'HIGHER'
          ? 'university-dashboard.html'
          : 'dashboard.html';
      window.location.replace(destination);
    } catch (error) {
      const message = error instanceof TypeError ? 'Could not reach the API. Check your connection and confirm the Render API allows this website in its CORS settings.' : error.message;
      showMessage(errorBox, message);
    } finally {
      submit.disabled = false;
      submit.textContent = mode === 'register' ? 'Create my account →' : 'Log in to my tracker →';
    }
  });
})();