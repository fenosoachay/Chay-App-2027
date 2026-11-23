// Site public chay.fr (refonte 2026) : règles pures, testées dans Node (pocketbase/tests/site-chay.test.mjs).
// Utilisé par pb_hooks/site_chay.pb.js. Aucune dépendance PocketBase ici.

const MAX = { nom: 100, email: 200, sujet: 100, message: 5000 };
const SUJETS = ['Demande de prière', 'Question', 'Témoignage', 'Association Chay', 'Autre'];
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[A-Za-z]{2,}$/;
// Délai minimum entre l'ouverture de la page et l'envoi : un robot remplit le formulaire instantanément.
const DELAI_MIN_MS = 3000;
// Au plus 3 messages par adresse IP par heure, et 5 par adresse e-mail par jour.
const PAR_IP_HEURE = 3;
const PAR_EMAIL_JOUR = 5;

const propre = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max + 1) : '');

/**
 * Formulaire « Nous contacter » du site.
 * Renvoie { erreur } (message à afficher) ou { robot: true } (envoi silencieusement ignoré) ou { valeurs }.
 */
function lireContact(body) {
  const b = body && typeof body === 'object' ? body : {};
  // Champ piège invisible pour les humains : rempli = robot. On répond « envoyé » sans rien enregistrer.
  if (propre(b.site_web, 500)) return { robot: true };
  const t = Number(b.t);
  if (!Number.isFinite(t) || t < DELAI_MIN_MS) return { robot: true };
  const nom = propre(b.nom, MAX.nom);
  const email = propre(b.email, MAX.email);
  const sujet = propre(b.sujet, MAX.sujet);
  const message = propre(b.message, MAX.message);
  if (!nom) return { erreur: 'Indiquez votre nom.' };
  if (nom.length > MAX.nom) return { erreur: 'Nom trop long.' };
  if (!email || email.length > MAX.email || !EMAIL_RE.test(email)) return { erreur: 'Adresse e-mail invalide.' };
  if (!message) return { erreur: 'Écrivez votre message.' };
  if (message.length > MAX.message) return { erreur: 'Message trop long (5 000 caractères au plus).' };
  return { valeurs: { nom, email: email.toLowerCase(), sujet: SUJETS.includes(sujet) ? sujet : 'Autre', message } };
}

/** Notification des admins pour un message du site. */
function notificationMessage(id, nom, sujet) {
  return {
    title: '✉️ Nouveau message du site',
    body: `${nom} : ${sujet}`.slice(0, 180),
    route: '/admin/messages',
    notification_id: `message_site_${id}`,
  };
}

/** Identifiant d'une vidéo YouTube (11 caractères) à partir d'un lien ou de l'identifiant lui-même ; '' sinon. */
function idYoutube(lien) {
  const s = String(lien || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|live\/|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#/].*)?$/);
  return m ? m[1] : '';
}

/** Titre renvoyé par l'oEmbed YouTube (JSON), borné ; '' si absent. */
function titreOembed(json) {
  try {
    const o = typeof json === 'string' ? JSON.parse(json) : json;
    return typeof o?.title === 'string' ? o.title.trim().slice(0, 200) : '';
  } catch (_) {
    return '';
  }
}

/**
 * Page https://www.youtube.com/@chaine/live : en direct si la page est celle d'une vidéo (lien canonique « watch?v= »)
 * ET que YouTube la marque « isLiveNow ». Renvoie { en_direct, video_id }.
 */
function lireDirect(html) {
  const s = String(html || '');
  const can = s.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})"/);
  const live = /"isLiveNow"\s*:\s*true/.test(s);
  if (can && live) return { en_direct: true, video_id: can[1] };
  return { en_direct: false, video_id: '' };
}

/**
 * Avant l'enregistrement d'un culte (hook SiteCulte) : lien vérifié, youtube_id rempli, titre repris de YouTube
 * s'il est vide. Utilise les objets globaux de PocketBase ($http, BadRequestError, toString, $app).
 */
function preparerCulte(e) {
  const r = e.record;
  const id = idYoutube(r.getString('youtube_url'));
  if (!id) throw new BadRequestError('Lien YouTube invalide. Collez le lien de la vidéo (https://www.youtube.com/watch?v=…).');
  r.set('youtube_id', id);
  if (!r.getString('titre').trim()) {
    try {
      const res = $http.send({
        url: `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`,
        method: 'GET',
        timeout: 8,
      });
      if (res.statusCode === 200) r.set('titre', titreOembed(toString(res.body || [])));
    } catch (_) {
      $app.logger().warn('[siteCulte] titre YouTube indisponible', 'video', id);
    }
  }
  return e.next();
}

/** Dernier dimanche d'un mois (UTC), à 01:00 UTC : changement d'heure européen. */
function dernierDimanche(annee, mois) {
  const d = new Date(Date.UTC(annee, mois + 1, 0, 1));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.getTime();
}
/** Date du jour à Paris (AAAA-MM-JJ), heure d'été comprise. */
function jourParis(ms) {
  const annee = new Date(ms).getUTCFullYear();
  const ete = ms >= dernierDimanche(annee, 2) && ms < dernierDimanche(annee, 9);
  return new Date(ms + (ete ? 2 : 1) * 3600 * 1000).toISOString().slice(0, 10);
}

module.exports = {
  jourParis,
  preparerCulte,
  lireContact, notificationMessage, idYoutube, titreOembed, lireDirect,
  SUJETS, DELAI_MIN_MS, PAR_IP_HEURE, PAR_EMAIL_JOUR, MAX,
};
