(() => {
  const token = localStorage.getItem('academic-tracker-token');
  if (!token) { window.location.replace('login.html'); return; }
  try {
    const user = JSON.parse(localStorage.getItem('academic-tracker-user') || 'null');
    const title = document.getElementById('page-title');
    if (title && user?.name) title.textContent = 'Welcome, ' + user.name.split(/\s+/)[0];
  } catch {}
  document.getElementById('logout-button')?.addEventListener('click', () => {
    localStorage.removeItem('academic-tracker-token');
    localStorage.removeItem('academic-tracker-user');
    window.location.replace('index.html');
  });
})();