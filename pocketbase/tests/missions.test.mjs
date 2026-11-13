// Requêtes › « Se missionner » : validation serveur (pb_hooks/lib/missions.js) et parité avec l'app (src/lib/missions.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { chargerLib } from './charger-cjs.mjs';
import { TYPES_MISSION as TYPES_APP, erreurMission } from '../../src/lib/missions.js';

const m = chargerLib('missions.js');
const ok = { last_name: 'Rakoto', first_name: ' Jean ', age: '34', phone: '+33 6 12 34 56 78', address: '1 rue de la Paix', kind: 'evangeliser', details: 'Disponible\r\nle samedi' };

test('formulaire complet accepté, champs nettoyés', () => {
  const v = m.validerMission(ok);
  assert.equal(v.erreur, undefined);
  assert.equal(v.data.first_name, 'Jean');
  assert.equal(v.data.age, 34);
  assert.equal(v.data.details, 'Disponible\nle samedi');
  assert.equal(v.data.other_text, '');
});

test('chaque champ obligatoire, âge, téléphone, type, « Autre demande » précisée', () => {
  for (const k of ['last_name', 'first_name', 'phone', 'address']) assert.match(m.validerMission({ ...ok, [k]: '  ' }).erreur, /obligatoire/);
  assert.match(m.validerMission({ ...ok, age: '0' }).erreur, /âge/);
  assert.match(m.validerMission({ ...ok, age: '12.5' }).erreur, /âge/);
  assert.match(m.validerMission({ ...ok, phone: 'abc' }).erreur, /invalide/);
  assert.match(m.validerMission({ ...ok, kind: 'pirate' }).erreur, /type/);
  assert.match(m.validerMission({ ...ok, kind: 'autre' }).erreur, /Précisez/);
  assert.equal(m.validerMission({ ...ok, kind: 'autre', other_text: 'Chorale' }).data.other_text, 'Chorale');
  assert.match(m.validerMission({ ...ok, details: 'x'.repeat(3001) }).erreur, /dépasse/);
  assert.match(m.validerMission(null).erreur, /obligatoire/);
});

test('mêmes choix et mêmes refus dans l\'app', () => {
  assert.deepEqual(TYPES_APP.map((t) => [t.value, t.label]), Object.entries(m.TYPES_MISSION));
  assert.equal(erreurMission(ok), null);
  assert.equal(erreurMission({ ...ok, kind: 'autre' }).champ, 'other_text');
  assert.equal(erreurMission({ ...ok, phone: '12' }).champ, 'phone');
});

test('e-mail aux admins : contenu du membre échappé, précision « Autre demande »', () => {
  const mail = { escapeHtml: (s) => String(s).replace(/</g, '&lt;'), paragraph: (h) => `<p>${h}</p>`, button: (l) => `<a href="${l}">`, shell: (t, b) => `<h1>${t}</h1>${b}` };
  const c = m.courrielMission(mail, { ...m.validerMission({ ...ok, kind: 'autre', other_text: '<b>x</b>', details: 'a\nb' }).data }, 'https://app/admin/missions');
  assert.match(c.sujet, /^Se missionner : Autre demande : <b>x<\/b> — Jean Rakoto$/);
  assert.match(c.html, /&lt;b>x/);
  assert.doesNotMatch(c.html, /<b>x/);
  assert.match(c.html, /a<br>b/);
  assert.match(c.texte, /Téléphone : \+33 6 12 34 56 78/);
});
