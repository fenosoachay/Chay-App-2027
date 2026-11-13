// Bout en bout « fichiers » : le VRAI src/lib/upload.js (uploadToBase44) et le VRAI adaptateur PocketBase,
// contre le bac à sable local et le faux S3 local (pocketbase/tests/faux-s3.mjs). Aucun accès extérieur.
// Reproduit les écrans qui téléversent : photo de profil / publication (membre), média admin (MediaUploader,
// FieldInput), vidéo > 100 Mo (R2 multipart).
import crypto from 'node:crypto';
import fs from 'node:fs';
import PocketBase from 'pocketbase';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPocketBaseAdapter } from '@/api/pocketbase/adapter';
import { retry429 } from './retry429.js';
import { loadFauxS3Env, s3Fetch } from './sigv4-node.mjs';
import { navigateur, recadrerDansNavigateur, tailleJpeg } from './navigateur-recadrage.mjs';

const BASE = process.env.PB_TEST_URL || 'http://127.0.0.1:8090';
const holder = vi.hoisted(() => ({ api: null }));
vi.mock('@/api/backendConfig', async (orig) => ({ ...(await orig()), BACKEND: 'pocketbase', IS_POCKETBASE: true }));
vi.mock('@/api/base44Client', () => ({ get base44() { return holder.api; } }));
const { uploadToBase44 } = await import('@/lib/upload');

const creds = Object.fromEntries(fs.readFileSync(process.env.PB_TEST_CREDENTIALS || 'C:\\PB-local\\identifiants-test.txt', 'utf8')
  .split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => { const [k, email, password] = l.split('\t'); return [k, { email, password }]; }));
const MIO = 1024 * 1024;
const s3env = loadFauxS3Env();
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const pad = (head, size) => Buffer.concat([head, crypto.randomBytes(Math.max(0, size - head.length))]);
const MP3 = (size) => pad(Buffer.from('4944330300000000000f', 'hex'), size);
const MP4 = (size) => pad(Buffer.concat([Buffer.from('0000001866747970', 'hex'), Buffer.from('mp42\0\0\0\0mp42isom')]), size);
const fileOf = (buf, name, type) => new File([buf], name, { type, lastModified: Date.now() + Math.floor(Math.random() * 1e6) });

async function signIn(who) {
  const pb = new PocketBase(BASE);
  pb.autoCancellation(false);
  const api = createPocketBaseAdapter(pb, { baseUrl: BASE });
  await retry429(() => api.auth.loginViaEmailPassword(creds[who].email, creds[who].password));
  return api;
}
const download = async (url) => Buffer.from(await (await fetch(url)).arrayBuffer());
const recordIdOf = (url) => /\/api\/files\/[^/]+\/([a-f0-9]{24})\//.exec(url)?.[1];

