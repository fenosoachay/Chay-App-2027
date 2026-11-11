// Ouverture par ?c= (notification) avec le VRAI adaptateur contre le BAC À SABLE :
// participant -> ok ; id inexistant ou non participant -> introuvable ; serveur injoignable -> erreur.
import fs from 'node:fs';
import PocketBase from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPocketBaseAdapter } from '@/api/pocketbase/adapter';
import { reprendreConversation } from '@/lib/conversationReprise';
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
  return { pb, api };
};
const sansAttente = async () => {};
const lireAvec = (api) => (id) => api.entities.Conversation.get(id);
const participant = (uid) => (c) => Array.isArray(c?.participant_ids) && c.participant_ids.includes(uid);

describe('reprise de conversation (bac à sable)', () => {
  let membre;
  let membre2;
  let convId;
  let creee = false;

  beforeAll(async () => {
    membre = await client('membre');
    membre2 = await client('membre2');
    const liste = await membre.api.entities.Conversation.filter({ type: 'direct' }, '-updated_date', 200);
    const existante = liste.find((c) => c.participant_ids?.length === 2 && c.participant_ids.includes(creds.membre.id)
      && c.participant_ids.includes(creds.membre2.id));
    if (existante) convId = existante.id;
    else {
      convId = (await membre.api.entities.Conversation.create({ type: 'direct', participant_ids: [creds.membre.id, creds.membre2.id] })).id;
      creee = true;
    }
  });

  afterAll(async () => {
    if (!creee) return;
    const su = new PocketBase(BASE);
    await retry429(() => su.collection('_superusers').authWithPassword(creds.superuser.email, creds.superuser.password));
    await su.collection('Conversation').delete(convId).catch(() => {});
  });

  it('participant (membre2, ouverture depuis la notification) : ok', async () => {
    const r = await reprendreConversation({ id: convId, lire: lireAvec(membre2.api), estAMoi: participant(creds.membre2.id), attendre: sansAttente });
    expect(r.etat).toBe('ok');
    expect(r.conversation.id).toBe(convId);
  });

  it('id inexistant : introuvable (404 réel, sans nouvel essai)', async () => {
    let appels = 0;
    const lire = (id) => { appels += 1; return membre.api.entities.Conversation.get(id); };
    const r = await reprendreConversation({ id: 'z'.repeat(15), lire, estAMoi: participant(creds.membre.id), attendre: sansAttente });
    expect(r.etat).toBe('introuvable');
    expect(appels).toBe(1);
  });

  it('admin non participant : introuvable dans sa messagerie', async () => {
    const admin = await client('admin');
    const r = await reprendreConversation({ id: convId, lire: lireAvec(admin.api), estAMoi: participant(creds.admin.id), attendre: sansAttente });
    expect(r.etat).toBe('introuvable');
  });

  it('serveur injoignable : erreur (Réessayer), pas introuvable', async () => {
    const hors = new PocketBase('http://127.0.0.1:9');
    hors.autoCancellation(false);
    hors.authStore.save(membre.pb.authStore.token, membre.pb.authStore.record);
    const apiHors = createPocketBaseAdapter(hors, { baseUrl: 'http://127.0.0.1:9' });
    const r = await reprendreConversation({ id: convId, lire: lireAvec(apiHors), attendre: sansAttente });
    expect(r.etat).toBe('erreur');
    expect(r.erreur?.status).toBe(0);
  });
});
