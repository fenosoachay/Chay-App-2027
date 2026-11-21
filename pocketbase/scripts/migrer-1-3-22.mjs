#!/usr/bin/env node
// Migration 1.3.22 — Aide et Assistance › « Signaler au responsable un problème technique » :
//  - nouvelle collection SignalementTechnique (accès uniquement par les routes de pb_hooks/signalements.pb.js) ;
//  - users.systeme (compte automatique « Chay ») et users.responsable_technique (qui reçoit les signalements) ;
//    personne ne peut se donner ces champs (règles de création et de mise à jour de users) ;
//  - MemberProfile.systeme : le profil public du compte « Chay » (nom, logo), à qui on ne peut pas répondre ;
//  - création du compte « Chay » (noreply@chay.fr, mot de passe aléatoire jamais affiché : personne ne s'y connecte)
//    et de son profil public ;
//  - le compte dont l'e-mail est donné dans RESPONSABLE_EMAIL devient responsable technique ;
//  - Petite Histoire du verset du jour : histoire_type / histoire_titre / histoire_url / histoire_texte sur
//    Devotional, et users.histoires_vues (versets dont la petite histoire est « Vue / Entendue / Lue ») ;
//  - Score Boards : nouvelle collection ScoreJeu (un point par partie ; routes enregistrerScore et classement).
// Idempotente. Usage (tunnel SSH ouvert, identifiants SUPERUSER saisis masqués, RESPONSABLE_EMAIL saisi) :
//   node pocketbase/scripts/migrer-1-3-22.mjs              -> simulation
//   node pocketbase/scripts/migrer-1-3-22.mjs --appliquer  -> applique

import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const SYSTEME_EMAIL = 'noreply@chay.fr';
export const SYSTEME_NOM = 'Chay';
export const SYSTEME_AVATAR = 'https://membres.chay.fr/branding/icon-192.png';

const texte = (name, max, extra = {}) => ({
  name, type: 'text', required: false, presentable: false, hidden: false, system: false, min: 0, max, pattern: '', ...extra,
});
const booleen = (name) => ({ name, type: 'bool', required: false, hidden: false, system: false });
const date = (name) => ({ name, type: 'date', required: false, hidden: false, system: false, min: '', max: '' });
const choix = (name, values) => ({ name, type: 'select', values, maxSelect: 1, required: false, hidden: false, system: false });
const json = (name, maxSize) => ({ name, type: 'json', maxSize, required: false, hidden: false, system: false });
const autodate = (name, onCreate, onUpdate) => ({ name, type: 'autodate', onCreate, onUpdate, hidden: false, system: false });

export function nouvellesCollections() {
  return [{
    name: 'SignalementTechnique',
    type: 'base',
    // Aucune règle : lecture et écriture seulement par les routes (signalerProbleme, listerSignalements, reglerSignalement).
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      texte('user_id', 64, { required: true }),
      texte('username', 200),
      texte('message', 5000, { required: true }),
      texte('capture_url', 5000),
      texte('plateforme', 100),
      choix('statut', ['ouvert', 'regle']),
      texte('reponse', 5000),
      date('regle_le'),
      booleen('lu'),
      autodate('created', true, false),
      autodate('updated', true, true),
    ],
    indexes: ['CREATE INDEX idx_signalement_statut ON SignalementTechnique (statut, created)'],
  }, {
    name: 'ScoreJeu',
    type: 'base',
    // Aucune règle : écriture par les routes (enregistrerScore, quizFinish, wsFinish), lecture par « classement ».
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      texte('user_id', 64, { required: true }),
      choix('espace', ['adulte', 'enfant']),
      texte('jeu', 30, { required: true }),
      { name: 'points', type: 'number', required: false, hidden: false, system: false, onlyInt: true, min: 0, max: 100000 },
      texte('pseudo', 30),
      texte('avatar', 16),
      autodate('created', true, false),
    ],
    indexes: [
      'CREATE INDEX idx_scorejeu_espace ON ScoreJeu (espace, created)',
      'CREATE INDEX idx_scorejeu_jeu ON ScoreJeu (espace, jeu, created)',
      'CREATE INDEX idx_scorejeu_user ON ScoreJeu (user_id, created)',
    ],
  }];
}

