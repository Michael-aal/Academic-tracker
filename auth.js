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
  const showMessage = (box, message) => { errorBox.classList.remove('show'); successBox.classList.remove('show'); box.textContent = message; box.classList.add('show'); };
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
    if (mode === 'register' && pass !== confirm.value) return showMessage(errorBox, 'Your passwords do not match.');
    if (pass.length < 10) return showMessage(errorBox, 'Use at least 10 characters for your password.');
    submit.disabled = true; submit.textContent = mode === 'register' ? 'Creating your account…' : 'Signing you in…';
    try {
      const response = await fetch(API_BASE + '/api/auth/' + (mode === 'register' ? 'register' : 'login'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'register' ? { name, email, password: pass } : { email, password: pass })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'We could not complete that request. Please try again.');
      if (!data.token || !data.user) throw new Error('The server response was incomplete. Please try again.');
      localStorage.setItem('academic-tracker-token', data.token);
      localStorage.setItem('academic-tracker-user', JSON.stringify(data.user));
      showMessage(successBox, mode === 'register' ? 'Account created. Opening your study space…' : 'Welcome back. Opening your study space…');
      window.location.replace('dashboard.html');
    } catch (error) {
      const message = error instanceof TypeError
        ? 'Could not reach the API. Check your connection and confirm the Render API allows this website in its CORS settings.'
        : error.message;
      showMessage(errorBox, message);
    } finally {
      submit.disabled = false; submit.textContent = mode === 'register' ? 'Create my account →' : 'Log in to my tracker →';
    }
  });
})();