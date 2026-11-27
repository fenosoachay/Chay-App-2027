// 1.4.1 : collection CoupDeCoeur (pocketbase/scripts/migrer-1-4-1.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectionCodeFamille, collectionCoupDeCoeur, majProfilEnfant, migrer, REGLE_LECTURE, REGLES_PROFIL_ENFANT,
} from '../scripts/migrer-1-4-1.mjs';

test('CoupDeCoeur : lecture réservée aux membres connectés selon leur niveau, écriture aux admins', () => {
  const c = collectionCoupDeCoeur();
  assert.equal(c.listRule, REGLE_LECTURE);
  assert.match(c.listRule, /@request\.auth\.id != ""/);
  assert.match(c.listRule, /audience = "membre" && @request\.auth\.niveau = "membre"/);
  for (const r of ['createRule', 'updateRule', 'deleteRule']) assert.equal(c[r], '@request.auth.role = "admin"');
});

test('CoupDeCoeur : champs attendus', () => {
  const noms = collectionCoupDeCoeur().fields.map((f) => f.name);
  for (const n of ['title', 'artist', 'audio_url', 'cover_url', 'mot', 'track_id', 'audience', 'actif', 'duree_jours', 'debut', 'base44_created_date']) {
    assert.ok(noms.includes(n), n);
  }
});

test('ProfilEnfant : les comptes invités lisent et font progresser, sans toucher aux invités, au parent ni au prénom', () => {
  const r = REGLES_PROFIL_ENFANT;
  assert.match(r.listRule, /invites ~ @request\.auth\.id/);
  assert.match(r.updateRule, /@request\.body\.invites:isset = false/);
  assert.match(r.updateRule, /@request\.body\.user_id:isset = false/);
  assert.match(r.updateRule, /@request\.body\.pseudo:isset = false/);
  assert.doesNotMatch(r.deleteRule, /invites/);
  assert.match(r.createRule, /@request\.body\.invites:isset = false/);
});

test('ProfilEnfant : champ invites ajouté une seule fois ; rien si déjà à jour', () => {
  const base = { fields: [{ name: 'id' }, { name: 'pseudo' }], listRule: 'ancienne' };
  const maj = majProfilEnfant(base);
  assert.deepEqual(maj.fields.map((f) => f.name), ['id', 'pseudo', 'invites']);
  assert.equal(majProfilEnfant({ ...REGLES_PROFIL_ENFANT, fields: maj.fields }), null);
});

test('CodeFamille : invisible pour l\'app (serveur seulement), code unique', () => {
  const c = collectionCodeFamille();
  for (const k of ['listRule', 'viewRule', 'createRule', 'updateRule', 'deleteRule']) assert.equal(c[k], null);
  assert.ok(c.indexes.some((i) => /UNIQUE INDEX .* \(code\)/.test(i)));
});

test('migration idempotente : rien si tout existe ; écritures seulement avec --appliquer', async () => {
  const appels = [];
  const ancien = globalThis.fetch;
  const profilAJour = { ...REGLES_PROFIL_ENFANT, fields: [{ name: 'invites' }] };
  try {
    globalThis.fetch = async (url, o = {}) => { appels.push([o.method || 'GET', url]); return { ok: true, status: 200, json: async () => profilAJour }; };
    assert.deepEqual(await migrer('http://pb', {}, { appliquer: true }), []);
    assert.equal(appels.filter(([m]) => m !== 'GET').length, 0);
    appels.length = 0;
    globalThis.fetch = async (url, o = {}) => {
      appels.push([o.method || 'GET', url]);
      if (o.method === 'POST' || o.method === 'PATCH') return { ok: true, status: 200 };
      if (url.endsWith('/ProfilEnfant')) return { ok: true, status: 200, json: async () => ({ fields: [] }) };
      return { ok: false, status: 404 };
    };
    assert.deepEqual(await migrer('http://pb', {}, { appliquer: false }), ['CoupDeCoeur', 'ProfilEnfant', 'CodeFamille']);
    assert.equal(appels.filter(([m]) => m !== 'GET').length, 0);
    assert.deepEqual(await migrer('http://pb', {}, { appliquer: true }), ['CoupDeCoeur', 'ProfilEnfant', 'CodeFamille']);
    assert.equal(appels.filter(([m]) => m === 'POST').length, 2);
    assert.equal(appels.filter(([m]) => m === 'PATCH').length, 1);
  } finally {
    globalThis.fetch = ancien;
  }
});
