/* Register the shared service worker on pages that opt into PWA support. */
(() => {
  "use strict";
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(error => {
      console.warn("Offline caching unavailable on this page.", error);
    });
  }, { once: true });
})();
