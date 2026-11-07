#!/usr/bin/env node
// Script de migration des fichiers (pocketbase/scripts/migrer-fichiers.mjs) : fonctions de base et envoi
// R2 multipart contre le FAUX S3 local, avec une petite vidéo générée (la vraie vidéo de 1,87 Go n'est
// pas simulée : place disque). Ne modifie aucune donnée du bac à sable.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeChecker } from './lib.mjs';
import { FAUX_S3_ENV, s3Fetch } from './sigv4-node.mjs';
import { detectType, envoyerVersR2, parseArgs, parseField, plan, readEnvFile } from '../scripts/migrer-fichiers.mjs';

const { check, done } = makeChecker();
const env = readEnvFile(FAUX_S3_ENV);

console.log('\n■ Script de migration des fichiers');
check('type réel : JPEG, PNG, HEIC, MP3, MP4, PDF, inconnu', [
  [Buffer.from('ffd8ffe000104a464946', 'hex'), 'jpg'],
  [Buffer.from('89504e470d0a1a0a0000', 'hex'), 'png'],
  [Buffer.concat([Buffer.from('0000001866747970', 'hex'), Buffer.from('heic')]), 'heic'],
  [Buffer.from('ID3\x03\x00\x00\x00\x00', 'latin1'), 'mp3'],
  [Buffer.concat([Buffer.from('0000001866747970', 'hex'), Buffer.from('mp42')]), 'mp4'],
  [Buffer.from('%PDF-1.4'), 'pdf'],
  [Buffer.from('<html>'), 'inconnu'],
].every(([b, t]) => detectType(Buffer.concat([b, Buffer.alloc(16)])) === t));
check('champ simple / élément de liste', JSON.stringify(parseField('avatar_url')) === '{"name":"avatar_url","index":null}'
  && JSON.stringify(parseField('image_urls[2]')) === '{"name":"image_urls","index":2}');
let refused = false;
try { parseArgs(['--pb', 'https://api.chay.fr']); } catch { refused = true; }
check('serveur autre que 127.0.0.1 -> refusé', refused);
check('simulation par défaut', parseArgs([]).appliquer === false);
check('adresse publique distincte du serveur', parseArgs(['--base', 'https://api.chay.fr/']).base === 'https://api.chay.fr');
let r2Refused = false;
try { await envoyerVersR2({ ...env, R2_ENDPOINT: 'https://compte.r2.cloudflarestorage.com' }, 'x', 'y'); } catch (e) { r2Refused = /non autorisé/.test(e.message); }
check('R2 réel -> refusé pour l’instant', r2Refused);

// Politique : TOUTE vidéo MP4 va sur R2, même petite ; jamais dans Fichier / FichierAdmin (sauvegardes petites).
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chay-plan-'));
  try {
    const mk = (nom, head, size) => {
      const p = path.join(dir, nom);
      fs.writeFileSync(p, Buffer.concat([head, Buffer.alloc(Math.max(0, size - head.length))]));
      return p;
    };
    const ftypMp4 = Buffer.concat([Buffer.from('0000001866747970', 'hex'), Buffer.from('mp42')]);
    const files = new Map([
      ['v1', { chemin: mk('petite.mp4', ftypMp4, 2 * 1024 * 1024), sha: 'a'.repeat(64), refs: [{ entite: 'Video', id: 'x' }], urls: ['u1'] }],
      ['v2', { chemin: mk('moyenne.mp4', ftypMp4, 30 * 1024 * 1024), sha: 'b'.repeat(64), refs: [{ entite: 'Video', id: 'y' }], urls: ['u2'] }],
      ['a1', { chemin: mk('chant.mp3', Buffer.from('ID3\x03\x00\x00\x00\x00', 'latin1'), 1024 * 1024), sha: 'c'.repeat(64), refs: [{ entite: 'MusicTrack', id: 'z' }], urls: ['u3'] }],
    ]);
    const pbStub = async () => ({ status: 404, data: null });
    const sans = await plan(pbStub, { files }, { avecVideo: false });
    const avec = await plan(pbStub, { files }, { avecVideo: true });
    const dest = (p, i) => `${p.items[i].destination}/${p.items[i].statut}`;
    check('migration : MP4 de 2 Mo et de 30 Mo -> R2, reportés sans --avec-video', sans.items.slice(0, 2).every((x) => x.destination === 'R2' && /^reporté/.test(x.statut)), `${dest(sans, 0)} ; ${dest(sans, 1)}`);
    check('migration : MP4 de 2 Mo et de 30 Mo -> R2, envoyés avec --avec-video', avec.items.slice(0, 2).every((x) => x.destination === 'R2' && x.statut === 'à envoyer'), `${dest(avec, 0)} ; ${dest(avec, 1)}`);
    check('migration : l’audio reste dans PocketBase', avec.items[2].destination === 'FichierAdmin', dest(avec, 2));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const tmp = path.join(os.tmpdir(), `chay-video-${crypto.randomBytes(4).toString('hex')}.mp4`);
const video = Buffer.concat([Buffer.from('0000001866747970', 'hex'), Buffer.from('mp42'), crypto.randomBytes(20 * 1024 * 1024)]);
fs.writeFileSync(tmp, video);
const key = `videos/migration/test-${crypto.randomBytes(4).toString('hex')}.mp4`;
try {
  const url = await envoyerVersR2(env, tmp, key);
  check('vidéo envoyée en multipart (parts de 16 Mo) -> adresse publique', url === `${env.R2_PUBLIC_BASE_URL}/${key}`, url);
  const got = Buffer.from(await (await fetch(url)).arrayBuffer());
  check('contenu identique', crypto.createHash('sha256').update(got).digest('hex') === crypto.createHash('sha256').update(video).digest('hex'));
  const left = await s3Fetch(env, 'GET', `/${env.R2_BUCKET}`, { query: [['uploads', ''], ['prefix', 'videos/migration/']] });
  check('aucun téléversement multipart laissé ouvert', !left.text.includes('<Upload>'));
} finally {
  fs.rmSync(tmp, { force: true });
  await s3Fetch(env, 'DELETE', `/${env.R2_BUCKET}/${key}`);
}
done();
