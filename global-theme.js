/* Academic Tracker theme preference.
   The landing page offers an explicit light/dark toggle; other routes retain the light default. */
(() => {
  "use strict";
  const root = document.documentElement;
  const toggle = document.getElementById("at-theme-toggle");
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const storageKey = "academic-tracker-theme";
  const icons = {
    moon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"/></svg>',
    sun: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>'
  };

  function ensureLightStyles() {
    if (!document.querySelector('link[href$="global-light-mode.css"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "global-light-mode.css";
      link.dataset.globalLightMode = "true";
      document.head.appendChild(link);
    }
  }

  function applyTheme(theme, persist = false) {
    const next = theme === "dark" ? "dark" : "light";
    root.dataset.theme = next;
    root.style.colorScheme = next;
    if (themeColor) themeColor.setAttribute("content", next === "dark" ? "#0B0812" : "#ffffff");
    if (toggle) {
      const dark = next === "dark";
      toggle.innerHTML = dark ? icons.sun : icons.moon;
      toggle.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
      toggle.setAttribute("title", dark ? "Switch to light mode" : "Switch to dark mode");
      toggle.setAttribute("aria-pressed", String(dark));
    }
    if (persist) {
      try { localStorage.setItem(storageKey, next); } catch (_) {}
    }
  }

  ensureLightStyles();
  let preferredTheme = "light";
  if (toggle) {
    try { preferredTheme = localStorage.getItem(storageKey) === "dark" ? "dark" : "light"; } catch (_) {}
    applyTheme(preferredTheme);
    if (toggle.dataset.themeToggleBound !== "true") {
      toggle.dataset.themeToggleBound = "true";
      toggle.addEventListener("click", () => {
        applyTheme(root.dataset.theme === "dark" ? "light" : "dark", true);
      });
    }
  } else {
    /* Keep non-landing routes on the established light default without overwriting
       the user's saved landing-page preference. */
    applyTheme("light");
  }
})();