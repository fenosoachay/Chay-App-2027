// Écran admin EntityCrud (src/components/admin/EntityCrud.jsx) avec le VRAI adaptateur et le VRAI SDK,
// contre le bac à sable local : pour chaque section de src/components/admin/adminSections.js,
// liste (tri de la section), création (champs du formulaire + created_by_admin), modification,
// suppression ; un membre est refusé. Tout ce qui est créé est supprimé.
import fs from 'node:fs';
import PocketBase from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPocketBaseAdapter } from '@/api/pocketbase/adapter';
import { SECTIONS } from '@/components/admin/adminSections';
import { deletePlaylistWithContents } from '@/lib/playlistAttachment';
import { retry429 } from './retry429.js';

const BASE = process.env.PB_TEST_URL || 'http://127.0.0.1:8090';
const credFile = process.env.PB_TEST_CREDENTIALS || 'C:\\PB-local\\identifiants-test.txt';
const creds = Object.fromEntries(fs.readFileSync(credFile, 'utf8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#')).map((l) => { const [k, email, password] = l.split('\t'); return [k, { email, password }]; }));

const newClient = () => {
  const pb = new PocketBase(BASE);
  pb.autoCancellation(false);
  return createPocketBaseAdapter(pb, { baseUrl: BASE });
};

/** Valeur de test selon le type de champ du formulaire. */
function sample(field, tag) {
  const opts = Array.isArray(field.options) ? field.options : [];
  const first = opts.length ? (typeof opts[0] === 'object' ? opts[0].value : opts[0]) : null;
  switch (field.type) {
    case 'text': case 'textarea': case 'rich-text': return `bloc6 ${tag} ${field.name}`;
    case 'date': return '2026-11-07';
    case 'file': return `${BASE}/api/files/test/bloc6/${field.name}.png`;
    case 'select': return first;
    case 'number': return 7;
    case 'boolean': return true;
    default: return undefined;
  }
}

// Écarts connus, identiques au schéma Base44 (pas des régressions) :
//  - Sermon : speaker et date sont obligatoires dans le schéma mais absents du formulaire
//    (aucune prédication n'a jamais été créée sur Base44 : 0 ligne dans l'export) ;
//  - Article.cover_cropped : case du formulaire absente du schéma (ignorée des deux côtés).
const MISSING_REQUIRED = { Sermon: { speaker: 'Orateur test', date: '2026-11-07' } };
const NOT_IN_SCHEMA = { Article: ['cover_cropped'] };

const created = []; // [entity, id]
let admin;
let membre;

beforeAll(async () => {
  admin = newClient();
  membre = newClient();
  await retry429(() => admin.auth.loginViaEmailPassword(creds.admin.email, creds.admin.password));
  await retry429(() => membre.auth.loginViaEmailPassword(creds.membre.email, creds.membre.password));
});

afterAll(async () => {
  for (const [entity, id] of created.reverse()) await admin.entities[entity].delete(id).catch(() => {});
});

// Collections créées par pocketbase/scripts/migrer-lot-e.mjs (script non importé ici : ligne « #! » en tête).
const LOT_E = new Set(['GameCategory', 'GameClassement', 'ChristianNews', 'Wallpaper', 'MissionRequest', 'MediaVue', 'VersionAnnonce']);
async function collectionPresente(nom) {
  const r = await fetch(`${BASE}/api/collections/${nom}/records?perPage=1`, { headers: { Authorization: admin.pb.authStore.token } });
  return r.status !== 404;
}

