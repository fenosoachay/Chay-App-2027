// Bilan d'un envoi push pour l'EXPÉDITEUR d'un message (createMessage) : vraie panne (notification_error)
// ou simple information (notification_info). Sans dépendance : testable dans Node (tests/bilan-push.test.mjs).
//
// Principe : l'expéditeur ne voit une erreur que pour une panne CÔTÉ SERVEUR (sidecar injoignable ou en
// erreur HTTP, mauvaise configuration Firebase / VAPID, échec définitif non dû au destinataire). Un jeton ou
// un abonnement périmé du destinataire est un cas NORMAL (ancienne installation, navigateur réinitialisé) :
// il est nettoyé par lib/push.js comme avant, et n'alarme jamais l'expéditeur. Si au moins une cible a
// accepté, aucune erreur.

// Échecs dus au DESTINATAIRE (classification renvoyée par le sidecar, pocketbase/sidecar-push/serveur.mjs) :
//  - unregistered_token : jeton FCM désinstallé / périmé (marqué « invalid », supprimé) ;
//  - expired_404, expired_410 : abonnement Web Push expiré (marqué « invalid », supprimé) ;
//  - vapid_key_mismatch_403 : abonnement créé avec une autre clé VAPID (marqué « invalid », supprimé) ;
//  - subscription_keys_invalid : clés d'abonnement du navigateur inutilisables ;
//  - SENDER_ID_MISMATCH : jeton d'un autre projet Firebase (ancienne installation de l'APK Base44).
const RECIPIENT_SIDE = [
  'unregistered_token',
  'expired_404',
  'expired_410',
  'vapid_key_mismatch_403',
  'subscription_keys_invalid',
  'SENDER_ID_MISMATCH',
];

/** Vrai si le résultat d'une cible est un échec dû au destinataire (jamais une erreur pour l'expéditeur). */
function isRecipientSideFailure(res) {
  return Boolean(res && !res.ok && (res.invalid || RECIPIENT_SIDE.indexOf(String(res.classification || '')) >= 0));
}

// Envoi retenu volontairement par l'interrupteur NOTIFICATIONS_MODE (lib/sortie.js) : pas un échec.
const MODE_BLOCK = /^notifications_(off|test)$/;
const realReason = (v) => (v && !MODE_BLOCK.test(String(v)) ? String(v) : null);

/**
 * Erreur de notification renvoyée par createMessage : seulement les VRAIES pannes côté serveur
 * (l'app affiche alors « La notification du destinataire n'a pas pu être envoyée »).
 * `d` : résultat de messagePush (lib/notifications.js).
 */
function messageNotificationError(d) {
  if (!d) return 'notification_dispatch_failed';
  if (d.notifFailed > 0) return 'notification_creation_failed';
  // Au moins une cible (téléphone ou navigateur) a accepté : jamais d'erreur.
  if (d.pushSent > 0) return null;
  // Panne ou configuration côté serveur : sidecar injoignable (sidecar_unreachable), réponse HTTP du sidecar
  // (sidecar_http_…), push non configuré, VAPID / Firebase en erreur. NOTIFICATIONS_MODE exclu.
  const skipped = realReason(d.webPushSkipped);
  if (skipped) return skipped;
  const fcmError = realReason(d.fcmError);
  if (fcmError) return fcmError;
  // Échecs restants qui ne sont ni dus au destinataire, ni remis en file pour un nouvel essai.
  const serverFailed = (d.pushFailed || 0) - (d.pushInvalid || 0) - (d.pushQueued || 0);
  if (serverFailed > 0) return 'push_delivery_failed';
  return null;
}

/** Information (non bloquante, jamais affichée comme une erreur) sur le push d'un message. */
function messageNotificationInfo(d) {
  if (!d) return null;
  if (d.pushBlocked > 0) return `notifications_${d.pushMode === 'test' ? 'test' : 'off'}`;
  if (d.pushNoSubscriptions > 0) return 'no_push_subscription';
  if (d.pushSent > 0) return null;
  if (d.pushQueued > 0) return 'push_queued';
  if (d.pushInvalid > 0) return 'push_targets_invalid';
  return null;
}

module.exports = { RECIPIENT_SIDE, isRecipientSideFailure, messageNotificationError, messageNotificationInfo };
