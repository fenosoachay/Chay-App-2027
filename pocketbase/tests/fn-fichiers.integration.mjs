#!/usr/bin/env node
// Fichiers (bloc 4) contre le BAC À SABLE LOCAL + le FAUX S3 local (pocketbase/tests/faux-s3.mjs).
// Fichier / FichierAdmin, upload_chunk, multipart R2, nettoyages. Supprime tout ce qu'il crée.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { BASE, fn, http, loadCreds, login, makeChecker, sleep } from './lib.mjs';
import { loadFauxS3Env, s3Fetch } from './sigv4-node.mjs';

const { check, done } = makeChecker();
const creds = loadCreds(['superuser', 'admin', 'membre', 'membre2']);
const s3env = loadFauxS3Env();
const su = await login('_superusers', creds.superuser);
const ADM = await login('users', creds.admin);
const A = await login('users', creds.membre);
const B = await login('users', creds.membre2);
const asSu = { token: su.token };
const MIO = 1024 * 1024;
const created = { Fichier: [], FichierAdmin: [], sessions: [], records: [], objects: [] };

// ── Contenus de test (détectés par leur contenu réel, pas leur nom) ───────────
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const pad = (head, size) => Buffer.concat([head, crypto.randomBytes(Math.max(0, size - head.length))]);
const MP3 = (size) => pad(Buffer.from('4944330300000000000f', 'hex'), size); // en-tête ID3
const MP4 = (size) => pad(Buffer.concat([Buffer.from('0000001866747970', 'hex'), Buffer.from('mp42\0\0\0\0mp42isom')]), size);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

async function upload(collection, token, buf, name, extra = {}) {
  const fd = new FormData();
  fd.append('fichier', new Blob([buf]), name);
  for (const [k, v] of Object.entries(extra)) fd.append(k, v);
  const res = await fetch(`${BASE}/api/collections/${collection}/records`, { method: 'POST', headers: token ? { Authorization: token } : {}, body: fd });
  const data = await res.json().catch(() => null);
  if (res.status === 200 && data?.id) created[collection].push(data.id);
  return { status: res.status, data };
}
const fileUrl = (rec) => `${BASE}/api/files/${rec.collectionId}/${rec.id}/${rec.fichier}`;
async function download(url) {
  const res = await fetch(url);
  return { status: res.status, buf: Buffer.from(await res.arrayBuffer()), type: res.headers.get('content-type') };
}
async function chunkCall(token, fields, chunk) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  if (chunk) fd.append('chunk', new Blob([chunk]), `${fields.session_id}_${fields.index}`);
  const res = await fetch(`${BASE}/api/fn/upload_chunk`, { method: 'POST', headers: token ? { Authorization: token } : {}, body: fd });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const sid = () => `test${crypto.randomBytes(12).toString('hex')}`;
const sessionsOf = async (sessionId) => (await http('GET', `/api/collections/UploadSession/records?filter=${encodeURIComponent(`session_id = "${sessionId}"`)}`, asSu)).data?.items || [];
const r2Uploads = async () => (await s3Fetch(s3env, 'GET', `/${s3env.R2_BUCKET}`, { query: [['uploads', '']] })).text;

