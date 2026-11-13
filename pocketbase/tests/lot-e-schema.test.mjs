// Lot E : la liste des collections du lot connue du test admin (sections sautées tant que la migration n'est pas
// appliquée) reste celle du script de migration.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nouvellesCollections } from '../scripts/migrer-lot-e.mjs';

test('admin-entitycrud.local.test.js connaît exactement les collections créées par migrer-lot-e.mjs', () => {
  const src = fs.readFileSync(new URL('./admin-entitycrud.local.test.js', import.meta.url), 'utf8');
  const liste = JSON.parse(/const LOT_E = new Set\((\[[^\]]*\])\)/.exec(src)[1].replace(/'/g, '"'));
  assert.deepEqual(liste.sort(), nouvellesCollections().map((c) => c.name).sort());
});
