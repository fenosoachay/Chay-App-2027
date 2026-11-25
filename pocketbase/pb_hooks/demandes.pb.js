/// <reference path="../pb_data/types.d.ts" />
// Notifications des requêtes (1.3.34) : à chaque nouvelle ligne, cloche + push pour les concernés.
//  - Prière (PrayerRequest)          -> tout le monde (sauf le demandeur)
//  - Se missionner (MissionRequest)  -> les admins
//  - Demande de don (DonationRequest)-> les admins
//  - Formulaire de l'app (ContactMessage, hors site chay.fr déjà notifié par site_chay.pb.js) -> les admins
// Un échec de notification n'annule jamais l'enregistrement.

onRecordAfterCreateSuccess((e) => {
  try { require(`${__hooks}/lib/notifications.js`).demandeNotify('priere', e.record); } catch (_) { $app.logger().warn('[demandes] prière : notification impossible'); }
  e.next();
}, 'PrayerRequest');

onRecordAfterCreateSuccess((e) => {
  try { require(`${__hooks}/lib/notifications.js`).demandeNotify('mission', e.record); } catch (_) { $app.logger().warn('[demandes] mission : notification impossible'); }
  e.next();
}, 'MissionRequest');

onRecordAfterCreateSuccess((e) => {
  try { require(`${__hooks}/lib/notifications.js`).demandeNotify('don', e.record); } catch (_) { $app.logger().warn('[demandes] don : notification impossible'); }
  e.next();
}, 'DonationRequest');

onRecordAfterCreateSuccess((e) => {
  try {
    if (e.record.getString('source') !== 'site') require(`${__hooks}/lib/notifications.js`).demandeNotify('message', e.record);
  } catch (_) { $app.logger().warn('[demandes] message : notification impossible'); }
  e.next();
}, 'ContactMessage');
