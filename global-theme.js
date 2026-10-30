/* Shared Academic Tracker theme preference. Every page reads and writes the same saved choice. */
(() => {
  "use strict";
  const root = document.documentElement;
  /* Loaded centrally so every route receives the same dark-surface corrections. */
  if (!document.querySelector('link[data-dark-mode-guard]')) {
    const guard = document.createElement("link");
    guard.rel = "stylesheet";
    guard.href = "dark-mode-guard.css";
    guard.dataset.darkModeGuard = "true";
    document.head.appendChild(guard);
  }
  if (!document.querySelector('link[data-vibrant-refresh]')) {
    const refresh = document.createElement("link");
    refresh.rel = "stylesheet";
    refresh.href = "vibrant-refresh.css";
    refresh.dataset.vibrantRefresh = "true";
    document.head.appendChild(refresh);
  }
  const storageKey = "academic-tracker-theme";
  const apiBase = (window.AT_API_BASE || "https://academic-tracker-0b2q.onrender.com").replace(/\/$/, "");
  // Capture the browser install event early, before the install UI script loads.
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    window.__AT_DEFERRED_INSTALL_PROMPT = event;
  });

  // Make the install manifest and install experience available on every page.
  if (!document.querySelector('link[rel="manifest"]')) {
    const manifestLink = document.createElement("link");
    manifestLink.rel = "manifest";
    manifestLink.href = "./manifest.webmanifest";
    document.head.appendChild(manifestLink);
  }
  if (!document.querySelector('link[data-pwa-install-styles]')) {
    const installStyles = document.createElement("link");
    installStyles.rel = "stylesheet";
    installStyles.href = "./pwa-install.css";
    installStyles.dataset.pwaInstallStyles = "true";
    document.head.appendChild(installStyles);
  }
  if (!document.querySelector('script[data-pwa-install]')) {
    const installScript = document.createElement("script");
    installScript.src = "./pwa-install.js";
    installScript.dataset.pwaInstall = "true";
    document.head.appendChild(installScript);
  }
  const token = localStorage.getItem("academic-tracker-token") || "";
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const icons = {
    moon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"/></svg>',
    sun: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>'
  };
  let toggle = document.getElementById("at-theme-toggle");

  function ensureToggle() {
    if (toggle) return;
    toggle = document.createElement("button");
    toggle.id = "at-theme-toggle";
    toggle.type = "button";
    toggle.className = "at-theme-toggle at-theme-toggle-global";
    toggle.setAttribute("aria-label", "Switch to dark mode");
    toggle.setAttribute("title", "Switch to dark mode");
    toggle.innerHTML = icons.moon;
    const actions = document.querySelector(".at-nav-actions");
    if (actions) actions.appendChild(toggle);
    else (document.body || document.documentElement).appendChild(toggle);
  }

  function applyTheme(theme, persist = false) {
    const next = theme === "dark" ? "dark" : "light";
    root.dataset.theme = next;
    root.style.colorScheme = next;
    if (themeColor) themeColor.setAttribute("content", next === "dark" ? "#0b0812" : "#ffffff");
    if (toggle) {
      const dark = next === "dark";
      toggle.innerHTML = dark ? icons.sun : icons.moon;
      toggle.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      toggle.setAttribute("title", dark ? "Switch to light mode" : "Switch to dark mode");
      toggle.setAttribute("aria-pressed", String(dark));
    }
    if (persist) {
      try { localStorage.setItem(storageKey, next); } catch (_) {}
      if (token) fetch(apiBase + "/api/user-data/preferences/main", { method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ data: { theme: next, updatedAt: new Date().toISOString() } }) }).catch(error => console.warn("Could not sync theme preference", error));
    }
  }

  let preferredTheme = "light";
  try { preferredTheme = localStorage.getItem(storageKey) === "dark" ? "dark" : "light"; } catch (_) {}
  applyTheme(preferredTheme);

  if (!toggle) ensureToggle();
  applyTheme(preferredTheme);
  if (toggle && toggle.dataset.themeToggleBound !== "true") {
    toggle.dataset.themeToggleBound = "true";
    toggle.addEventListener("click", () => {
      applyTheme(root.dataset.theme === "dark" ? "light" : "dark", true);
    });
  }
  if (token) {
    fetch(apiBase + "/api/user-data/preferences", { headers: { Authorization: "Bearer " + token } })
      .then(response => response.ok ? response.json() : Promise.reject(new Error("Could not load account preferences.")))
      .then(result => {
        const saved = result.records?.find(record => record.recordId === "main")?.data;
        if (saved?.theme === "light" || saved?.theme === "dark") {
          applyTheme(saved.theme);
          try { localStorage.setItem(storageKey, saved.theme); } catch (_) {}
        } else {
          fetch(apiBase + "/api/user-data/preferences/main", { method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ data: { theme: preferredTheme } }) }).catch(error => console.warn("Could not initialize account theme", error));
        }
      })
      .catch(error => console.warn("Could not load account theme preference", error));
  }
})();