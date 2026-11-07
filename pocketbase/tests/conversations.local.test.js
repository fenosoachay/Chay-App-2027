// Parcours « conversations » de l'app avec le VRAI adaptateur et le VRAI SDK PocketBase,
// contre le bac à sable local : reproduit src/lib/conversations.js (findOrCreateDirect)
// et src/components/messages/GroupSettingsSheet.jsx (ajout / retrait de membres).
import fs from 'node:fs';
import PocketBase from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPocketBaseAdapter } from '@/api/pocketbase/adapter';
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
  return api;
};

// src/lib/conversations.js
async function findOrCreateDirect(base44, user, otherId) {
  const convos = await base44.entities.Conversation.filter({ type: 'direct' }, '-updated_date', 200).catch(() => []);
  const list = Array.isArray(convos) ? convos : [];
  const existing = list.find((c) => c.participant_ids && c.participant_ids.length === 2
    && c.participant_ids.includes(user.id) && c.participant_ids.includes(otherId));
  if (existing) return existing.id;
  const created = await base44.entities.Conversation.create({ type: 'direct', participant_ids: [user.id, otherId] });
  return created.id;
}

describe('conversations en mode PocketBase (bac à sable)', () => {
  let membre;
  let membre2;
  let su;
  const createdIds = [];

  beforeAll(async () => {
    membre = await client('membre');
    membre2 = await client('membre2');
    su = new PocketBase(BASE);
    await su.collection('_superusers').authWithPassword(creds.superuser.email, creds.superuser.password);
  });

  afterAll(async () => {
    for (const id of createdIds) {
      const msgs = await su.collection('Message').getFullList({ filter: su.filter('conversation_id = {:c}', { c: id }), fields: 'id' });
      for (const m of msgs) await su.collection('Message').delete(m.id);
      await su.collection('Conversation').delete(id).catch(() => {});
    }
  });

  it('findOrCreateDirect : crée via la route, puis retrouve la même conversation', async () => {
    const me = await membre.auth.me();
    const id1 = await findOrCreateDirect(membre, me, creds.membre2.id);
    createdIds.push(id1);
    const id2 = await findOrCreateDirect(membre, me, creds.membre2.id);
    expect(id2).toBe(id1);
    const me2 = await membre2.auth.me();
    expect(await findOrCreateDirect(membre2, me2, creds.membre.id)).toBe(id1);
  });

  it('création de groupe (NewChatSheet) puis ajout / retrait de membres (GroupSettingsSheet)', async () => {
    const me = await membre.auth.me();
    const c = await membre.entities.Conversation.create({
      type: 'group', participant_ids: [me.id, creds.membre2.id], name: 'Groupe e2e', photo_url: null, admin_id: me.id,
    });
    createdIds.push(c.id);
    expect(c).toMatchObject({ type: 'group', admin_id: me.id, name: 'Groupe e2e' });
    expect(c).toHaveProperty('created_date');

    const added = await membre.entities.Conversation.update(c.id, { participant_ids: [...c.participant_ids, creds.admin.id] });
    expect(added.participant_ids).toContain(creds.admin.id);
    const removed = await membre.entities.Conversation.update(c.id, { participant_ids: added.participant_ids.filter((x) => x !== creds.admin.id) });
    expect(removed.participant_ids).not.toContain(creds.admin.id);

    // Un membre non admin du groupe : refus explicite, comme l'interface le prévoit.
    await expect(membre2.entities.Conversation.update(c.id, { participant_ids: [me.id, creds.membre2.id, creds.admin.id] }))
      .rejects.toMatchObject({ status: 403 });

    // Mises à jour ordinaires toujours directes.
    const renamed = await membre.entities.Conversation.update(c.id, { name: 'Groupe renommé', last_message_text: 'salut' });
    expect(renamed.name).toBe('Groupe renommé');
  });

  it('message + read_by par l’adaptateur (règle Message corrigée)', async () => {
    const id = createdIds[0];
    const res = await membre.functions.invoke('createMessage', { conversation_id: id, text: 'bonjour' });
    const msgs = await membre2.entities.Message.filter({ conversation_id: id }, '-created_date', 10);
    const m = msgs.find((x) => x.id === res.data.id);
    expect(m).toBeTruthy();
    await membre2.entities.Message.bulkUpdate([{ id: m.id, read_by: [...(m.read_by || []), creds.membre2.id] }]);
    await expect(membre2.entities.Message.update(m.id, { text: 'piraté' })).rejects.toMatchObject({ status: 404 });
  });
});
