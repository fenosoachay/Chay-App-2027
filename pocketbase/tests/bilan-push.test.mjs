// Règles « erreur / information » pour l'expéditeur d'un message (pb_hooks/lib/bilan-push.js). Aucun réseau.
// Lancement : node --test pocketbase/tests/bilan-push.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { chargerLib } from './charger-cjs.mjs';

const { isRecipientSideFailure, messageNotificationError: erreur, messageNotificationInfo: info } = chargerLib('bilan-push.js');

// Résultat de messagePush (lib/notifications.js), valeurs par défaut d'un envoi sans souci.
const bilan = (over = {}) => ({
  notifFailed: 0, pushSent: 0, pushFailed: 0, pushInvalid: 0, pushQueued: 0, pushBlocked: 0, pushMode: 'on',
  pushNoSubscriptions: 0, webPushSkipped: null, fcmError: null, ...over,
});

test('classifications du sidecar : échecs dus au destinataire', () => {
  for (const c of ['unregistered_token', 'expired_404', 'expired_410', 'vapid_key_mismatch_403', 'subscription_keys_invalid', 'SENDER_ID_MISMATCH']) {
    assert.equal(isRecipientSideFailure({ ok: false, classification: c }), true, c);
  }
  assert.equal(isRecipientSideFailure({ ok: false, invalid: true, classification: 'autre' }), true, 'marqué invalid par le sidecar');
  for (const c of ['http_500', 'UNAVAILABLE', 'transport_error', 'configuration_error', 'firebase_authentication_failed', 'INVALID_ARGUMENT']) {
    assert.equal(isRecipientSideFailure({ ok: false, classification: c }), false, c);
  }
  assert.equal(isRecipientSideFailure({ ok: true, classification: 'accepted' }), false);
});

test('cas constaté : 1 jeton FCM périmé + 1 accepté (FCM) + 1 navigateur accepté -> aucune erreur, aucune info', () => {
  const d = bilan({ pushSent: 2, pushFailed: 1, pushInvalid: 1 });
  assert.equal(erreur(d), null);
  assert.equal(info(d), null);
});

test('tous les jetons / abonnements périmés -> aucune erreur, information discrète', () => {
  const d = bilan({ pushSent: 0, pushFailed: 2, pushInvalid: 2 });
  assert.equal(erreur(d), null);
  assert.equal(info(d), 'push_targets_invalid');
});

test('sidecar injoignable -> erreur (même si les envois sont remis en file)', () => {
  const d = bilan({ pushFailed: 2, pushQueued: 2, fcmError: 'sidecar_unreachable', webPushSkipped: 'sidecar_unreachable' });
  assert.equal(erreur(d), 'sidecar_unreachable');
});

test('sidecar en erreur HTTP, push non configuré, Firebase / VAPID en erreur -> erreur', () => {
  assert.equal(erreur(bilan({ pushFailed: 1, fcmError: 'sidecar_http_500' })), 'sidecar_http_500');
  assert.equal(erreur(bilan({ pushFailed: 1, fcmError: 'push_not_configured' })), 'push_not_configured');
  assert.equal(erreur(bilan({ pushFailed: 1, fcmError: 'authentification Firebase impossible' })), 'authentification Firebase impossible');
  assert.equal(erreur(bilan({ pushFailed: 1, webPushSkipped: 'vapid_key_mismatch' })), 'vapid_key_mismatch');
});

test('échec définitif non dû au destinataire (ex. INVALID_ARGUMENT) -> erreur', () => {
  assert.equal(erreur(bilan({ pushFailed: 1 })), 'push_delivery_failed');
});

test('erreur passagère remise en file (429 / 5xx) -> pas d\'erreur, information « push_queued »', () => {
  const d = bilan({ pushFailed: 1, pushQueued: 1 });
  assert.equal(erreur(d), null);
  assert.equal(info(d), 'push_queued');
});

test('au moins une cible acceptée -> jamais d\'erreur, même avec une panne sur une autre cible', () => {
  assert.equal(erreur(bilan({ pushSent: 1, pushFailed: 1, fcmError: 'sidecar_http_502' })), null);
  assert.equal(erreur(bilan({ pushSent: 1, pushFailed: 3 })), null);
});

test('NOTIFICATIONS_MODE (test / off) : comportement inchangé -> information, jamais d\'erreur', () => {
  const test_ = bilan({ pushBlocked: 1, pushMode: 'test', fcmError: 'notifications_test', webPushSkipped: 'notifications_test' });
  assert.equal(erreur(test_), null);
  assert.equal(info(test_), 'notifications_test');
  const off = bilan({ pushBlocked: 1, pushMode: 'off', fcmError: 'notifications_off' });
  assert.equal(erreur(off), null);
  assert.equal(info(off), 'notifications_off');
});

test('destinataire sans appareil -> information ; notification in-app impossible ou exception -> erreur', () => {
  assert.equal(erreur(bilan({ pushNoSubscriptions: 1 })), null);
  assert.equal(info(bilan({ pushNoSubscriptions: 1 })), 'no_push_subscription');
  assert.equal(erreur(bilan({ notifFailed: 1 })), 'notification_creation_failed');
  assert.equal(erreur(null), 'notification_dispatch_failed');
});
