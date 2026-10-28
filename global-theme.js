/* Academic Tracker: enforce the requested purple-and-white light theme. */
(() => {
  "use strict";
  const root = document.documentElement;
  root.dataset.theme = "light";
  root.style.colorScheme = "light";
  try { localStorage.setItem("academic-tracker-theme", "light"); } catch (_) {}

  function ensureLightStyles() {
    if (!document.querySelector('link[href$="global-light-mode.css"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "global-light-mode.css";
      link.dataset.globalLightMode = "true";
      document.head.appendChild(link);
    }
    document.querySelectorAll("#at-theme-toggle").forEach((button) => button.remove());
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute("content", "#ffffff");
  }

  ensureLightStyles();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureLightStyles, { once: true });
  }
})();