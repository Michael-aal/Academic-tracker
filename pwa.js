(() => {
  "use strict";
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(error => {
      console.warn("Academic Tracker offline support could not start.", error);
    });
  });

  let installPrompt = null;
  const installButton = document.createElement("button");
  installButton.type = "button";
  installButton.textContent = "Install app";
  installButton.setAttribute("aria-label", "Install Academic Tracker app");
  installButton.style.cssText = "position:fixed;z-index:1000;right:16px;bottom:calc(18px + env(safe-area-inset-bottom));display:none;border:1px solid #4a7659;border-radius:999px;padding:12px 16px;background:#a4edbf;color:#102017;font:700 13px system-ui,sans-serif;box-shadow:0 8px 28px #0005;cursor:pointer";
  document.body.appendChild(installButton);

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event;
    installButton.style.display = "block";
  });

  installButton.addEventListener("click", async () => {
    if (!installPrompt) return;
    installButton.disabled = true;
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
    } catch (error) {
      console.warn("The install prompt could not be completed.", error);
    } finally {
      installPrompt = null;
      installButton.disabled = false;
      installButton.style.display = "none";
    }
  });

  window.addEventListener("appinstalled", () => {
    installPrompt = null;
    installButton.style.display = "none";
  });
})();