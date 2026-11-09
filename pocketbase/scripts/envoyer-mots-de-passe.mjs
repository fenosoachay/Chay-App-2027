#!/usr/bin/env node
// Envoie l'e-mail « Choisir un nouveau mot de passe » (lien de réinitialisation PocketBase) aux membres IMPORTÉS de
// Base44, qui n'ont pas de mot de passe connu après la migration (docs/MIGRATION-COMPTES.md §2).
//
//   PowerShell (production, par le tunnel ssh -N -L 8092:127.0.0.1:8090 <serveur>) :
//     $env:PB_URL = "http://127.0.0.1:8092"
//     $env:PB_EMAIL = Read-Host "E-mail superuser"
//     $env:PB_PASSWORD = Lire-Secret "Mot de passe superuser"
//     node pocketbase/scripts/envoyer-mots-de-passe.mjs --exclure C:\Secrets-Chay\exclure.txt              -> SIMULATION
//     node pocketbase/scripts/envoyer-mots-de-passe.mjs --exclure C:\Secrets-Chay\exclure.txt --appliquer  -> envoi
//     Remove-Item Env:PB_PASSWORD, Env:PB_EMAIL, Env:PB_URL
//
// Qui reçoit l'e-mail : les comptes `users` dont l'id figure dans l'export Base44 (User.json), non désactivés,
// dont l'adresse est valide, absents de la liste d'exclusion, et pas encore invités (journal local).
// Les comptes créés dans PocketBase (test1, test2, test-admin…) ne sont jamais dans l'export, donc jamais visés.
//
// Options :
//   --appliquer              envoie vraiment (résumé puis confirmation à taper « ENVOYER <n> ») ; sinon simulation
//   --exclure <fichier>      adresses ou noms à exclure, un par ligne (# = commentaire) ; HORS du dépôt ;
//                            obligatoire avec --appliquer (sauf --un-seul)
//   --un-seul <adresse>      un seul compte (test) : contourne l'export et la liste d'exclusion, pas le reste
//   --limite <N>             au plus N envois pour ce passage (lots : relancer plus tard pour la suite)
//   --intervalle <s>         secondes entre deux envois (défaut 8 : sous la limite de 10 / min / IP de PocketBase)
//   --export <dossier>       dossier de l'export Base44 (défaut : EXPORT_BASE44 ou C:\Export-Base44) ; lit User.json
//   --journal <fichier>      journal des envois (défaut : <export>\_invitations\journal-invitations.jsonl) ; HORS du dépôt
//   --duree-lien <72h|30min> AUTRE MODE : lit puis règle la durée de validité du lien (users → passwordResetToken),
//                            sans rien envoyer ; simulation sans --appliquer. Le secret du jeton n'est jamais lu.
//
// Reprise : chaque envoi réussi est écrit aussitôt dans le journal (id du compte + date de création du compte dans
// PocketBase) ; une relance saute ces comptes. Un nouvel import (base restaurée) donne une autre date de création :
// le compte est alors de nouveau invité. Ctrl+C : arrêt propre après l'envoi en cours.
// 429 (trop de demandes) : attente (Retry-After ou 60 s) puis nouvel essai, 5 fois au plus.
// Rien de secret ni de personnel n'est affiché : adresses masquées (j***@gmail.com), aucun nom, aucun mot de passe.
// Code de sortie : 0 si tout va bien, 1 si au moins un envoi a échoué, 2 en cas d'erreur.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EMAIL_RE = /^[^@\s"<>,;]+@[^@\s"<>,;]+\.[a-z]{2,}$/i;

/** j***@gmail.com : première lettre, puis *** ; le domaine reste lisible. */
export const masquer = (email) => {
  const s = String(email || '');
  const at = s.lastIndexOf('@');
  if (at < 1) return '***';
  return `${s[0]}***${s.slice(at)}`;
};

const horsDepot = (f) => {
  const rel = path.relative(REPO, path.resolve(f));
  return rel.startsWith('..') || path.isAbsolute(rel);
};

