#!/usr/bin/env node
// Bible › « Sagesse en audio » : envoi EN MASSE des audios de chapitres vers R2, puis fiche BibleAudio par chapitre.
//
// Dossier attendu : des fichiers nommés « Proverbes-01.mp3 » … « Proverbes-31.mp3 », « Ecclesiaste-01.mp3 » …
// « Ecclesiaste-12.mp3 » (zéros de tête facultatifs, casse et accents ignorés). Tout autre nom est signalé et ignoré.
// Chaque fichier passe par les routes du serveur (initMultipartUpload avec rangement livre + chapitre,
// getPresignedUrl, completeMultipartUpload) : les octets vont directement du PC vers R2, la clé est imposée par
// le serveur (videos/bible/<livre>/<Livre>-<chapitre>-<aléatoire>.mp3) et le contenu est contrôlé (vrai mp3).
//
//   node pocketbase/scripts/envoyer-bible-audio.mjs <dossier>                 -> simulation : plan, rien n'est envoyé
//   node pocketbase/scripts/envoyer-bible-audio.mjs <dossier> --appliquer     -> envoi des chapitres absents
//   node pocketbase/scripts/envoyer-bible-audio.mjs <dossier> --appliquer --remplacer
//                                                   -> remplace aussi les chapitres dont le fichier a changé
// Relançable : un chapitre déjà en ligne avec un fichier de même taille est sauté. Un échec n'arrête pas les autres.
// Variables : PB_URL (ex. http://127.0.0.1:8092 par le tunnel), PB_EMAIL et PB_PASSWORD d'un compte ADMIN de l'app
// (saisis masqués, voir docs/1.3.7.md). Rien n'est écrit sur le disque ; les mots de passe ne sont jamais affichés.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { lireNomFichierAudio, nomFichierAudio } from '../../src/lib/sagesseAudio.js';

const MIO = 1024 * 1024;

// ── Durée d'un mp3 (secondes) : en-tête Xing / Info (VBR) si présent, sinon débit de la 1re trame (CBR) ──────
const DEBITS = { // kbit/s : [version MPEG][couche III]
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const FREQUENCES = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 25: [11025, 12000, 8000] };

/** Durée en secondes (entier) d'après les premiers octets du fichier et sa taille totale ; null si illisible. */
export function dureeMp3(tete, tailleTotale) {
  let p = 0;
  if (tete.length >= 10 && tete.toString('latin1', 0, 3) === 'ID3') {
    p = 10 + (((tete[6] & 0x7f) << 21) | ((tete[7] & 0x7f) << 14) | ((tete[8] & 0x7f) << 7) | (tete[9] & 0x7f));
  }
  for (; p + 4 <= tete.length; p++) {
    if (tete[p] !== 0xff || (tete[p + 1] & 0xe0) !== 0xe0) continue;
    const v = (tete[p + 1] >> 3) & 3; // 3 : MPEG1, 2 : MPEG2, 0 : MPEG2.5
    const couche = (tete[p + 1] >> 1) & 3; // 1 : couche III
    const iDebit = tete[p + 2] >> 4;
    const iFreq = (tete[p + 2] >> 2) & 3;
    if (v === 1 || couche !== 1 || iDebit === 0 || iDebit === 15 || iFreq === 3) continue;
    const version = v === 3 ? 1 : v === 2 ? 2 : 25;
    const freq = FREQUENCES[version][iFreq];
    const echantillons = version === 1 ? 1152 : 576;
    const mono = (tete[p + 3] >> 6) === 3;
    const decalageXing = p + 4 + (version === 1 ? (mono ? 17 : 32) : (mono ? 9 : 17));
    const marque = tete.toString('latin1', decalageXing, decalageXing + 4);
    if ((marque === 'Xing' || marque === 'Info') && (tete[decalageXing + 7] & 1)) {
      const trames = tete.readUInt32BE(decalageXing + 8);
      return trames > 0 ? Math.round((trames * echantillons) / freq) : null;
    }
    const debit = DEBITS[version === 1 ? 1 : 2][iDebit] * 1000;
    return Math.round(((tailleTotale - p) * 8) / debit);
  }
  return null;
}

