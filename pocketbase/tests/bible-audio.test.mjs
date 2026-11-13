// Bible › Sagesse en audio : script d'envoi en masse (plan, durée des mp3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { dureeMp3, planEnvoi } from '../scripts/envoyer-bible-audio.mjs';

test('plan : ajouter, identique, existe / remplacer, ignoré, doublon (Proverbes, Ecclésiaste ; Psaumes refusés)', () => {
  const fichiers = [
    { nom: 'Proverbes-01.mp3', taille: 100 }, { nom: 'Proverbes-1.mp3', taille: 100 },
    { nom: 'Ecclesiaste-03.mp3', taille: 200 }, { nom: 'ecclesiaste-12.mp3', taille: 300 },
    { nom: 'notes.txt', taille: 5 }, { nom: 'Ecclesiaste-13.mp3', taille: 5 }, { nom: 'Psaumes-012.mp3', taille: 5 },
  ];
  const existants = [{ id: 'r3', book: 'ecclesiaste', chapter: 3, size: 200 }, { id: 'r12', book: 'ecclesiaste', chapter: 12, size: 999 }];
  const actions = (p) => Object.fromEntries(p.map((x) => [x.fichier, x.action]));
  const a = actions(planEnvoi(fichiers, existants));
  assert.equal(a['Proverbes-01.mp3'], 'ajouter');
  assert.equal(a['Proverbes-1.mp3'], 'doublon');
  assert.equal(a['Ecclesiaste-03.mp3'], 'identique');
  assert.equal(a['ecclesiaste-12.mp3'], 'existe');
  assert.equal(a['notes.txt'], 'ignoré');
  assert.equal(a['Ecclesiaste-13.mp3'], 'ignoré');
  assert.equal(a['Psaumes-012.mp3'], 'ignoré');
  const r = planEnvoi(fichiers, existants, { remplacer: true }).find((x) => x.fichier === 'ecclesiaste-12.mp3');
  assert.deepEqual([r.action, r.id], ['remplacer', 'r12']);
});

test('durée mp3 : débit constant (128 kbit/s) et en-tête Xing (VBR), avec ou sans balise ID3', () => {
  const trame = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
  const cbr = Buffer.concat([trame, Buffer.alloc(400)]);
  assert.equal(dureeMp3(cbr, 1_600_000), 100);
  const id3 = Buffer.concat([Buffer.from('ID3'), Buffer.from([3, 0, 0, 0, 0, 0, 0, 10]), Buffer.alloc(10), cbr]);
  assert.equal(dureeMp3(id3, 1_600_000 + 20), 100);
  const xing = Buffer.concat([trame, Buffer.alloc(32), Buffer.from('Xing'), Buffer.from([0, 0, 0, 1]), Buffer.from([0, 0, 3, 0xe8]), Buffer.alloc(200)]);
  assert.equal(dureeMp3(xing, 5_000_000), Math.round((1000 * 1152) / 44100));
  assert.equal(dureeMp3(Buffer.alloc(100), 100), null);
});
