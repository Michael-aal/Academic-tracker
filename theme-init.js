/* Synchronous pre-paint theme bootstrap. Keep this file loaded before page styles. */
(() => {
  "use strict";
  let theme = "light";
  try {
    theme = localStorage.getItem("academic-tracker-theme") === "dark" ? "dark" : "light";
  } catch (_) {
    /* Storage may be disabled; use the documented light default for this visit. */
  }
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  const ensureStylesheet = (attribute, href) => {
    if (document.querySelector(`link[${attribute}]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute(attribute, "true");
    document.head.appendChild(link);
  };
  ensureStylesheet("data-global-light-mode", "global-light-mode.css");
  ensureStylesheet("data-dark-mode-guard", "dark-mode-guard.css");
  const applyMeta = () => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#0b0812" : "#ffffff");
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyMeta, { once: true });
  } else {
    applyMeta();
  }
})();