export function parseArgs(argv) {
  const a = { appliquer: false, exclure: null, unSeul: null, limite: Infinity, intervalle: 8, export: null, journal: null, dureeLien: null };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`Refusé : ${k} attend une valeur.`);
      return v;
    };
    if (k === '--appliquer') a.appliquer = true;
    else if (k === '--exclure') a.exclure = val();
    else if (k === '--un-seul') a.unSeul = val().trim().toLowerCase();
    else if (k === '--limite') a.limite = Number(val());
    else if (k === '--intervalle') a.intervalle = Number(val());
    else if (k === '--export') a.export = val();
    else if (k === '--journal') a.journal = val();
    else if (k === '--duree-lien') a.dureeLien = val();
    else throw new Error(`Refusé : option inconnue ${k}.`);
  }
  if (!(a.limite > 0)) throw new Error('Refusé : --limite doit être un nombre positif.');
  if (!(a.intervalle >= 0)) throw new Error('Refusé : --intervalle doit être un nombre de secondes.');
  a.export = a.export || process.env.EXPORT_BASE44 || 'C:\\Export-Base44';
  a.journal = a.journal || path.join(a.export, '_invitations', 'journal-invitations.jsonl');
  return a;
}

/** « 72h », « 30min », « 3j » -> secondes. */
export function dureeEnSecondes(txt) {
  const m = /^(\d+)\s*(min|h|j)$/i.exec(String(txt).trim());
  if (!m) throw new Error('Refusé : --duree-lien attend par exemple 72h ou 30min.');
  const s = Number(m[1]) * { min: 60, h: 3600, j: 86400 }[m[2].toLowerCase()];
  if (s < 300 || s > 7 * 86400) throw new Error('Refusé : durée hors limites (entre 5 min et 7 jours).');
  return s;
}
const lisible = (s) => (s % 3600 === 0 ? `${s / 3600} h` : `${Math.round(s / 60)} min`);

/** Liste d'exclusion : adresses ou noms, un par ligne, sans tenir compte des majuscules. */
export function lireExclusions(fichier) {
  if (!fichier) return new Set();
  if (!horsDepot(fichier)) throw new Error('Refusé : le fichier --exclure doit être HORS du dépôt (ex. C:\\Secrets-Chay\\exclure.txt).');
  if (!fs.existsSync(fichier)) throw new Error('Refusé : fichier --exclure introuvable.');
  return new Set(fs.readFileSync(fichier, 'utf8').split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith('#')));
}

/** Ids des comptes de l'export Base44 (User.json). Seul le champ id est utilisé. */
export function lireIdsExport(dossier) {
  const f = path.join(dossier, 'User.json');
  if (!fs.existsSync(f)) throw new Error(`Refusé : ${f} introuvable (export Base44).`);
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  const list = Array.isArray(j) ? j : j.records || j.items || [];
  return new Set(list.map((r) => r && r.id).filter((id) => typeof id === 'string'));
}

/** Journal : une ligne JSON { id, created, envoye_le } par envoi réussi. Clé : id + date de création du compte. */
export function lireJournal(fichier) {
  const deja = new Set();
  if (!fs.existsSync(fichier)) return deja;
  for (const l of fs.readFileSync(fichier, 'utf8').split(/\r?\n/)) {
    if (!l.trim()) continue;
    try { const e = JSON.parse(l); if (e.id) deja.add(`${e.id}|${e.created || ''}`); } catch { /* ligne tronquée : ignorée */ }
  }
  return deja;
}
const noter = (fichier, u) => {
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  fs.appendFileSync(fichier, `${JSON.stringify({ id: u.id, created: u.created, envoye_le: new Date().toISOString() })}\n`);
};

/**
 * Classe chaque compte : « à inviter » ou la raison de l'exclusion. Ne fait aucune requête.
 * @returns {Array<{ u, statut }>}
 */
export function trier(users, { idsExport, exclusions, deja, unSeul }) {
  return users.map((u) => {
    const email = String(u.email || '').trim().toLowerCase();
    const nom = String(u.name || '').trim().toLowerCase();
    let statut = 'à inviter';
    if (unSeul) { if (email !== unSeul) statut = 'hors --un-seul'; } else if (!idsExport.has(u.id)) statut = 'pas dans l\'export Base44';
    else if (exclusions.has(email) || (nom && exclusions.has(nom))) statut = 'exclu (liste)';
    if (statut === 'à inviter') {
      if (u.disabled) statut = 'compte désactivé';
      else if (!EMAIL_RE.test(email)) statut = 'adresse invalide';
      else if (deja.has(`${u.id}|${u.created || ''}`)) statut = 'déjà invité';
    }
    return { u, statut };
  });
}

function demanderConfirmation(attendu) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`Pour envoyer, tapez exactement : ${attendu}\n> `, (r) => { rl.close(); resolve(String(r).trim() === attendu); });
  });
}

