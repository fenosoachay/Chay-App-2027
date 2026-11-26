#!/usr/bin/env node
// Diagnostic des notifications (1.3.43) — LECTURE SEULE, rien n'est modifié.
// Pour chaque membre actif : peut-il recevoir les notifications sur son téléphone ? Sinon, pourquoi ?
//   - réglages de l'appli : notifications coupées (tout, push, messages, nouveautés…) ;
//   - aucun téléphone enregistré (appli jamais ouverte depuis la migration, ou notifications refusées sur Android) ;
//   - téléphone désactivé (déconnexion, push coupé, ou appareil passé à un autre compte) ;
//   - ligne invisible pour l'envoi (créée par quelqu'un d'autre : created_by_id ≠ user_id) ;
//   - téléphone silencieux depuis longtemps (appli désinstallée ou plus ouverte).
// + la file des push en échec (PushEnvoi).
// Aucun jeton, aucune adresse e-mail n'est affiché : seulement le prénom et l'initiale du nom.
//
// Usage (tunnel SSH ouvert, SUPERUSER, comme les migrations) :
//   node pocketbase/scripts/diagnostiquer-notifications.mjs
import { pathToFileURL } from 'node:url';

const JOUR = 24 * 3600 * 1000;

export function nomCourt(u) {
  const p = String(u.first_name || u.name || '').trim().split(/\s+/)[0] || 'Sans nom';
  const n = String(u.last_name || '').trim();
  return n ? `${p} ${n.charAt(0).toUpperCase()}.` : p;
}

function reglages(u) {
  let s = u.settings;
  if (typeof s === 'string') { try { s = JSON.parse(s || '{}'); } catch { s = {}; } }
  return s && typeof s === 'object' ? s : {};
}

const ms = (d) => { const t = Date.parse(String(d || '').replace(' ', 'T')); return Number.isFinite(t) ? t : 0; };

/** Classe un membre. `jetons` = ses lignes DeviceToken. Renvoie { etat, details[] }. */
export function diagnostiquer(u, jetons, maintenant = Date.now()) {
  const s = reglages(u);
  const details = [];
  const coupes = [];
  if (s.notifications_enabled === false) coupes.push('TOUTES les notifications');
  if (s.notif_push === false) coupes.push('le canal « téléphone »');
  if (s.notif_messages === false) coupes.push('les messages');
  if (s.notif_news === false) coupes.push('les nouveautés');
  if (s.notif_likes === false) coupes.push('les J’aime');
  if (s.notif_comments === false) coupes.push('les commentaires');
  if (coupes.length) details.push(`a coupé dans ses réglages : ${coupes.join(', ')}`);

  const siens = jetons.filter((j) => j.user_id === u.id);
  const actifs = siens.filter((j) => j.is_active && j.token);
  const envoyables = actifs.filter((j) => j.created_by_id === j.user_id);
  const recent = Math.max(0, ...siens.map((j) => ms(j.last_seen) || ms(j.updated)));

  let etat;
  if (s.notifications_enabled === false || s.notif_push === false) etat = 'coupe';
  else if (!siens.length) { etat = 'aucun'; details.push('aucun téléphone enregistré (appli jamais ouverte depuis la migration, ou notifications refusées dans Android)'); }
  else if (!actifs.length) { etat = 'desactive'; details.push(`${siens.length} téléphone(s) enregistré(s) mais désactivé(s) (déconnexion, push coupé ou appareil repris par un autre compte)`); }
  else if (!envoyables.length) { etat = 'invisible'; details.push('téléphone actif mais créé par un autre compte : le serveur ne l’utilise pas'); }
  else if (recent && maintenant - recent > 45 * JOUR) { etat = 'ancien'; details.push(`téléphone pas revu depuis ${Math.round((maintenant - recent) / JOUR)} jours (appli désinstallée ou plus ouverte ?)`); }
  else etat = coupes.length ? 'partiel' : 'ok';
  if (envoyables.length > 1) details.push(`${envoyables.length} téléphones actifs (normal s'il en a plusieurs)`);
  return { etat, details };
}

