(() => {
  "use strict";
  const API = (window.AT_API_BASE || "https://academic-tracker-0b2q.onrender.com").replace(/\/+$/, "");
  const token = () => localStorage.getItem("academic-tracker-token") || "";
  const status = message => {
    const node = document.getElementById("focus-push-status");
    if (node) node.textContent = message;
  };
  async function request(path, options = {}) {
    const response = await fetch(API + path, {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token(), ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not configure notifications.");
    return data;
  }
  function decodeKey(value) {
    const padded = value + "=".repeat((4 - value.length % 4) % 4);
    const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(raw, character => character.charCodeAt(0));
  }
  async function enable() {
    if (!token()) throw new Error("Sign in to enable account notifications.");
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      throw new Error("This browser does not support background push notifications. You can still use the in-app timer.");
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("Notification permission was not granted. Enable it in your browser settings.");
    const registration = await navigator.serviceWorker.ready;
    const { publicKey } = await request("/api/push/public-key");
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(publicKey) });
    await request("/api/push/subscribe", { method: "POST", body: JSON.stringify({ subscription: subscription.toJSON() }) });
    status("Notifications are enabled. We'll alert you in Academic Tracker and send a device notification when your focus session ends.");
  }
  function showInApp(session) {
    const subject = String(session?.task || "Your study session").slice(0, 100);
    let toast = document.getElementById("at-focus-complete-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "at-focus-complete-toast";
      toast.className = "at-focus-complete-toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }
    toast.textContent = "Study session completed — " + subject + ". Take a moment to review what you learned.";
    toast.hidden = false;
    if ("Notification" in window && Notification.permission === "granted" && document.visibilityState === "visible") {
      navigator.serviceWorker?.ready.then(registration => registration.showNotification("Study session completed", {
        body: subject + " focus session is up.",
        tag: "focus-session-complete",
        icon: "assets/icon.svg"
      })).catch(() => {});
    }
  }
  document.addEventListener("click", event => {
    if (event.target.closest("#focus-enable-push")) {
      const button = event.target.closest("#focus-enable-push");
      button.disabled = true;
      enable().catch(error => status(error.message)).finally(() => { button.disabled = false; });
    }
  });
  window.ATFocusNotifications = { showInApp };
})();