/**
 * Plan d'envoi : pour chaque fichier du dossier, { fichier, livre, chapitre, taille, action } avec action =
 * « ajouter », « remplacer », « identique » (même taille déjà en ligne), « existe » (différent, sans --remplacer),
 * ou « ignoré » (nom non reconnu) / « doublon » (deux fichiers pour un même chapitre).
 */
export function planEnvoi(fichiers, existants, { remplacer = false } = {}) {
  const parCle = new Map((existants || []).map((r) => [`${r.book}:${Number(r.chapter)}`, r]));
  const vus = new Map();
  const plan = [];
  for (const f of fichiers) {
    const lu = lireNomFichierAudio(f.nom);
    if (!lu) { plan.push({ fichier: f.nom, action: 'ignoré', raison: 'nom attendu : Proverbes-01.mp3 … Proverbes-31.mp3 ou Ecclesiaste-01.mp3 … Ecclesiaste-12.mp3' }); continue; }
    const cle = `${lu.livre}:${lu.chapitre}`;
    if (vus.has(cle)) { plan.push({ fichier: f.nom, ...lu, action: 'doublon', raison: `même chapitre que ${vus.get(cle)}` }); continue; }
    vus.set(cle, f.nom);
    const r = parCle.get(cle);
    const action = !r ? 'ajouter' : Number(r.size) === f.taille ? 'identique' : remplacer ? 'remplacer' : 'existe';
    plan.push({ fichier: f.nom, ...lu, taille: f.taille, action, id: r?.id || null });
  }
  return plan.sort((a, b) => String(a.livre || '~').localeCompare(String(b.livre || '~')) || (a.chapitre || 0) - (b.chapitre || 0));
}

async function appel(url, token, nom, corps) {
  const r = await fetch(`${url}/api/fn/${nom}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: token }, body: JSON.stringify(corps) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${nom} : HTTP ${r.status} ${typeof data.error === 'string' ? data.error : ''}`.trim());
  return data;
}