const TITRES = {
  ok: 'Reçoivent tout normalement',
  partiel: 'Reçoivent, mais ont coupé certains types',
  coupe: 'Ont coupé les notifications dans les réglages de l’appli',
  aucun: 'Aucun téléphone enregistré',
  desactive: 'Téléphone désactivé',
  invisible: 'Téléphone invisible pour l’envoi (à corriger côté serveur)',
  ancien: 'Téléphone silencieux depuis plus de 45 jours',
};

async function toutLire(url, h, collection, filtre = '') {
  const out = [];
  for (let page = 1; page < 200; page++) {
    const q = new URLSearchParams({ page: String(page), perPage: '500', skipTotal: '1' });
    if (filtre) q.set('filter', filtre);
    const r = await fetch(`${url}/api/collections/${collection}/records?${q}`, { headers: h, signal: AbortSignal.timeout(60000) });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`lecture de ${collection} impossible (HTTP ${r.status})`);
    const items = (await r.json()).items || [];
    out.push(...items);
    if (items.length < 500) break;
  }
  return out;
}

async function main() {
  const URL_PB = (process.env.PB_URL || '').replace(/\/+$/, '');
  const { PB_EMAIL: email, PB_PASSWORD: password } = process.env;
  if (!URL_PB || !email || !password) throw new Error('PB_URL, PB_EMAIL et PB_PASSWORD (superuser) sont requis.');
  const auth = await fetch(`${URL_PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: email, password }),
    signal: AbortSignal.timeout(30000),
  });
  if (!auth.ok) {
    const corps = await auth.json().catch(() => ({}));
    if (corps && corps.mfaId) throw new Error('la MFA du superuser est activée : désactivez-la le temps du diagnostic, puis réactivez-la.');
    throw new Error(`connexion superuser refusée (HTTP ${auth.status}) : e-mail ou mot de passe du SUPERUSER incorrect (pas celui d'un compte de l'appli).`);
  }
  const h = { Authorization: (await auth.json()).token };

  const membres = (await toutLire(URL_PB, h, 'users', 'disabled != true && systeme != true')) || [];
  const jetons = (await toutLire(URL_PB, h, 'DeviceToken')) || [];
  const groupes = {};
  for (const u of membres) {
    const d = diagnostiquer(u, jetons);
    (groupes[d.etat] ||= []).push({ nom: nomCourt(u), details: d.details });
  }

  console.log(`\nDIAGNOSTIC DES NOTIFICATIONS — ${membres.length} membres actifs, ${jetons.length} lignes téléphone\n`);
  for (const cle of ['ok', 'partiel', 'coupe', 'aucun', 'desactive', 'invisible', 'ancien']) {
    const g = groupes[cle] || [];
    console.log(`■ ${TITRES[cle]} : ${g.length}`);
    if (cle === 'ok') continue;
    for (const m of g.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))) console.log(`   - ${m.nom} : ${m.details.join(' ; ')}`);
  }

  // File des push en échec temporaire (reprises automatiques, 6 h au plus).
  const file = await toutLire(URL_PB, h, 'PushEnvoi');
  if (file === null) console.log('\n■ File PushEnvoi : absente');
  else {
    const raisons = {};
    for (const r of file) {
      const k = String(r.raison || r.reason || r.last_error || r.erreur || r.statut || r.status || 'inconnue').slice(0, 60);
      raisons[k] = (raisons[k] || 0) + 1;
    }
    console.log(`\n■ Push en attente de nouvel essai (PushEnvoi) : ${file.length}`);
    for (const [k, n] of Object.entries(raisons).sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`   - ${k} : ${n}`);
  }
  console.log('\nRien n’a été modifié. Envoyez une capture de ce bilan.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`Erreur : ${e.message}`); process.exitCode = 1; });
}
