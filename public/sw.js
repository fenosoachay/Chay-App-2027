/* Service worker CHAY — notifications push navigateur.
   Reçoit les pushes envoyés par la fonction backend sendWebPush, les affiche
   en notification système et, au clic, ouvre l'application sur la bonne page.

   Le service worker ne peut pas importer de modules : le mapping de routes
   ci-dessous complète (et doit rester aligné avec) la navigation de l'app. */

function routeFor(data) {
  if (data.target_type === "message" && data.target_id) {
    return "/messages?c=" + encodeURIComponent(data.target_id);
  }
  if (data.target_type === "content") return "/media";
  if (data.target_type === "community") return "/community";
  // daily_verse, annonce, défaut → accueil
  return "/";
}

self.addEventListener("push", (event) => {
  let data = {};
  const raw = event.data ? event.data.text() : "";
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { body: raw };
  }
  const title = data.title || "ÉGLISE CHAY";
  const url = typeof data.url === "string" && data.url.charAt(0) === "/"
    ? data.url
    : routeFor(data);
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      data: { url },
      tag: data.tag,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const url = typeof data.url === "string" && data.url.charAt(0) === "/"
    ? data.url
    : "/";
  event.waitUntil(
    (async () => {
      // Une fenêtre de l'app est déjà ouverte : on la focalise et on la fait
      // naviguer (message écouté par l'app côté Layout).
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const w of windows) {
        if (typeof w.focus === "function") {
          w.postMessage({ type: "chay-notification-click", url });
          return w.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })()
  );
});

/* ── Fonctionnement hors ligne de la Bible ───────────────────────────────────
   Les fichiers de données (textes FR/MG + index de concordance) sont
   préchargés à l'installation puis servis depuis le cache, avec le réseau en
   renfort uniquement s'ils manquent. Incrémenter DATA_CACHE quand un de ces
   fichiers change : l'ancien cache est alors supprimé et le nouveau rechargé. */
const DATA_CACHE = "chay-bible-data-v2";
const DATA_FILES = [
  "/data/bibles/lsg1910_fr_CORRIGE.json",
  "/data/bibles/malagasy_complete.json",
  "/data/concordance/concordance-fr.json",
  "/data/concordance/concordance-mg.json",
];

self.addEventListener("install", (event) => {
  // Préchargement best-effort : un échec réseau n'empêche pas l'installation
  // (les fichiers seront alors mis en cache à leur première lecture).
  event.waitUntil(
    caches
      .open(DATA_CACHE)
      .then((cache) => Promise.allSettled(DATA_FILES.map((u) => cache.add(u))))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("chay-bible-data-") && k !== DATA_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
);

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (!DATA_FILES.includes(url.pathname)) return;
  event.respondWith(
    caches.open(DATA_CACHE).then(async (cache) => {
      const hit = await cache.match(url.pathname);
      if (hit) return hit;
      const res = await fetch(event.request);
      if (res.ok) cache.put(url.pathname, res.clone());
      return res;
    })
  );
});
