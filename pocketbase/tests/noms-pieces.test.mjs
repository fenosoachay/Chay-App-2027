// 1.3.35 : nom affiché (Prénom Nom du profil avant le nom Google) et pièces jointes des messages.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chargerLib } from './charger-cjs.mjs';
import { CHAMPS, correctionsNoms, nomComplet } from '../scripts/migrer-1-3-35.mjs';

const nm = chargerLib('nouveauxMembres.js');
const pj = chargerLib('messagesPieces.js');
const lire = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

test('nom affiché : prénom + nom du profil passent avant le nom Google', () => {
  assert.equal(nm.nomAffiche('Marie', 'Rakoto', 'marie.r Google'), 'Marie Rakoto');
  assert.equal(nm.nomAffiche('', '', 'Jean Google'), 'Jean Google');
  assert.equal(nm.nameASynchroniser('Marie', 'Rakoto', 'Ancien Nom'), 'Marie Rakoto');
  assert.equal(nm.nameASynchroniser(' Marie ', ' Rakoto ', 'Marie Rakoto'), null);
  assert.equal(nm.nameASynchroniser('', '', 'Ancien'), null); // sans prénom ni nom : on ne touche à rien
});

test('migration 1.3.35 : comptes et profils publics à corriger', () => {
  const users = [
    { id: 'u1', name: 'Google Name', first_name: 'Marie', last_name: 'Rakoto' },
    { id: 'u2', name: 'Paul Be', first_name: 'Paul', last_name: 'Be' },
    { id: 'u3', name: 'Inconnu', first_name: '', last_name: '' },
  ];
  const profils = [
    { id: 'p1', created_by_id: 'u1', display_name: 'Google Name' },
    { id: 'p2', created_by_id: 'u1', display_name: 'Marie Rakoto' },
    { id: 'p3', created_by_id: 'u2', display_name: 'Membre' },
    { id: 'p4', created_by_id: 'u3', display_name: 'Inconnu' },
  ];
  const { comptes, publics } = correctionsNoms(users, profils);
  assert.deepEqual(comptes.map((c) => [c.id, c.apres]), [['u1', 'Marie Rakoto']]);
  assert.deepEqual(publics.map((c) => [c.id, c.apres]), [['p1', 'Marie Rakoto'], ['p3', 'Paul Be']]);
  assert.equal(nomComplet(' A ', ''), 'A');
  assert.deepEqual(CHAMPS.map((c) => `${c.collection}.${c.champ.name}`), ['TexteDefilant.secondes', 'ImageDefilante.secondes', 'Message.piece_jointe']);
});

test('hooks : name synchronisé à chaque enregistrement, serveur qui préfère prénom + nom', () => {
  const noms = lire('../pb_hooks/noms.pb.js');
  assert.match(noms, /onRecordCreate\(synchroniserName, 'users'\)/);
  assert.match(noms, /onRecordUpdate\(synchroniserName, 'users'\)/);
  assert.match(noms, /onRecordAfterUpdateSuccess/);
  const integrite = lire('../pb_hooks/integrite.pb.js');
  assert.ok(integrite.indexOf("auth.getString('first_name')") < integrite.indexOf("auth.getString('name')"));
});

test('pièces jointes : genre, durée plafonnée à 10 min, aperçu', () => {
  assert.equal(pj.genrePiece('audio/webm', true), 'vocal');
  assert.equal(pj.genrePiece('audio/mpeg', false), 'audio');
  assert.equal(pj.genrePiece('video/mp4'), 'video');
  assert.equal(pj.genrePiece('application/pdf'), 'document');
  assert.equal(pj.genrePiece('application/octet-stream'), 'fichier');
  const v = pj.pieceJointe({ url: 'https://x/v.weba', nom: 'v.weba', mime: 'audio/webm', taille: 1200, vocal: true, duree: 9999 });
  assert.equal(v.genre, 'vocal');
  assert.equal(v.duree, 600);
  assert.equal(pj.pieceJointe({ url: 'u', nom: 'a.pdf', mime: 'application/pdf', duree: 30 }).duree, undefined);
  assert.equal(pj.apercuPiece(v), '🎤 Message vocal');
  assert.equal(pj.apercuPiece({ genre: 'document', nom: 'devis.pdf' }), '📄 devis.pdf');
  assert.equal(pj.apercuPiece(null), '');
});

test('téléversement des membres : réservé aux messages, 500 Mo, limite par jour, types dangereux téléchargés', () => {
  const fichiers = lire('../pb_hooks/fichiers.pb.js');
  assert.match(fichiers, /pourMessage \? fn\.requireUser\(e, 'Connexion requise'\) : fn\.requireAdmin/);
  assert.equal((fichiers.match(/const pourMessage = body\.usage === 'message';/g) || []).length, 3);
  assert.match(fichiers, /refusQuotaMessage\(user\.id, fileSize\)/);
  const lib = lire('../pb_hooks/lib/televersement.js');
  assert.match(lib, /MAX_MESSAGE_BYTES = 500 \* MIO/);
  assert.match(lib, /mime: 'application\/octet-stream', nom: 'un fichier'/);
  assert.doesNotMatch(lib, /html: 'text\/html'|svg: 'image\/svg/);
  const msg = lire('../pb_hooks/fn_messagerie_priere.pb.js');
  // la pièce jointe doit venir d'une session terminée de CE membre
  assert.match(msg, /final_file_url = \{:url\} && created_by = \{:u\} && storage = \{:t\} && status = "done"/);
});

test('e-mails : le canal « E-mail » coupé arrête tout, plafond par jour', () => {
  const ce = chargerLib('canauxEmail.js');
  const champs = { email_messages: true, email_nouveautes: true };
  assert.equal(ce.emailAutorise({}, champs, 'messages'), true);
  assert.equal(ce.emailAutorise({ notif_email: false }, champs, 'messages'), false); // le bug signalé
  assert.equal(ce.emailAutorise({ notifications_enabled: false }, champs, 'nouveautes'), false);
  assert.equal(ce.emailAutorise({ notif_messages: false }, champs, 'messages'), false);
  assert.equal(ce.emailAutorise({}, { email_messages: false }, 'messages'), false);
  assert.equal(ce.emailAutorise({ notif_news: false }, champs, 'nouveautes'), false);
  assert.equal(ce.emailAutorise({ notif_email: false }, champs, 'admin'), false);
  const t = Date.UTC(2026, 10, 25, 12);
  const cle = ce.cleJour('u1', t);
  assert.equal(cle, 'u1:2026-11-25');
  assert.equal(ce.plafondAtteint({ [cle]: ce.MAX_PAR_JOUR - 1 }, 'u1', t), false);
  assert.equal(ce.plafondAtteint({ [cle]: ce.MAX_PAR_JOUR }, 'u1', t), true);
  const notif = lire('../pb_hooks/lib/notifications.js');
  assert.match(notif, /const emailOn = emailPermis\(recipient, 'messages'\);/);
  assert.match(notif, /if \(!emailPermis\(u, 'nouveautes'\)\) continue;/);
  assert.match(notif, /PUSH_CONTENU_ECART_MS = 10 \* 60 \* 1000/);
  assert.match(lire('../pb_hooks/lib/push.js'), /web: web\.filter\(\(w\) => admins\[w\.user\]\)/);
});
