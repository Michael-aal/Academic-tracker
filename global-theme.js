/* Academic Tracker theme controller: isolated light tokens, persistent user choice. */
(() => {
  "use strict";
  if (window.__academicTrackerThemeReady) return;
  window.__academicTrackerThemeReady = true;

  const root = document.documentElement;
  const storageKey = "academic-tracker-theme";
  const media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;
  let savedTheme = null;
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === "light" || stored === "dark") savedTheme = stored;
  } catch (_) {}

  let theme = savedTheme || (media && media.matches ? "light" : "dark");
  const sun = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>';
  const moon = '<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"/>';

  function syncButtons() {
    document.querySelectorAll("#at-theme-toggle").forEach((button) => {
      button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (theme === "dark" ? sun : moon) + "</svg>";
      const label = "Switch to " + (theme === "dark" ? "light" : "dark") + " mode";
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
      button.setAttribute("aria-pressed", String(theme === "light"));
    });
  }

  function apply(next, persist) {
    theme = next === "light" ? "light" : "dark";
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    if (persist) {
      savedTheme = theme;
      try { localStorage.setItem(storageKey, theme); } catch (_) {}
    }
    syncButtons();
  }

  function makeToggle(kind) {
    const button = document.createElement("button");
    button.id = "at-theme-toggle";
    button.type = "button";
    button.className = kind === "app" ? "at-nav-icon-button at-theme-toggle" : "at-theme-toggle at-theme-toggle-" + kind;
    button.setAttribute("aria-label", "Switch theme");
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"></svg>';
    button.addEventListener("click", () => apply(theme === "dark" ? "light" : "dark", true));
    return button;
  }

  function ensureStylesheet() {
    if (document.querySelector('link[data-global-light-mode]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "global-light-mode.css";
    link.dataset.globalLightMode = "true";
    document.head.appendChild(link);
  }

  function mountToggle() {
    const appActions = document.querySelector(".at-nav-actions");
    if (appActions && !appActions.querySelector("#at-theme-toggle")) {
      appActions.insertBefore(makeToggle("app"), appActions.firstChild);
    }

    const siteHeader = document.querySelector(".site-header");
    if (siteHeader && !siteHeader.querySelector("#at-theme-toggle")) {
      const menuToggle = siteHeader.querySelector(".menu-toggle");
      siteHeader.insertBefore(makeToggle("landing"), menuToggle || siteHeader.lastElementChild);
    }

    const authPage = document.body && document.body.matches('[data-mode="login"], [data-mode="register"]');
    if (authPage && !document.querySelector("#at-theme-toggle")) {
      document.body.appendChild(makeToggle("auth"));
    }
    syncButtons();
  }

  ensureStylesheet();
  apply(theme, false);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountToggle, { once: true });
  } else {
    mountToggle();
  }

  const observer = new MutationObserver(() => {
    if (!document.querySelector("#at-theme-toggle") ||
        (document.querySelector(".at-nav-actions") && !document.querySelector(".at-nav-actions #at-theme-toggle"))) {
      mountToggle();
    }
  });
  if (document.body) observer.observe(document.body, { childList: true, subtree: true });

  if (media && typeof media.addEventListener === "function") {
    media.addEventListener("change", (event) => {
      if (!savedTheme) apply(event.matches ? "light" : "dark", false);
    });
  }
  window.addEventListener("storage", (event) => {
    if (event.key === storageKey && (event.newValue === "light" || event.newValue === "dark")) {
      savedTheme = event.newValue;
      apply(savedTheme, false);
    }
  });
})();