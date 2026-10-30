/* Installable PWA experience for Academic Tracker. */
(() => {
  "use strict";
  if (window.__AT_PWA_INSTALL_INITIALIZED) return;
  window.__AT_PWA_INSTALL_INITIALIZED = true;

  const DISMISS_KEY = "at-pwa-install-dismissed-until";
  const DISMISS_DAYS = 7;
  let deferredPrompt = window.__AT_DEFERRED_INSTALL_PROMPT || null;
  let banner = null;
  let instructions = null;

  const isInstalled = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  const wasRecentlyDismissed = () => {
    try {
      return Number(localStorage.getItem(DISMISS_KEY) || 0) > Date.now();
    } catch (_) {
      return false;
    }
  };

  const rememberDismissal = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 86400000));
    } catch (_) {}
  };

  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  function hideBanner() {
    if (banner) banner.remove();
    banner = null;
  }

  function showInstructions() {
    if (!banner || instructions) return;
    instructions = document.createElement("div");
    instructions.className = "at-install-instructions";
    const steps = isIOS()
      ? [
          "Open this page in Safari.",
          "Tap the Share button.",
          "Choose “Add to Home Screen”, then tap “Add”."
        ]
      : [
          "Open your browser menu (⋮).",
          "Choose “Install app” or “Add to Home screen”.",
          "Confirm the installation."
        ];
    const heading = document.createElement("strong");
    heading.textContent = isIOS() ? "Install on iPhone or iPad" : "Install from your browser";
    const list = document.createElement("ol");
    steps.forEach(step => {
      const item = document.createElement("li");
      item.textContent = step;
      list.appendChild(item);
    });
    const close = document.createElement("button");
    close.type = "button";
    close.className = "at-install-help-close";
    close.textContent = "Got it";
    close.addEventListener("click", () => {
      instructions?.remove();
      instructions = null;
    });
    instructions.append(heading, list, close);
    banner.querySelector(".at-install-copy").appendChild(instructions);
  }

  function createBanner() {
    if (banner || isInstalled() || wasRecentlyDismissed()) return;
    banner = document.createElement("section");
    banner.className = "at-install-banner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Install Academic Tracker");
    banner.innerHTML = `
      <span class="at-install-mark" aria-hidden="true">A</span>
      <div class="at-install-copy">
        <strong>Install Academic Tracker</strong>
        <p>Get quicker access from your phone’s home screen.</p>
      </div>
      <div class="at-install-actions">
        <button type="button" class="at-install-primary">Install app</button>
        <button type="button" class="at-install-dismiss" aria-label="Not now">Not now</button>
      </div>`;
    document.body.appendChild(banner);

    banner.querySelector(".at-install-primary").addEventListener("click", async () => {
      if (!deferredPrompt) {
        showInstructions();
        return;
      }
      deferredPrompt.prompt();
      try {
        const choice = await deferredPrompt.userChoice;
        if (choice?.outcome === "accepted") hideBanner();
      } catch (error) {
        console.warn("The browser install prompt could not be completed.", error);
        showInstructions();
      }
      deferredPrompt = null;
    });

    banner.querySelector(".at-install-dismiss").addEventListener("click", () => {
      rememberDismissal();
      hideBanner();
    });
  }

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredPrompt = event;
    window.__AT_DEFERRED_INSTALL_PROMPT = event;
    if (banner) {
      const button = banner.querySelector(".at-install-primary");
      if (button) button.textContent = "Install app";
    }
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    hideBanner();
    try { localStorage.removeItem(DISMISS_KEY); } catch (_) {}
  });

  if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js", { scope: "./" })
        .catch(error => console.warn("Academic Tracker offline support could not be registered.", error));
    }, { once: true });
  }

  if (!isInstalled() && !wasRecentlyDismissed()) {
    window.setTimeout(createBanner, 900);
  }
})();
