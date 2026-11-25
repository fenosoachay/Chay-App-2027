// E-mails des notifications (1.3.35) : règles pures (testées par node --test).
// Bug corrigé : un membre qui coupait « E-mail » (Paramètres › Notifications › Canaux) recevait encore les
// e-mails des messages, qui ne regardaient que « Messages par e-mail ». Désormais un e-mail part seulement si :
//  - les notifications ne sont pas coupées (notifications_enabled) ;
//  - le canal E-mail est ouvert (notif_email) ;
//  - et, selon le genre : « Messages par e-mail » + « Nouveaux messages privés » pour un message,
//    « Nouveautés par e-mail » + « Nouveautés » pour un nouveau contenu.
// Anti-saturation : MAX_PAR_JOUR e-mails de messages et nouveautés par membre et par jour (le reste passe par le
// push et la cloche) ; les alertes des admins (missions, dons…) ne sont pas comptées.

const MAX_PAR_JOUR = 6;

/**
 * @param {object} s réglages du membre (user.settings)
 * @param {{ email_messages?: boolean, email_nouveautes?: boolean }} champs champs du compte
 * @param {'messages'|'nouveautes'|'demandes'|'admin'} genre
 */
function emailAutorise(s, champs, genre) {
  const r = s && typeof s === 'object' ? s : {};
  const c = champs || {};
  if (r.notifications_enabled === false || r.notif_email === false) return false;
  if (genre === 'messages') return c.email_messages !== false && r.notif_messages !== false;
  if (genre === 'nouveautes') return c.email_nouveautes !== false && r.notif_news !== false;
  return true;
}

/** Clé du compteur du jour (UTC) pour un membre. */
const cleJour = (userId, maintenant) => `${userId}:${new Date(maintenant || Date.now()).toISOString().slice(0, 10)}`;

/** Le plafond du jour est-il atteint ? `compteurs` = { cle: nombre }. */
const plafondAtteint = (compteurs, userId, maintenant) => (Number((compteurs || {})[cleJour(userId, maintenant)]) || 0) >= MAX_PAR_JOUR;

module.exports = { MAX_PAR_JOUR, emailAutorise, cleJour, plafondAtteint };
