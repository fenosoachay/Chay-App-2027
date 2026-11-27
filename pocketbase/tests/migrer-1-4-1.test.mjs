// 1.4.1 : collection CoupDeCoeur (pocketbase/scripts/migrer-1-4-1.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionCoupDeCoeur, migrer, REGLE_LECTURE } from '../scripts/migrer-1-4-1.mjs';

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

test('migration idempotente : rien si la collection existe ; création seulement avec --appliquer', async () => {
  const appels = [];
  const ancien = globalThis.fetch;
  try {
    globalThis.fetch = async (url, o = {}) => { appels.push([o.method || 'GET', url]); return { ok: true, status: 200, json: async () => ({}) }; };
    assert.deepEqual(await migrer('http://pb', {}, { appliquer: true }), []);
    appels.length = 0;
    globalThis.fetch = async (url, o = {}) => { appels.push([o.method || 'GET', url]); return o.method === 'POST' ? { ok: true, status: 200 } : { ok: false, status: 404 }; };
    assert.deepEqual(await migrer('http://pb', {}, { appliquer: false }), ['CoupDeCoeur']);
    assert.equal(appels.filter(([m]) => m === 'POST').length, 0);
    assert.deepEqual(await migrer('http://pb', {}, { appliquer: true }), ['CoupDeCoeur']);
    assert.equal(appels.filter(([m]) => m === 'POST').length, 1);
  } finally {
    globalThis.fetch = ancien;
  }
});
