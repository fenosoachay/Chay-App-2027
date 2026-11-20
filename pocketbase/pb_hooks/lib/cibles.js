// Écran précis ouvert au clic sur une notification (push ET cloche).
// Copie conforme de src/lib/routesNotification.js (même règles, test de parité src/lib/routesNotification.test.js).
// Le push transporte `route` ; target_type / target_id restent, pour les anciennes versions de l'app et la
// file PushEnvoi (qui ne garde pas `route` : l'app recalcule alors la route depuis target_type / target_id).

const ROUTE_RE = /^\/[A-Za-z0-9\-._~/?=&%]*$/;
const ROUTE_MAX = 200;
const PISTES = { MusicTrack: 'music', Sermon: 'sermons', Video: 'films' };

const q = (v) => encodeURIComponent(String(v));
const routeValide = (r) => typeof r === 'string' && r.length <= ROUTE_MAX && ROUTE_RE.test(r) && r.indexOf('//') !== 0;

/** Contenu publié (collection Content) -> écran de la ressource elle-même. */
function routeContenu(c) {
  if (!c) return '/media';
  const type = c.resource_type || '';
  const id = c.resource_id || '';
  if (id && PISTES[type]) {
    return `/media?cat=${PISTES[type]}${c.playlist_id ? `&playlist=${q(c.playlist_id)}` : ''}&track=${q(id)}`;
  }
  if (id && type === 'YouTubeVideo') return `/media?cat=youtube&video=${q(id)}`;
  if (id && type === 'Article') return `/media?cat=articles&article=${q(id)}`;
  if (id && type === 'GalleryImage') return `/media?cat=gallery&image=${q(id)}`;
  if (id && type === 'Paroles') return `/media?cat=paroles&parole=${q(id)}`;
  if (id && type === 'Verset') return `/media?cat=verset&verset=${q(id)}`;
  if (id && type === 'Announcement') return `/?annonce=${q(id)}`;
  return c.id ? `/?contenu=${q(c.id)}` : '/media';
}

/** Route connue sans rien charger ; null pour « content » (il faut la ligne Content). */
function routeCible(type, id) {
  switch (type) {
    case 'message': return id ? `/messages?c=${q(id)}` : '/messages';
    case 'community': return '/community';
    case 'daily_verse': return id ? `/?verset=${q(id)}` : '/';
    case 'announcement': return id ? `/?annonce=${q(id)}` : '/';
    case 'theme_request':
    case 'theme_answer': return '/requests?tab=theme';
    case 'prayer': return '/requests?tab=my-prayers';
    case 'app_update': return '/?apropos=1';
    case 'content': return null;
    default: return '/';
  }
}

module.exports = { routeContenu, routeCible, routeValide, ROUTE_MAX };
