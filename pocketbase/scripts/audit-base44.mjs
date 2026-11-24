#!/usr/bin/env node
// Avant la fin de Base44 (25/11/2026) : cherche dans TOUTE la base les valeurs qui pointent encore vers Base44
// (fichiers base44.com / base44.app / supabase). Lecture seule. N'affiche que des comptes et quelques adresses de fichiers.
// Usage (tunnel SSH ouvert, identifiants SUPERUSER saisis masqués) : node pocketbase/scripts/audit-base44.mjs
const URL_PB = (process.env.PB_URL || '').replace(/\/+$/, '');
const { PB_EMAIL: email, PB_PASSWORD: password } = process.env;
if (!URL_PB || !email || !password) throw new Error('PB_URL, PB_EMAIL et PB_PASSWORD (superuser) sont requis.');
const MOTIF = /https?:\/\/[^\s"']*(base44\.(com|app)|supabase\.(co|in))[^\s"']*/gi;

const auth = await fetch(`${URL_PB}/api/collections/_superusers/auth-with-password`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: email, password }),
});
if (!auth.ok) throw new Error(`connexion superuser refusée (HTTP ${auth.status})`);
const h = { Authorization: (await auth.json()).token };
const { items: cols } = await (await fetch(`${URL_PB}/api/collections?perPage=500`, { headers: h })).json();

let total = 0;
const exemples = [];
for (const c of cols.filter((x) => !x.system && x.type !== 'view')) {
  const champs = (c.fields || []).filter((f) => ['text', 'url', 'json', 'editor'].includes(f.type)).map((f) => f.name);
  if (!champs.length) continue;
  const parChamp = {};
  for (let page = 1; ; page++) {
    const r = await fetch(`${URL_PB}/api/collections/${c.name}/records?perPage=500&page=${page}&fields=id,${champs.join(',')}`, { headers: h });
    if (!r.ok) throw new Error(`${c.name} : lecture impossible (HTTP ${r.status})`);
    const { items, totalPages } = await r.json();
    for (const rec of items) {
      for (const ch of champs) {
        const v = rec[ch];
        const s = typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v);
        const trouves = s.match(MOTIF);
        if (trouves) {
          parChamp[ch] = (parChamp[ch] || 0) + 1;
          if (exemples.length < 15) exemples.push(`${c.name}.${ch} : ${trouves[0].slice(0, 110)}`);
        }
      }
    }
    if (page >= (totalPages || 1)) break;
  }
  const n = Object.values(parChamp).reduce((a, b) => a + b, 0);
  if (n) {
    total += n;
    console.log(`${c.name} : ${n} valeur(s) -> ${Object.entries(parChamp).map(([k, v]) => `${k} (${v})`).join(', ')}`);
  }
}
console.log(total ? `\nTOTAL : ${total} valeur(s) pointent encore vers Base44.` : '\nAucune valeur ne pointe vers Base44.');
if (exemples.length) console.log('\nExemples :\n  ' + exemples.join('\n  '));
