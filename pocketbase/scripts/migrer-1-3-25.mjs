#!/usr/bin/env node
// Migration 1.3.25 :
//  1. ActiviteJour et PositionMembre : tableau de bord de l'app (temps passé, sections, ville arrondie ~5 km).
//     Lecture et écriture réservées au serveur (hooks activite.pb.js).
//  2. PetiteHistoire : pop-up « Petite histoire » à l'ouverture de l'app (vidéo, photo ou texte), gérée par les admins.
//  3. LienAccueil : liens ronds en bas de l'accueil de l'app (site, Facebook, YouTube, TikTok), modifiables ;
//     créés avec les 4 liens actuels.
//  4. Paroles : champ musique_id (musique liée, facultatif : petit lecteur en haut de la parole).
//  5. Fichier / FichierAdmin : types de fichiers acceptés élargis (bmp, tiff, wma, amr, aiff…), si le champ « fichier »
//     limite les types.
// Idempotente. Usage (tunnel SSH ouvert, identifiants SUPERUSER saisis masqués) :
//   node pocketbase/scripts/migrer-1-3-25.mjs              -> simulation
//   node pocketbase/scripts/migrer-1-3-25.mjs --appliquer  -> applique

import { pathToFileURL } from 'node:url';

const PUBLIC = '';
const ADMINS = '@request.auth.role = "admin"';
const texte = (name, max, extra = {}) => ({ name, type: 'text', required: false, presentable: false, hidden: false, system: false, min: 0, max, pattern: '', ...extra });
const nombre = (name, extra = {}) => ({ name, type: 'number', required: false, presentable: false, hidden: false, system: false, onlyInt: false, ...extra });
const json = (name) => ({ name, type: 'json', required: false, presentable: false, hidden: false, system: false, maxSize: 20000 });
const bool = (name) => ({ name, type: 'bool', required: false, presentable: false, hidden: false, system: false });
const choix = (name, values, extra = {}) => ({ name, type: 'select', values, maxSelect: 1, required: false, presentable: false, hidden: false, system: false, ...extra });
const autodate = (name, onCreate, onUpdate) => ({ name, type: 'autodate', onCreate, onUpdate, hidden: false, system: false });
const dates = () => [autodate('created', true, false), autodate('updated', true, true)];
const serveurSeul = { listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null };

export const ICONES_LIEN = ['site', 'facebook', 'youtube', 'tiktok', 'instagram', 'whatsapp'];

export const COLLECTIONS = [
  {
    name: 'ActiviteJour', type: 'base', ...serveurSeul,
    fields: [texte('user', 40, { required: true }), texte('jour', 10, { required: true }), nombre('secondes', { onlyInt: true, min: 0 }), json('sections'), ...dates()],
    indexes: [
      'CREATE UNIQUE INDEX idx_activitejour_membre_jour ON ActiviteJour (user, jour)',
      'CREATE INDEX idx_activitejour_jour ON ActiviteJour (jour)',
    ],
  },
  {
    name: 'PositionMembre', type: 'base', ...serveurSeul,
    fields: [texte('user', 40, { required: true }), nombre('lat'), nombre('lon'), texte('jour', 10), ...dates()],
    indexes: ['CREATE UNIQUE INDEX idx_positionmembre_membre ON PositionMembre (user)'],
  },
  {
    // Visible des membres seulement quand elle est « en ligne » ; les admins voient tout.
    name: 'PetiteHistoire', type: 'base',
    listRule: `actif = true || ${ADMINS}`, viewRule: `actif = true || ${ADMINS}`,
    createRule: ADMINS, updateRule: ADMINS, deleteRule: ADMINS,
    fields: [
      choix('type', ['video', 'photo', 'texte'], { required: true }),
      texte('titre', 200), texte('media_url', 2000), texte('description', 3000), texte('texte', 30000),
      bool('actif'), ...dates(),
    ],
    indexes: ['CREATE INDEX idx_petitehistoire_actif ON PetiteHistoire (actif, created)'],
  },
  {
    name: 'LienAccueil', type: 'base',
    listRule: PUBLIC, viewRule: PUBLIC, createRule: ADMINS, updateRule: ADMINS, deleteRule: ADMINS,
    fields: [texte('label', 60, { required: true }), texte('url', 500, { required: true }), choix('icone', ICONES_LIEN), nombre('order'), ...dates()],
    indexes: [],
  },
];

// Les 4 liens affichés jusqu'ici en bas de l'accueil (components/home/HomeSocialLinks.jsx).
export const LIENS_DEPART = [
  { label: 'Site Web Église Chay', url: 'https://www.chay.fr/', icone: 'site', order: 0 },
  { label: 'Facebook', url: 'https://www.facebook.com/www.chay.fr', icone: 'facebook', order: 1 },
  { label: 'YouTube', url: 'https://www.youtube.com/@EgliseChay.fr-tv', icone: 'youtube', order: 2 },
  { label: 'TikTok', url: 'https://www.tiktok.com/@anjahamintsoa', icone: 'tiktok', order: 3 },
];

