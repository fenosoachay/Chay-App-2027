// 1.3.9 — Ordre du multimédia choisi par l'admin et vu par les membres, avec le VRAI module d'enregistrement
// (src/hooks/useOrdreMedia.js) et le vrai adaptateur. Collection MediaOrder : migration 1.3.9 ; tant qu'elle n'est
// pas appliquée sur le serveur testé (bac à sable), le test est sauté ; il passe contre la copie migrée
// (PB_TEST_URL=http://127.0.0.1:8095).
import fs from 'node:fs';
import PocketBase from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPocketBaseAdapter } from '@/api/pocketbase/adapter';
import { appliquerOrdre, ordresParCle, cleYoutube, cleGalerie, CLE_SECTIONS } from '@/lib/ordreMedia';
import { enregistrerOrdreChamp } from '@/lib/ordreChamp';
import { trierFonds } from '@/lib/fondsEcran';
import { CATEGORIES } from '@/lib/mediaConstants';
import { retry429 } from './retry429.js';

const BASE = process.env.PB_TEST_URL || 'http://127.0.0.1:8090';
const holder = vi.hoisted(() => ({ api: null }));
vi.mock('@/api/base44Client', () => ({ get base44() { return holder.api; } }));
const { enregistrerOrdreMedia, _reinitialiserOrdresMedia } = await import('@/hooks/useOrdreMedia');
const creds = Object.fromEntries(fs.readFileSync(process.env.PB_TEST_CREDENTIALS || 'C:/PB-local/identifiants-test.txt', 'utf8')
  .split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => { const [k, email, password] = l.split('\t'); return [k, { email, password }]; }));
const client = async (who) => {
  const pb = new PocketBase(BASE);
  pb.autoCancellation(false);
  const api = createPocketBaseAdapter(pb, { baseUrl: BASE });
  await retry429(() => api.auth.loginViaEmailPassword(creds[who].email, creds[who].password));
  return api;
};

describe('ordre du multimédia : admin -> membres', () => {
  let admin;
  let membre;
  let presente = false;
  const crees = [];
  const ordresAvant = [];
  beforeAll(async () => {
    admin = await client('admin');
    membre = await client('membre');
    const r = await fetch(`${BASE}/api/collections/MediaOrder/records?perPage=200`, { headers: { Authorization: admin.pb.authStore.token } });
    presente = r.status !== 404;
    if (presente) ordresAvant.push(...((await r.json()).items || []));
  });
  afterAll(async () => {
    if (!presente) return;
    for (const [e, id] of crees.reverse()) await admin.entities[e].delete(id).catch(() => {});
    // Ordres remis comme avant le test (lignes créées supprimées, lignes existantes restaurées).
    const apres = await admin.entities.MediaOrder.list('-created_date', 200);
    for (const r of apres) {
      const avant = ordresAvant.find((x) => x.id === r.id);
      if (!avant) await admin.entities.MediaOrder.delete(r.id).catch(() => {});
      else await admin.entities.MediaOrder.update(r.id, { ids: avant.ids }).catch(() => {});
    }
  });

  it('sections, YouTube, Galerie (MediaOrder) et Fonds d’écran (order) : ordre de l’admin lu par un membre', async (ctx) => {
    if (!presente) { ctx.skip('collection MediaOrder absente (migration 1.3.9 non appliquée ici)'); return; }
    holder.api = admin;
    _reinitialiserOrdresMedia();
    const sections = ['gallery', 'radio', 'music', 'youtube'];
    await enregistrerOrdreMedia(CLE_SECTIONS, sections);
    const v1 = await admin.entities.YouTubeVideo.create({ title: 'Test ordre 1', youtube_id: 'aaaaaaaaaaa', section: 'culte' });
    const v2 = await admin.entities.YouTubeVideo.create({ title: 'Test ordre 2', youtube_id: 'bbbbbbbbbbb', section: 'culte' });
    const g1 = await admin.entities.GalleryImage.create({ title: 'Test ordre g1', image_url: 'https://exemple.invalid/1.jpg', category: 'eglise' });
    const g2 = await admin.entities.GalleryImage.create({ title: 'Test ordre g2', image_url: 'https://exemple.invalid/2.jpg', category: 'eglise' });
    crees.push(['YouTubeVideo', v1.id], ['YouTubeVideo', v2.id], ['GalleryImage', g1.id], ['GalleryImage', g2.id]);
    await enregistrerOrdreMedia(cleYoutube('culte'), [v2.id, v1.id]);
    await enregistrerOrdreMedia(cleGalerie('eglise'), [g2.id, g1.id]);
    await enregistrerOrdreMedia(cleYoutube('culte'), [v1.id, v2.id]); // mise à jour de la même ligne

    // Membre : lecture seule, même ordre.
    const ordres = ordresParCle(await membre.entities.MediaOrder.list('-created_date', 500));
    expect(appliquerOrdre(CATEGORIES, ordres.get(CLE_SECTIONS), { nouveauxEnTete: false }).slice(0, 4).map((c) => c.id)).toEqual(sections);
    const yt = await membre.entities.YouTubeVideo.filter({ id: { $in: [v1.id, v2.id] } }, '-created_date', 10);
    expect(appliquerOrdre(yt, ordres.get(cleYoutube('culte'))).map((v) => v.id)).toEqual([v1.id, v2.id]);
    const gal = await membre.entities.GalleryImage.filter({ id: { $in: [g1.id, g2.id] } }, '-created_date', 10);
    expect(appliquerOrdre(gal, ordres.get(cleGalerie('eglise'))).map((g) => g.id)).toEqual([g2.id, g1.id]);
    expect((await admin.entities.MediaOrder.list('-created_date', 500)).filter((r) => r.key === cleYoutube('culte'))).toHaveLength(1);

    // Membre : écriture refusée.
    await expect(membre.entities.MediaOrder.create({ key: 'youtube:louange', ids: ['x'] })).rejects.toThrow();
    const ligne = (await membre.entities.MediaOrder.list('-created_date', 500)).find((r) => r.key === CLE_SECTIONS);
    await expect(membre.entities.MediaOrder.update(ligne.id, { ids: ['radio'] })).rejects.toThrow();

    // Fonds d'écran : champ order.
    const f1 = await admin.entities.Wallpaper.create({ title: 'Test ordre f1', image_url: 'https://exemple.invalid/f1.jpg' });
    const f2 = await admin.entities.Wallpaper.create({ title: 'Test ordre f2', image_url: 'https://exemple.invalid/f2.jpg' });
    crees.push(['Wallpaper', f1.id], ['Wallpaper', f2.id]);
    await enregistrerOrdreChamp([f2, f1], (id, d) => admin.entities.Wallpaper.update(id, d));
    const fonds = trierFonds(await membre.entities.Wallpaper.filter({ id: { $in: [f1.id, f2.id] } }, '-created_date', 10));
    expect(fonds.map((f) => f.id)).toEqual([f2.id, f1.id]);
  });
});
