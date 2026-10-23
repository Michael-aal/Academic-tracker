(() => {
  const API_BASE = (window.AT_API_BASE || "https://academic-tracker-0b2q.onrender.com").replace(/\/$/, "");
  const token = localStorage.getItem("academic-tracker-token");
  const mode = document.body.dataset.mode || "user";
  if (!token) { window.location.replace("login.html"); return; }
  const $ = (id) => document.getElementById(id);
  const list = $("message-list"), form = $("message-form"), input = $("message-input");
  const notice = $("notice"), sendButton = $("send-button");
  let me = null, currentConversationId = null, selectedUserId = null, pollHandle = null;
  let users = [];

  async function api(path, options = {}) {
    const response = await fetch(API_BASE + path, {
      ...options,
      headers: { Authorization: "Bearer " + token, ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) { localStorage.removeItem("academic-tracker-token"); localStorage.removeItem("academic-tracker-user"); window.location.replace("login.html"); throw new Error("Please sign in again."); }
    if (!response.ok) throw new Error(data.error || "Could not complete the request.");
    return data;
  }
  function showNotice(message, error = false) { notice.textContent = message || ""; notice.classList.toggle("error", error); }
  function dateLabel(value) {
    try { return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
    catch { return ""; }
  }
  function escapeInitial(value) { return (value || "?").trim().charAt(0).toUpperCase() || "?"; }

  function renderMessages(conversation) {
    list.replaceChildren();
    if (!conversation.messages.length) {
      const empty = document.createElement("p"); empty.className = "empty-state";
      empty.textContent = mode === "admin" ? "No messages yet. Send the first private message to this user." : "This is your private support conversation. Send a message whenever you need help.";
      list.append(empty); return;
    }
    conversation.messages.forEach((message) => {
      const wrap = document.createElement("article");
      const mine = message.senderId === me.id;
      wrap.className = "message " + (mine ? "mine" : "theirs");
      const meta = document.createElement("div"); meta.className = "message-meta";
      const senderName = message.sender?.name || (mine ? "You" : "Support");
      const sender = document.createElement("span"); sender.textContent = senderName;
      const date = document.createElement("time"); date.dateTime = message.createdAt; date.textContent = dateLabel(message.createdAt);
      meta.append(sender, date);
      const bubble = document.createElement("div"); bubble.className = "bubble"; bubble.textContent = message.body;
      wrap.append(meta, bubble); list.append(wrap);
    });
    list.scrollTop = list.scrollHeight;
  }

  function updateStatus(status) {
    const pill = $("status-pill");
    if (pill) { pill.textContent = (status || "OPEN").replace("_", " "); }
    const select = $("status-select");
    if (select && status) select.value = status;
  }

  async function loadConversation(id = currentConversationId) {
    if (!id) return;
    const data = await api("/api/support/conversations/" + encodeURIComponent(id));
    if (currentConversationId !== id) return;
    renderMessages(data.conversation);
    updateStatus(data.conversation.status);
  }

  async function loadUserConversation() {
    const data = await api("/api/support/conversation");
    currentConversationId = data.conversation.id;
    renderMessages(data.conversation);
    updateStatus(data.conversation.status);
    $("chat-subtitle").textContent = "Private messages · " + (data.conversation.status || "OPEN").replace("_", " ").toLowerCase();
  }

  function renderUserList() {
    const container = $("user-list"), query = ($("user-search").value || "").trim().toLowerCase();
    container.replaceChildren();
    const filtered = users.filter((user) => (user.name + " " + user.email).toLowerCase().includes(query));
    $("user-count").textContent = String(users.length);
    if (!filtered.length) {
      const empty = document.createElement("p"); empty.className = "empty-state"; empty.textContent = query ? "No users match that search." : "No user accounts yet."; container.append(empty); return;
    }
    filtered.forEach((user) => {
      const button = document.createElement("button"); button.type = "button";
      button.className = "user-item" + (selectedUserId === user.id ? " selected" : "");
      const avatar = document.createElement("span"); avatar.className = "user-avatar"; avatar.textContent = escapeInitial(user.name);
      const info = document.createElement("span"); info.className = "user-info";
      const name = document.createElement("strong"); name.textContent = user.name;
      const email = document.createElement("small"); email.textContent = user.email;
      const preview = document.createElement("span"); preview.className = "user-preview";
      preview.textContent = user.lastMessage?.body || (user.conversationId ? "Conversation started" : "No messages yet");
      info.append(name, email, preview); button.append(avatar, info);
      button.addEventListener("click", () => selectUser(user.id));
      container.append(button);
    });
  }

  async function loadUsers() {
    const data = await api("/api/admin/users");
    users = data.users || []; renderUserList();
  }

  async function selectUser(userId) {
    const user = users.find((item) => item.id === userId); if (!user) return;
    selectedUserId = userId; renderUserList(); showNotice("");
    try {
      let id = user.conversationId;
      if (!id) {
        const created = await api("/api/support/conversations", { method: "POST", body: JSON.stringify({ userId }) });
        id = created.conversationId; user.conversationId = id; user.status = "OPEN";
      }
      currentConversationId = id;
      $("chat-header").replaceChildren();
      const avatar = document.createElement("div"); avatar.className = "avatar"; avatar.textContent = escapeInitial(user.name);
      const person = document.createElement("div"); person.className = "chat-person";
      const name = document.createElement("strong"); name.textContent = user.name;
      const email = document.createElement("span"); email.textContent = user.email;
      person.append(name, email); $("chat-header").append(avatar, person);
      input.disabled = false; sendButton.disabled = false; $("status-select").disabled = false;
      await loadConversation(id);
      await loadUsers();
      renderUserList();
    } catch (error) { showNotice(error.message, true); }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const body = input.value.trim();
    if (!body || !currentConversationId) return;
    sendButton.disabled = true; showNotice("");
    try {
      await api("/api/support/conversations/" + encodeURIComponent(currentConversationId) + "/messages", {
        method: "POST", body: JSON.stringify({ body })
      });
      input.value = "";
      await loadConversation(currentConversationId);
      if (mode === "admin") { await loadUsers(); renderUserList(); }
    } catch (error) { showNotice(error.message, true); }
    finally { sendButton.disabled = mode === "admin" && !selectedUserId; }
  });

  $("status-select")?.addEventListener("change", async (event) => {
    if (!currentConversationId) return;
    try {
      await api("/api/support/conversations/" + encodeURIComponent(currentConversationId) + "/status", {
        method: "PATCH", body: JSON.stringify({ status: event.target.value })
      });
      showNotice("Conversation status updated.");
      await loadUsers(); renderUserList();
    } catch (error) { showNotice(error.message, true); }
  });
  $("user-search")?.addEventListener("input", renderUserList);
  $("refresh-button")?.addEventListener("click", async () => {
    try { await loadUsers(); if (currentConversationId) await loadConversation(currentConversationId); showNotice("Inbox refreshed."); }
    catch (error) { showNotice(error.message, true); }
  });

  async function init() {
    try {
      const meData = await api("/api/auth/me"); me = meData.user;
      if (mode === "admin") {
        if (!me.isAdmin) { window.location.replace("support.html"); return; }
        await loadUsers();
        pollHandle = window.setInterval(async () => {
          try { await loadUsers(); if (currentConversationId) await loadConversation(currentConversationId); }
          catch (error) { showNotice(error.message, true); }
        }, 15000);
      } else {
        if (me.isAdmin) { window.location.replace("admin-support.html"); return; }
        await loadUserConversation();
        pollHandle = window.setInterval(() => loadConversation().catch((error) => showNotice(error.message, true)), 15000);
      }
    } catch (error) { showNotice(error.message, true); }
  }
  window.addEventListener("beforeunload", () => { if (pollHandle) window.clearInterval(pollHandle); });
  init();
})();