async function connexion(fetchImpl, sleep) {
  let base;
  try { base = new URL(process.env.PB_URL || ''); } catch { throw new Error('PB_URL absente ou invalide (exemple : http://127.0.0.1:8092).'); }
  if (!['127.0.0.1', 'localhost'].includes(base.hostname)) throw new Error('PB_URL doit viser 127.0.0.1 ou localhost (tunnel ou bac à sable).');
  if (!process.env.PB_EMAIL || !process.env.PB_PASSWORD) throw new Error('PB_EMAIL et PB_PASSWORD sont requis (variables d\'environnement).');
  const root = base.origin;
  let r;
  for (let essai = 0; ; essai++) { // limite de connexions superuser (10 / min) : attendre puis réessayer
    r = await fetchImpl(`${root}/api/collections/_superusers/auth-with-password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: process.env.PB_EMAIL, password: process.env.PB_PASSWORD }),
    });
    if (r.status !== 429 || essai >= 8) break;
    await sleep(10000);
  }
  if (!r.ok) throw new Error(`connexion superuser impossible (HTTP ${r.status})`);
  const token = (await r.json()).token;
  const call = async (method, p, body) => {
    const res = await fetchImpl(root + p, {
      method, headers: { Authorization: token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json().catch(() => null) };
  };
  return { root, call };
}

async function lireUsers(call) {
  const out = [];
  for (let page = 1; ; page++) {
    const r = await call('GET', `/api/collections/users/records?page=${page}&perPage=200&sort=created&fields=id,email,name,disabled,created`);
    if (r.status !== 200) throw new Error(`lecture des comptes impossible (HTTP ${r.status})`);
    out.push(...r.data.items);
    if (page >= r.data.totalPages) return out;
  }
}

/** Mode --duree-lien : lit puis règle users.passwordResetToken.duration (le secret n'est ni lu ni modifié). */
async function regleDuree(args, call, log) {
  const voulu = dureeEnSecondes(args.dureeLien);
  const r = await call('GET', '/api/collections/users?fields=passwordResetToken.duration');
  if (r.status !== 200) throw new Error(`lecture de la collection users impossible (HTTP ${r.status})`);
  const actuel = r.data.passwordResetToken.duration;
  log(`Durée du lien de réinitialisation : ${lisible(actuel)} (${actuel} s) -> voulue : ${lisible(voulu)} (${voulu} s)`);
  if (actuel === voulu) { log('Rien à changer.'); return { actuel, voulu, change: false }; }
  if (!args.appliquer) { log('SIMULATION : rien n\'est modifié (ajoutez --appliquer).'); return { actuel, voulu, change: false }; }
  const p = await call('PATCH', '/api/collections/users?fields=passwordResetToken.duration', { passwordResetToken: { duration: voulu } });
  if (p.status !== 200 || p.data?.passwordResetToken?.duration !== voulu) throw new Error(`modification refusée (HTTP ${p.status})`);
  log(`Fait : ${lisible(voulu)}.`);
  return { actuel, voulu, change: true };
}

/**
 * Programme principal. `opts` (tests) : fetchImpl, sleep, confirmer, apresEnvoi(n), log.
 * @returns {Promise<{ lignes, envoyes, echecs, attentes429 }>}
 */
export async function main(argv = process.argv.slice(2), opts = {}) {
  const fetchImpl = opts.fetchImpl || fetch;
  const sleep = opts.sleep || ((ms) => new Promise((ok) => setTimeout(ok, ms)));
  const log = opts.log || console.log;
  const args = parseArgs(argv);

  if (args.dureeLien) {
    const { call } = await connexion(fetchImpl, sleep);
    return regleDuree(args, call, log);
  }
  // Contrôles avant toute connexion.
  if (!horsDepot(args.journal)) throw new Error('Refusé : le journal --journal doit être HORS du dépôt.');
  if (args.appliquer && !args.unSeul && !args.exclure) throw new Error('Refusé : --appliquer exige --exclure <fichier> (comptes de test à ne pas inviter).');
  const exclusions = lireExclusions(args.exclure);
  const idsExport = args.unSeul ? new Set() : lireIdsExport(args.export);
  const deja = lireJournal(args.journal);

  const { root, call } = await connexion(fetchImpl, sleep);
  const users = await lireUsers(call);
  const lignes = trier(users, { idsExport, exclusions, deja, unSeul: args.unSeul });
  const absents = [...idsExport].filter((id) => !users.some((u) => u.id === id)).length;
  const aInviter = lignes.filter((l) => l.statut === 'à inviter');
  const cible = aInviter.slice(0, args.limite);

  // Contexte non secret : serveur d'envoi et durée du lien (filtrés côté serveur : aucun mot de passe transmis).
  const smtp = (await call('GET', '/api/settings?fields=smtp.host,smtp.port,smtp.enabled')).data?.smtp || {};
  const duree = (await call('GET', '/api/collections/users?fields=passwordResetToken.duration')).data?.passwordResetToken?.duration;

  const compte = {};
  for (const l of lignes) compte[l.statut] = (compte[l.statut] || 0) + 1;
  log(`PocketBase : ${root} — envoi par ${smtp.enabled ? `${smtp.host}:${smtp.port}` : 'SMTP DÉSACTIVÉ'} — lien valable ${duree ? lisible(duree) : '?'}`);
  log(`Comptes dans PocketBase : ${users.length}${args.unSeul ? ` (mode --un-seul ${masquer(args.unSeul)})` : ` ; dans l'export Base44 : ${idsExport.size} (dont ${absents} absents de PocketBase)`}`);
  for (const k of ['exclu (liste)', 'compte désactivé', 'adresse invalide', 'déjà invité']) if (compte[k]) log(`  ${k} : ${compte[k]}`);
  if (!args.unSeul && !args.exclure) log('  ⚠ aucune liste d\'exclusion (--exclure) : obligatoire pour envoyer.');
  log(`À inviter : ${aInviter.length}${cible.length < aInviter.length ? ` ; ce passage : ${cible.length} (--limite)` : ''}`);
  for (const l of cible) log(`  ${masquer(l.u.email)}`);
  if (args.appliquer && duree && duree < 86400) log(`  ⚠ le lien n'est valable que ${lisible(duree)} : le jour J, passez d'abord à 72 h (--duree-lien 72h).`);

  const res = { lignes, envoyes: 0, echecs: 0, attentes429: 0, aInviter: aInviter.length };
  if (!args.appliquer) { log('SIMULATION : aucun e-mail envoyé (ajoutez --appliquer).'); return res; }
  if (!cible.length) { log('Rien à envoyer.'); return res; }
  if (!smtp.enabled) throw new Error('SMTP désactivé dans PocketBase : rien n\'est envoyé.');
  const ok = await (opts.confirmer || demanderConfirmation)(`ENVOYER ${cible.length}`);
  if (!ok) throw new Error('Annulé : confirmation non reçue, aucun e-mail envoyé.');

  let arret = false;
  const surSigint = () => { arret = true; log('\nInterruption demandée : arrêt après l\'envoi en cours.'); };
  process.on('SIGINT', surSigint);
  try {
    for (let n = 0; n < cible.length && !arret; n++) {
      const { u } = cible[n];
      if (n > 0) await sleep(args.intervalle * 1000);
      let statut = null;
      for (let essai = 0; essai <= 5 && !arret; essai++) {
        const r = await fetchImpl(`${root}/api/collections/users/request-password-reset`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u.email }),
        });
        await r.text().catch(() => '');
        statut = r.status;
        if (statut !== 429) break;
        const attente = Math.max(1, Number(r.headers.get('retry-after')) || 60);
        res.attentes429++;
        log(`  429 (trop de demandes) : attente de ${attente} s…`);
        await sleep(attente * 1000);
      }
      if (statut === 204) {
        noter(args.journal, u);
        res.envoyes++;
        log(`  ${n + 1}/${cible.length} envoyé : ${masquer(u.email)}`);
        if (opts.apresEnvoi) await opts.apresEnvoi(n + 1);
      } else {
        res.echecs++;
        log(`  ${n + 1}/${cible.length} ÉCHEC (HTTP ${statut}) : ${masquer(u.email)} — sera retenté à la prochaine relance`);
      }
    }
  } finally {
    process.off('SIGINT', surSigint);
  }
  log(`Bilan : ${res.envoyes} envoyé(s), ${res.echecs} échec(s)${arret ? ', interrompu (relancez pour reprendre)' : ''}. Journal : ${args.journal}`);
  return res;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((r) => { process.exitCode = r && r.echecs ? 1 : 0; }).catch((err) => {
    console.error(`Erreur : ${err.message}`);
    process.exitCode = 2;
  });
}
