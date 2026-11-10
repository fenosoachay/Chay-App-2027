// REPRODUCTION (bac à sable uniquement) des problèmes signalés après la bascule, avec le VRAI adaptateur :
//   1. message privé envoyé : parcours exact de ConversationView.send puis Messages.loadAll ;
//   2. « Tester le push Android » : réponse de sendFcmPush ;
//   3. enregistrement du jeton FCM : parcours exact de usePushNotifications.upsertTokenInternal.
import fs from 'node:fs';
import PocketBase from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPocketBaseAdapter } from '@/api/pocketbase/adapter';
import { deactivateDeviceToken, upsertDeviceToken } from '@/lib/deviceTokenSync';
import { retry429 } from './retry429.js';

const BASE = process.env.PB_TEST_URL || 'http://127.0.0.1:8090';
const credFile = process.env.PB_TEST_CREDENTIALS || 'C:\\PB-local\\identifiants-test.txt';
const creds = Object.fromEntries(fs.readFileSync(credFile, 'utf8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#')).map((l) => { const [k, email, password, id] = l.split('\t'); return [k, { email, password, id }]; }));

const client = async (who) => {
  const pb = new PocketBase(BASE);
  pb.autoCancellation(false);
  const api = createPocketBaseAdapter(pb, { baseUrl: BASE });
  await retry429(() => api.auth.loginViaEmailPassword(creds[who].email, creds[who].password));
  const me = await api.auth.me();
  return { api, pb, me };
};

describe('reproduction des problèmes APK (bac à sable)', () => {
  let a; let b; let su;
  const nettoyer = [];

  beforeAll(async () => {
    a = await client('membre');
    b = await client('membre2');
    su = new PocketBase(BASE);
    su.autoCancellation(false);
    await retry429(() => su.collection('_superusers').authWithPassword(creds.superuser.email, creds.superuser.password));
  });

  afterAll(async () => {
    for (const [col, id] of nettoyer.reverse()) await su.collection(col).delete(id).catch(() => {});
  });

  it('1. message privé : créé, visible par l’expéditeur et le destinataire (code des écrans)', async () => {
    const conv = await a.api.entities.Conversation.create({ type: 'direct', participant_ids: [a.me.id, b.me.id] });
    nettoyer.push(['Conversation', conv.id]);
    const text = `repro ${Date.now()}`;
    const result = await a.api.functions.invoke('createMessage', { conversation_id: conv.id, text, reply_to_id: null });
    nettoyer.push(['Message', result.data.id]);
    await a.api.entities.Conversation.update(conv.id, {
      last_message_text: text, last_message_at: result?.data?.created_date || new Date().toISOString(), typing_user_id: null, typing_at: null,
    });
    for (const who of [a, b]) {
      const msgs = await who.api.entities.Message.list('-created_date', 500);
      const mine = msgs.filter((m) => Array.isArray(m.participant_ids) && m.participant_ids.includes(who.me.id));
      const m = mine.find((x) => x.id === result.data.id);
      expect(m, `visible pour ${who.me.id === a.me.id ? 'l’expéditeur' : 'le destinataire'}`).toBeTruthy();
      expect(m.text).toBe(text);
      expect(Number.isNaN(new Date(m.created_date).getTime())).toBe(false);
    }
  });

  it('3. jeton FCM : la mise à jour envoyée par usePushNotifications (avec user_id) est refusée en 404', async () => {
    const token = `repro-fcm-${Date.now()}`;
    const created = await a.api.entities.DeviceToken.create({ user_id: a.me.id, token, platform: 'android', is_active: true, last_seen: new Date().toISOString() });
    nettoyer.push(['DeviceToken', created.id]);
    const rows = await a.api.entities.DeviceToken.filter({ token }, null, 25);
    expect(rows.map((r) => r.id)).toEqual([created.id]);
    // usePushNotifications.upsertTokenInternal : update(existing.id, { user_id, is_active, last_seen, platform })
    let statut = null;
    try {
      await a.api.entities.DeviceToken.update(created.id, { user_id: a.me.id, is_active: true, last_seen: new Date().toISOString(), platform: 'android' });
    } catch (e) { statut = e?.status ?? e?.response?.status ?? null; }
    expect(statut).toBe(404);
    // Sans user_id : accepté (le propriétaire met à jour son propre jeton).
    await a.api.entities.DeviceToken.update(created.id, { is_active: true, last_seen: new Date().toISOString(), platform: 'android' });
  });

  it('3 (correctif). déconnexion puis reconnexion : le jeton est RÉACTIVÉ (src/lib/deviceTokenSync.js)', async () => {
    const token = `repro-fcm3-${Date.now()}`;
    const r1 = await upsertDeviceToken(a.api.entities, { token, platform: 'android', userId: a.me.id });
    nettoyer.push(['DeviceToken', r1.id]);
    expect(r1.action).toBe('creee');
    await deactivateDeviceToken(a.api.entities, token); // déconnexion
    expect((await a.api.entities.DeviceToken.filter({ token }, null, 5))[0].is_active).toBe(false);
    const r2 = await upsertDeviceToken(a.api.entities, { token, platform: 'android', userId: a.me.id }); // reconnexion
    expect(r2.action).toBe('mise-a-jour');
    const lignes = await a.api.entities.DeviceToken.filter({ token }, null, 5);
    expect(lignes).toHaveLength(1);
    expect(lignes[0].is_active).toBe(true);
    // Ligne supprimée côté serveur (id périmé) : recréée au lieu d'échouer.
    await su.collection('DeviceToken').delete(r2.id);
    const vrai = a.api.entities.DeviceToken;
    const entities = { DeviceToken: {
      filter: async () => [{ id: r2.id, token }], // l'app croit encore la ligne présente
      update: (...x) => vrai.update(...x),
      create: (...x) => vrai.create(...x),
    } };
    const r3 = await upsertDeviceToken(entities, { token, platform: 'android', userId: a.me.id });
    nettoyer.push(['DeviceToken', r3.id]);
    expect(r3.action).toBe('recreee');
    expect((await vrai.filter({ token }, null, 5)).filter((l) => l.is_active)).toHaveLength(1);
  });

  it('2. « Tester le push Android » : sendFcmPush répond « accepté » dès que FCM accepte, quel que soit l’affichage', async () => {
    const token = `repro-fcm2-${Date.now()}`;
    const created = await a.api.entities.DeviceToken.create({ user_id: a.me.id, token, platform: 'android', is_active: true, last_seen: new Date().toISOString() });
    nettoyer.push(['DeviceToken', created.id]);
    const r = await a.api.functions.invoke('sendFcmPush', { test: true, title: 'Test de notification Chay', body: 'x', target_type: 'messages' });
    const data = r?.data || r;
    expect(data.tokensFound).toBeGreaterThanOrEqual(1);
    // Le faux FCM accepte : le bouton affiche alors « Firebase a accepté l'envoi… », alors que, sur le téléphone,
    // l'app est au PREMIER PLAN (on vient d'appuyer sur le bouton) : Android n'affiche aucune notification système.
    expect(data.sent).toBeGreaterThanOrEqual(1);
  });
});
