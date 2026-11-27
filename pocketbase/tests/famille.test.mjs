// 1.4.1 : marque du foyer et code famille (pocketbase/pb_hooks/lib/famille.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { chargerLib } from './charger-cjs.mjs';

const f = chargerLib('famille.js');

test('marque du foyer : nom de famille, sinon prénom, sinon nom affiché', () => {
  assert.equal(f.initialeFamille('Hanta', 'Rakoto', ''), 'R');
  assert.equal(f.initialeFamille('hanta', '', ''), 'H');
  assert.equal(f.initialeFamille('', '', ' élodie M'), 'É');
  assert.equal(f.initialeFamille('', "  'Andry", ''), 'A');
  assert.equal(f.initialeFamille('', '', ''), '');
});

test('invités : ajout sans doublon, retrait, accès du parent et des invités seulement', () => {
  let t = f.ajouterInvite('', 'aaa');
  t = f.ajouterInvite(t, 'bbb');
  t = f.ajouterInvite(t, 'aaa');
  assert.equal(t, ',aaa,bbb,');
  assert.ok(f.aAcces('papa', t, 'bbb'));
  assert.ok(f.aAcces('papa', t, 'papa'));
  assert.ok(!f.aAcces('papa', t, 'ccc'));
  assert.ok(!f.aAcces('papa', t, ''));
  assert.equal(f.retirerInvite(t, 'aaa'), ',bbb,');
  assert.equal(f.retirerInvite(',bbb,', 'bbb'), '');
});

test('invités : 10 au plus (les plus récents gardés)', () => {
  let t = '';
  for (let i = 0; i < 12; i += 1) t = f.ajouterInvite(t, `u${i}`);
  assert.equal(f.listeInvites(t).length, f.INVITES_MAX);
  assert.ok(!f.listeInvites(t).includes('u0'));
});

test('code : 6 chiffres, espaces ignorés', () => {
  assert.equal(f.codeValide('482 913'), '482913');
  assert.equal(f.codeValide('48291'), '');
  assert.equal(f.codeValide('48291a'), '');
});

test('essais faux : 8 par heure, puis bloqué ; remis à zéro après une heure', () => {
  const t0 = 1_000_000;
  let e = null;
  for (let i = 0; i < 8; i += 1) e = f.essaiSuivant(e, t0 + i);
  assert.ok(f.tropDEssais(e, t0 + 10));
  assert.ok(!f.tropDEssais(e, t0 + 3600 * 1000 + 1));
  assert.equal(f.essaiSuivant(e, t0 + 3600 * 1000 + 1).n, 1);
});
