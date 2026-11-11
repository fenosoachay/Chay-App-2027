// Texte de l'e-mail « Choisir un nouveau mot de passe » : durée dynamique, lien de l'APK, consigne Android.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { APK_URL, dureeEnSecondes, dureeEnTexte, gabaritReinitialisation, texteBrut } from '../scripts/envoyer-mots-de-passe.mjs';

const PHRASE = "Si Android refuse l'installation, désinstallez d'abord l'ancienne application, puis réinstallez.";

test('durée en toutes lettres', () => {
  assert.equal(dureeEnTexte(dureeEnSecondes('72h')), '72 heures');
  assert.equal(dureeEnTexte(dureeEnSecondes('30min')), '30 minutes');
  assert.equal(dureeEnTexte(3600), '1 heure');
  assert.equal(dureeEnTexte(dureeEnSecondes('3j')), '72 heures');
  assert.equal(dureeEnTexte(90 * 60), '90 minutes');
});

test('gabarit 72 h : durée, lien de l\'APK, consigne Android, variables PocketBase', () => {
  const g = gabaritReinitialisation(72 * 3600);
  assert.equal(g.subject, 'Choisir un nouveau mot de passe — Chay');
  assert.match(g.body, /expire au bout de 72 heures\./);
  assert.doesNotMatch(g.body, /30 minutes/);
  assert.ok(g.body.includes(`<a href="${APK_URL}">${APK_URL}</a>`));
  assert.equal(APK_URL, 'https://membres.chay.fr/telechargements/chay.apk');
  assert.ok(g.body.includes(PHRASE));
  assert.ok(g.body.includes('{APP_URL}/reset-password?token={TOKEN}'));
});

test('gabarit 30 min = version de pocketbase/config/users-auth.json (configurer-production.mjs reste cohérent)', () => {
  const cfg = JSON.parse(fs.readFileSync(new URL('../config/users-auth.json', import.meta.url), 'utf8'));
  const g = gabaritReinitialisation(1800);
  assert.equal(cfg.resetPasswordTemplate.subject, g.subject);
  assert.equal(cfg.resetPasswordTemplate.body, g.body);
  assert.match(g.body, /expire au bout de 30 minutes\./);
});

test('aucune adresse de bac à sable dans le gabarit (même règle que configurer-production.mjs)', () => {
  const interdit = /127\.0\.0\.1|localhost|%PB_URL%|chay\.test|:5173|:8090|bac[ -]à[ -]sable/i;
  for (const s of [1800, 72 * 3600]) assert.doesNotMatch(JSON.stringify(gabaritReinitialisation(s)), interdit);
});

test('aperçu en texte brut', () => {
  const t = texteBrut(gabaritReinitialisation(72 * 3600).body);
  assert.match(t, /^Bonjour,\n\nPour choisir un nouveau mot de passe, ouvrez ce lien :\n\nChoisir mon mot de passe\n\n/);
  assert.ok(t.includes(`Application Android : ${APK_URL}\n${PHRASE}`));
  assert.doesNotMatch(t, /<[a-z]/);
});
