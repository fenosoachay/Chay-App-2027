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