describe('fichiers en mode PocketBase (vrai upload.js + vrai adaptateur)', () => {
  let su;
  let membre;
  let admin;
  const cleanup = { Fichier: [], FichierAdmin: [], objects: [] };
  const photosAvant = [];

  beforeAll(async () => {
    su = new PocketBase(BASE);
    su.autoCancellation(false);
    await retry429(() => su.collection('_superusers').authWithPassword(creds.superuser.email, creds.superuser.password));
    membre = await signIn('membre');
    admin = await signIn('admin');
  });

  afterAll(async () => {
    for (const { id, avant } of photosAvant) await su.collection('users').update(id, avant).catch(() => {});
    for (const col of ['Fichier', 'FichierAdmin']) for (const id of cleanup[col]) await su.collection(col).delete(id).catch(() => {});
    for (const key of cleanup.objects) await s3Fetch(s3env, 'DELETE', `/${s3env.R2_BUCKET}/${key}`);
  });

  it('membre : photo (Community, profil) -> Fichier, adresse publique, propriétaire = membre', async () => {
    holder.api = membre;
    const progress = [];
    const url = await uploadToBase44(fileOf(PNG, 'photo.png', 'image/png'), { onProgress: (p) => progress.push(p) });
    const id = recordIdOf(url);
    cleanup.Fichier.push(id);
    expect(url).toMatch(new RegExp(`^${BASE}/api/files/`));
    expect((await download(url)).equals(PNG)).toBe(true);
    expect((await su.collection('Fichier').getOne(id)).proprietaire).toBe(membre.pb.authStore.record.id);
    expect(progress.at(-1)).toBe(100);
  });

  it('membre : image recadrée (Blob sans nom, CroppableUploader) via Core.UploadFile', async () => {
    holder.api = membre;
    const { file_url: url } = await membre.integrations.Core.UploadFile({ file: new Blob([PNG], { type: 'image/png' }) });
    cleanup.Fichier.push(recordIdOf(url));
    expect((await download(url)).equals(PNG)).toBe(true);
  });

  it('membre : fichier de 16 Mo -> refusé (morceaux réservés aux admins)', async () => {
    holder.api = membre;
    await expect(uploadToBase44(fileOf(MP3(16 * MIO), 'long.mp3', 'audio/mpeg'))).rejects.toThrow(/HTTP 403/);
  });

  it('membre : type non autorisé -> message en français', async () => {
    holder.api = membre;
    await expect(uploadToBase44(fileOf(Buffer.from('pas une image'), 'x.png', 'image/png'))).rejects.toMatchObject({ message: 'Type de fichier non autorisé' });
  });

  it('admin : média de 15 Mo forcé en morceaux (MediaUploader) -> envoi direct dans FichierAdmin', async () => {
    holder.api = admin;
    const buf = MP3(2 * MIO);
    const url = await uploadToBase44(fileOf(buf, 'chant.mp3', 'audio/mpeg'), { forceChunked: true });
    cleanup.FichierAdmin.push(recordIdOf(url));
    expect(sha(await download(url))).toBe(sha(buf));
  });

  it('admin : audio de 20 Mo -> upload_chunk (3 morceaux), progression, contenu identique', async () => {
    holder.api = admin;
    const buf = MP3(20 * MIO + 4321);
    const details = [];
    const url = await uploadToBase44(fileOf(buf, 'prédication.mp3', 'audio/mpeg'), { onDetail: (d) => details.push(d.uploadedBytes) });
    cleanup.FichierAdmin.push(recordIdOf(url));
    expect(url).toMatch(/\/f_[a-z0-9]{20}\.mp3$/);
    expect(sha(await download(url))).toBe(sha(buf));
    expect(details.at(-1)).toBe(buf.length);
  });

  it('admin : vidéo de 101 Mo -> R2 multipart (13 parts présignées), adresse publique, contenu identique', async () => {
    holder.api = admin;
    const buf = MP4(101 * MIO);
    const url = await uploadToBase44(fileOf(buf, 'Culte du dimanche.mp4', 'video/mp4'));
    const key = url.slice(s3env.R2_PUBLIC_BASE_URL.length + 1);
    cleanup.objects.push(decodeURIComponent(key));
    expect(url).toMatch(new RegExp(`^${s3env.R2_PUBLIC_BASE_URL}/videos/\\d{4}/\\d{2}/[a-z0-9]{16}-culte-du-dimanche\\.mp4$`));
    expect(sha(await download(url))).toBe(sha(buf));
  });

  // Lot E (7) : un mp3 de prédication de plus de 100 Mo recevait 415 (« Seules les vidéos… ») : il va maintenant sur R2.
  it('admin : mp3 de prédication de 101 Mo -> R2 multipart, adresse publique .mp3, contenu identique', async () => {
    holder.api = admin;
    const buf = MP3(101 * MIO);
    const url = await uploadToBase44(fileOf(buf, 'Prédication du 9 novembre.mp3', 'audio/mpeg'));
    cleanup.objects.push(decodeURIComponent(url.slice(s3env.R2_PUBLIC_BASE_URL.length + 1)));
    expect(url).toMatch(new RegExp(`^${s3env.R2_PUBLIC_BASE_URL}/videos/\\d{4}/\\d{2}/[a-z0-9]{16}-predication-du-9-novembre\\.mp3$`));
    expect(sha(await download(url))).toBe(sha(buf));
  });

  it('admin : mp3 de 101 Mo annoncé sans type (certains Android) -> R2 quand même', async () => {
    holder.api = admin;
    const buf = MP3(101 * MIO);
    const url = await uploadToBase44(fileOf(buf, 'enregistrement.mp3', ''));
    cleanup.objects.push(decodeURIComponent(url.slice(s3env.R2_PUBLIC_BASE_URL.length + 1)));
    expect(url).toMatch(/\.mp3$/);
  });

  it('plafonds vérifiés AVANT tout envoi : audio > 1 Go, image > 200 Mo, autre type > 100 Mo', async () => {
    holder.api = admin;
    const faux = (name, type, size) => ({ name, type, size, lastModified: 1, slice: () => new Blob([]) });
    await expect(uploadToBase44(faux('long.mp3', 'audio/mpeg', 1024 * MIO + 1))).rejects.toThrow(/max 1 Go/);
    await expect(uploadToBase44(faux('fond.jpg', 'image/jpeg', 200 * MIO + 1))).rejects.toThrow(/max 200 Mo/);
    await expect(uploadToBase44(faux('archive.zip', 'application/zip', 101 * MIO))).rejects.toThrow(/max 100 Mo/);
  });

  // ── Politique : TOUTES les vidéos sur R2, quelle que soit leur taille ─────────────────────────────
  const r2Key = (url) => decodeURIComponent(url.slice(s3env.R2_PUBLIC_BASE_URL.length + 1));
  const surR2 = new RegExp(`^${s3env.R2_PUBLIC_BASE_URL}/videos/\\d{4}/\\d{2}/[a-z0-9]{16}-`);

  it('admin : petite vidéo (300 Ko) -> R2, jamais dans PocketBase', async () => {
    holder.api = admin;
    const buf = MP4(300 * 1024);
    const url = await uploadToBase44(fileOf(buf, 'clip.mp4', 'video/mp4'));
    cleanup.objects.push(r2Key(url));
    expect(url).toMatch(surR2);
    expect(url).not.toContain('/api/files/');
    expect(sha(await download(url))).toBe(sha(buf));
  });

  it('admin : vidéo de 20 Mo au nom accentué, tiret long et emoji -> R2 (3 parts), contenu identique', async () => {
    holder.api = admin;
    const buf = MP4(20 * MIO + 4321);
    const details = [];
    const url = await uploadToBase44(fileOf(buf, 'Culte – Noël 🙏.mp4', 'video/mp4'), { onDetail: (d) => details.push(d.uploadedBytes) });
    cleanup.objects.push(r2Key(url));
    expect(url).toMatch(new RegExp(`${surR2.source}culte-noel\\.mp4$`));
    expect(sha(await download(url))).toBe(sha(buf));
    expect(details.at(-1)).toBe(buf.length);
  });

  it('admin : vidéo sans nom (Blob video/webm) -> R2 avec une extension vidéo', async () => {
    holder.api = admin;
    const buf = Buffer.concat([Buffer.from('1a45dfa3', 'hex'), Buffer.alloc(64 * 1024)]);
    const url = await uploadToBase44(new Blob([buf], { type: 'video/webm' }));
    cleanup.objects.push(r2Key(url));
    expect(url).toMatch(new RegExp(`${surR2.source}video\\.webm$`));
  });

  it('membre : vidéo -> refusée (envoi de vidéos réservé aux admins), rien dans PocketBase', async () => {
    holder.api = membre;
    await expect(uploadToBase44(fileOf(MP4(200 * 1024), 'souvenir.mp4', 'video/mp4'))).rejects.toThrow(/HTTP 403/);
  });

  it('admin : audio de 2 Mo et image -> toujours dans PocketBase (FichierAdmin)', async () => {
    holder.api = admin;
    const url = await uploadToBase44(fileOf(MP3(2 * MIO), 'cantique.mp3', 'audio/mpeg'));
    cleanup.FichierAdmin.push(recordIdOf(url));
    expect(url).toMatch(new RegExp(`^${BASE}/api/files/`));
  });

  // ── Bogue « HTTP 400: {"error":"fileSize invalide"} » (Paramètres > Mon compte) ──────────────────
  // Le bouton « Rogner » transmettait l'événement du clic au lieu de l'image : objet sans taille,
  // donc branche « gros fichier » d'upload.js, donc initMultipartUpload sans fileSize.
  it('objet qui n\'est pas un fichier (événement de clic) -> erreur claire, aucune requête', async () => {
    holder.api = admin;
    const espion = vi.spyOn(globalThis, 'fetch');
    try {
      const clic = { type: 'click', target: {}, preventDefault() {} };
      await expect(uploadToBase44(clic)).rejects.toThrow('Aucune image à envoyer : le fichier est invalide.');
      await expect(uploadToBase44(new Blob([]))).rejects.toThrow('Le fichier est vide.');
      expect(espion).not.toHaveBeenCalled();
    } finally {
      espion.mockRestore();
    }
  });

  describe.skipIf(!navigateur())('photos recadrées par un vrai navigateur (JPEG de quelques centaines de Ko)', () => {
    for (const qui of ['membre', 'admin']) {
      it(`${qui} : profil (carré) puis couverture (2,5:1) -> adresses /api/files/ sur l'hôte PocketBase`, async () => {
        const api = qui === 'membre' ? membre : admin;
        holder.api = api;
        const id = api.pb.authStore.record.id;
        const u = await su.collection('users').getOne(id);
        photosAvant.push({ id, avant: { profile_photo_url: u.profile_photo_url || '', cover_photo_url: u.cover_photo_url || '' } });
        const col = qui === 'membre' ? 'Fichier' : 'FichierAdmin';
        const colId = (await su.collections.getOne(col)).id;
        const forme = new RegExp(`^${BASE}/api/files/${colId}/[a-z0-9]+/[^/]+\\.jpe?g$`);

        // Profil : ImageCrop (aspect 1, « Rogner ») -> Blob JPEG sans nom -> AccountSection.uploadAvatar
        const profil = recadrerDansNavigateur({ aspect: 1 });
        expect(profil.source.length).toBeGreaterThan(200 * 1024);
        expect(profil.source.length).toBeLessThan(1024 * 1024);
        expect(tailleJpeg(profil.crop)).toEqual({ w: 640, h: 640 });
        const urlProfil = await uploadToBase44(new Blob([profil.crop], { type: 'image/jpeg' }));
        cleanup[col].push(recordIdOf(urlProfil));
        expect(urlProfil).toMatch(forme);
        await api.auth.updateMe({ profile_photo_url: urlProfil });

        // Couverture : CroppableUploader (aspect 2,5) « Rogner », puis « Conserver l'original »
        const couv = recadrerDansNavigateur({ aspect: 2.5 });
        expect(tailleJpeg(couv.crop)).toEqual({ w: 640, h: 256 });
        const urlCouv = await uploadToBase44(new Blob([couv.crop], { type: 'image/jpeg' }));
        cleanup[col].push(recordIdOf(urlCouv));
        expect(urlCouv).toMatch(forme);
        await api.auth.updateMe({ cover_photo_url: urlCouv });
        const urlOriginal = await uploadToBase44(fileOf(couv.source, 'IMG_2026.jpg', 'image/jpeg'));
        cleanup[col].push(recordIdOf(urlOriginal));
        expect(urlOriginal).toMatch(forme);

        // Contenu servi identique, adresses enregistrées sur le compte
        expect((await download(urlProfil)).equals(profil.crop)).toBe(true);
        expect((await download(urlCouv)).equals(couv.crop)).toBe(true);
        expect(sha(await download(urlOriginal))).toBe(sha(couv.source));
        const apres = await su.collection('users').getOne(id);
        expect(apres.profile_photo_url).toBe(urlProfil);
        expect(apres.cover_photo_url).toBe(urlCouv);
      });
    }
  });
});
