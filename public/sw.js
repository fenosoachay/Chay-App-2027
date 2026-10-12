/* Service worker CHAY — notifications push + fonctionnement hors ligne.
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

/* ── Fonctionnement hors ligne ───────────────────────────────────────────────
   1. DONNÉES de la Bible (textes FR/MG + index de concordance) : préchargées à
      l'installation puis servies depuis le cache. Incrémenter DATA_CACHE quand
      un de ces fichiers change.
   2. INTERFACE de l'application (page, scripts, styles, polices, images) :
      mise en cache au fil de l'eau (réseau d'abord, cache en secours) pour que
      l'application s'ouvre sans connexion.
   Les appels d'API (données de l'app, authentification, fonctions) ne sont
   jamais mis en cache ici : seule la Bible/dictionnaire est garantie hors ligne. */
const DATA_CACHE = "chay-bible-data-v2";
const SHELL_CACHE = "chay-app-shell-v2";
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
    Promise.all([
      caches
        .open(DATA_CACHE)
        .then((cache) => Promise.allSettled(DATA_FILES.map((u) => cache.add(u)))),
      caches.open(SHELL_CACHE).then((cache) => Promise.allSettled([cache.add("/")])),
    ])
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
            .filter(
              (k) =>
                (k.startsWith("chay-bible-data-") && k !== DATA_CACHE) ||
                (k.startsWith("chay-app-shell-") && k !== SHELL_CACHE)
            )
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  )
);

// Ressources statiques de l'interface (même origine, ou polices Google).
function isShellAsset(url, request) {
  if (url.origin === self.location.origin) {
    return (
      request.destination === "script" ||
      request.destination === "style" ||
      request.destination === "font" ||
      request.destination === "image" ||
      url.pathname.startsWith("/assets/")
    );
  }
  return url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
}

// Réseau d'abord (toujours la dernière version en ligne), cache en secours.
async function networkFirst(request, cacheName, fallbackKey) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && (res.ok || res.type === "opaque")) cache.put(fallbackKey || request, res.clone());
    return res;
  } catch (e) {
    const hit = (await cache.match(fallbackKey || request)) || (await cache.match(request));
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Données de la Bible : cache d'abord.
  if (url.origin === self.location.origin && DATA_FILES.includes(url.pathname)) {
    event.respondWith(
      caches.open(DATA_CACHE).then(async (cache) => {
        const hit = await cache.match(url.pathname);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(url.pathname, res.clone());
        return res;
      })
    );
    return;
  }

  // Navigation (ouverture de l'app / d'une page) : sans réseau, on sert la
  // page d'application mémorisée (l'app est une SPA : "/" suffit pour toutes les routes).
  if (request.mode === "navigate" && url.origin === self.location.origin) {
    event.respondWith(networkFirst(request, SHELL_CACHE, "/"));
    return;
  }

  if (isShellAsset(url, request)) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
  }
});
