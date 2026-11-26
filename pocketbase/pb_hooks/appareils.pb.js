// Un téléphone (ou une tablette) = un seul compte pour les notifications (1.3.43).
// Avant : en se déconnectant puis en se connectant avec un autre compte, l'appareil gardait aussi la ligne
// DeviceToken de l'ancien compte (un membre ne peut ni voir ni désactiver les lignes des autres), et recevait
// les notifications des DEUX comptes. Ici : dès qu'un compte enregistre ou réactive le jeton de l'appareil,
// les lignes des autres comptes avec ce même jeton sont désactivées (lib/appareils.js).
// (Une fonction déclarée ici ne serait pas visible dans les handlers : chaque handler s'exécute isolé.)

onRecordAfterCreateSuccess((e) => {
  e.next();
  try { require(`${__hooks}/lib/appareils.js`).garderSeulement(e.record); } catch (_) { $app.logger().warn('[appareils] anciens comptes de cet appareil non désactivés'); }
}, 'DeviceToken');

onRecordAfterUpdateSuccess((e) => {
  e.next();
  try { require(`${__hooks}/lib/appareils.js`).garderSeulement(e.record); } catch (_) { $app.logger().warn('[appareils] anciens comptes de cet appareil non désactivés'); }
}, 'DeviceToken');

// 1.3.43 : appareil déconnecté (personne n'est connecté dans l'appli) : POST /api/chay/appareil/oublier { token }.
// L'appli l'appelle au démarrage quand aucun compte n'est ouvert : l'appareil ne reçoit plus les notifications
// d'un ancien compte (cas des déconnexions faites avant la 1.3.43). Public (pas de session) : il ne fait que
// DÉSACTIVER les lignes de ce jeton, qu'il faut connaître ; 10 appels par heure et par adresse au plus.
routerAdd('POST', '/api/chay/appareil/oublier', (e) => {
  const fn = require(`${__hooks}/lib/fn.js`);
  return fn.run(e, 'appareilOublier', 'Appareil non oublié', () => {
    const notif = require(`${__hooks}/lib/notifications.js`);
    let ip = '';
    try { ip = e.realIP() || ''; } catch (_) { ip = ''; }
    if (!notif.hit(`appareil_oublier:${ip || 'inconnue'}`, 10, 3600 * 1000)) throw new fn.HttpError(429, 'Trop de demandes.');
    const corps = fn.readBody(e) || {};
    const jeton = typeof corps.token === 'string' ? corps.token.trim() : '';
    if (jeton.length < 20 || jeton.length > 4096) throw new fn.HttpError(400, 'jeton invalide');
    const n = require(`${__hooks}/lib/appareils.js`).oublier(jeton);
    return { ok: true, desactives: n };
  });
});
