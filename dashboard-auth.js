(() => {
  const token = localStorage.getItem('academic-tracker-token');
  if (!token) { window.location.replace('login.html'); return; }
  try {
    const user = JSON.parse(localStorage.getItem('academic-tracker-user') || 'null');
    const title = document.getElementById('page-title');
    if (title && user?.name) title.textContent = 'Welcome, ' + user.name.split(/\s+/)[0];
  } catch {}
  const supportLink = document.getElementById('support-link');
  if (supportLink) {
    supportLink.href = user?.isAdmin ? 'admin-support.html' : 'support.html';
    supportLink.textContent = user?.isAdmin ? 'Admin messages' : 'Messages';
  }
  fetch((window.AT_API_BASE || 'https://academic-tracker-0b2q.onrender.com').replace(/\\/$/, '') + '/api/auth/me', {
    headers: { Authorization: 'Bearer ' + token }
  }).then(response => response.ok ? response.json() : null).then(data => {
    if (supportLink && data?.user) {
      supportLink.href = data.user.isAdmin ? 'admin-support.html' : 'support.html';
      supportLink.textContent = data.user.isAdmin ? 'Admin messages' : 'Messages';
    }
  }).catch(() => {});
  document.getElementById('logout-button')?.addEventListener('click', () => {
    localStorage.removeItem('academic-tracker-token');
    localStorage.removeItem('academic-tracker-user');
    window.location.replace('index.html');
  });
})();