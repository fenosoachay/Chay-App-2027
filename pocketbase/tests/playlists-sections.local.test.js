// Playlists dans toutes les sections (1.3.6), BAC À SABLE, vrai adaptateur : un admin crée Playlist > Sous-playlist
// (YouTube, Articles, Galerie, Musique), y range un contenu comme le formulaire admin (buildPlaylistTrackRecord +
// savePlaylistTrack) ; l'alerte « à ranger » et la navigation membre (contenusDe) voient le bon résultat.
// Prérequis : migration pocketbase/scripts/migrer-playlists.mjs appliquée (migrer-playlists.integration.mjs).
// Tout ce qui est créé est supprimé.
import fs from 'node:fs';
import PocketBase from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPocketBaseAdapter } from '@/api/pocketbase/adapter';
import { buildPlaylistTrackRecord, savePlaylistTrack } from '@/lib/playlistAttachment';
import { arbrePlaylists, contenusDe, contenusNonRanges, optionsSousPlaylists } from '@/lib/playlistsArbre';
import { chargerNonRanges } from '@/components/admin/AlerteRangement';
import { retry429 } from './retry429.js';

const BASE = process.env.PB_TEST_URL || 'http://127.0.0.1:8090';
const credFile = process.env.PB_TEST_CREDENTIALS || 'C:\\PB-local\\identifiants-test.txt';
const creds = Object.fromEntries(fs.readFileSync(credFile, 'utf8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#')).map((l) => { const [k, email, password, id] = l.split('\t'); return [k, { email, password, id }]; }));

const client = () => {
  const pb = new PocketBase(BASE);
  pb.autoCancellation(false);
  return createPocketBaseAdapter(pb, { baseUrl: BASE });
};
const COVER = 'https://exemple.invalid/couverture.jpg';
const CAS = [
  { entite: 'YouTubeVideo', categorie: 'youtube', data: { title: 'Test 136 vidéo', youtube_id: 'dQw4w9WgXcQ' }, media: null, champ: 'thumbnail_url' },
  { entite: 'Article', categorie: 'articles', data: { title: 'Test 136 article', body: '<p>x</p>' }, media: null, champ: 'cover_url' },
  { entite: 'GalleryImage', categorie: 'gallery', data: { title: 'Test 136 photo', image_url: 'https://exemple.invalid/p.jpg' }, media: null, champ: 'image_url' },
  { entite: 'MusicTrack', categorie: 'music', data: { title: 'Test 136 titre', artist: 'Test', audio_url: 'https://exemple.invalid/a.mp3' }, media: 'audio_url', champ: 'cover_url' },
];

describe('playlists et sous-playlists dans toutes les sections (bac à sable)', () => {
  let adm;
  let membre;
  const crees = []; // [entité, id]

  beforeAll(async () => {
    adm = client();
    membre = client();
    await retry429(() => adm.auth.loginViaEmailPassword(creds.admin.email, creds.admin.password));
    await retry429(() => membre.auth.loginViaEmailPassword(creds.membre.email, creds.membre.password));
  });

  afterAll(async () => {
    for (const [e, id] of crees.reverse()) await adm.entities[e].delete(id).catch(() => {});
  });

  for (const c of CAS) {
    it(`${c.entite} : rangé dans une sous-playlist, vu par le membre, absent de l'alerte`, async () => {
      const p = await adm.entities.Playlist.create({ name: `Test 136 ${c.categorie}`, category: c.categorie, cover_url: COVER, parent_id: '' });
      crees.push(['Playlist', p.id]);
      const sp = await adm.entities.Playlist.create({ name: 'Sous-playlist test', category: c.categorie, cover_url: COVER, parent_id: p.id });
      crees.push(['Playlist', sp.id]);
      const item = await adm.entities[c.entite].create({ ...c.data, created_by_admin: true });
      crees.push([c.entite, item.id]);
      const libre = await adm.entities[c.entite].create({ ...c.data, title: `${c.data.title} non rangé`, created_by_admin: true });
      crees.push([c.entite, libre.id]);

      // Comme EntityCrud.attachToPlaylist.
      const record = buildPlaylistTrackRecord({ entity: c.entite, playlistId: sp.id, item, submittedData: c.data, coverField: c.champ });
      const lien = await savePlaylistTrack(adm.entities.PlaylistTrack, record, c.media, { checkExisting: false });
      crees.push(['PlaylistTrack', lien.id]);
      expect(lien.playlist_id).toBe(sp.id);

      // Membre : Section > Playlist > Sous-playlist > contenu.
      const playlists = await membre.entities.Playlist.list('-created_date', 2000);
      const liens = await membre.entities.PlaylistTrack.list('-created_date', 20000);
      const contenus = await membre.entities[c.entite].filter({ id: { $in: [item.id, libre.id] } }, '-created_date', 10);
      const arbre = arbrePlaylists(playlists, c.categorie);
      const noeud = arbre.find((x) => x.id === p.id);
      expect(noeud.sous.map((s) => s.id)).toEqual([sp.id]);
      expect(optionsSousPlaylists(arbre)).toContainEqual({ value: sp.id, label: `Test 136 ${c.categorie} › Sous-playlist test` });
      expect(contenusDe(sp.id, liens, contenus).map((x) => x.id)).toEqual([item.id]);
      expect(contenusNonRanges(contenus, liens, arbre).map((x) => x.id)).toEqual([libre.id]); // reste visible (non classés)

      // Alerte admin : le contenu non rangé y figure, pas le contenu rangé.
      const alerte = (await chargerNonRanges(adm.entities)).find((s) => s.entite === c.entite);
      const ids = alerte.restants.map((x) => x.id);
      expect(ids).toContain(libre.id);
      expect(ids).not.toContain(item.id);
    });
  }

  it("un membre ne peut ni créer de sous-playlist ni ranger un contenu", async () => {
    await expect(membre.entities.Playlist.create({ name: 'x', category: 'youtube', cover_url: COVER, parent_id: '' })).rejects.toBeTruthy();
    await expect(membre.entities.PlaylistTrack.create({ playlist_id: 'x', track_id: 'y', title: 'z' })).rejects.toBeTruthy();
  });
});
