// Interrupteur NOTIFICATIONS_MODE (pb_hooks/lib/sortie.js), avec de faux $os / $app.
// Aucun réseau. Lancement : node --test pocketbase/tests/sortie.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';
import { chargerLib } from './charger-cjs.mjs';

const sortie = chargerLib('sortie.js');
const USERS = { u1: 'liste@chay.test', u2: 'autre@chay.test', u3: 'Second@Chay.test' };
const logs = [];
let env = {};
globalThis.$os = { getenv: (k) => env[k] || '' };
globalThis.$app = {
  findRecordById: (col, id) => {
    if (col !== 'users' || !USERS[id]) throw new Error('not found');
    return { email: () => USERS[id] };
  },
  logger: () => ({ info: (...a) => logs.push(a) }),
};
const withEnv = (e, f) => { env = e; try { f(); } finally { env = {}; } };

test('mode : absent ou invalide -> off ; casse et espaces ignorés', () => {
  withEnv({}, () => assert.equal(sortie.mode(), 'off'));
  withEnv({ NOTIFICATIONS_MODE: '' }, () => assert.equal(sortie.mode(), 'off'));
  withEnv({ NOTIFICATIONS_MODE: 'oui' }, () => assert.equal(sortie.mode(), 'off'));
  withEnv({ NOTIFICATIONS_MODE: 'production' }, () => assert.equal(sortie.mode(), 'off'));
  withEnv({ NOTIFICATIONS_MODE: ' ON ' }, () => assert.equal(sortie.mode(), 'on'));
  withEnv({ NOTIFICATIONS_MODE: 'Test' }, () => assert.equal(sortie.mode(), 'test'));
});

test('off : aucun e-mail, aucun destinataire', () => {
  withEnv({ NOTIFICATIONS_MODE: 'off', NOTIFICATIONS_TEST_EMAILS: 'liste@chay.test' }, () => {
    assert.equal(sortie.emailAllowed('liste@chay.test'), false);
    assert.deepEqual(sortie.filterUserIds(['u1', 'u2']), []);
  });
});

test('test : seulement les adresses listées (virgules, espaces, casse ignorés)', () => {
  withEnv({ NOTIFICATIONS_MODE: 'test', NOTIFICATIONS_TEST_EMAILS: ' liste@chay.test , second@chay.TEST,,' }, () => {
    assert.deepEqual(sortie.testEmails(), ['liste@chay.test', 'second@chay.test']);
    assert.equal(sortie.emailAllowed('LISTE@chay.test'), true);
    assert.equal(sortie.emailAllowed('autre@chay.test'), false);
    assert.equal(sortie.emailAllowed(''), false);
    assert.deepEqual(sortie.filterUserIds(['u1', 'u2', 'u3', 'inconnu', '', null]), ['u1', 'u3']);
  });
});

test('test sans liste : personne', () => {
  withEnv({ NOTIFICATIONS_MODE: 'test' }, () => {
    assert.equal(sortie.emailAllowed('liste@chay.test'), false);
    assert.deepEqual(sortie.filterUserIds(['u1']), []);
  });
});

test('on : tout passe', () => {
  withEnv({ NOTIFICATIONS_MODE: 'on' }, () => {
    assert.equal(sortie.emailAllowed('autre@chay.test'), true);
    assert.deepEqual(sortie.filterUserIds(['u1', 'u2']), ['u1', 'u2']);
  });
});

test('journal : compteur seulement, rien si zéro', () => {
  logs.length = 0;
  withEnv({ NOTIFICATIONS_MODE: 'off' }, () => { sortie.blocked('email', 0); sortie.blocked('email', 3); });
  assert.equal(logs.length, 1);
  assert.deepEqual(logs[0], ['[sortie] envois bloques', 'mode', 'off', 'canal', 'email', 'nombre', 3]);
});
