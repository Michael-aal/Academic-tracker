(() => {
  const token = localStorage.getItem('academic-tracker-token');
  if (!token) { window.location.replace('login.html'); return; }
  let cachedUser = null;
  try {
    cachedUser = JSON.parse(localStorage.getItem('academic-tracker-user') || 'null');
    const title = document.getElementById('page-title');
    if (title && cachedUser?.name) title.textContent = 'Welcome, ' + cachedUser.name.split(/\s+/)[0];
  } catch {}
  const supportLink = document.getElementById('support-link');
  const applyRole = (user) => {
    if (!supportLink || !user) return;
    supportLink.href = user.isAdmin ? 'admin-support.html' : 'support.html';
    supportLink.textContent = user.isAdmin ? 'Admin messages' : 'Messages';
  };
  applyRole(cachedUser);
  fetch((window.AT_API_BASE || 'https://academic-tracker-0b2q.onrender.com').replace(/\/$/, '') + '/api/auth/me', {
    headers: { Authorization: 'Bearer ' + token }
  }).then(response => response.ok ? response.json() : null).then(data => {
    if (data?.user) {
      localStorage.setItem('academic-tracker-user', JSON.stringify(data.user));
      applyRole(data.user);
    }
  }).catch(() => {});
  document.getElementById('logout-button')?.addEventListener('click', async () => {
    // Revoke the server-side session before discarding the local bearer token.
    // Always clear local state, even when the API is temporarily unavailable.
    try {
      await fetch((window.AT_API_BASE || 'https://academic-tracker-0b2q.onrender.com').replace(/\\/$/, '') + '/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token }
      });
    } catch (error) {
      console.warn('Server logout could not be confirmed; clearing this device session.', error);
    } finally {
      localStorage.removeItem('academic-tracker-token');
      localStorage.removeItem('academic-tracker-user');
      window.location.replace('index.html');
    }
  });
})();
