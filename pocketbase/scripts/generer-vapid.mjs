#!/usr/bin/env node
// Génère une nouvelle paire VAPID (P-256) pour le push navigateur.
//
//   node pocketbase/scripts/generer-vapid.mjs <fichier de sortie>
//
// - Écrit UNE ligne « VAPID_PRIVATE_KEY=... » dans le fichier (créé avec des droits restreints).
// - Refuse d'écraser un fichier existant.
// - N'affiche QUE la clé publique (65 octets non compressés, base64url), jamais la clé privée.
// - Sans dépendance, aucun accès réseau.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const fail = (msg) => { console.log(`ERREUR : ${msg}`); process.exit(1); };

const target = process.argv[2];
if (!target) fail('indiquez le chemin du fichier à créer (exemple : C:\\Secrets-Chay\\vapid.txt)');
const file = path.resolve(target);
if (!fs.existsSync(path.dirname(file))) fail(`le dossier ${path.dirname(file)} n'existe pas (créez-le d'abord)`);
if (fs.existsSync(file)) fail(`${file} existe déjà : rien n'a été écrit (aucun écrasement)`);

// Paire P-256, vérifiée avant écriture.
const ecdh = crypto.createECDH('prime256v1');
ecdh.generateKeys();
const priv = ecdh.getPrivateKey();
const publicKey = ecdh.getPublicKey(null, 'uncompressed');
if (priv.length !== 32 || publicKey.length !== 65 || publicKey[0] !== 0x04) fail('paire générée inattendue (rien n\'a été écrit)');
const check = crypto.createECDH('prime256v1');
check.setPrivateKey(priv);
if (!crypto.timingSafeEqual(check.getPublicKey(null, 'uncompressed'), publicKey)) fail('paire incohérente (rien n\'a été écrit)');

// Création exclusive (« wx » : échoue si le fichier apparaît entre-temps), droits 600 sous Unix.
let fd;
try {
  fd = fs.openSync(file, 'wx', 0o600);
} catch (err) {
  priv.fill(0);
  fail(err.code === 'EEXIST' ? `${file} existe déjà : rien n'a été écrit` : `impossible de créer ${file} (${err.code || 'erreur'})`);
}
try {
  fs.writeSync(fd, `VAPID_PRIVATE_KEY=${priv.toString('base64url')}\n`);
} finally {
  fs.closeSync(fd);
  priv.fill(0);
}

// Windows : les droits Unix ne s'appliquent pas ; on retire l'héritage et on ne garde que l'utilisateur courant.
let acl = 'droits 600';
if (process.platform === 'win32') {
  try {
    const user = `${process.env.USERDOMAIN ? `${process.env.USERDOMAIN}\\` : ''}${process.env.USERNAME}`;
    execFileSync('icacls', [file, '/inheritance:r', '/grant:r', `${user}:(R,W)`], { stdio: 'ignore' });
    acl = `accès réservé à ${process.env.USERNAME}`;
  } catch {
    acl = 'ATTENTION : droits Windows non restreints (icacls a échoué), protégez le fichier à la main';
  }
}

console.log(`Clé privée écrite dans ${file} (${acl}). Elle n'est pas affichée.`);
console.log('Clé publique VAPID (à mettre dans VITE_VAPID_PUBLIC_KEY et VAPID_PUBLIC_KEY) :');
console.log(publicKey.toString('base64url'));
