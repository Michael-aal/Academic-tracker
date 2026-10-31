(() => {
  "use strict";
  const API_BASE = (window.AT_API_BASE || "https://academic-tracker-0b2q.onrender.com").replace(/\/$/, "");
  const token = localStorage.getItem("academic-tracker-token") || "";
  const $ = id => document.getElementById(id);
  if (!token) { window.location.replace("login.html"); return; }
  const list = $("notification-list");
  const count = $("notification-count");
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const icons = { PAYMENT:"₦", SUBSCRIPTION:"✦", AI_CREDITS:"✧", MAINTENANCE:"⚙", UPDATE:"↗", ANNOUNCEMENT:"●" };
  let notifications = [];

  async function request(path, options = {}) {
    const response = await fetch(API_BASE + path, {
      ...options,
      headers: { "Content-Type":"application/json", Authorization:"Bearer " + token, ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      localStorage.removeItem("academic-tracker-token");
      localStorage.removeItem("academic-tracker-user");
      window.location.replace("login.html");
      throw new Error("Your session has expired.");
    }
    if (!response.ok) throw new Error(data.error || "Could not complete this notification action.");
    return data;
  }
  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"});
  }
  function render() {
    const unread = notifications.filter(item => !item.readAt).length;
    count.textContent = notifications.length + " notification" + (notifications.length === 1 ? "" : "s") + " · " + unread + " unread";
    $("mark-all-read").disabled = unread === 0;
    if (!notifications.length) {
      list.innerHTML = '<div class="notification-empty"><strong>You’re all caught up.</strong><p>Payment confirmations and important account updates will appear here.</p></div>';
      list.setAttribute("aria-busy","false");
      return;
    }
    list.innerHTML = notifications.map(item => {
      const unreadClass = item.readAt ? "" : " is-unread";
      return '<article class="notification-item' + unreadClass + '" data-id="' + esc(item.id) + '">' +
        '<div class="notification-item-icon" aria-hidden="true">' + esc(icons[item.category] || "●") + '</div>' +
        '<div><h3>' + esc(item.title) + '</h3><p>' + esc(item.body) + '</p><time datetime="' + esc(item.createdAt) + '">' + esc(formatDate(item.createdAt)) + '</time></div>' +
        '<div class="notification-item-actions">' + (item.readAt ? '<span aria-label="Read notification" title="Read">✓</span>' : '<span class="notification-unread-dot" aria-label="Unread"></span><button class="notification-read-button" type="button" data-mark-read="' + esc(item.id) + '">Mark read</button>') + '</div>' +
        '</article>';
    }).join("");
    list.setAttribute("aria-busy","false");
  }
  async function load() {
    list.setAttribute("aria-busy","true");
    try {
      const data = await request("/api/notifications?limit=100");
      notifications = Array.isArray(data.notifications) ? data.notifications : [];
      render();
      const target = new URLSearchParams(location.search).get("id");
      if (target) {
        const item = notifications.find(entry => entry.id === target);
        if (item && !item.readAt) await markRead(target);
        document.querySelector('[data-id="' + CSS.escape(target) + '"]')?.scrollIntoView({behavior:"smooth",block:"center"});
      }
    } catch (error) {
      list.innerHTML = '<div class="notification-empty">' + esc(error.message) + '</div>';
      list.setAttribute("aria-busy","false");
    }
  }
  async function markRead(id) {
    await request("/api/notifications/" + encodeURIComponent(id) + "/read", {method:"PATCH"});
    const item = notifications.find(entry => entry.id === id);
    if (item) item.readAt = new Date().toISOString();
    render();
    window.dispatchEvent(new CustomEvent("at-notifications-updated"));
  }
  list.addEventListener("click", async event => {
    const button = event.target.closest("[data-mark-read]");
    if (!button) return;
    button.disabled = true;
    try { await markRead(button.dataset.markRead); }
    catch (error) { button.disabled = false; window.alert(error.message); }
  });
  $("mark-all-read").addEventListener("click", async () => {
    const button = $("mark-all-read");
    button.disabled = true;
    try {
      await request("/api/notifications/read-all", {method:"POST"});
      notifications.forEach(item => { if (!item.readAt) item.readAt = new Date().toISOString(); });
      render();
      window.dispatchEvent(new CustomEvent("at-notifications-updated"));
    } catch (error) { button.disabled = false; window.alert(error.message); }
  });
  $("refresh-notifications").addEventListener("click", load);

  let account = {};
  try { account = JSON.parse(localStorage.getItem("academic-tracker-user") || "{}"); } catch {}
  if (account.role === "ADMIN" || account.isAdmin === true) {
    $("notification-admin").hidden = false;
    $("notification-compose-form").addEventListener("submit", async event => {
      event.preventDefault();
      const button = $("send-announcement");
      const status = $("announcement-status");
      button.disabled = true;
      button.textContent = "Publishing…";
      status.className = "notification-form-status";
      status.textContent = "Sending to student accounts…";
      try {
        const result = await request("/api/notifications/admin/send", {
          method:"POST",
          body:JSON.stringify({
            title:$("announcement-title").value.trim(),
            body:$("announcement-body").value.trim(),
            category:$("announcement-category").value,
            audience:$("announcement-audience").value
          })
        });
        status.className = "notification-form-status success";
        status.textContent = "Published successfully to " + result.sent + " account" + (result.sent === 1 ? "" : "s") + ".";
        $("notification-compose-form").reset();
        await load();
      } catch (error) {
        status.className = "notification-form-status error";
        status.textContent = error.message;
      } finally {
        button.disabled = false;
        button.textContent = "Publish notification";
      }
    });
  }
  load();
})();
