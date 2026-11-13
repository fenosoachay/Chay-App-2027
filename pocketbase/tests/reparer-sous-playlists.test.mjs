// 1.3.9 : réparation des sous-playlists créées à tort comme playlists de premier niveau — plan pur.
import test from 'node:test';
import assert from 'node:assert/strict';
import { modeleRattachements, planRattachements } from '../scripts/reparer-sous-playlists.mjs';

const P = [
  { id: 'r1', name: 'Louange', category: 'music', parent_id: '' },
  { id: 'r2', name: 'Dimanche', category: 'music', parent_id: '' },
  { id: 'r3', name: 'Cantiques', category: 'music', parent_id: '' },
  { id: 's0', name: 'Déjà sous', category: 'music', parent_id: 'r1', order: 4 },
  { id: 'y1', name: 'Cultes', category: 'youtube', parent_id: '' },
  { id: 'y2', name: 'Noël 2026', category: 'youtube', parent_id: '' },
  { id: 'd1', name: 'Doublon', category: 'articles', parent_id: '' },
  { id: 'd2', name: 'Doublon', category: 'articles', parent_id: '' },
];

test('modèle : playlists de premier niveau sans sous-playlist, par section', () => {
  assert.deepEqual(modeleRattachements(P).map((l) => `${l.section}:${l.sous}`), ['articles:Doublon', 'articles:Doublon', 'music:Cantiques', 'music:Dimanche', 'youtube:Cultes', 'youtube:Noël 2026']);
});

test('rattachements valides : ordre à la fin des sous-playlists de la parente ; déjà fait compté', () => {
  const p = planRattachements(P, [
    { section: 'music', sous: 'Dimanche', parente: 'Louange' },
    { section: 'music', sous: 'Cantiques', parente: 'Louange' },
    { section: 'youtube', sous: 'Noël 2026', parente: 'Cultes' },
    { section: 'music', sous: 'Déjà sous', parente: 'Louange' },
  ]);
  assert.deepEqual(p.erreurs, []);
  assert.deepEqual(p.operations.map((o) => [o.sous.id, o.parente.id, o.order]), [['r2', 'r1', 5], ['r3', 'r1', 6], ['y2', 'y1', 0]]);
  assert.equal(p.dejaFaits, 1);
});

test('refus : autre section, 3e niveau, parente rattachée dans le même fichier, doublons de noms, introuvable', () => {
  const p = planRattachements(P, [
    { section: 'music', sous: 'Dimanche', parente: 'Cultes' },
    { section: 'music', sous: 'Cantiques', parente: 'Déjà sous' },
    { section: 'music', sous: 'Louange', parente: 'Dimanche' },
    { section: 'articles', sous: 'Doublon', parente: 'Doublon' },
    { section: 'music', sous: 'Inconnue', parente: 'Louange' },
    { section: 'youtube', sous: 'Cultes', parente: 'Cultes' },
  ]);
  assert.equal(p.operations.length, 0);
  const texte = p.erreurs.join(' | ');
  assert.match(texte, /Playlist parente « Cultes » introuvable dans la section music/);
  assert.match(texte, /un seul niveau/);
  assert.match(texte, /a elle-même des sous-playlists/);
  assert.match(texte, /2 playlists portent ce nom/);
  assert.match(texte, /« Inconnue » introuvable/);
  assert.match(texte, /sa propre sous-playlist/);
  const parId = planRattachements(P, [{ sous_id: 'd1', parente_id: 'd2' }]);
  assert.deepEqual(parId.operations.map((o) => [o.sous.id, o.parente.id]), [['d1', 'd2']]);
});
