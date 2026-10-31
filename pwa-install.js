/* Installable PWA experience for Academic Tracker. */
(() => {
  "use strict";
  if (window.__AT_PWA_INSTALL_INITIALIZED) return;
  window.__AT_PWA_INSTALL_INITIALIZED = true;

  const PROMPT_SEEN_KEY = "at-pwa-landing-prompt-seen-v1";
  let deferredPrompt = window.__AT_DEFERRED_INSTALL_PROMPT || null;
  let banner = null;
  let instructions = null;

  const isInstalled = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  const isLandingPage = () => {
    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    return path === "/" || path.endsWith("/index.html");
  };

  const hasSeenLandingPrompt = () => {
    try { return localStorage.getItem(PROMPT_SEEN_KEY) === "true"; }
    catch (_) { return false; }
  };

  const rememberLandingPromptChoice = () => {
    try { localStorage.setItem(PROMPT_SEEN_KEY, "true"); } catch (_) {}
  };

  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  function refreshInstallUI() {
    const installed = isInstalled();
    document.querySelectorAll("[data-at-install-app]").forEach(button => {
      button.hidden = installed;
      button.disabled = installed;
      button.setAttribute("aria-hidden", String(installed));
    });
  }

  function hideBanner() {
    if (banner) banner.remove();
    banner = null;
  }

  function hideInstructions() {
    if (instructions) instructions.remove();
    instructions = null;
  }

  function showInstructions() {
    if (instructions || isInstalled()) return;
    instructions = document.createElement("section");
    instructions.className = "at-install-help-panel";
    instructions.setAttribute("role", "dialog");
    instructions.setAttribute("aria-modal", "false");
    instructions.setAttribute("aria-label", "How to install Academic Tracker");

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
    close.addEventListener("click", hideInstructions);
    instructions.append(heading, list, close);
    document.body.appendChild(instructions);
    close.focus();
  }

  async function requestInstall() {
    if (isInstalled()) {
      refreshInstallUI();
      return;
    }
    const promptEvent = deferredPrompt || window.__AT_DEFERRED_INSTALL_PROMPT || null;
    if (!promptEvent) {
      showInstructions();
      return;
    }

    try {
      promptEvent.prompt();
      await promptEvent.userChoice;
    } catch (error) {
      console.warn("The browser install prompt could not be completed.", error);
      showInstructions();
    } finally {
      deferredPrompt = null;
      window.__AT_DEFERRED_INSTALL_PROMPT = null;
      refreshInstallUI();
    }
  }

  // The landing-page choice is permanent for this browser profile. Installation
  // remains available later from the authenticated app's workspace dropdown.
  function createBanner() {
    if (!isLandingPage() || banner || isInstalled() || hasSeenLandingPrompt()) return;
    banner = document.createElement("section");
    banner.className = "at-install-banner";
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", "Install Academic Tracker");
    banner.setAttribute("aria-live", "polite");
    banner.setAttribute("aria-atomic", "true");
    banner.innerHTML = `
      <span class="at-install-mark" aria-hidden="true">A</span>
      <div class="at-install-copy">
        <strong>Install Academic Tracker</strong>
        <p>Get quicker access from your phone’s home screen.</p>
      </div>
      <div class="at-install-actions">
        <button type="button" class="at-install-primary">Install Now</button>
        <button type="button" class="at-install-dismiss" aria-label="Not Now">Not Now</button>
      </div>`;
    document.body.appendChild(banner);

    banner.querySelector(".at-install-primary").addEventListener("click", async () => {
      rememberLandingPromptChoice();
      hideBanner();
      await requestInstall();
    });

    banner.querySelector(".at-install-dismiss").addEventListener("click", () => {
      rememberLandingPromptChoice();
      hideBanner();
    });
  }

  window.ATInstallApp = requestInstall;
  window.ATRefreshInstallUI = refreshInstallUI;

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredPrompt = event;
    window.__AT_DEFERRED_INSTALL_PROMPT = event;
    refreshInstallUI();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    window.__AT_DEFERRED_INSTALL_PROMPT = null;
    rememberLandingPromptChoice();
    hideBanner();
    hideInstructions();
    refreshInstallUI();
  });

  window.addEventListener("at-pwa-install-ready", refreshInstallUI);
  refreshInstallUI();

  if ("serviceWorker" in navigator && window.isSecureContext) {
    const registerWorker = () => {
      navigator.serviceWorker.register("./sw.js", { scope: "./" })
        .catch(error => console.warn("Academic Tracker offline support could not be registered.", error));
    };
    if (document.readyState === "complete") registerWorker();
    else window.addEventListener("load", registerWorker, { once: true });
  }

  if (isLandingPage() && !isInstalled() && !hasSeenLandingPrompt()) {
    window.setTimeout(createBanner, 900);
  }
})();
