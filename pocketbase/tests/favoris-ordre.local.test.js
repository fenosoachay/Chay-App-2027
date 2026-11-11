// Ordre des favoris (« Votre Playlist ») enregistré par un membre avec le VRAI adaptateur, BAC À SABLE :
// reproduit Media.reorderFavoriteItems (update `order` par id) puis relit l'ordre.
import fs from 'node:fs';
import PocketBase from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPocketBaseAdapter } from '@/api/pocketbase/adapter';
import { groupMusicFavorites } from '@/lib/favoritePlaylists';
import { deplacer } from '@/lib/glisserOrdre';
import { retry429 } from './retry429.js';

const BASE = process.env.PB_TEST_URL || 'http://127.0.0.1:8090';
const credFile = process.env.PB_TEST_CREDENTIALS || 'C:\\PB-local\\identifiants-test.txt';
const creds = Object.fromEntries(fs.readFileSync(credFile, 'utf8').split(/\r?\n/)
  .filter((l) => l && !l.startsWith('#')).map((l) => { const [k, email, password, id] = l.split('\t'); return [k, { email, password, id }]; }));

describe('ordre des favoris (bac à sable)', () => {
  let api;
  const crees = [];

  beforeAll(async () => {
    const pb = new PocketBase(BASE);
    pb.autoCancellation(false);
    api = createPocketBaseAdapter(pb, { baseUrl: BASE });
    await retry429(() => api.auth.loginViaEmailPassword(creds.membre.email, creds.membre.password));
    const base = { category: 'music', kind: 'audio', audio_url: 'https://exemple.invalid/a.mp3' };
    for (const [i, src] of [['a', 'pa'], ['b', 'pb'], ['c', 'pa']].entries()) {
      crees.push(await api.entities.PlaylistItem.create({
        ...base, track_id: `test-ordre-${src[0]}`, title: `Test ordre ${src[0]}`, source_playlist_id: `test-${src[1]}`,
        source_playlist_name: src[1], order: i, playlist_order: 0,
      }));
    }
  });

  afterAll(async () => {
    for (const it of crees) await api.entities.PlaylistItem.delete(it.id).catch(() => {});
  });

  it('le membre enregistre le nouvel ordre (titres de playlists d’origine différentes) et le relit', async () => {
    const lire = async () => (await api.entities.PlaylistItem.list('order', 500)).filter((i) => crees.some((c) => c.id === i.id));
    const affiche = groupMusicFavorites(await lire())[0].items;
    expect(affiche.map((i) => i.title)).toEqual(['Test ordre a', 'Test ordre b', 'Test ordre c']);
    const nouvelOrdre = deplacer(affiche, 2, 0); // « c » glissé en haut
    for (const [order, item] of nouvelOrdre.entries()) await api.entities.PlaylistItem.update(item.id, { order });
    const relu = groupMusicFavorites(await lire())[0].items;
    expect(relu.map((i) => i.title)).toEqual(['Test ordre c', 'Test ordre a', 'Test ordre b']);
  });
});
