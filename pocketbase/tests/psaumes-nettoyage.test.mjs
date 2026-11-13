// 1.3.8 : migration (Psaumes -> Ecclésiaste) et nettoyage des Psaumes : règles pures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chargerLib } from './charger-cjs.mjs';
import { planBibleAudio } from '../scripts/migrer-1-3-8.mjs';
import { nouvellesCollections as c137 } from '../scripts/migrer-1-3-7.mjs';
import { lireArgs, urlAutorisee, resumeTexte } from '../scripts/nettoyer-psaumes.mjs';

const n = chargerLib('nettoyageBible.js');
const PUB = 'https://media.chay.fr';
const PRE = 'videos/bible/psaumes/';

test('migration 1.3.8 : valeurs du livre et maximum du chapitre, identifiants gardés ; idempotente', () => {
  const col = JSON.parse(JSON.stringify(c137()[0]));
  col.fields.forEach((f, i) => { f.id = `id${i}`; });
  const plan = planBibleAudio(col);
  assert.equal(plan.changements.length, 2);
  const book = plan.fields.find((f) => f.name === 'book');
  assert.deepEqual(book.values, ['proverbes', 'ecclesiaste']);
  assert.equal(book.id, col.fields.find((f) => f.name === 'book').id);
  assert.equal(plan.fields.find((f) => f.name === 'chapter').max, 31);
  assert.equal(plan.fields.length, col.fields.length);
  assert.deepEqual(col.fields.find((f) => f.name === 'book').values, ['proverbes', 'psaumes']); // non modifiée
  assert.equal(planBibleAudio({ ...col, fields: plan.fields }), null);
  assert.throws(() => planBibleAudio({ fields: [] }), /book/);
});

test('nettoyage : seul un livre retiré, clé R2 seulement sous le préfixe du livre', () => {
  assert.deepEqual(n.LIVRES_RETIRES, ['psaumes']);
  assert.equal(n.prefixeLivre('videos', 'psaumes'), PRE);
  assert.equal(n.cleDepuisUrl(`${PUB}/videos/bible/psaumes/Psaumes-012-abcd1234.mp3`, PUB, PRE), 'videos/bible/psaumes/Psaumes-012-abcd1234.mp3');
  assert.equal(n.cleDepuisUrl(`${PUB}/videos/bible/proverbes/Proverbes-01-x.mp3`, PUB, PRE), null);
  assert.equal(n.cleDepuisUrl(`${PUB}/videos/2026/11/abc-film.mp4`, PUB, PRE), null);
  assert.equal(n.cleDepuisUrl('https://autre.site/videos/bible/psaumes/x.mp3', PUB, PRE), null);
  assert.equal(n.cleDepuisUrl(`${PUB}/videos/bible/psaumes/../proverbes/x.mp3`, PUB, PRE), null);
  assert.equal(n.cleDepuisUrl(`${PUB}/videos/bible/psaumes/`, PUB, PRE), null);
});

test('nettoyage : plan (fiches, objets, objets sans fiche, fiches sans objet, hors rangement)', () => {
  const fiches = [
    { id: 'a', chapter: 1, audio_url: `${PUB}/videos/bible/psaumes/Psaumes-001-a.mp3` },
    { id: 'b', chapter: 2, audio_url: `${PUB}/videos/bible/psaumes/Psaumes-002-b.mp3` },
    { id: 'c', chapter: 3, audio_url: 'https://ancien.site/p3.mp3' },
  ];
  const objets = [
    { key: 'videos/bible/psaumes/Psaumes-001-a.mp3', size: 10 },
    { key: 'videos/bible/psaumes/Psaumes-001-ancien.mp3', size: 5 },
  ];
  const p = n.planNettoyage(fiches, objets, PUB, PRE);
  assert.equal(p.fiches.length, 3);
  assert.equal(p.objets.length, 2);
  assert.equal(p.octets, 15);
  assert.equal(p.objetsSansFiche, 1);
  assert.equal(p.clesSansObjet, 1);
  assert.equal(p.fichesHorsRangement, 1);
});

test('script : suppression seulement avec --confirmer, tunnel local seulement, résumé lisible', () => {
  assert.equal(lireArgs([]).appliquer, false);
  assert.throws(() => lireArgs(['--appliquer']), /confirmer/);
  assert.equal(lireArgs(['--appliquer', '--confirmer', '146']).confirmer, 146);
  assert.throws(() => lireArgs(['--tout']), /inconnue/);
  assert.ok(urlAutorisee('http://127.0.0.1:8092'));
  assert.ok(!urlAutorisee('https://api.chay.fr'));
  const t = resumeTexte({ livre: 'psaumes', prefixe: PRE, fiches: 146, objets: 150, octets: 3 * 1024 * 1024, objetsSansFiche: 4, clesSansObjet: 0, fichesHorsRangement: 0, exemples: ['videos/bible/psaumes/Psaumes-001-a.mp3'] });
  assert.match(t, /Fiches BibleAudio à supprimer : 146/);
  assert.match(t, /Objets R2 à supprimer : 150 \(3\.0 Mo\)/);
});
