#!/usr/bin/env node
// Prépare la publication d'un APK Android à l'adresse STABLE https://membres.chay.fr/telechargements/chay.apk.
// Ne se connecte à rien : contrôle l'APK, calcule sa taille et son sha256, écrit latest.json, puis AFFICHE les
// commandes scp / ssh à taper (clé SSH seulement : BatchMode=yes interdit toute saisie de mot de passe SSH).
//
//   node pocketbase/scripts/publier-apk.mjs android\app\build\outputs\apk\release\app-release.apk
//
// Options : --version-name <x.y> --version-code <n> (défaut : android/app/build.gradle) ;
//           --sortie <dossier> (défaut C:\Temp\chay-apk : latest.json y est écrit) ;
//           --serveur <utilisateur@hôte> (défaut : la variable PowerShell $SERVEUR) ; --cle-ssh <fichier> (facultatif).
// Contrôles de l'APK (refus sinon) : archive ZIP valide ; bloc de signature APK v2/v3 présent ; certificat qui
// n'est PAS celui de debug (« Android Debug ») ; fichiers web embarqués qui visent https://api.chay.fr et ne
// contiennent aucune adresse de bac à sable ; capacitor.config.json sans server.url.
// Code de sortie : 0 si prêt, 2 en cas de refus ou d'erreur.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const API = 'https://api.chay.fr';
const DOSSIER_SERVEUR = '/srv/chay-app/telechargements';
// Adresses de bac à sable ou de développement : interdites dans l'APK publié. (« 127.0.0.1 » seul n'est pas
// interdit : des bibliothèques l'emploient pour reconnaître les adresses locales.)
const INTERDITS = [/:8090\b/, /:5173\b/, /10\.0\.2\.2/, /[@.]chay\.test\b/];

export function parseArgs(argv) {
  const a = { apk: null, versionName: null, versionCode: null, sortie: 'C:\\Temp\\chay-apk', serveur: null, cleSsh: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`Refusé : ${k} attend une valeur.`);
      return v;
    };
    if (k === '--version-name') a.versionName = val();
    else if (k === '--version-code') a.versionCode = Number(val());
    else if (k === '--sortie') a.sortie = val();
    else if (k === '--serveur') a.serveur = val();
    else if (k === '--cle-ssh') a.cleSsh = val();
    else if (k.startsWith('--')) throw new Error(`Refusé : option inconnue ${k}.`);
    else if (!a.apk) a.apk = k;
    else throw new Error('Refusé : un seul fichier APK.');
  }
  if (!a.apk) throw new Error('Refusé : indiquez le fichier APK (ex. android\\app\\build\\outputs\\apk\\release\\app-release.apk).');
  return a;
}

/** versionName / versionCode de android/app/build.gradle (texte). */
export function versionGradle(texte) {
  const name = /versionName\s+"([^"]+)"/.exec(texte)?.[1] || null;
  const code = Number(/versionCode\s+(\d+)/.exec(texte)?.[1]);
  return { versionName: name, versionCode: Number.isSafeInteger(code) ? code : null };
}

/** Lit une archive ZIP (APK) en mémoire : { entrees: Map(nom -> { lire() }), debutRepertoire }. */
export function lireZip(buf) {
  const min = Math.max(0, buf.length - 65557);
  let eocd = -1;
  for (let i = buf.length - 22; i >= min; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Refusé : ce fichier n\'est pas une archive APK (ZIP) valide.');
  const total = buf.readUInt16LE(eocd + 10);
  const debutRepertoire = buf.readUInt32LE(eocd + 16);
  const entrees = new Map();
  let p = debutRepertoire;
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Refusé : répertoire de l\'archive APK illisible.');
    const methode = buf.readUInt16LE(p + 10);
    const taille = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28);
    const xl = buf.readUInt16LE(p + 30);
    const cl = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nom = buf.toString('utf8', p + 46, p + 46 + nl);
    entrees.set(nom, {
      lire: () => {
        const debut = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
        const data = buf.subarray(debut, debut + taille);
        if (methode === 0) return Buffer.from(data);
        if (methode === 8) return zlib.inflateRawSync(data);
        throw new Error(`méthode de compression ${methode} non gérée`);
      },
    });
    p += 46 + nl + xl + cl;
  }
  return { entrees, debutRepertoire };
}

/** Bloc de signature APK (v2 / v3) juste avant le répertoire central : { present, debug }. */
export function signatureApk(buf, debutRepertoire) {
  const magic = 'APK Sig Block 42';
  if (debutRepertoire < 32 || buf.toString('latin1', debutRepertoire - 16, debutRepertoire) !== magic) return { present: false, debug: false };
  const taille = Number(buf.readBigUInt64LE(debutRepertoire - 24));
  const debut = debutRepertoire - taille - 8;
  if (debut < 0) return { present: false, debug: false };
  const bloc = buf.subarray(debut, debutRepertoire);
  // Le certificat de la clé de debug Android a pour sujet « CN=Android Debug ».
  return { present: true, debug: bloc.includes(Buffer.from('Android Debug', 'latin1')) };
}

