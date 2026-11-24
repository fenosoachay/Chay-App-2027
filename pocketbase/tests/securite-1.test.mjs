import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { corrigerCreationUsers, migrer, REGLE_HISTOIRE } from '../scripts/migrer-securite-1.mjs';

// Règle réelle relevée sur le serveur le 24/11/2026 (audit-regles.mjs).
const regles = JSON.parse(fs.existsSync(new URL('../../regles-pocketbase.json', import.meta.url)) ? fs.readFileSync(new URL('../../regles-pocketbase.json', import.meta.url), 'utf8') : '[]');
const AVANT = '(@request.body.role:isset = false && @request.body.niveau:isset = false && @request.body.systeme:isset = false && @request.body.responsable_technique:isset = false || @request.body.role = "user") && @request.body.verified:isset = false && @request.body.created_by_id:isset = false';

// Évaluation minimale d'une règle d'inscription (seulement les formes « champ:isset = false » et « role = "user" »).
function autorise(regle, corps) {
  const js = regle
    .replace(/@request\.body\.(\w+):isset = false/g, (_, c) => `!(${JSON.stringify(c)} in corps)`)
    .replace(/@request\.body\.role = "user"/g, 'corps.role === "user"');
  return Function('corps', `return ${js};`)(corps);
}

test('ancienne règle : role "user" ouvrait niveau / systeme / responsable_technique (faille reproduite)', () => {
  assert.equal(autorise(AVANT, { role: 'user', niveau: 'vip' }), true);
  assert.equal(autorise(AVANT, { role: 'user', systeme: true }), true);
  assert.equal(autorise(AVANT, { niveau: 'vip' }), false);
});

test('règle corrigée : ces trois champs sont refusés dans tous les cas, l\'inscription normale passe', () => {
  const apres = corrigerCreationUsers(AVANT);
  for (const corps of [{ role: 'user', niveau: 'vip' }, { role: 'user', systeme: true }, { role: 'user', responsable_technique: true }, { niveau: 'membre' }, { role: 'admin' }, { verified: true }]) {
    assert.equal(autorise(apres, corps), false, JSON.stringify(corps));
  }
  assert.equal(autorise(apres, { email: 'a@b.fr', password: 'x', first_name: 'A' }), true);
  assert.equal(autorise(apres, { role: 'user', first_name: 'A' }), true);
  assert.equal(corrigerCreationUsers(apres), null, 'idempotente');
  assert.throws(() => corrigerCreationUsers('autre chose'));
});

test('la règle du serveur (audit) a bien la forme attendue', { skip: !regles.length && 'regles-pocketbase.json absent' }, () => {
  const users = regles.find((c) => c.nom === 'users');
  assert.ok(corrigerCreationUsers(users.creer));
});

test('migration : simulation sans écriture, puis application, puis rien à refaire', async () => {
  const cols = { users: { createRule: AVANT }, PetiteHistoire: { listRule: 'actif = true || @request.auth.role = "admin"', viewRule: 'actif = true || @request.auth.role = "admin"' } };
  const ecrits = [];
  global.fetch = async (u, o = {}) => {
    const p = new URL(u).pathname;
    if (o.method === 'PATCH') { const n = p.split('/').pop(); Object.assign(cols[n], JSON.parse(o.body)); ecrits.push(n); return { ok: true, json: async () => ({}) }; }
    if (p.endsWith('/records')) return { ok: true, json: async () => ({ items: [{ id: 'u1', first_name: 'Chay', systeme: true }] }) };
    return { ok: true, json: async () => cols[p.split('/').pop()] };
  };
  const lignes = [];
  assert.equal((await migrer('http://pb', {}, { log: (l) => lignes.push(l) })).length, 2);
  assert.equal(ecrits.length, 0);
  assert.ok(lignes.some((l) => l.includes('SYSTÈME')));
  await migrer('http://pb', {}, { appliquer: true });
  assert.deepEqual(ecrits.sort(), ['PetiteHistoire', 'users']);
  assert.equal(cols.PetiteHistoire.listRule, REGLE_HISTOIRE);
  assert.deepEqual(await migrer('http://pb', {}, { appliquer: true }), []);
});
