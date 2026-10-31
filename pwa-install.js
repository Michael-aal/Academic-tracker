/* One-time landing prompt + on-demand app installation for Academic Tracker. */
(() => {
  "use strict";
  if (window.__AT_PWA_INSTALL_INITIALIZED) return;
  window.__AT_PWA_INSTALL_INITIALIZED = true;

  const SEEN_KEY = "at-pwa-install-prompt-seen";
  let deferredPrompt = window.__AT_DEFERRED_INSTALL_PROMPT || null;
  let banner = null;
  let instructions = null;

  const isInstalled = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const promptWasSeen = () => {
    try { return localStorage.getItem(SEEN_KEY) === "true"; }
    catch (_) { return false; }
  };

  const rememberPromptSeen = () => {
    try { localStorage.setItem(SEEN_KEY, "true"); } catch (_) {}
  };

  function hideBanner() {
    banner?.remove();
    banner = null;
  }

  function closeInstructions() {
    instructions?.remove();
    instructions = null;
  }

  function showInstructions() {
    if (instructions) return;
    instructions = document.createElement("section");
    instructions.className = "at-install-instructions at-install-help-dialog";
    instructions.setAttribute("role", "dialog");
    instructions.setAttribute("aria-label", "Install Academic Tracker");
    const steps = isIOS()
      ? ["Open this page in Safari.", "Tap the Share button.", "Choose “Add to Home Screen”, then tap “Add”."]
      : ["Open your browser menu (⋮).", "Choose “Install app” or “Add to Home screen”.", "Confirm the installation."];
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
    close.addEventListener("click", closeInstructions);
    instructions.append(heading, list, close);
    document.body.appendChild(instructions);
  }

  async function installApp() {
    if (isInstalled()) {
      window.alert("Academic Tracker is already installed on this device.");
      return;
    }
    if (!deferredPrompt) {
      showInstructions();
      return;
    }
    const promptEvent = deferredPrompt;
    deferredPrompt = null;
    window.__AT_DEFERRED_INSTALL_PROMPT = null;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice?.outcome === "accepted") hideBanner();
      else showInstructions();
    } catch (error) {
      console.warn("The browser install prompt could not be completed.", error);
      showInstructions();
    }
  }

  window.ATInstallApp = installApp;

  function createBanner() {
    if (banner || isInstalled() || promptWasSeen()) return;
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
        <button type="button" class="at-install-primary">Install now</button>
        <button type="button" class="at-install-dismiss" aria-label="Not now">Not now</button>
      </div>`;
    document.body.appendChild(banner);

    banner.querySelector(".at-install-primary").addEventListener("click", () => {
      rememberPromptSeen();
      hideBanner();
      installApp();
    });
    banner.querySelector(".at-install-dismiss").addEventListener("click", () => {
      rememberPromptSeen();
      hideBanner();
    });
  }

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredPrompt = event;
    window.__AT_DEFERRED_INSTALL_PROMPT = event;
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    window.__AT_DEFERRED_INSTALL_PROMPT = null;
    hideBanner();
    closeInstructions();
  });

  const currentFile = location.pathname.split("/").pop() || "index.html";
  const isLandingPage = currentFile === "" || currentFile === "index.html";
  if (isLandingPage && !isInstalled() && !promptWasSeen()) {
    window.setTimeout(createBanner, 900);
  }

  if ("serviceWorker" in navigator && window.isSecureContext) {
    const registerWorker = () => {
      navigator.serviceWorker.register("./sw.js", { scope: "./" })
        .catch(error => console.warn("Academic Tracker offline support could not be registered.", error));
    };
    if (document.readyState === "complete") registerWorker();
    else window.addEventListener("load", registerWorker, { once: true });
  }
})();
