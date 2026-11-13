// 1.3.9 — Bug « sélecteur de sous-playlist vide » : parcours complet avec le VRAI adaptateur PocketBase et les
// vraies fonctions du formulaire admin (arbre, options du sélecteur, lien PlaylistTrack) puis de la page
// Multimédia (contenus d'une sous-playlist), dans les 5 sections, contre le bac à sable local.
// La cause (champ Playlist.parent_id absent : rattachement ignoré en silence) est reproduite sur une copie
// jetable sans ce champ : pocketbase/tests/sous-playlists-schema.integration.mjs.
import fs from 'node:fs';
import PocketBase from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPocketBaseAdapter } from '@/api/pocketbase/adapter';
import { arbrePlaylists, contenusDe, contenusNonRanges, optionsSousPlaylists, CATEGORIE_PLAYLIST } from '@/lib/playlistsArbre';
import { buildPlaylistTrackRecord, savePlaylistTrack } from '@/lib/playlistAttachment';
import { champPerdu, schemaSansSousPlaylists } from '@/lib/playlist';
import { retry429 } from './retry429.js';

const BASE = process.env.PB_TEST_URL || 'http://127.0.0.1:8090';
const creds = Object.fromEntries(fs.readFileSync(process.env.PB_TEST_CREDENTIALS || 'C:/PB-local/identifiants-test.txt', 'utf8')
  .split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => { const [k, email, password] = l.split('\t'); return [k, { email, password }]; }));
const client = async (who) => {
  const pb = new PocketBase(BASE);
  pb.autoCancellation(false);
  const api = createPocketBaseAdapter(pb, { baseUrl: BASE });
  await retry429(() => api.auth.loginViaEmailPassword(creds[who].email, creds[who].password));
  return api;
};
const COUV = 'https://exemple.invalid/couverture.jpg';
// Contenu minimal par section (champs obligatoires du schéma).
const CONTENUS = {
  MusicTrack: { title: 'Test sous-playlist piste', artist: 'Chorale', audio_url: 'https://exemple.invalid/a.mp3' },
  Sermon: { title: 'Test sous-playlist prédication', audio_url: 'https://exemple.invalid/s.mp3', speaker: 'Orateur', date: '2026-11-13' },
  YouTubeVideo: { title: 'Test sous-playlist YouTube', youtube_id: 'abcdefghijk', section: 'culte' },
  Article: { title: 'Test sous-playlist article', body: '<p>x</p>' },
  GalleryImage: { title: 'Test sous-playlist image', image_url: 'https://exemple.invalid/i.jpg' },
};
const MEDIA = { MusicTrack: 'audio_url', Sermon: 'audio_url' };

describe('sous-playlists : sélecteur rempli, classement enregistré, contenu visible du membre', () => {
  let admin;
  let membre;
  const crees = [];
  beforeAll(async () => { admin = await client('admin'); membre = await client('membre'); });
  afterAll(async () => { for (const [e, id] of crees.reverse()) await admin.entities[e].delete(id).catch(() => {}); });

  for (const entite of Object.keys(CONTENUS)) {
    const categorie = CATEGORIE_PLAYLIST[entite];
    it(`${entite} (${categorie})`, async () => {
      // 1. Playlist puis sous-playlist, comme la fenêtre « Nouvelle playlist » / « Nouvelle sous-playlist ».
      const envoyeP = { name: `Test SP ${categorie}`, description: null, cover_url: COUV, category: categorie, parent_id: '' };
      const p = await admin.entities.Playlist.create(envoyeP);
      crees.push(['Playlist', p.id]);
      const envoyeS = { name: `Test SP ${categorie} sous`, description: null, cover_url: COUV, category: categorie, parent_id: p.id };
      const s = await admin.entities.Playlist.create(envoyeS);
      crees.push(['Playlist', s.id]);
      expect(champPerdu(envoyeS, await admin.entities.Playlist.get(s.id))).toBe(null);

      // 2. Sélecteur du formulaire (même chargement que EntityCrud.loadPlaylists).
      const liste = await admin.entities.Playlist.list('-created_date', 1000);
      expect(schemaSansSousPlaylists(liste)).toBe(false);
      const options = optionsSousPlaylists(arbrePlaylists(liste, categorie));
      expect(options).toContainEqual({ value: s.id, label: `Test SP ${categorie} › Test SP ${categorie} sous` });

      // 3. Contenu créé puis rangé (même lien que le formulaire : buildPlaylistTrackRecord + savePlaylistTrack).
      const contenu = await admin.entities[entite].create(CONTENUS[entite]);
      crees.push([entite, contenu.id]);
      const lien = buildPlaylistTrackRecord({ entity: entite, playlistId: s.id, item: contenu, submittedData: CONTENUS[entite] });
      const enregistre = await savePlaylistTrack(admin.entities.PlaylistTrack, lien, MEDIA[entite] || null);
      if (enregistre?.id) crees.push(['PlaylistTrack', enregistre.id]);

      // 4. Côté membre : le contenu est dans la sous-playlist, et n'est plus « à ranger ».
      const [pls, liens, contenus] = await Promise.all([
        membre.entities.Playlist.list('-created_date', 2000),
        membre.entities.PlaylistTrack.list('-created_date', 20000),
        membre.entities[entite].filter({ id: contenu.id }, '-created_date', 1),
      ]);
      const arbre = arbrePlaylists(pls, categorie);
      expect(contenusDe(s.id, liens, contenus).map((c) => c.id)).toEqual([contenu.id]);
      expect(contenusNonRanges(contenus, liens, arbre)).toEqual([]);
    });
  }

  it('serveur : 3e niveau, autre section, parente absente et écriture par un membre refusés', async () => {
    const p = await admin.entities.Playlist.create({ name: 'Test SP racine', cover_url: COUV, category: 'articles', parent_id: '' });
    crees.push(['Playlist', p.id]);
    const s = await admin.entities.Playlist.create({ name: 'Test SP sous', cover_url: COUV, category: 'articles', parent_id: p.id });
    crees.push(['Playlist', s.id]);
    await expect(admin.entities.Playlist.create({ name: 'Test SP niveau 3', cover_url: COUV, category: 'articles', parent_id: s.id })).rejects.toThrow(/seul niveau/i);
    await expect(admin.entities.Playlist.create({ name: 'Test SP autre section', cover_url: COUV, category: 'gallery', parent_id: p.id })).rejects.toThrow(/même section/i);
    await expect(admin.entities.Playlist.create({ name: 'Test SP orpheline', cover_url: COUV, category: 'articles', parent_id: 'inexistant123456' })).rejects.toThrow(/introuvable/i);
    await expect(admin.entities.Playlist.update(p.id, { parent_id: s.id })).rejects.toThrow();
    await expect(membre.entities.Playlist.create({ name: 'Test SP membre', cover_url: COUV, category: 'articles', parent_id: p.id })).rejects.toThrow();
  });
});
