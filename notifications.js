(() => {
  "use strict";
  const API_BASE = (window.AT_API_BASE || "https://academic-tracker-0b2q.onrender.com").replace(/\/$/, "");
  const token = localStorage.getItem("academic-tracker-token") || "";
  const $ = id => document.getElementById(id);
  if (!token) { window.location.replace("login.html"); return; }

  const query = new URLSearchParams(location.search);
  const context = query.get("source") === "preproom" ? "preproom" : "tracker";
  const list = $("notification-list");
  const count = $("notification-count");
  const filterBar = document.querySelector(".preproom-notification-filters");
  const preproomNav = document.querySelector(".preproom-page-nav");
  const account = (() => { try { return JSON.parse(localStorage.getItem("academic-tracker-user") || "{}"); } catch { return {}; } })();
  const track = String(account.educationTrack || "").toUpperCase();
  const dashboardPath = ["HIGHER", "UNIVERSITY"].includes(track) ? "university-dashboard.html" : "dashboard.html";
  const icons = { SOCIAL:"✦", ACADEMIC:"▤", ANNOUNCEMENT:"●", UPDATE:"↗", MAINTENANCE:"⚙" };
  let notifications = [];
  let activeFilter = "all";

  const contextReturn = $("notification-context-return");
  const academicReturn = $("notification-academic-return");
  if (context === "preproom") {
    if (contextReturn) { contextReturn.href = "community.html"; contextReturn.textContent = "← Back to Preproom"; }
    if (academicReturn) { academicReturn.href = dashboardPath; academicReturn.hidden = false; }
    if (preproomNav) preproomNav.hidden = false;
    if (filterBar) filterBar.hidden = false;
    $("notification-admin").hidden = true;
  } else {
    if (contextReturn) { contextReturn.href = dashboardPath; contextReturn.textContent = "← Back to Academic Tracker"; }
    if (academicReturn) academicReturn.hidden = true;
    if (preproomNav) preproomNav.hidden = true;
    if (filterBar) filterBar.hidden = true;
  }

  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
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
  function destinationFor(item) {
    if (context !== "preproom") return dashboardPath;
    const metadata = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
    const type = String(metadata.type || "").toUpperCase();
    if (metadata.postId) return "community.html#post/" + encodeURIComponent(metadata.postId);
    if (type === "FRIEND_REQUEST") return "community.html#people";
    if (type === "FRIEND_ACCEPTED") return metadata.actorUsername
      ? "community.html#profile/" + encodeURIComponent(metadata.actorUsername)
      : "community.html#people";
    if (type.includes("MESSAGE") || metadata.conversationId || metadata.groupId) return "community.html#messages";
    if (metadata.actorUsername) return "community.html#profile/" + encodeURIComponent(metadata.actorUsername);
    return "community.html#feed";
  }
  function matchesFilter(item) {
    if (activeFilter === "all") return true;
    const type = String(item.metadata?.type || "").toUpperCase();
    if (activeFilter === "likes") return type === "POST_REACTION";
    if (activeFilter === "comments") return type === "POST_COMMENT";
    if (activeFilter === "shares") return type === "POST_SHARED";
    if (activeFilter === "friends") return ["FRIEND_REQUEST","FRIEND_ACCEPTED"].includes(type);
    if (activeFilter === "messages") return type.includes("MESSAGE") || Boolean(item.metadata?.conversationId);
    return true;
  }
  function render() {
    const unread = notifications.filter(item => !item.readAt).length;
    count.textContent = notifications.length + " notification" + (notifications.length === 1 ? "" : "s") + " · " + unread + " unread";
    $("mark-all-read").disabled = unread === 0;
    const visible = notifications.filter(matchesFilter);
    if (!visible.length) {
      const message = notifications.length
        ? "No notifications in this filter."
        : context === "preproom"
          ? "Friend requests, post activity and messages will appear here."
          : "Learning reminders, announcements and important account updates will appear here.";
      list.innerHTML = '<div class="notification-empty"><strong>You’re all caught up.</strong><p>' + esc(message) + '</p></div>';
      list.setAttribute("aria-busy","false");
      return;
    }
    list.innerHTML = visible.map(item => {
      const unreadClass = item.readAt ? "" : " is-unread";
      const href = destinationFor(item);
      return '<article class="notification-item' + unreadClass + '" data-id="' + esc(item.id) + '">' +
        '<a class="notification-item-main" data-open-notification="' + esc(item.id) + '" href="' + esc(href) + '">' +
          '<div class="notification-item-icon" aria-hidden="true">' + esc(icons[item.category] || "●") + '</div>' +
          '<div class="notification-item-copy"><h3>' + esc(item.title) + '</h3><p>' + esc(item.body) + '</p><time datetime="' + esc(item.createdAt) + '">' + esc(formatDate(item.createdAt)) + '</time></div>' +
        '</a>' +
        '<div class="notification-item-actions">' + (item.readAt ? '<span aria-label="Read notification" title="Read">✓</span>' : '<span class="notification-unread-dot" aria-label="Unread"></span><button class="notification-read-button" type="button" data-mark-read="' + esc(item.id) + '">Mark read</button>') + '</div>' +
        '</article>';
    }).join("");
    list.setAttribute("aria-busy","false");
  }
  async function load() {
    list.setAttribute("aria-busy","true");
    try {
      const data = await request("/api/notifications?limit=100&context=" + context);
      notifications = Array.isArray(data.notifications) ? data.notifications : [];
      render();
      const target = query.get("id");
      if (target) {
        const item = notifications.find(entry => entry.id === target);
        if (item && !item.readAt) await markRead(target);
        list.querySelector('[data-id="' + CSS.escape(target) + '"]')?.scrollIntoView({behavior:"smooth",block:"center"});
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
    if (button) {
      event.preventDefault(); event.stopPropagation(); button.disabled = true;
      try { await markRead(button.dataset.markRead); }
      catch (error) { button.disabled = false; window.alert(error.message); }
      return;
    }
    const link = event.target.closest("[data-open-notification]");
    if (!link) return;
    event.preventDefault();
    const item = notifications.find(entry => entry.id === link.dataset.openNotification);
    const destination = link.href;
    try { if (item && !item.readAt) await markRead(item.id); }
    catch (_) {}
    window.location.href = destination;
  });

  filterBar?.addEventListener("click", event => {
    const button = event.target.closest("[data-notification-filter]");
    if (!button) return;
    activeFilter = button.dataset.notificationFilter || "all";
    filterBar.querySelectorAll("[data-notification-filter]").forEach(item => {
      item.classList.toggle("active", item === button);
      item.setAttribute("aria-pressed", String(item === button));
    });
    render();
  });
  $("mark-all-read").addEventListener("click", async () => {
    const button = $("mark-all-read"); button.disabled = true;
    try {
      await request("/api/notifications/read-all", {method:"POST", body:JSON.stringify({context})});
      notifications.forEach(item => { if (!item.readAt) item.readAt = new Date().toISOString(); });
      render(); window.dispatchEvent(new CustomEvent("at-notifications-updated"));
    } catch (error) { button.disabled = false; window.alert(error.message); }
  });
  $("refresh-notifications").addEventListener("click", load);

  if (context === "tracker" && (account.role === "ADMIN" || account.isAdmin === true)) {
    $("notification-admin").hidden = false;
    $("notification-compose-form").addEventListener("submit", async event => {
      event.preventDefault();
      const button = $("send-announcement"), status = $("announcement-status");
      button.disabled = true; button.textContent = "Publishing…";
      status.className = "notification-form-status"; status.textContent = "Sending to student accounts…";
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
        $("notification-compose-form").reset(); await load();
      } catch (error) {
        status.className = "notification-form-status error"; status.textContent = error.message;
      } finally {
        button.disabled = false; button.textContent = "Publish notification";
      }
    });
  }
  load();
})();