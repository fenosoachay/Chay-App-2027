// Tableau de bord de l'application (1.3.25) : règles pures, testées par node --test (tests/activite.test.mjs).
//  - Chaque membre connecté envoie un « ping » (POST /api/chay/activite) : temps passé dans l'app (secondes,
//    écran visible seulement), pages ouvertes par section, et sa position ARRONDIE (environ 5 km : la ville,
//    jamais l'adresse). Une ligne ActiviteJour par membre et par jour (heure de Paris), une ligne PositionMembre
//    par membre (dernière position connue).
//  - GET /api/chay/admin/stats (admins) : connectés et nouveaux membres (aujourd'hui, semaine depuis lundi, mois),
//    sections les plus visitées, temps moyen, points de la carte.

const SECTIONS = {
  accueil: 'Accueil',
  bible: 'Bible',
  media: 'Multimédia',
  jeux: 'Jeux',
  enfants: 'Chay Kids',
  communaute: 'Communauté',
  messages: 'Messages',
  requetes: 'Requêtes',
  don: 'Faire un don',
  contact: 'Contact',
  eglise: 'Menu de l’Église',
  notifications: 'Notifications',
  reglages: 'Réglages',
  admin: 'Administration',
};

const MAX_SECONDES_PING = 120; // un ping par minute environ : au-delà, la valeur est plafonnée
const MAX_VISITES_PING = 30;
const PAS_POSITION = 0.05; // degrés (~5 km) : précision de la ville

/** Nombre entier borné, sinon 0. */
function entier(v, max) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, max);
}

/** Arrondi d'une coordonnée au pas de la ville (null si invalide). */
function arrondir(v, min, max) {
  const n = Number(v);
  if (typeof v === 'boolean' || v === null || v === '' || !Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(Math.round(n / PAS_POSITION) * PAS_POSITION * 100) / 100;
}

/** Corps d'un ping nettoyé : { secondes, sections: {id: n}, position: {lat, lon} | null }. */
function lirePing(body) {
  const b = body && typeof body === 'object' ? body : {};
  const secondes = entier(b.secondes, MAX_SECONDES_PING);
  const sections = {};
  const brut = b.sections && typeof b.sections === 'object' ? b.sections : {};
  let total = 0;
  for (const id of Object.keys(brut)) {
    if (!Object.prototype.hasOwnProperty.call(SECTIONS, id)) continue;
    const n = entier(brut[id], MAX_VISITES_PING);
    if (!n || total >= MAX_VISITES_PING) continue;
    const garde = Math.min(n, MAX_VISITES_PING - total);
    sections[id] = garde;
    total += garde;
  }
  const lat = arrondir(b.lat, -90, 90);
  const lon = arrondir(b.lon, -180, 180);
  // « Apparaître sur la carte » désactivé dans les réglages : la position enregistrée est effacée.
  if (b.sansPosition === true) return { secondes, sections, position: null, sansPosition: true };
  return { secondes, sections, position: lat !== null && lon !== null ? { lat, lon } : null, sansPosition: false };
}

/** Additionne les visites d'un ping à celles déjà enregistrées pour la journée. */
function fusionnerSections(avant, ajout) {
  const out = {};
  const a = avant && typeof avant === 'object' && !Array.isArray(avant) ? avant : {};
  for (const id of Object.keys(a)) if (Object.prototype.hasOwnProperty.call(SECTIONS, id)) out[id] = entier(a[id], 1e9);
  for (const id of Object.keys(ajout || {})) out[id] = (out[id] || 0) + ajout[id];
  return out;
}

const pad = (n) => String(n).padStart(2, '0');

/** Jours de début (AAAA-MM-JJ) : aujourd'hui, lundi de la semaine, 1er du mois, à partir du jour de Paris. */
function bornes(jour) {
  const [a, m, j] = jour.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  const recul = (d.getUTCDay() + 6) % 7; // lundi = 0
  const lundi = new Date(d.getTime() - recul * 86400000);
  return {
    jour,
    semaine: `${lundi.getUTCFullYear()}-${pad(lundi.getUTCMonth() + 1)}-${pad(lundi.getUTCDate())}`,
    mois: `${a}-${pad(m)}-01`,
  };
}

/**
 * Statistiques du tableau de bord.
 *  - membres : [{ id, cree (jour de Paris AAAA-MM-JJ), nom, photo }] (comptes actifs, hors comptes système) ;
 *  - lignes  : [{ user, jour, secondes, sections }] (ActiviteJour depuis le plus ancien des débuts) ;
 *  - positions : [{ user, lat, lon, maj }] ;
 *  - jour : jour de Paris d'aujourd'hui.
 */
function statistiques({ membres, lignes, positions, jour }) {
  const b = bornes(jour);
  const ids = new Set((membres || []).map((m) => m.id));
  const total = ids.size;
  const periode = (debut) => {
    const actifs = new Set();
    for (const l of lignes || []) if (ids.has(l.user) && l.jour >= debut && l.jour <= jour) actifs.add(l.user);
    const nouveaux = (membres || []).filter((m) => m.cree >= debut && m.cree <= jour).length;
    return { connectes: actifs.size, nouveaux, part: total ? Math.round((actifs.size / total) * 100) : 0 };
  };

  // Sections et temps moyen : sur le mois en cours.
  const visites = {};
  let secondes = 0;
  let journees = 0;
  for (const l of lignes || []) {
    if (!ids.has(l.user) || l.jour < b.mois || l.jour > jour) continue;
    const s = entier(l.secondes, 86400);
    if (s > 0) { secondes += s; journees += 1; }
    const sec = l.sections && typeof l.sections === 'object' ? l.sections : {};
    for (const id of Object.keys(sec)) {
      if (!Object.prototype.hasOwnProperty.call(SECTIONS, id) || id === 'admin') continue;
      visites[id] = (visites[id] || 0) + entier(sec[id], 1e9);
    }
  }
  const sections = Object.keys(visites)
    .map((id) => ({ id, nom: SECTIONS[id], visites: visites[id] }))
    .sort((x, y) => y.visites - x.visites);

  const parId = new Map((membres || []).map((m) => [m.id, m]));
  const carte = (positions || [])
    .filter((p) => parId.has(p.user) && Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .map((p) => ({ id: p.user, nom: parId.get(p.user).nom, photo: parId.get(p.user).photo || '', lat: p.lat, lon: p.lon, maj: p.maj || '' }));

  return {
    jour,
    total,
    aujourdhui: periode(b.jour),
    semaine: periode(b.semaine),
    mois: periode(b.mois),
    sections,
    tempsMoyenSecondes: journees ? Math.round(secondes / journees) : 0,
    carte,
  };
}

module.exports = { SECTIONS, MAX_SECONDES_PING, PAS_POSITION, lirePing, fusionnerSections, bornes, statistiques, arrondir };
