// 1.3.43 : un appareil = un seul compte pour les notifications.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chargerLib } from './charger-cjs.mjs';

const rec = (o) => ({
  ...o,
  getBool: (k) => Boolean(o[k]),
  getString: (k) => String(o[k] ?? ''),
  set(k, v) { o[k] = v; this[k] = v; },
});

test('tablette : le jeton passe au nouveau compte, l\'ancien compte ne reçoit plus rien', () => {
  const lignes = [
    rec({ id: 'a', user_id: 'ancien', token: 'T1', is_active: true }),
    rec({ id: 'b', user_id: 'nouveau', token: 'T1', is_active: true }),
    rec({ id: 'c', user_id: 'autre', token: 'T2', is_active: true }),
  ];
  const sauves = [];
  globalThis.$app = {
    findRecordsByFilter: (_c, _f, _s, _l, _o, p) => lignes.filter((r) => r.token === p.t && r.id !== p.id && r.is_active),
    save: (r) => sauves.push(r.id),
  };
  const ap = chargerLib('appareils.js');
  assert.equal(ap.garderSeulement(lignes[1]), 1);
  assert.equal(lignes[0].is_active, false); // ancien compte désactivé
  assert.equal(lignes[1].is_active, true);
  assert.equal(lignes[2].is_active, true); // autre appareil intact
  assert.deepEqual(sauves, ['a']);
  // ligne inactive : rien
  assert.equal(ap.garderSeulement(rec({ id: 'z', user_id: 'x', token: 'T1', is_active: false })), 0);
  delete globalThis.$app;
});

test('appareil sans compte connecté : il est retiré de tous les comptes', () => {
  const lignes = [
    rec({ id: 'a', user_id: 'ancien', token: 'T1', is_active: true }),
    rec({ id: 'b', user_id: 'autre', token: 'T2', is_active: true }),
  ];
  globalThis.$app = {
    findRecordsByFilter: (_c, _f, _s, _l, _o, p) => lignes.filter((r) => r.token === p.t && r.is_active),
    save: () => {},
  };
  const ap = chargerLib('appareils.js');
  assert.equal(ap.oublier('T1'), 1);
  assert.equal(lignes[0].is_active, false);
  assert.equal(lignes[1].is_active, true);
  assert.equal(ap.oublier(''), 0);
  delete globalThis.$app;
});