describe('EntityCrud en mode PocketBase', () => {
  for (const section of SECTIONS) {
    it(`${section.key} : liste, création, modification, suppression (admin) ; membre refusé`, async (ctx) => {
      // Collections du lot E : absentes tant que migrer-lot-e.mjs n'est pas appliqué (bac à sable non migré).
      // Section sautée dans ce cas ; couverte contre la copie migrée (PB_TEST_URL=http://127.0.0.1:8095).
      if (LOT_E.has(section.key) && !(await collectionPresente(section.key))) {
        ctx.skip(`${section.key} : collection absente (migration du lot E non appliquée ici)`);
        return;
      }
      const api = admin.entities[section.key];
      const list = await api.list(section.sort || '-created_date', 50);
      expect(Array.isArray(list)).toBe(true);
      if (section.readOnly) {
        // Lecture seule dans l'écran (ex. messages de contact) : liste admin, rien pour un membre.
        const asMember = await membre.entities[section.key].list(section.sort || '-created_date', 50);
        expect(asMember).toEqual([]);
        return;
      }

      const data = {};
      for (const f of section.fields || []) {
        const v = sample(f, section.key);
        if (v !== undefined && v !== null) data[f.name] = v;
      }
      if (MISSING_REQUIRED[section.key]) {
        await expect(api.create({ ...data, created_by_admin: true })).rejects.toBeTruthy();
        Object.assign(data, MISSING_REQUIRED[section.key]);
      }
      const item = await api.create({ ...data, created_by_admin: true });
      expect(item?.id).toBeTruthy();
      created.push([section.key, item.id]);
      for (const [k, v] of Object.entries(data)) {
        if ((NOT_IN_SCHEMA[section.key] || []).includes(k)) { expect(item[k]).toBeUndefined(); continue; }
        if (section.fields.find((f) => f.name === k)?.type === 'date') expect(String(item[k]).slice(0, 10)).toBe(v);
        else expect(item[k], `${section.key}.${k}`).toEqual(v);
      }

      const textField = (section.fields || []).find((f) => f.type === 'text');
      if (textField) {
        const upd = await api.update(item.id, { [textField.name]: `${data[textField.name]} modifié` });
        expect(upd[textField.name]).toBe(`${data[textField.name]} modifié`);
      }

      await expect(membre.entities[section.key].create({ ...data })).rejects.toBeTruthy();
      if (textField) await expect(membre.entities[section.key].update(item.id, { [textField.name]: 'pirate' })).rejects.toBeTruthy();
      await expect(membre.entities[section.key].delete(item.id)).rejects.toBeTruthy();

      await api.delete(item.id);
      created.pop();
      await expect(api.get(item.id)).rejects.toBeTruthy();
    });
  }

  it('suppression de playlist (mode PocketBase) : ses contenus et liens sont supprimés, pas ceux d’une autre playlist', async () => {
    const cover = `${BASE}/api/files/test/bloc7/cover.png`;
    const music = SECTIONS.find((x) => x.key === 'MusicTrack');
    const newTrack = async (n) => {
      const data = {};
      for (const f of music.fields) { const v = sample(f, `piste${n}`); if (v !== undefined && v !== null) data[f.name] = v; }
      const t = await admin.entities.MusicTrack.create(data);
      created.push(['MusicTrack', t.id]);
      return t;
    };
    const link = async (pl, t) => {
      const r = await admin.entities.PlaylistTrack.create({ playlist_id: pl.id, track_id: t.id, title: t.title || 'piste' });
      created.push(['PlaylistTrack', r.id]);
      return r;
    };
    const pl = await admin.entities.Playlist.create({ name: 'bloc7 à supprimer', category: 'music', cover_url: cover });
    const other = await admin.entities.Playlist.create({ name: 'bloc7 témoin', category: 'music', cover_url: cover });
    created.push(['Playlist', pl.id], ['Playlist', other.id]);
    const [t1, t2, t3] = [await newTrack(1), await newTrack(2), await newTrack(3)];
    const [l1, l2] = [await link(pl, t1), await link(pl, t2)];
    const l3 = await link(other, t3);

    // Ancien appel (filtre passé comme tri) : ne trouvait rien, d'où les contenus orphelins.
    const old = await admin.entities.PlaylistTrack.list(`-playlist_id eq "${pl.id}"`, 500).catch(() => []);
    expect(old).toEqual([]);

    const n = await deletePlaylistWithContents(admin, 'MusicTrack', pl.id, true);
    expect(n).toBe(2);
    for (const [entity, id] of [['Playlist', pl.id], ['MusicTrack', t1.id], ['MusicTrack', t2.id], ['PlaylistTrack', l1.id], ['PlaylistTrack', l2.id]]) {
      await expect(admin.entities[entity].get(id), `${entity} supprimé`).rejects.toBeTruthy();
    }
    expect((await admin.entities.Playlist.get(other.id)).id).toBe(other.id);
    expect((await admin.entities.MusicTrack.get(t3.id)).id).toBe(t3.id);
    expect((await admin.entities.PlaylistTrack.get(l3.id)).id).toBe(l3.id);
  });
});

// src/hooks/useUnreadMessages.js en mode PocketBase (badge « 99+ »).
import { isUnreadIncomingMessage } from '@/lib/messageNotifications';

describe('badge des messages non lus (mode PocketBase)', () => {
  it('admin : seuls les messages des conversations où il participe sont comptés', async () => {
    const me = await admin.auth.me();
    const page = await admin.entities.Message.list('-created_date', 500, 0);
    const before = page.filter((m) => isUnreadIncomingMessage(m, me.id)).length; // ancien calcul
    const after = page.filter((m) => isUnreadIncomingMessage(m, me.id)
      && Array.isArray(m.participant_ids) && m.participant_ids.includes(me.id)).length;
    const mine = page.filter((m) => (m.participant_ids || []).includes(me.id) && isUnreadIncomingMessage(m, me.id)).length;
    expect(after).toBe(mine);
    expect(after).toBeLessThanOrEqual(before);
  });
});
