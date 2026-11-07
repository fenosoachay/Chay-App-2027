#!/usr/bin/env node
// Vérifie que la clé privée VAPID d'un fichier correspond à la clé publique de l'app.
//
//   node pocketbase/scripts/verifier-vapid.mjs <fichier contenant VAPID_PRIVATE_KEY=...> [clé publique | fichier]
//
// Clé publique attendue, dans cet ordre :
//   - le second argument : la clé publique elle-même (base64url), ou un fichier contenant
//     VITE_VAPID_PUBLIC_KEY=..., VAPID_PUBLIC_KEY=... ou VAPID_PUBLIC_KEY = "..." ;
//   - sinon la variable d'environnement VITE_VAPID_PUBLIC_KEY (nouvelle paire, mode PocketBase).
// - N'affiche JAMAIS la clé privée, ni une partie, et ne l'écrit nulle part.
// - Sans dépendance, aucun accès réseau.
// Sortie : une seule ligne « OK : … » (code 0) ou « ERREUR : … » (code 1).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const OK = "OK : la clé privée correspond à la clé publique de l'app";
const fail = (msg) => { console.log(`ERREUR : ${msg}`); process.exit(1); };

const B64URL = /^[A-Za-z0-9_-]+$/;
function decodeB64url(text) {
  const s = String(text).trim().replace(/=+$/, '');
  if (!B64URL.test(s)) return null;
  return Buffer.from(s, 'base64url');
}

const [envPath, pubArg] = process.argv.slice(2);
if (!envPath) fail('indiquez le chemin du fichier contenant la ligne VAPID_PRIVATE_KEY=...');

// 1. Clé publique de l'app.
let pubText = '';
let pubSource = '';
if (pubArg && /^[A-Za-z0-9_-]{80,100}=*$/.test(pubArg.trim())) {
  pubText = pubArg.trim();
  pubSource = 'clé publique donnée en argument';
} else if (pubArg) {
  let text;
  try { text = fs.readFileSync(path.resolve(pubArg), 'utf8'); } catch { fail(`fichier de la clé publique illisible (${pubArg})`); }
  const m = text.match(/VAPID_PUBLIC_KEY\s*=\s*["'`]?([A-Za-z0-9_=-]+)/);
  if (!m) fail(`clé publique VAPID_PUBLIC_KEY introuvable dans ${pubArg}`);
  pubText = m[1];
  pubSource = pubArg;
} else if (process.env.VITE_VAPID_PUBLIC_KEY) {
  pubText = process.env.VITE_VAPID_PUBLIC_KEY;
  pubSource = 'VITE_VAPID_PUBLIC_KEY';
} else {
  fail('clé publique absente : donnez-la en second argument ou dans la variable VITE_VAPID_PUBLIC_KEY');
}
const appPublic = decodeB64url(pubText);
if (!appPublic || appPublic.length !== 65 || appPublic[0] !== 0x04) {
  fail("la clé publique n'est pas une clé P-256 non compressée de 65 octets en base64url");
}

// 2. Clé privée du fichier (jamais affichée).
let envText;
try { envText = fs.readFileSync(envPath, 'utf8'); } catch { fail('fichier de la clé privée illisible (chemin introuvable ou accès refusé)'); }
let raw = null;
let count = 0;
for (const line of envText.replace(/^﻿/, '').split(/\r?\n/)) {
  const m = line.match(/^\s*(?:export\s+)?VAPID_PRIVATE_KEY\s*=(.*)$/);
  if (!m) continue;
  count += 1;
  raw = m[1].trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) raw = raw.slice(1, -1).trim();
}
envText = null;
if (count === 0) fail('aucune ligne VAPID_PRIVATE_KEY=... dans le fichier');
if (count > 1) fail('plusieurs lignes VAPID_PRIVATE_KEY=... dans le fichier');
if (!raw) fail('VAPID_PRIVATE_KEY est vide');
const priv = decodeB64url(raw);
raw = null;
if (!priv) fail('format invalide : VAPID_PRIVATE_KEY doit être en base64url (caractères A-Z a-z 0-9 - _)');
if (priv.length !== 32) { const n = priv.length; priv.fill(0); fail(`format invalide : la clé privée décodée fait ${n} octets au lieu de 32`); }

// 3. Dérivation et comparaison.
let derived;
try {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(priv);
  derived = ecdh.getPublicKey(null, 'uncompressed');
} catch {
  priv.fill(0);
  fail("format invalide : ce n'est pas une clé privée P-256 valide");
}
priv.fill(0);
if (derived.length === appPublic.length && crypto.timingSafeEqual(derived, appPublic)) {
  console.log(OK);
  process.exit(0);
}
fail(`la clé privée ne correspond pas à la clé publique de l'app (${pubSource})`);