/** Contrôle complet de l'APK. Renvoie { taille, sha256, avertissements } ou lève une erreur « Refusé : … ». */
export function controlerApk(buf) {
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const { entrees, debutRepertoire } = lireZip(buf);
  if (!entrees.has('AndroidManifest.xml')) throw new Error('Refusé : AndroidManifest.xml absent : ce n\'est pas un APK.');
  const sig = signatureApk(buf, debutRepertoire);
  if (!sig.present) throw new Error('Refusé : APK non signé (bloc de signature v2/v3 absent). Construire avec « gradlew assembleRelease » et keystore.properties.');
  if (sig.debug) throw new Error('Refusé : APK signé avec la clé de DEBUG (« Android Debug ») : construire la version release.');
  const conf = entrees.get('assets/capacitor.config.json');
  if (conf) {
    let c = null;
    try { c = JSON.parse(conf.lire().toString('utf8')); } catch { c = null; }
    if (c?.server?.url) throw new Error('Refusé : capacitor.config.json contient server.url (application de développement).');
    if (c?.server?.cleartext) throw new Error('Refusé : capacitor.config.json autorise le trafic non chiffré (server.cleartext).');
  }
  let api = false;
  for (const [nom, e] of entrees) {
    if (!/^assets\/public\/.*\.(js|html|json)$/.test(nom)) continue;
    const t = e.lire().toString('utf8');
    if (t.includes(API)) api = true;
    for (const re of INTERDITS) if (re.test(t)) throw new Error(`Refusé : ${nom} contient une adresse de bac à sable ou de développement (${re.source}).`);
  }
  if (!api) throw new Error(`Refusé : aucun fichier web de l'APK ne vise ${API} (build web fait sans VITE_PB_URL=${API} ?).`);
  return { taille: buf.length, sha256 };
}

/** Commandes à taper (PowerShell sur le PC), une par ligne. Aucun mot de passe. */
export function commandes({ apk, latest, serveur, cleSsh, sha256 }) {
  const cible = serveur ? `"${serveur}` : '"${SERVEUR}';
  const ssh = serveur ? `"${serveur}"` : '$SERVEUR';
  const opt = `-o BatchMode=yes${cleSsh ? ` -i "${cleSsh}"` : ''}`;
  return [
    `scp ${opt} "${apk}" ${cible}:/tmp/chay.apk.nouveau"`,
    `scp ${opt} "${latest}" ${cible}:/tmp/latest.json.nouveau"`,
    `ssh -t ${opt} ${ssh} "test -f ${DOSSIER_SERVEUR}/chay.apk && sudo cp -p ${DOSSIER_SERVEUR}/chay.apk ${DOSSIER_SERVEUR}/chay-precedent.apk; sudo install -o root -g root -m 644 /tmp/chay.apk.nouveau ${DOSSIER_SERVEUR}/chay.apk.nouveau && sudo mv -f ${DOSSIER_SERVEUR}/chay.apk.nouveau ${DOSSIER_SERVEUR}/chay.apk && sudo install -o root -g root -m 644 /tmp/latest.json.nouveau ${DOSSIER_SERVEUR}/latest.json && rm -f /tmp/chay.apk.nouveau /tmp/latest.json.nouveau"`,
    `ssh ${opt} ${ssh} "sha256sum ${DOSSIER_SERVEUR}/chay.apk"`,
    `curl.exe -sI https://membres.chay.fr/telechargements/chay.apk`,
    `curl.exe -s https://membres.chay.fr/telechargements/latest.json`,
    `# attendu pour sha256sum : ${sha256}`,
  ];
}

export function main(argv = process.argv.slice(2), opts = {}) {
  const log = opts.log || console.log;
  const args = parseArgs(argv);
  const apk = path.resolve(args.apk);
  if (!fs.existsSync(apk)) throw new Error(`Refusé : fichier introuvable : ${apk}`);
  if (!apk.toLowerCase().endsWith('.apk')) throw new Error('Refusé : le fichier doit avoir l\'extension .apk.');
  const gradle = versionGradle(fs.readFileSync(opts.gradle || path.join(REPO, 'android', 'app', 'build.gradle'), 'utf8'));
  const versionName = args.versionName || gradle.versionName;
  const versionCode = args.versionCode || gradle.versionCode;
  if (!/^\d+(\.\d+){0,3}$/.test(versionName || '')) throw new Error('Refusé : versionName invalide (ex. 1.3).');
  if (!Number.isSafeInteger(versionCode) || versionCode < 1) throw new Error('Refusé : versionCode invalide (entier positif).');

  const buf = fs.readFileSync(apk);
  const { taille, sha256 } = controlerApk(buf);
  const latest = { versionName, versionCode, date: new Date().toISOString(), tailleMo: Math.round((taille / 1024 / 1024) * 10) / 10, sha256 };
  fs.mkdirSync(args.sortie, { recursive: true });
  const fichier = path.join(path.resolve(args.sortie), 'latest.json');
  fs.writeFileSync(fichier, `${JSON.stringify(latest, null, 2)}\n`);

  log(`APK : ${apk}`);
  log(`  version ${versionName} (code ${versionCode}) — ${latest.tailleMo} Mo (${taille} octets)`);
  log(`  sha256 : ${sha256}`);
  log('  contrôles : signé (release, pas la clé de debug), vise https://api.chay.fr, aucune adresse de bac à sable');
  log(`latest.json écrit : ${fichier}`);
  log('');
  log('Commandes à taper (PowerShell, PC ; clé SSH seulement, sudo demandera votre mot de passe serveur au besoin) :');
  for (const c of commandes({ apk, latest: fichier, serveur: args.serveur, cleSsh: args.cleSsh, sha256 })) log(c);
  return { latest, fichier };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (err) {
    console.error(`Erreur : ${err.message}`);
    process.exitCode = 2;
  }
}
