// Annonce d'une nouvelle version : règles pures (pb_hooks/lib/annonceVersion.js) et texte de confirmation de l'app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chargerLib } from './charger-cjs.mjs';
import { messageConfirmationVersion } from '../../src/lib/annonceVersion.js';

const a = chargerLib('annonceVersion.js');

test('version : nom x.y[.z] et code entier positif', () => {
  assert.deepEqual(a.validerVersion({ version_name: ' 1.3.7 ', version_code: '11' }), { version_name: '1.3.7', version_code: 11 });
  assert.match(a.validerVersion({ version_name: '1.3-beta', version_code: 11 }).erreur, /version/);
  assert.match(a.validerVersion({ version_name: '1.3.7', version_code: 0 }).erreur, /Code/);
  assert.match(a.validerVersion({ version_name: '1.3.7', version_code: 1.5 }).erreur, /Code/);
});

test('canaux : coupure générale, « Nouvelle version », e-mail et push respectés', () => {
  assert.deepEqual(a.canaux({}), { email: true, push: true });
  assert.deepEqual(a.canaux({ notif_new_version: false }), { email: false, push: false });
  assert.deepEqual(a.canaux({ notifications_enabled: false }), { email: false, push: false });
  assert.deepEqual(a.canaux({ notif_email: false }), { email: false, push: true });
  assert.deepEqual(a.canaux({ notif_push: false }), { email: true, push: false });
  assert.deepEqual(a.canaux(null), { email: true, push: true });
});

test('file d\'e-mails : lots, lecture du champ json sous toutes ses formes', () => {
  assert.deepEqual(a.prochainLot(['a', 'b', 'c'], 2), { lot: ['a', 'b'], reste: ['c'] });
  assert.deepEqual(a.prochainLot(null, 2), { lot: [], reste: [] });
  assert.deepEqual(a.lireListe('["a","b"]'), ['a', 'b']);
  assert.deepEqual(a.lireListe(JSON.stringify('["a"]')), ['a']);
  assert.deepEqual(a.lireListe(['x', 3, '']), ['x']);
  assert.deepEqual(a.lireListe('pas du json'), []);
});

test('e-mail : lien de téléchargement stable, version échappée ; confirmation « Envoyer à N membres ? »', () => {
  const mail = { escapeHtml: (s) => String(s).replace(/</g, '&lt;'), paragraph: (h) => `<p>${h}</p>`, button: (l, t) => `<a href="${l}">${t}</a>`, shell: (t, b) => `<h1>${t}</h1>${b}` };
  const c = a.courriel(mail, { version_name: '1.3.7', version_code: 11 });
  assert.equal(c.sujet, 'Nouvelle version de l\'app Chay : 1.3.7');
  assert.match(c.html, /href="https:\/\/membres\.chay\.fr\/telechargements\/chay\.apk"/);
  assert.match(c.texte, /chay\.apk/);
  assert.match(messageConfirmationVersion({ destinataires: 42, appareils: 1, version_name: '1.3.7' }), /^Envoyer à 42 membres \? Version 1\.3\.7 : un e-mail à 42 membres et une notification à 1 appareil\./);
});