export const CHAMPS_AJOUTES = {
  users: [booleen('systeme'), booleen('responsable_technique'), json('histoires_vues', 20000)],
  MemberProfile: [booleen('systeme')],
  Devotional: [choix('histoire_type', ['video', 'audio', 'texte']), texte('histoire_titre', 200), texte('histoire_url', 5000), texte('histoire_texte', 20000)],
};

const PROTECTION = '@request.body.systeme:isset = false && @request.body.responsable_technique:isset = false';
const ANCRE = '@request.body.niveau:isset = false';

/** Règle de création ou de mise à jour de users : personne ne se donne « systeme » ni « responsable_technique ». */
export function regleUsersProtegee(regle) {
  if (regle === null || regle === undefined) return regle;
  const r = String(regle);
  if (r.includes('@request.body.responsable_technique:isset = false')) return regle;
  if (!r.includes(ANCRE)) throw new Error('règle de users inattendue (migration 1.3.21 appliquée ?) : arrêt');
  return r.split(ANCRE).join(`${ANCRE} && ${PROTECTION}`);
}

/** Règle de MemberProfile : un membre ne peut pas marquer son profil comme « systeme ». */
export function regleProfilProtegee(regle) {
  if (regle === null || regle === undefined) return regle;
  const r = String(regle);
  if (r.includes('@request.body.systeme:isset = false')) return regle;
  return r.trim() ? `(${r}) && @request.body.systeme:isset = false` : '@request.body.systeme:isset = false';
}

async function lire(url, headers, chemin) {
  const r = await fetch(`${url}${chemin}`, { headers });
  if (!r.ok) throw new Error(`${chemin} : lecture refusée (HTTP ${r.status})`);
  return r.json();
}

async function premier(url, headers, collection, filtre) {
  const q = new URLSearchParams({ filter: filtre, perPage: '1' });
  const r = await lire(url, headers, `/api/collections/${collection}/records?${q}`);
  return r.items && r.items[0] ? r.items[0] : null;
}

