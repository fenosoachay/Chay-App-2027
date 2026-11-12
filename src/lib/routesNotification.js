// Écran précis ouvert au clic sur une notification : push Android, push navigateur (public/sw.js) et cloche.
// Mêmes règles que pocketbase/pb_hooks/lib/cibles.js (test de parité dans routesNotification.test.js).

const ROUTE_RE = /^\/[A-Za-z0-9\-._~/?=&%]*$/;
const ROUTE_MAX = 200;
const PISTES = { MusicTrack: "music", Sermon: "sermons", Video: "films" };

const q = (v) => encodeURIComponent(String(v));
export const routeValide = (r) =>
  typeof r === "string" && r.length <= ROUTE_MAX && ROUTE_RE.test(r) && r.indexOf("//") !== 0;

/** Contenu publié (collection Content) -> écran de la ressource elle-même. */
export function routeContenu(c) {
  if (!c) return "/media";
  const type = c.resource_type || "";
  const id = c.resource_id || "";
  if (id && PISTES[type]) {
    return `/media?cat=${PISTES[type]}${c.playlist_id ? `&playlist=${q(c.playlist_id)}` : ""}&track=${q(id)}`;
  }
  if (id && type === "YouTubeVideo") return `/media?cat=youtube&video=${q(id)}`;
  if (id && type === "Article") return `/media?cat=articles&article=${q(id)}`;
  if (id && type === "GalleryImage") return `/media?cat=gallery&image=${q(id)}`;
  if (id && type === "Announcement") return `/?annonce=${q(id)}`;
  return c.id ? `/?contenu=${q(c.id)}` : "/media";
}

/** Route connue sans rien charger ; null pour « content » (il faut la ligne Content). */
export function routeCible(type, id) {
  switch (type) {
    case "message": return id ? `/messages?c=${q(id)}` : "/messages";
    case "community": return "/community";
    case "daily_verse": return id ? `/?verset=${q(id)}` : "/";
    case "announcement": return id ? `/?annonce=${q(id)}` : "/";
    case "theme_request":
    case "theme_answer": return "/requests?tab=theme";
    case "prayer": return "/requests?tab=my-prayers";
    case "content": return null;
    default: return "/";
  }
}

/** Notification de la cloche (UserNotification) -> { target_type, target_id } du push équivalent. */
export function cibleCloche(n) {
  if (!n) return { target_type: "", target_id: "" };
  const t = n.type || "";
  const ct = n.content_type || "";
  if (t === "message" || ct === "message") return { target_type: "message", target_id: n.content_id || "" };
  if (t === "new_content") return { target_type: "content", target_id: n.content_id || "" };
  if (t === "daily_verse" || ct === "devotional") return { target_type: "daily_verse", target_id: n.content_id || "" };
  if (t === "announcement" || ct === "announcement") return { target_type: "announcement", target_id: n.content_id || "" };
  if (ct === "prayer" || t.indexOf("prayer") === 0) return { target_type: "prayer", target_id: n.content_id || "" };
  if (t === "theme_request" || t === "theme_answer") return { target_type: t, target_id: n.content_id || "" };
  if (t === "like" || t === "comment" || t === "community_post") return { target_type: "community", target_id: n.post_id || "" };
  return { target_type: t, target_id: n.content_id || "" };
}

/**
 * Route d'une notification (données du push, ou cibleCloche(n)). `chargerContenu(id)` charge la ligne
 * Content quand il faut la lire (anciens push sans `route`, file de reprise, cloche) ; en cas d'échec,
 * Multimédia s'ouvre.
 */
export async function routeNotification(data, chargerContenu) {
  const d = data || {};
  if (routeValide(d.route)) return d.route;
  const connue = routeCible(d.target_type, d.target_id);
  if (connue) return connue;
  if (!d.target_id || typeof chargerContenu !== "function") return "/media";
  try {
    return routeContenu(await chargerContenu(d.target_id));
  } catch {
    return "/media";
  }
}
