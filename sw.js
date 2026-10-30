const CACHE_NAME = "academic-tracker-v8";
const APP_SHELL = [
  "./", "./index.html", "./landing.css", "./landing-menu-fix.css", "./landing.js",
  "./login.html", "./register.html", "./auth.css", "./auth.js",
  "./dashboard.html", "./dashboard-auth.js",
  "./styles.css", "./ui-polish.css", "./focus.css", "./app.js", "./focus-push.js", "./global-navigation.js", "./vibrant-refresh.css",
  "./manifest.webmanifest", "./assets/icon.svg"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request, { cache: "no-cache" })
      .then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        if (event.request.mode === "navigate") {
          const appShell = await caches.match("./index.html");
          if (appShell) return appShell;
        }
        return new Response("You are offline and this resource is not cached.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      })
  );
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil((async () => {
    const targetUrl = new URL(event.notification.data?.url || "./study-plan.html", self.location.origin).href;
    const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clientsList) {
      if ("focus" in client) {
        await client.focus();
        if ("navigate" in client) await client.navigate(targetUrl);
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
  })());
});


self.addEventListener("push", event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() || "Your study session is complete." }; }
  const title = typeof payload.title === "string" ? payload.title.slice(0, 80) : "Academic Tracker";
  const options = {
    body: typeof payload.body === "string" ? payload.body.slice(0, 220) : "Your focus session is complete.",
    tag: typeof payload.tag === "string" ? payload.tag.slice(0, 120) : "focus-session-complete",
    icon: "./assets/icon.svg",
    badge: "./assets/icon.svg",
    data: { url: "./dashboard.html?view=focus" },
    renotify: false
  };
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const visibleClients = windows.filter(client => client.visibilityState === "visible");
    if (visibleClients.length) {
      visibleClients.forEach(client => client.postMessage({ type: "focus-notification", title, body: options.body, tag: options.tag }));
      return;
    }
    await self.registration.showNotification(title, options);
  })());
});