try {
  // ── Fichier (membres) ──────────────────────────────────────────────────────
  console.log('\n■ Fichier (membres)');
  check('anonyme -> refusé', (await upload('Fichier', null, PNG, 'a.png')).status >= 400);
  const img = await upload('Fichier', A.token, PNG, 'Photo de Constantin.png');
  check('membre : image acceptée', img.status === 200, `HTTP ${img.status}`);
  check('propriétaire imposé = membre', img.data?.proprietaire === A.id);
  check('nom de fichier aléatoire (nom d’origine non conservé)', /^f_[a-z0-9]{20}\.png$/.test(img.data?.fichier || ''), img.data?.fichier);
  check('identifiant imprévisible (24 hex)', /^[a-f0-9]{24}$/.test(img.data?.id || ''));
  const dl = await download(fileUrl(img.data));
  check('lecture publique par l’adresse (comme Base44), contenu identique', dl.status === 200 && dl.buf.equals(PNG), `HTTP ${dl.status}`);
  check('propriétaire falsifié -> refusé', (await upload('Fichier', A.token, PNG, 'b.png', { proprietaire: B.id })).status >= 400);
  check('sha256 fourni par un membre -> refusé', (await upload('Fichier', A.token, PNG, 'c.png', { sha256: sha(PNG) })).status >= 400);
  check('texte déguisé en .png -> refusé (type réel)', (await upload('Fichier', A.token, Buffer.from('bonjour, je ne suis pas une image'), 'faux.png')).status === 400);
  check('exécutable -> refusé', (await upload('Fichier', A.token, Buffer.from('4d5a90000300000004000000ffff0000', 'hex'), 'x.png')).status === 400);
  check('16 Mo -> refusé (max 15 Mo)', (await upload('Fichier', A.token, pad(PNG, 16 * MIO), 'gros.png')).status >= 400);
  const mp3 = await upload('Fichier', A.token, MP3(200 * 1024), 'chant.mp3');
  check('membre : audio mp3 accepté (playlist personnelle)', mp3.status === 200, `HTTP ${mp3.status}`);
  const vMembre = await upload('Fichier', A.token, MP4(100 * 1024), 'v.mp4');
  check('membre : vidéo refusée dans Fichier (415, vidéos sur R2)', vMembre.status === 415 && /R2/.test(vMembre.data?.message || ''), `HTTP ${vMembre.status}`);
  check('membre : FichierAdmin refusé', (await upload('FichierAdmin', A.token, PNG, 'd.png')).status >= 400);
  const listB = await http('GET', '/api/collections/Fichier/records?perPage=200', { token: B.token });
  check('autre membre : ne voit pas le fichier dans la liste', listB.status === 200 && !listB.data.items.some((r) => r.id === img.data.id));
  check('autre membre : lecture directe de l’enregistrement -> 404', (await http('GET', `/api/collections/Fichier/records/${img.data.id}`, { token: B.token })).status === 404);
  check('autre membre : suppression -> refusée', (await http('DELETE', `/api/collections/Fichier/records/${img.data.id}`, { token: B.token })).status === 404);
  check('modification -> refusée (pas de mise à jour)', (await http('PATCH', `/api/collections/Fichier/records/${img.data.id}`, { token: A.token, body: { usage: 'avatar' } })).status >= 400);
  const listAdm = await http('GET', '/api/collections/Fichier/records?perPage=200', { token: ADM.token });
  check('admin : voit le fichier du membre', listAdm.data?.items?.some((r) => r.id === img.data.id));

  // ── FichierAdmin ─────────────────────────────────────────────────────────────
  console.log('\n■ FichierAdmin (administrateurs)');
  const pdf = await upload('FichierAdmin', ADM.token, PDF, 'programme.pdf');
  check('admin : PDF accepté, propriétaire = admin', pdf.status === 200 && pdf.data?.proprietaire === ADM.id, `HTTP ${pdf.status}`);
  // Politique : toutes les vidéos vont sur R2, quelle que soit leur taille (sauvegardes petites).
  for (const nom of ['clip.mp4', 'clip.MOV', 'clip.webm', 'clip.mkv', 'clip.m4v']) {
    const v = await upload('FichierAdmin', ADM.token, MP4(300 * 1024), nom);
    check(`admin : petite vidéo ${nom} refusée dans FichierAdmin (415)`, v.status === 415, `HTTP ${v.status}`);
  }
  const m4a = await upload('FichierAdmin', ADM.token, pad(Buffer.concat([Buffer.from('0000001866747970', 'hex'), Buffer.from('M4A \0\0\0\0M4A mp42isom')]), 200 * 1024), 'chant.m4a');
  check('admin : audio m4a (même signature « ftyp » que le MP4) toujours accepté', m4a.status === 200, `HTTP ${m4a.status}`);
  check('admin : texte refusé', (await upload('FichierAdmin', ADM.token, Buffer.from('texte'), 't.pdf')).status === 400);

  // Suppression par le propriétaire
  const del = await http('DELETE', `/api/collections/Fichier/records/${mp3.data.id}`, { token: A.token });
  check('membre : supprime son fichier', del.status === 204);
  check('fichier supprimé -> adresse 404', (await download(fileUrl(mp3.data))).status === 404);
  created.Fichier = created.Fichier.filter((x) => x !== mp3.data.id);

  // ── upload_chunk ────────────────────────────────────────────────────────────
  console.log('\n■ upload_chunk (15 à 100 Mo, admin)');
  const audio = MP3(9 * MIO + 12345);
  const s1 = sid();
  created.sessions.push(s1);
  check('anonyme -> 401', (await chunkCall(null, { action: 'init', session_id: s1, name: 'a.mp3', size: audio.length })).status === 401);
  check('membre -> 403', (await chunkCall(A.token, { action: 'init', session_id: s1, name: 'a.mp3', size: audio.length })).status === 403);
  check('plus de 100 Mo -> 413', (await chunkCall(ADM.token, { action: 'init', session_id: s1, name: 'a.mp3', size: 100 * MIO + 1 })).status === 413);
  check('vidéo (20 Mo, .mp4) -> 415 : les vidéos vont sur R2', (await chunkCall(ADM.token, { action: 'init', session_id: s1, name: 'film.mp4', size: 20 * MIO })).status === 415);
  const init = await chunkCall(ADM.token, { action: 'init', session_id: s1, name: 'prédication.mp3', size: audio.length });
  check('init -> 200, aucun morceau', init.status === 200 && Array.isArray(init.data?.uploaded) && init.data.uploaded.length === 0, JSON.stringify(init.data));
  const c0 = await chunkCall(ADM.token, { action: 'chunk', session_id: s1, index: 0, total: 2, name: 'x' }, audio.subarray(0, 8 * MIO));
  check('morceau 0 (8 Mo) -> 200', c0.status === 200 && c0.data?.success === true, JSON.stringify(c0.data));
  const again = await chunkCall(ADM.token, { action: 'init', session_id: s1, name: 'prédication.mp3', size: audio.length });
  check('reprise : init renvoie le morceau déjà reçu', JSON.stringify(again.data?.uploaded) === '[0]', JSON.stringify(again.data));
  check('morceau de mauvaise taille -> 400', (await chunkCall(ADM.token, { action: 'chunk', session_id: s1, index: 1, total: 2 }, audio.subarray(8 * MIO, 8 * MIO + 10))).status === 400);
  check('index hors limites -> 400', (await chunkCall(ADM.token, { action: 'chunk', session_id: s1, index: 5, total: 2 }, audio.subarray(8 * MIO))).status === 400);
  check('assemblage avec un morceau manquant -> 400', (await chunkCall(ADM.token, { action: 'finalize', session_id: s1 })).status === 400);
  check('morceau 1 (dernier) -> 200', (await chunkCall(ADM.token, { action: 'chunk', session_id: s1, index: 1, total: 2 }, audio.subarray(8 * MIO))).status === 200);
  const fin = await chunkCall(ADM.token, { action: 'finalize', session_id: s1, name: 'x' });
  check('assemblage -> file_url', fin.status === 200 && /\/api\/files\/[^/]+\/[a-f0-9]{24}\/f_[a-z0-9]{20}\.mp3$/.test(fin.data?.file_url || ''), JSON.stringify(fin.data));
  const got = fin.data?.file_url ? await download(fin.data.file_url) : { status: 0, buf: Buffer.alloc(0) };
  check('fichier assemblé identique à l’original', got.status === 200 && sha(got.buf) === sha(audio), `HTTP ${got.status} ${got.buf.length}`);
  const fin2 = await chunkCall(ADM.token, { action: 'finalize', session_id: s1 });
  check('assemblage rejoué -> même adresse', fin2.data?.file_url === fin.data?.file_url);
  const recId = /\/([a-f0-9]{24})\//.exec(fin.data?.file_url || '')?.[1];
  if (recId) created.FichierAdmin.push(recId);
  const rec = recId ? (await http('GET', `/api/collections/FichierAdmin/records/${recId}`, asSu)).data : null;
  check('FichierAdmin créé, propriétaire = admin', rec?.proprietaire === ADM.id);
  check('dossier des morceaux supprimé après assemblage', !fs.existsSync(`C:\\PB-local\\pb_data\\.televersements\\${(await sessionsOf(s1))[0]?.id}`));
  const reinit = await chunkCall(ADM.token, { action: 'init', session_id: s1, name: 'prédication.mp3', size: audio.length });
  const reChunk = await chunkCall(ADM.token, { action: 'chunk', session_id: s1, index: 0 }, audio.subarray(0, 8 * MIO));
  check('même session_id après un envoi terminé -> nouvelle session (jamais l’ancienne adresse)',
    reinit.status === 200 && !reinit.data?.file_url && reinit.data?.uploaded?.length === 0 && reChunk.status === 200, `${JSON.stringify(reinit.data)} ${reChunk.status}`);

  const s2 = sid();
  created.sessions.push(s2);
  const junk = Buffer.concat([Buffer.from('4d5a90000300000004000000ffff0000', 'hex'), crypto.randomBytes(9 * MIO)]);
  await chunkCall(ADM.token, { action: 'init', session_id: s2, name: 'outil.mp3', size: junk.length });
  await chunkCall(ADM.token, { action: 'chunk', session_id: s2, index: 0 }, junk.subarray(0, 8 * MIO));
  await chunkCall(ADM.token, { action: 'chunk', session_id: s2, index: 1 }, junk.subarray(8 * MIO));
  const bad = await chunkCall(ADM.token, { action: 'finalize', session_id: s2 });
  check('contenu non autorisé (exécutable) -> 415, aucun fichier créé', bad.status === 415, `HTTP ${bad.status} ${JSON.stringify(bad.data)}`);

  // ── Multipart R2 (faux S3) ──────────────────────────────────────────────────
  console.log('\n■ Vidéos > 100 Mo : multipart R2 (faux S3 local)');
  const video = MP4(8 * MIO + 777);
  const m1 = sid();
  created.sessions.push(m1);
  const initBody = (over = {}) => ({ session_id: m1, fileName: 'Culte de Noël.mp4', fileSize: video.length, fileType: 'video/mp4', lastModified: 1, ...over });
  check('anonyme -> 401', (await fn('initMultipartUpload', { body: initBody() })).status === 401);
  check('membre -> 403', (await fn('initMultipartUpload', { token: A.token, body: initBody() })).status === 403);
  // Lot E (7) : audio (1 Go) et images (200 Mo) acceptés sur R2 ; tout autre type refusé.
  check('archive (.zip) -> 415', (await fn('initMultipartUpload', { token: ADM.token, body: initBody({ fileName: 'a.zip', fileType: 'application/zip' }) })).status === 415);
  check('nom .mp3 annoncé comme vidéo -> 415', (await fn('initMultipartUpload', { token: ADM.token, body: initBody({ fileName: 'a.mp3', fileType: 'video/mp4' }) })).status === 415);
  check('audio de plus de 1 Go -> 413', (await fn('initMultipartUpload', { token: ADM.token, body: initBody({ fileName: 'a.mp3', fileType: 'audio/mpeg', fileSize: 1024 * MIO + 1 }) })).status === 413);
  check('image de plus de 200 Mo -> 413', (await fn('initMultipartUpload', { token: ADM.token, body: initBody({ fileName: 'a.jpg', fileType: 'image/jpeg', fileSize: 200 * MIO + 1 }) })).status === 413);
  check('type annoncé non vidéo avec un nom .mp4 -> 415', (await fn('initMultipartUpload', { token: ADM.token, body: initBody({ fileType: 'application/zip' }) })).status === 415);
  check('plus de 5 Go -> 413', (await fn('initMultipartUpload', { token: ADM.token, body: initBody({ fileSize: 5 * 1024 * MIO + 1 }) })).status === 413);
  const mi = await fn('initMultipartUpload', { token: ADM.token, body: initBody({ key: '../../autre/chemin.mp4' }) });
  check('init -> uploadId, 2 parts de 8 Mo', mi.status === 200 && mi.data?.uploadId && mi.data?.totalParts === 2 && mi.data?.partSize === 8 * MIO, JSON.stringify(mi.data));
  check('clé imposée par le serveur (préfixe videos/, aléatoire, clé du client ignorée)', /^videos\/\d{4}\/\d{2}\/[a-z0-9]{16}-culte-de-noel\.mp4$/.test(mi.data?.key || ''), mi.data?.key);
  const { uploadId, key } = mi.data || {};
  if (key) created.objects.push(key);
  const presign = (n, over = {}) => fn('getPresignedUrl', { token: ADM.token, body: { session_id: m1, uploadId, key, partNumber: n, ...over } });
  check('membre : URL présignée -> 403', (await fn('getPresignedUrl', { token: A.token, body: { session_id: m1, uploadId, key, partNumber: 1 } })).status === 403);
  check('autre uploadId -> 400', (await presign(1, { uploadId: 'x' })).status === 400);
  check('autre clé -> 400', (await presign(1, { key: 'videos/autre.mp4' })).status === 400);
  check('partNumber hors limites -> 400', (await presign(3)).status === 400);
  const p1 = await presign(1);
  check('URL présignée de la part 1 (taille imposée)', p1.status === 200 && /X-Amz-Signature=/.test(p1.data?.presignedUrl || '') && /X-Amz-SignedHeaders=content-length%3Bhost/.test(p1.data.presignedUrl), p1.data?.presignedUrl ? 'url' : JSON.stringify(p1.data));
  const tampered = p1.data.presignedUrl.replace('partNumber=1', 'partNumber=2');
  check('URL présignée modifiée -> refusée par S3 (403)', (await fetch(tampered, { method: 'PUT', body: video.subarray(0, 8 * MIO) })).status === 403);
  check('part de mauvaise taille -> refusée par S3 (403)', (await fetch(p1.data.presignedUrl, { method: 'PUT', body: video.subarray(0, 8 * MIO - 1) })).status === 403);
  const put1 = await fetch(p1.data.presignedUrl, { method: 'PUT', body: video.subarray(0, 8 * MIO) });
  check('part 1 envoyée directement au stockage, ETag exposé', put1.status === 200 && Boolean(put1.headers.get('etag')));
  const st = await fn('getPresignedUrl', { token: ADM.token, body: { action: 'status', session_id: m1 } });
  check('reprise : état = part 1 reçue', JSON.stringify(st.data?.uploaded) === '[1]', JSON.stringify(st.data));
  const early = await fn('completeMultipartUpload', { token: ADM.token, body: { session_id: m1, uploadId, key, parts: [{ partNumber: 1, etag: 'x' }] } });
  check('assemblage incomplet -> 400', early.status === 400, `HTTP ${early.status}`);
  const p2 = await presign(2);
  check('part 2 envoyée', (await fetch(p2.data.presignedUrl, { method: 'PUT', body: video.subarray(8 * MIO) })).status === 200);
  const done1 = await fn('completeMultipartUpload', { token: ADM.token, body: { session_id: m1, uploadId, key, parts: [{ partNumber: 1, etag: 'faux' }, { partNumber: 2, etag: 'faux' }] } });
  check('assemblage -> adresse publique (ETags relus côté serveur, pas ceux du client)', done1.status === 200 && done1.data?.file_url === `${s3env.R2_PUBLIC_BASE_URL}/${key}`, JSON.stringify(done1.data));
  const pub = await download(done1.data?.file_url || 'http://127.0.0.1:9000/x');
  check('vidéo lisible à l’adresse publique, contenu identique', pub.status === 200 && sha(pub.buf) === sha(video), `HTTP ${pub.status}`);
  const done2 = await fn('completeMultipartUpload', { token: ADM.token, body: { session_id: m1, uploadId, key, parts: [] } });
  check('assemblage rejoué -> même adresse', done2.data?.file_url === done1.data?.file_url);
  const again2 = await fn('initMultipartUpload', { token: ADM.token, body: initBody() });
  check('même fichier relancé -> déjà envoyé (already_done)', again2.data?.already_done === true && again2.data?.file_url === done1.data?.file_url);
  const other = await fn('initMultipartUpload', { token: ADM.token, body: initBody({ lastModified: 2 }) });
  check('même session_id mais autre fichier (date différente) -> nouvel envoi, pas l’ancienne adresse',
    other.status === 200 && !other.data?.already_done && Boolean(other.data?.uploadId) && other.data?.key !== key, JSON.stringify(other.data));
  if (other.data?.uploadId) await s3Fetch(s3env, 'DELETE', `/${s3env.R2_BUCKET}/${other.data.key}`, { query: [['uploadId', other.data.uploadId]] });

  // Petite vidéo (< 5 Mo, minimum S3 d'une part qui n'est pas la dernière) : une seule part, acceptée par S3.
  const small = MP4(1 * MIO + 333);
  const ms = sid();
  created.sessions.push(ms);
  const si = await fn('initMultipartUpload', { token: ADM.token, body: { session_id: ms, fileName: 'petit clip.mp4', fileSize: small.length, fileType: 'video/mp4', lastModified: 3 } });
  check('petite vidéo (1 Mo) -> R2 accepté, 1 seule part', si.status === 200 && si.data?.totalParts === 1, JSON.stringify(si.data));
  if (si.data?.key) created.objects.push(si.data.key);
  const sp = await fn('getPresignedUrl', { token: ADM.token, body: { session_id: ms, uploadId: si.data?.uploadId, key: si.data?.key, partNumber: 1 } });
  const sput = await fetch(sp.data?.presignedUrl, { method: 'PUT', body: small });
  const sdone = await fn('completeMultipartUpload', { token: ADM.token, body: { session_id: ms, uploadId: si.data?.uploadId, key: si.data?.key, parts: [] } });
  const spub = await download(sdone.data?.file_url || 'http://127.0.0.1:9000/x');
  check('petite vidéo : part unique < 5 Mo acceptée, adresse publique R2, contenu identique',
    sput.status === 200 && sdone.status === 200 && sdone.data?.file_url?.startsWith(s3env.R2_PUBLIC_BASE_URL) && sha(spub.buf) === sha(small), `PUT ${sput.status} / ${sdone.status}`);

  const m2 = sid();
  created.sessions.push(m2);
  const fake = crypto.randomBytes(8 * MIO + 10);
  const fi = await fn('initMultipartUpload', { token: ADM.token, body: { session_id: m2, fileName: 'pas-une-video.mp4', fileSize: fake.length, fileType: 'video/mp4' } });
  for (const n of [1, 2]) {
    const p = await fn('getPresignedUrl', { token: ADM.token, body: { session_id: m2, uploadId: fi.data.uploadId, key: fi.data.key, partNumber: n } });
    await fetch(p.data.presignedUrl, { method: 'PUT', body: n === 1 ? fake.subarray(0, 8 * MIO) : fake.subarray(8 * MIO) });
  }
  const fc = await fn('completeMultipartUpload', { token: ADM.token, body: { session_id: m2, uploadId: fi.data.uploadId, key: fi.data.key, parts: [] } });
  check('contenu qui n’est pas une vidéo -> 415', fc.status === 415, `HTTP ${fc.status}`);
  check('… et objet supprimé du stockage', (await download(`${s3env.R2_PUBLIC_BASE_URL}/${fi.data.key}`)).status === 404);

  // Audio sur R2 (lot E) : un vrai mp3 (en-tête ID3) passe ; des octets quelconques nommés .mp3 sont refusés.
  const envoyerR2 = async (nom, type, buf) => {
    const s = sid();
    created.sessions.push(s);
    const i = await fn('initMultipartUpload', { token: ADM.token, body: { session_id: s, fileName: nom, fileSize: buf.length, fileType: type, lastModified: 4 } });
    if (i.data?.key) created.objects.push(i.data.key);
    const p = await fn('getPresignedUrl', { token: ADM.token, body: { session_id: s, uploadId: i.data?.uploadId, key: i.data?.key, partNumber: 1 } });
    await fetch(p.data?.presignedUrl, { method: 'PUT', body: buf });
    return { init: i, fin: await fn('completeMultipartUpload', { token: ADM.token, body: { session_id: s, uploadId: i.data?.uploadId, key: i.data?.key, parts: [] } }) };
  };
  const mp3R2 = Buffer.concat([Buffer.from("4944330300000000000f", "hex"), crypto.randomBytes(2 * MIO)]);
  const a1 = await envoyerR2("Prédication longue.mp3", "audio/mpeg", mp3R2);
  check('audio (.mp3, en-tête ID3) -> R2 accepté, clé .mp3', a1.init.status === 200 && a1.fin.status === 200 && /-predication-longue\.mp3$/.test(a1.fin.data?.file_url || '') && a1.fin.data?.mime_type === 'audio/mpeg', `${a1.init.status}/${a1.fin.status}`);
  const pasAudio = Buffer.concat([Buffer.alloc(16), crypto.randomBytes(MIO)]);
  const a2 = await envoyerR2('faux.mp3', 'audio/mpeg', pasAudio);
  check('octets quelconques nommés .mp3 -> 415 « pas un fichier audio », objet supprimé', a2.fin.status === 415 && /audio/.test(JSON.stringify(a2.fin.data))
    && (await download(`${s3env.R2_PUBLIC_BASE_URL}/${a2.init.data?.key}`)).status === 404, `HTTP ${a2.fin.status}`);
  const jpg = Buffer.concat([Buffer.from('ffd8ffe000104a464946', 'hex'), crypto.randomBytes(MIO)]);
  const a3 = await envoyerR2('fond.jpg', 'image/jpeg', jpg);
  check('image (.jpg) -> R2 accepté', a3.fin.status === 200 && a3.fin.data?.mime_type === 'image/jpeg', `HTTP ${a3.fin.status}`);

  // ── Nettoyage des téléversements incomplets ─────────────────────────────────
  console.log('\n■ Abandon et nettoyage (sessions de plus de 24 h)');
  const m3 = sid();
  created.sessions.push(m3);
  const ai = await fn('initMultipartUpload', { token: ADM.token, body: { session_id: m3, fileName: 'abandon.mp4', fileSize: 20 * MIO, fileType: 'video/mp4' } });
  const ap = await fn('getPresignedUrl', { token: ADM.token, body: { session_id: m3, uploadId: ai.data.uploadId, key: ai.data.key, partNumber: 1 } });
  await fetch(ap.data.presignedUrl, { method: 'PUT', body: MP4(8 * MIO) });
  const c3 = sid();
  created.sessions.push(c3);
  await chunkCall(ADM.token, { action: 'init', session_id: c3, name: 'abandon.mp3', size: 9 * MIO });
  await chunkCall(ADM.token, { action: 'chunk', session_id: c3, index: 0 }, MP3(8 * MIO));
  const chunkSession = (await sessionsOf(c3))[0];
  const chunkDir = `C:\\PB-local\\pb_data\\.televersements\\${chunkSession?.id}`;
  check('morceau en attente présent sur disque', fs.existsSync(chunkDir));
  // R2 : un téléversement sans session (ex. serveur interrompu), vieilli de 48 h, et un récent.
  const orphanKey = `videos/test/orphelin-${crypto.randomBytes(4).toString('hex')}.mp4`;
  const recentKey = `videos/test/recent-${crypto.randomBytes(4).toString('hex')}.mp4`;
  const orphanId = /<UploadId>([^<]+)/.exec((await s3Fetch(s3env, 'POST', `/${s3env.R2_BUCKET}/${orphanKey}`, { query: [['uploads', '']] })).text)[1];
  const recentId = /<UploadId>([^<]+)/.exec((await s3Fetch(s3env, 'POST', `/${s3env.R2_BUCKET}/${recentKey}`, { query: [['uploads', '']] })).text)[1];
  await s3Fetch(s3env, 'POST', `/${s3env.R2_BUCKET}/_faux/vieillir`, { query: [['uploadId', orphanId], ['heures', '48']] });

  check('membre : nettoyage -> 403', (await fn('cleanupIncompleteUploads', { token: A.token, body: {} })).status === 403);
  const keep = await fn('cleanupIncompleteUploads', { token: ADM.token, body: {} });
  check('sessions de moins de 24 h conservées', keep.status === 200 && (await sessionsOf(m3)).length === 1 && fs.existsSync(chunkDir), JSON.stringify(keep.data));
  for (const s of [...await sessionsOf(m3), ...await sessionsOf(c3)]) {
    await http('PATCH', `/api/collections/UploadSession/records/${s.id}`, { ...asSu, body: { expires_at: '2020-01-01 00:00:00.000Z' } });
  }
  const crons = await http('GET', '/api/crons', asSu);
  check('tâches planifiées enregistrées (horaire + hebdomadaire)', ['televersements_incomplets', 'fichiers_orphelins'].every((id) => crons.data?.some?.((c) => c.id === id)), JSON.stringify(crons.data?.map?.((c) => `${c.id} ${c.expression}`)));
  const run = await http('POST', '/api/crons/televersements_incomplets', asSu);
  check('exécution de la tâche planifiée -> 204', run.status === 204, `HTTP ${run.status}`);
  await sleep(500);
  const uploadsAfter = await r2Uploads();
  check('session R2 expirée : téléversement abandonné dans le stockage', !uploadsAfter.includes(ai.data.uploadId));
  check('session R2 expirée : session supprimée', (await sessionsOf(m3)).length === 0);
  check('session par morceaux expirée : morceaux supprimés du disque', !fs.existsSync(chunkDir) && (await sessionsOf(c3)).length === 0);
  check('téléversement R2 sans session, de plus de 24 h : abandonné', !uploadsAfter.includes(orphanId));
  check('téléversement R2 récent sans session : conservé', uploadsAfter.includes(recentId));
  await s3Fetch(s3env, 'DELETE', `/${s3env.R2_BUCKET}/${recentKey}`, { query: [['uploadId', recentId]] });

  // ── Fichiers non référencés ─────────────────────────────────────────────────
  console.log('\n■ Fichiers non référencés (tâche hebdomadaire)');
  const used = await upload('Fichier', A.token, PNG, 'utilise.png');
  const unused = await upload('Fichier', A.token, PNG, 'oublie.png');
  const gal = await http('POST', '/api/collections/GalleryImage/records', { ...asSu, body: { title: 'test fichiers', image_url: fileUrl(used.data) } });
  if (gal.data?.id) created.records.push(['GalleryImage', gal.data.id]);
  check('référence créée (GalleryImage.image_url)', gal.status === 200, `HTTP ${gal.status} ${JSON.stringify(gal.data?.data || {})}`);
  const only = [used.data.id, unused.data.id];
  check('membre / admin : route réservée au superuser', (await fn('cleanupOrphanFiles', { token: ADM.token, body: { limiterA: only } })).status === 403);
  const sim = await fn('cleanupOrphanFiles', { ...asSu, body: { graceHours: 0, limiterA: only } });
  check('simulation par défaut : 1 orphelin trouvé, rien supprimé', sim.data?.simulation === true && sim.data?.orphelins === 1 && sim.data?.supprimes === 0, JSON.stringify(sim.data));
  const real = await fn('cleanupOrphanFiles', { ...asSu, body: { graceHours: 0, simulation: false, limiterA: only } });
  check('suppression : seul le fichier non référencé est supprimé', real.data?.supprimes === 1
    && (await http('GET', `/api/collections/Fichier/records/${unused.data.id}`, asSu)).status === 404
    && (await http('GET', `/api/collections/Fichier/records/${used.data.id}`, asSu)).status === 200, JSON.stringify(real.data));
  const recent = await fn('cleanupOrphanFiles', { ...asSu, body: { simulation: false, limiterA: only } });
  check('délai de grâce (7 jours) : un fichier récent n’est jamais examiné', recent.data?.examines === 0, JSON.stringify(recent.data));

  // Le nettoyage passera un jour en mode « actif » : un fichier réellement utilisé ne doit JAMAIS être supprimé,
  // quelle que soit la forme de la référence.
  console.log('\n■ Formes de référence (un fichier utilisé n’est jamais supprimé)');
  const film = await upload('FichierAdmin', ADM.token, PNG, 'film-test.png');
  const enc = await upload('Fichier', A.token, PNG, 'encode.png');
  const parNom = await upload('Fichier', A.token, PNG, 'par-nom.png');
  const parNomCol = await upload('Fichier', A.token, PNG, 'nom-collection.png');
  const perdu = await upload('Fichier', A.token, PNG, 'perdu.png');
  const filmVid = await http('POST', '/api/collections/Video/records', { ...asSu, body: { title: 'test fichiers', category: 'films', video_url: fileUrl(film.data) } });
  if (filmVid.data?.id) created.records.push(['Video', filmVid.data.id]);
  const note = async (description) => {
    const r = await http('POST', '/api/collections/Content/records', { ...asSu, body: { type: 'autre', title: 'test fichiers', status: 'draft', description } });
    if (r.data?.id) created.records.push(['Content', r.data.id]);
    return r.status;
  };
  const prep = [filmVid.status,
    await note(`https://membres.chay.fr/partage?image=${encodeURIComponent(fileUrl(enc.data))}`),
    await note(`ancienne image : ${parNom.data.fichier}`),
    await note(`${BASE}/api/files/Fichier/${parNomCol.data.id}/${parNomCol.data.fichier}`)];
  check('références préparées (Video.video_url, 3 × Content.description)', prep.every((s) => s === 200), prep.join(','));
  const formes = [film, enc, parNom, parNomCol, perdu].map((x) => x.data.id);
  const actif = await fn('cleanupOrphanFiles', { ...asSu, body: { graceHours: 0, simulation: false, limiterA: formes } });
  const existe = async (col, id) => (await http('GET', `/api/collections/${col}/records/${id}`, asSu)).status === 200;
  check('film : FichierAdmin cité par Video.video_url (adresse normale) -> conservé', await existe('FichierAdmin', film.data.id));
  check('adresse encodée dans une autre adresse (%2Fapi%2Ffiles%2F) -> conservé', await existe('Fichier', enc.data.id));
  check('cité seulement par son nom de fichier -> conservé', await existe('Fichier', parNom.data.id));
  check('adresse avec le nom de la collection au lieu de son identifiant -> conservé', await existe('Fichier', parNomCol.data.id));
  check('seul le fichier vraiment inutilisé est supprimé', actif.data?.supprimes === 1 && !(await existe('Fichier', perdu.data.id)), JSON.stringify(actif.data));
} finally {
  // ── Ménage ──────────────────────────────────────────────────────────────────
  for (const [col, id] of created.records) await http('DELETE', `/api/collections/${col}/records/${id}`, asSu);
  for (const col of ['Fichier', 'FichierAdmin']) for (const id of created[col]) await http('DELETE', `/api/collections/${col}/records/${id}`, asSu);
  for (const s of created.sessions) for (const r of await sessionsOf(s)) await http('DELETE', `/api/collections/UploadSession/records/${r.id}`, asSu);
  for (const k of created.objects) await s3Fetch(s3env, 'DELETE', `/${s3env.R2_BUCKET}/${k}`);
  await fn('cleanupIncompleteUploads', { ...asSu, body: {} });
}
done();
