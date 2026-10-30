(() => {
  "use strict";
  const token = localStorage.getItem('academic-tracker-token');
  let cachedUser = null;
  try { cachedUser = JSON.parse(localStorage.getItem('academic-tracker-user') || 'null'); } catch {}
  const decodeExpiry = value => {
    try {
      const part = value.split('.')[1];
      if (!part) return 0;
      const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
      return Number(payload.exp) || 0;
    } catch { return 0; }
  };
  const clearSession = () => {
    localStorage.removeItem('academic-tracker-token');
    localStorage.removeItem('academic-tracker-user');
  };
  if (!token || !cachedUser?.id || !decodeExpiry(token) || decodeExpiry(token) * 1000 <= Date.now()) {
    clearSession();
    window.location.replace('login.html');
    return;
  }

  const title = document.getElementById('page-title');
  if (title && cachedUser?.name) title.textContent = 'Welcome, ' + cachedUser.name.split(/\s+/)[0];
  const supportLink = document.getElementById('support-link');
  const applyRole = user => {
    if (!supportLink || !user) return;
    supportLink.href = user.isAdmin ? 'admin-support.html' : 'support.html';
    supportLink.textContent = user.isAdmin ? 'Admin messages' : 'Messages';
  };
  applyRole(cachedUser);

  let statusNotice = null;
  const showOfflineStatus = message => {
    if (!statusNotice) {
      statusNotice = document.createElement('p');
      statusNotice.className = 'notice at-connection-status';
      statusNotice.setAttribute('role', 'status');
      const app = document.getElementById('app');
      if (app) app.prepend(statusNotice);
      else document.body.prepend(statusNotice);
    }
    statusNotice.textContent = message;
  };
  const clearOfflineStatus = () => { statusNotice?.remove(); statusNotice = null; };

  let checking = false;
  const validateOnlineSession = async () => {
    if (checking || !navigator.onLine) return;
    checking = true;
    try {
      const response = await fetch((window.AT_API_BASE || 'https://academic-tracker-0b2q.onrender.com').replace(/\/$/, '') + '/api/auth/me', {
        headers: { Authorization: 'Bearer ' + token },
        cache: 'no-store'
      });
      if (response.status === 401 || response.status === 403) {
        clearSession();
        window.location.replace('login.html');
        return;
      }
      if (!response.ok) throw new Error('Account verification is temporarily unavailable.');
      const data = await response.json();
      if (!data?.user?.id || data.user.id !== cachedUser.id) {
        clearSession();
        window.location.replace('login.html');
        return;
      }
      localStorage.setItem('academic-tracker-user', JSON.stringify(data.user));
      cachedUser = data.user;
      applyRole(cachedUser);
      clearOfflineStatus();
    } catch (error) {
      showOfflineStatus('Your saved study space is open, but the account could not be verified right now. Changes will stay on this device until you reconnect. ' + error.message);
    } finally { checking = false; }
  };

  if (navigator.onLine) validateOnlineSession();
  else showOfflineStatus('You are offline. Your previously saved study space is available on this device. AI tools, payments and account changes need an internet connection.');
  window.addEventListener('online', validateOnlineSession);
  window.addEventListener('offline', () => showOfflineStatus('You are offline. Your previously saved study space is available on this device. AI tools, payments and account changes need an internet connection.'));

  document.getElementById('logout-button')?.addEventListener('click', async () => {
    try {
      if (navigator.onLine) await fetch((window.AT_API_BASE || 'https://academic-tracker-0b2q.onrender.com').replace(/\/$/, '') + '/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token }
      });
    } catch (error) { console.warn('Server logout could not be confirmed.', error); }
    finally {
      clearSession();
      window.location.replace('index.html');
    }
  });
})();