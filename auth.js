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
  const cachedSession = () => {
    try {
      const token = localStorage.getItem('academic-tracker-token') || '';
      const user = JSON.parse(localStorage.getItem('academic-tracker-user') || 'null');
      const payloadPart = token.split('.')[1];
      if (!payloadPart || !user?.id) return null;
      const payload = JSON.parse(atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/')));
      if (!Number.isFinite(payload.exp) || payload.exp * 1000 <= Date.now()) return null;
      return { token, user };
    } catch { return null; }
  };
  const offlineDestination = user => user.isAdmin ? 'admin-support.html' : user.educationTrack === 'HIGHER' ? 'university-dashboard.html' : 'dashboard.html';
  let offlineButton = document.getElementById('offline-login-button');
  if (!offlineButton) {
    offlineButton = document.createElement('button');
    offlineButton.type = 'button';
    offlineButton.id = 'offline-login-button';
    offlineButton.className = submit.className;
    offlineButton.textContent = 'Continue with saved session';
    offlineButton.hidden = true;
    submit.insertAdjacentElement('afterend', offlineButton);
  }
  const setOfflineOptionVisible = visible => {
    offlineButton.hidden = !visible;
    offlineButton.style.display = visible ? '' : 'none';
  };
  const refreshOfflineOption = () => {
    setOfflineOptionVisible(mode === 'login' && !navigator.onLine && Boolean(cachedSession()));
  };
  offlineButton.addEventListener('click', () => {
    const session = cachedSession();
    if (!session) {
      showMessage(errorBox, 'Your saved session is missing or expired. Connect to the internet to log in again.');
      refreshOfflineOption();
      return;
    }
    showMessage(successBox, 'Opening your saved study space. Some features will need an internet connection.');
    window.location.replace(offlineDestination(session.user));
  });
  window.addEventListener('online', refreshOfflineOption);
  window.addEventListener('offline', refreshOfflineOption);
  refreshOfflineOption();
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
  form.addEventListener('submit', async event => {
    event.preventDefault(); errorBox.classList.remove('show'); successBox.classList.remove('show');
    const name = document.getElementById('name')?.value.trim();
    const email = document.getElementById('email').value.trim().toLowerCase();
    const pass = password.value;
    const higher = mode === 'register' && selectedTrack() === 'HIGHER';
    if (mode === 'register' && pass !== confirm.value) return showMessage(errorBox, 'Your passwords do not match.');
    if (pass.length < 10) return showMessage(errorBox, 'Use at least 10 characters for your password.');
    if (higher && (!institutionName.value.trim() || !programme.value.trim() || !studyLevel.value)) return showMessage(errorBox, 'Enter your institution, programme, and current level.');
    const body = mode === 'register' ? { name, email, password: pass, educationTrack: selectedTrack(), institutionName: institutionName?.value.trim(), programme: programme?.value.trim(), studyLevel: studyLevel?.value } : { email, password: pass };
    submit.disabled = true; submit.textContent = mode === 'register' ? 'Creating your account…' : 'Signing you in…';
    try {
      if (!navigator.onLine && mode === 'login') {
        const session = cachedSession();
        if (session) { window.location.replace(offlineDestination(session.user)); return; }
        throw new Error('You are offline. Connect to the internet for your first login or to restore an expired session.');
      }
      const response = await fetch(API_BASE + '/api/auth/' + (mode === 'register' ? 'register' : 'login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'We could not complete that request. Please try again.');
      if (!data.token || !data.user) throw new Error('The server response was incomplete. Please try again.');
      localStorage.setItem('academic-tracker-token', data.token);
      localStorage.setItem('academic-tracker-user', JSON.stringify(data.user));
      showMessage(successBox, mode === 'register' ? 'Account created. Opening your study space…' : 'Welcome back. Opening your study space…');
      const destination = data.user.isAdmin ? 'admin-support.html' : data.user.educationTrack === 'HIGHER' ? 'university-dashboard.html' : 'dashboard.html';
      window.location.replace(destination);
    } catch (error) {
      const message = error instanceof TypeError ? 'Could not reach the API. Check your connection and confirm the Render API allows this website in its CORS settings.' : error.message;
      showMessage(errorBox, message);
      if (mode === 'login' && cachedSession()) { setOfflineOptionVisible(true); offlineButton.textContent = navigator.onLine ? 'Continue with saved session' : 'Continue with saved session (offline)'; }
    } finally { submit.disabled = false; submit.textContent = mode === 'register' ? 'Create my account →' : 'Log in to my tracker →'; }
  });
})();