const CACHE_VERSION = "v2";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.map((name) => caches.delete(name)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(event.request)
      )
    );
    return;
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    const payload = event.data?.json();
    if (payload && typeof payload === "object" && !Array.isArray(payload)) data = payload;
  } catch {
    // Non-JSON push must not abort notification display.
  }
  const title = typeof data.title === "string" && data.title ? data.title : "Nestwork";
  const options = {
    body: typeof data.body === "string" ? data.body : "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: typeof data.tag === "string" ? data.tag : "nestwork-" + Date.now(),
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: safeNotificationUrl(data.url) },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

function safeNotificationUrl(value) {
  try {
    const url = new URL(typeof value === "string" ? value : "/", self.location.origin);
    if (url.origin === self.location.origin) return url.href;
  } catch {}
  return self.location.origin + "/";
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safeNotificationUrl(event.notification.data?.url);
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
