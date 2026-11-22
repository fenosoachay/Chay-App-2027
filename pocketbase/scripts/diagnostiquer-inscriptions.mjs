#!/usr/bin/env node
// Diagnostic (lecture seule) des 15 derniers comptes : le nom a-t-il été enregistré à l'inscription ?
// Montre, pour chaque compte : date, nom (users), profil public (MemberProfile), et si la fin de
// l'inscription (consentements) a bien été enregistrée. Ne modifie rien.
// Usage (tunnel SSH ouvert, identifiants SUPERUSER saisis masqués) :
//   node pocketbase/scripts/diagnostiquer-inscriptions.mjs

const URL_PB = (process.env.PB_URL || '').replace(/\/+$/, '');
const { PB_EMAIL: email, PB_PASSWORD: password } = process.env;
if (!URL_PB || !email || !password) throw new Error('PB_URL, PB_EMAIL et PB_PASSWORD (superuser) sont requis.');
const auth = await fetch(`${URL_PB}/api/collections/_superusers/auth-with-password`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: email, password }),
});
if (!auth.ok) throw new Error(`connexion superuser refusée (HTTP ${auth.status})`);
const h = { Authorization: (await auth.json()).token };
const lire = async (chemin) => { const r = await fetch(`${URL_PB}${chemin}`, { headers: h }); if (!r.ok) throw new Error(`${chemin} : HTTP ${r.status}`); return r.json(); };

const users = (await lire(`/api/collections/users/records?${new URLSearchParams({ sort: '-created', perPage: '15', filter: 'systeme != true' })}`)).items || [];
const masquer = (e) => String(e || '').replace(/^(.).*(@.*)$/, '$1***$2');
for (const u of users) {
  const profils = (await lire(`/api/collections/MemberProfile/records?${new URLSearchParams({ filter: `created_by_id = "${u.id}"`, perPage: '5' })}`)).items || [];
  const nom = [u.first_name, u.last_name].filter(Boolean).join(' ');
  console.log([
    String(u.created).slice(0, 16),
    `id=${u.id}`,
    `nom=« ${nom || '(vide)'} »`,
    `profil=« ${profils.map((p) => p.display_name || '(vide)').join(' | ') || '(aucun)'} »`,
    `fin_inscription=${u.consents_accepted ? 'oui' : 'NON'}`,
    `tel=${u.phone ? 'oui' : 'non'}`,
    `ville=${u.city ? 'oui' : 'non'}`,
    `email=${masquer(u.email)}`,
  ].join('  '));
}
console.log('DIAGNOSTIC_TERMINE');
