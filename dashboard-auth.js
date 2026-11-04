(() => {
  const token = localStorage.getItem('academic-tracker-token');
  if (!token) { window.location.replace('login.html'); return; }
  let cachedUser = null;
  try {
    cachedUser = JSON.parse(localStorage.getItem('academic-tracker-user') || 'null');
    const title = document.getElementById('page-title');
    if (title && cachedUser?.name) title.textContent = 'Welcome, ' + cachedUser.name.split(/\s+/)[0];
  } catch {}
  // The secondary dashboard must never become the destination for a university account.
  if (String(cachedUser?.educationTrack || '').toUpperCase() === 'HIGHER') {
    window.location.replace('university-dashboard.html');
    return;
  }
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
      if (String(data.user.educationTrack || '').toUpperCase() === 'HIGHER') {
        window.location.replace('university-dashboard.html');
        return;
      }
      applyRole(data.user);
    }
  }).catch(() => {});
  document.getElementById('logout-button')?.addEventListener('click', () => {
    localStorage.removeItem('academic-tracker-token');
    localStorage.removeItem('academic-tracker-user');
    window.location.replace('index.html');
  });
})();