export const CHAMP_MUSIQUE = texte('musique_id', 40);
export const TYPES_EN_PLUS = [
  'image/bmp', 'image/x-ms-bmp', 'image/tiff', 'image/heic', 'image/heif', 'image/avif',
  'audio/x-ms-wma', 'audio/amr', 'audio/aiff', 'audio/x-aiff', 'audio/3gpp', 'audio/webm', 'audio/x-matroska',
  'audio/ac3', 'audio/x-caf', 'audio/mp4', 'audio/ogg', 'audio/flac', 'audio/x-flac', 'audio/wav', 'audio/x-wav', 'audio/aac',
];
// Admins seulement : wma reconnu comme « asf » ; formats rares reconnus comme binaires. Jamais pour les membres.
export const TYPES_ADMIN_SEULEMENT = ['video/x-ms-asf', 'application/octet-stream'];

export async function migrer(url, headers, { appliquer = false, log = () => {} } = {}) {
  const changements = [];
  const ecrire = async (methode, chemin, corps, quoi) => {
    const r = await fetch(`${url}${chemin}`, { method: methode, headers, body: JSON.stringify(corps) });
    if (!r.ok) throw new Error(`${quoi} : refusé (HTTP ${r.status}) ${(await r.text()).slice(0, 300)}`);
  };

  // 1-4. Collections
  const creees = new Set();
  for (const c of COLLECTIONS) {
    const r = await fetch(`${url}/api/collections/${c.name}`, { headers });
    if (r.status === 404) {
      changements.push(`${c.name} (création)`);
      creees.add(c.name);
      log(`  - ${c.name} : nouvelle collection`);
      if (appliquer) await ecrire('POST', '/api/collections', c, c.name);
    } else if (!r.ok) {
      throw new Error(`lecture de ${c.name} impossible (HTTP ${r.status})`);
    } else {
      log(`  = ${c.name} existe déjà`);
    }
  }

  // 5. Liens de l'accueil : seulement si la collection vient d'être créée (un lien supprimé par l'admin ne revient pas).
  if (creees.has('LienAccueil')) {
    for (const l of LIENS_DEPART) {
      changements.push(`lien ${l.label}`);
      log(`  - LienAccueil : ${l.label}`);
      if (appliquer) await ecrire('POST', '/api/collections/LienAccueil/records', l, `lien ${l.label}`);
    }
  } else {
    log('  = LienAccueil : liens déjà en place (rien ajouté)');
  }
  // 6. Paroles : musique liée
  const rp = await fetch(`${url}/api/collections/Paroles`, { headers });
  if (!rp.ok) throw new Error(`lecture de Paroles impossible (HTTP ${rp.status})`);
  const paroles = await rp.json();
  if ((paroles.fields || []).some((f) => f.name === 'musique_id')) log('  = Paroles : champ musique_id déjà présent');
  else {
    changements.push('Paroles (musique_id)');
    log('  - Paroles : champ musique_id (musique liée)');
    if (appliquer) await ecrire('PATCH', '/api/collections/Paroles', { fields: [...paroles.fields, CHAMP_MUSIQUE] }, 'Paroles');
  }

  // 7. Types de fichiers acceptés (seulement si le champ les limite)
  for (const nom of ['FichierAdmin', 'Fichier']) {
    const r = await fetch(`${url}/api/collections/${nom}`, { headers });
    if (r.status === 404) { log(`  = ${nom} absente`); continue; }
    if (!r.ok) throw new Error(`lecture de ${nom} impossible (HTTP ${r.status})`);
    const col = await r.json();
    const champ = (col.fields || []).find((f) => f.type === 'file');
    const avant = Array.isArray(champ?.mimeTypes) ? champ.mimeTypes : [];
    if (!champ || !avant.length) { log(`  = ${nom} : tous les types sont déjà acceptés`); continue; }
    const voulus = nom === 'FichierAdmin' ? [...TYPES_EN_PLUS, ...TYPES_ADMIN_SEULEMENT] : TYPES_EN_PLUS;
    const manquants = voulus.filter((t) => !avant.includes(t));
    if (!manquants.length) { log(`  = ${nom} : types déjà élargis`); continue; }
    changements.push(`${nom} (types de fichiers)`);
    log(`  - ${nom} : ${manquants.length} type(s) de fichier en plus`);
    if (appliquer) {
      const fields = col.fields.map((f) => (f === champ ? { ...f, mimeTypes: [...avant, ...manquants] } : f));
      await ecrire('PATCH', `/api/collections/${nom}`, { fields }, nom);
    }
  }
  return changements;
}

async function main() {
  const URL_PB = (process.env.PB_URL || '').replace(/\/+$/, '');
  const { PB_EMAIL: email, PB_PASSWORD: password } = process.env;
  const appliquer = process.argv.includes('--appliquer');
  if (!URL_PB || !email || !password) throw new Error('PB_URL, PB_EMAIL et PB_PASSWORD (superuser) sont requis.');
  const auth = await fetch(`${URL_PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: email, password }),
  });
  if (!auth.ok) throw new Error(`connexion superuser refusée (HTTP ${auth.status})`);
  const h = { Authorization: (await auth.json()).token, 'Content-Type': 'application/json' };
  console.log(`Serveur : ${URL_PB}`);
  const changements = await migrer(URL_PB, h, { appliquer, log: console.log });
  if (!changements.length) console.log('Déjà à jour : rien à faire.');
  else console.log(appliquer ? `Appliqué (${changements.length} changement(s)).` : 'Simulation : relancer avec --appliquer pour écrire.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`Erreur : ${e.message}`); process.exitCode = 1; });
}