export async function migrer(url, headers, { appliquer = false, log = () => {}, responsableEmail = '' } = {}) {
  const changements = [];
  // Le compte « Chay » et le responsable ne se lisent qu'une fois le champ « systeme » présent sur users.
  const champsPrets = appliquer || ((await lire(url, headers, '/api/collections/users')).fields || []).some((f) => f.name === 'systeme');
  const ecrire = async (methode, chemin, corps, quoi) => {
    if (!appliquer) return null;
    const r = await fetch(`${url}${chemin}`, { method: methode, headers, body: JSON.stringify(corps) });
    if (!r.ok) throw new Error(`${quoi} : refusé (HTTP ${r.status}) ${(await r.text()).slice(0, 300)}`);
    return r.json();
  };

  // 1. Champs (users en premier : les règles en dépendent).
  for (const [nom, champs] of Object.entries(CHAMPS_AJOUTES)) {
    const col = await lire(url, headers, `/api/collections/${nom}`);
    const manquants = champs.filter((c) => !(col.fields || []).some((f) => f.name === c.name));
    if (!manquants.length) { log(`  = ${nom} : champs déjà présents`); continue; }
    changements.push(nom);
    log(`  - ${nom} : ajout de ${manquants.map((c) => c.name).join(', ')}`);
    await ecrire('PATCH', `/api/collections/${nom}`, { fields: [...col.fields, ...manquants] }, nom);
  }

  // 2. Collection SignalementTechnique.
  for (const def of nouvellesCollections()) {
    const existe = await fetch(`${url}/api/collections/${def.name}`, { headers });
    if (existe.ok) { log(`  = ${def.name} existe déjà`); continue; }
    changements.push(def.name);
    log(`  - ${def.name} : nouvelle collection`);
    await ecrire('POST', '/api/collections', def, def.name);
  }

  // 3. Règles : protection des nouveaux champs.
  const users = await lire(url, headers, '/api/collections/users');
  const maj = regleUsersProtegee(users.updateRule);
  const creation = regleUsersProtegee(users.createRule);
  if (maj === users.updateRule && creation === users.createRule) log('  = users : règles déjà protégées');
  else {
    changements.push('users (règles)');
    log('  - users : personne ne peut se déclarer compte automatique ou responsable technique');
    await ecrire('PATCH', '/api/collections/users', { updateRule: maj, createRule: creation }, 'users (règles)');
  }
  const profil = await lire(url, headers, '/api/collections/MemberProfile');
  const pc = regleProfilProtegee(profil.createRule);
  const pu = regleProfilProtegee(profil.updateRule);
  if (pc === profil.createRule && pu === profil.updateRule) log('  = MemberProfile : règles déjà protégées');
  else {
    changements.push('MemberProfile (règles)');
    log('  - MemberProfile : un membre ne peut pas se faire passer pour « Chay »');
    await ecrire('PATCH', '/api/collections/MemberProfile', { createRule: pc, updateRule: pu }, 'MemberProfile (règles)');
  }

  // 4. Compte automatique « Chay » et son profil public (seulement si les champs existent déjà, sinon : simulation).
  let systeme = champsPrets ? await premier(url, headers, 'users', `email = "${SYSTEME_EMAIL}"`) : null;
  if (systeme) log(`  = compte « ${SYSTEME_NOM} » existe déjà`);
  else {
    changements.push('compte Chay');
    log(`  - compte automatique « ${SYSTEME_NOM} » (${SYSTEME_EMAIL}), sans connexion possible`);
    if (appliquer) {
      const mdp = crypto.randomBytes(32).toString('base64url');
      systeme = await ecrire('POST', '/api/collections/users/records', {
        email: SYSTEME_EMAIL, emailVisibility: false, password: mdp, passwordConfirm: mdp, verified: true,
        name: SYSTEME_NOM, first_name: SYSTEME_NOM, last_name: '', systeme: true,
      }, 'compte Chay');
    }
  }
  if (systeme && !systeme.systeme) {
    changements.push('compte Chay (marque)');
    log('  - compte « Chay » marqué comme automatique');
    await ecrire('PATCH', `/api/collections/users/records/${systeme.id}`, { systeme: true }, 'compte Chay (marque)');
  }
  const profilChay = systeme ? await premier(url, headers, 'MemberProfile', `created_by_id = "${systeme.id}"`) : null;
  if (profilChay && profilChay.systeme) log('  = profil public « Chay » existe déjà');
  else {
    changements.push('profil Chay');
    log('  - profil public « Chay » (logo de l\'église)');
    if (appliquer && systeme) {
      const corps = { display_name: SYSTEME_NOM, avatar_url: SYSTEME_AVATAR, systeme: true, created_by_id: systeme.id };
      if (profilChay) await ecrire('PATCH', `/api/collections/MemberProfile/records/${profilChay.id}`, corps, 'profil Chay');
      else await ecrire('POST', '/api/collections/MemberProfile/records', corps, 'profil Chay');
    }
  }

  // 5. Responsable technique.
  const email = String(responsableEmail || '').trim().toLowerCase();
  if (!email) log('  ! RESPONSABLE_EMAIL non donné : responsable technique inchangé');
  else if (champsPrets) {
    const resp = await premier(url, headers, 'users', `email = "${email.replace(/"/g, '')}"`);
    if (!resp) throw new Error(`aucun compte avec l'e-mail donné dans RESPONSABLE_EMAIL`);
    if (resp.responsable_technique) log('  = responsable technique déjà désigné');
    else {
      changements.push('responsable technique');
      log('  - responsable technique : le compte donné dans RESPONSABLE_EMAIL');
      await ecrire('PATCH', `/api/collections/users/records/${resp.id}`, { responsable_technique: true }, 'responsable technique');
    }
  } else log('  - responsable technique : désigné avec --appliquer');
  return changements;
}

async function main() {
  const URL_PB = (process.env.PB_URL || '').replace(/\/+$/, '');
  const { PB_EMAIL: email, PB_PASSWORD: password, RESPONSABLE_EMAIL: responsableEmail } = process.env;
  const appliquer = process.argv.includes('--appliquer');
  if (!URL_PB || !email || !password) throw new Error('PB_URL, PB_EMAIL et PB_PASSWORD (superuser) sont requis.');
  const auth = await fetch(`${URL_PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: email, password }),
  });
  if (!auth.ok) throw new Error(`connexion superuser refusée (HTTP ${auth.status})`);
  const h = { Authorization: (await auth.json()).token, 'Content-Type': 'application/json' };
  console.log(`Serveur : ${URL_PB}`);
  const changements = await migrer(URL_PB, h, { appliquer, log: console.log, responsableEmail });
  if (!changements.length) console.log('Déjà à jour : rien à faire.');
  else console.log(appliquer ? 'Appliqué.' : 'Simulation : relancer avec --appliquer pour écrire.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`Erreur : ${e.message}`); process.exitCode = 1; });
}
