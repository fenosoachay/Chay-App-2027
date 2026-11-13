// 1.3.9 : diagnostic des playlists (lecture seule) — analyse pure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyser } from '../scripts/diagnostiquer-playlists.mjs';

const col = (avecParent, valeurs = ['music', 'sermons', 'films', 'other', 'youtube', 'articles', 'gallery']) => ({
  listRule: '@request.auth.id != ""',
  fields: [{ name: 'name' }, { name: 'category', values: valeurs }, ...(avecParent ? [{ name: 'parent_id' }] : [])],
});

test('cause du sélecteur vide : parent_id absent, sections sans sous-playlist', () => {
  const a = analyser(col(false), [{ id: 'a', category: 'articles' }, { id: 'b', category: 'articles' }], []);
  assert.equal(a.avecParent, false);
  assert.ok(a.problemes.some((p) => /parent_id ABSENT/.test(p)));
  assert.ok(a.problemes.some((p) => /articles : 2 playlist\(s\) mais aucune sous-playlist/.test(p)));
});

test('catégories manquantes, orphelines, liens vers une playlist de premier niveau ; cas sain', () => {
  const a = analyser(col(true, ['music', 'sermons']), [
    { id: 'r', category: 'youtube' }, { id: 's', category: 'youtube', parent_id: 'r' }, { id: 'o', category: 'youtube', parent_id: 'inconnue' },
    { id: 'x', category: 'gallery', parent_id: 'r' },
  ], [{ playlist_id: 'r' }, { playlist_id: 's' }]);
  assert.ok(a.problemes.some((p) => /sans les valeurs youtube, articles, gallery/.test(p)));
  assert.deepEqual(a.parSection.youtube, { racines: 1, sous: 2, orphelines: 1, liensVersRacines: 1 });
  assert.equal(a.parSection.gallery.orphelines, 1);
  const sain = analyser(col(true), [{ id: 'r', category: 'music' }, { id: 's', category: 'music', parent_id: 'r' }], [{ playlist_id: 's' }]);
  assert.deepEqual(sain.problemes, []);
});
