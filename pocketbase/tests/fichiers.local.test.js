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

  beforeAll(async () => {
    su = new PocketBase(BASE);
    su.autoCancellation(false);
    await retry429(() => su.collection('_superusers').authWithPassword(creds.superuser.email, creds.superuser.password));
    membre = await signIn('membre');
    admin = await signIn('admin');
  });

  afterAll(async () => {
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

  it('admin : 101 Mo qui ne sont pas une vidéo -> refusé avant tout envoi (415)', async () => {
    holder.api = admin;
    await expect(uploadToBase44(fileOf(MP3(101 * MIO), 'concert.mp3', 'audio/mpeg'))).rejects.toThrow(/HTTP 415/);
  });
});
