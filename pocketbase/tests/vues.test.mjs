// Compteur de vues : demande validée côté serveur (pb_hooks/lib/vues.js) et parité des types avec l'app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chargerLib } from './charger-cjs.mjs';
import { TYPES_VUE } from '../../src/lib/vues.js';

const v = chargerLib('vues.js');

test('types et cibles : mêmes types que l\'app ; piste -> PlaylistTrack.listen_count par track_id', () => {
  assert.deepEqual(Object.keys(v.CIBLES), TYPES_VUE);
  assert.deepEqual(v.CIBLES.piste, { collection: 'PlaylistTrack', champ: 'listen_count', parChamp: 'track_id' });
  assert.equal(v.FENETRE_MS, 30 * 60 * 1000);
});

test('demande : type connu, identifiant alphanumérique', () => {
  assert.equal(v.lireDemande({ type: 'youtube', id: 'abc123' }).cle, 'youtube:abc123');
  assert.match(v.lireDemande({ type: 'Video', id: 'abc' }).erreur, /type/);
  assert.match(v.lireDemande({ type: 'article', id: 'a" || 1=1' }).erreur, /identifiant/);
  assert.match(v.lireDemande({ type: 'article', id: 'x'.repeat(41) }).erreur, /identifiant/);
  assert.match(v.lireDemande(null).erreur, /type/);
  assert.equal(v.entier('7.9'), 7);
  assert.equal(v.entier(-3), 0);
});