/** Envoie un fichier vers R2 (rangé livre + chapitre) ; renvoie l'adresse publique. */
async function envoyerVersR2(url, token, chemin, p) {
  const taille = fs.statSync(chemin).size;
  const session = `bible${p.livre}${p.chapitre}${taille}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 48);
  const init = await appel(url, token, 'initMultipartUpload', {
    session_id: session, fileName: path.basename(chemin), fileSize: taille, fileType: 'audio/mpeg',
    lastModified: Math.floor(fs.statSync(chemin).mtimeMs), rangement: { livre: p.livre, chapitre: p.chapitre },
  });
  if (init.already_done && init.file_url) return init.file_url;
  const fd = fs.openSync(chemin, 'r');
  try {
    for (let n = 1; n <= init.totalParts; n++) {
      const debut = (n - 1) * init.partSize;
      const buf = Buffer.alloc(Math.min(init.partSize, taille - debut));
      fs.readSync(fd, buf, 0, buf.length, debut);
      const s = await appel(url, token, 'getPresignedUrl', { session_id: session, uploadId: init.uploadId, key: init.key, partNumber: n });
      const put = await fetch(s.presignedUrl, { method: 'PUT', body: buf });
      if (!put.ok) throw new Error(`part ${n} refusée par R2 (HTTP ${put.status})`);
    }
  } finally {
    fs.closeSync(fd);
  }
  const fin = await appel(url, token, 'completeMultipartUpload', { session_id: session, uploadId: init.uploadId, key: init.key, parts: [] });
  return fin.file_url;
}

/** Exécute le plan (exporté pour le test d'intégration). Renvoie le bilan { envoyes, echecs }. */
export async function executer(url, token, dossier, plan, { log = () => {} } = {}) {
  const bilan = { envoyes: 0, echecs: [] };
  for (const p of plan.filter((x) => x.action === 'ajouter' || x.action === 'remplacer')) {
    const chemin = path.join(dossier, p.fichier);
    try {
      const tete = Buffer.alloc(Math.min(256 * 1024, p.taille));
      const fd = fs.openSync(chemin, 'r');
      fs.readSync(fd, tete, 0, tete.length, 0);
      fs.closeSync(fd);
      const audioUrl = await envoyerVersR2(url, token, chemin, p);
      const fiche = { book: p.livre, chapter: p.chapitre, audio_url: audioUrl, size: p.taille, duration: dureeMp3(tete, p.taille) };
      const r = await fetch(`${url}/api/collections/BibleAudio/records${p.id ? `/${p.id}` : ''}`, {
        method: p.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: token }, body: JSON.stringify(fiche),
      });
      if (!r.ok) throw new Error(`fiche BibleAudio refusée (HTTP ${r.status})`);
      bilan.envoyes++;
      log(`  ✓ ${nomFichierAudio(p.livre, p.chapitre)} (${(p.taille / MIO).toFixed(1)} Mo${fiche.duration ? `, ${Math.round(fiche.duration / 60)} min` : ''})`);
    } catch (e) {
      bilan.echecs.push({ fichier: p.fichier, erreur: e.message });
      log(`  ✗ ${p.fichier} : ${e.message}`);
    }
  }
  return bilan;
}

/** Fiches BibleAudio existantes (toutes). */
export async function lireExistants(url, token) {
  const r = await fetch(`${url}/api/collections/BibleAudio/records?perPage=500`, { headers: { Authorization: token } });
  if (!r.ok) throw new Error(`lecture de BibleAudio impossible (HTTP ${r.status}) : la migration 1.3.7 est-elle appliquée ?`);
  return (await r.json()).items || [];
}

async function main() {
  const args = process.argv.slice(2);
  const dossier = args.find((a) => !a.startsWith('--'));
  const appliquer = args.includes('--appliquer');
  const remplacer = args.includes('--remplacer');
  if (!dossier || !fs.statSync(dossier, { throwIfNoEntry: false })?.isDirectory()) throw new Error('indiquez le dossier des mp3.');
  const URL_PB = (process.env.PB_URL || '').replace(/\/+$/, '');
  const { PB_EMAIL: email, PB_PASSWORD: password } = process.env;
  if (!URL_PB || !email || !password) throw new Error('PB_URL, PB_EMAIL et PB_PASSWORD (compte admin de l’app) sont requis.');
  const auth = await fetch(`${URL_PB}/api/collections/users/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: email, password }),
  });
  if (!auth.ok) throw new Error(`connexion refusée (HTTP ${auth.status})`);
  const { token, record } = await auth.json();
  if (record?.role !== 'admin') throw new Error('ce compte n’est pas admin.');
  const fichiers = fs.readdirSync(dossier, { withFileTypes: true }).filter((d) => d.isFile())
    .map((d) => ({ nom: d.name, taille: fs.statSync(path.join(dossier, d.name)).size }));
  const plan = planEnvoi(fichiers, await lireExistants(URL_PB, token), { remplacer });
  const compte = (a) => plan.filter((p) => p.action === a).length;
  console.log(`Serveur : ${URL_PB} — ${fichiers.length} fichier(s)`);
  for (const p of plan.filter((x) => ['ignoré', 'doublon', 'existe'].includes(x.action))) console.log(`  · ${p.fichier} : ${p.action}${p.raison ? ` (${p.raison})` : ' (fichier différent : --remplacer pour le remplacer)'}`);
  console.log(`À ajouter : ${compte('ajouter')} · à remplacer : ${compte('remplacer')} · déjà en ligne : ${compte('identique')} · différents non remplacés : ${compte('existe')} · ignorés : ${compte('ignoré') + compte('doublon')}`);
  if (!appliquer) { console.log('Simulation : relancer avec --appliquer pour envoyer.'); return; }
  const bilan = await executer(URL_PB, token, dossier, plan, { log: console.log });
  console.log(`Envoyés : ${bilan.envoyes} · échecs : ${bilan.echecs.length}${bilan.echecs.length ? ' (relancer la même commande : les chapitres déjà en ligne sont sautés)' : ''}`);
  if (bilan.echecs.length) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`Erreur : ${e.message}`); process.exitCode = 1; });
}
