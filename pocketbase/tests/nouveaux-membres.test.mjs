import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
const nm = createRequire(import.meta.url)('../pb_hooks/lib/nouveauxMembres.js');

test('nom complet', () => {
  assert.equal(nm.nomComplet(' Anja ', 'Rakoto'), 'Anja Rakoto');
  assert.equal(nm.nomComplet('', ''), '');
});

test("fin d'inscription : une seule fois, jamais pour le compte automatique", () => {
  assert.equal(nm.inscriptionTerminee({ consents_accepted: false }, { consents_accepted: true }), true);
  assert.equal(nm.inscriptionTerminee({ consents_accepted: true }, { consents_accepted: true }), false); // modification de profil plus tard
  assert.equal(nm.inscriptionTerminee({ consents_accepted: false }, { consents_accepted: false }), false);
  assert.equal(nm.inscriptionTerminee({}, { consents_accepted: true, systeme: true }), false);
});

test('notification : ouvre Gérer les membres sur le compte', () => {
  const n = nm.notificationNouveauMembre('abc123', 'Anja Rakoto');
  assert.equal(n.route, '/admin/membres?membre=abc123');
  assert.equal(n.notification_id, 'nouveau_membre_abc123');
  assert.match(n.body, /Anja Rakoto vient de s'inscrire/);
  assert.match(nm.notificationNouveauMembre('x', '').body, /Un nouveau compte/);
});

test('profil public « Membre » : remplacé par le vrai nom seulement', () => {
  assert.equal(nm.profilARetablir('Membre', 'Anja R'), true);
  assert.equal(nm.profilARetablir('', 'Anja R'), true);
  assert.equal(nm.profilARetablir('anja2503', 'Anja R'), false); // nom choisi par le membre : gardé
  assert.equal(nm.profilARetablir('Membre', ''), false);
});
