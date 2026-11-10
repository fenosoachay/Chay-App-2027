#!/usr/bin/env node
// envoyer-mots-de-passe.mjs contre le BAC À SABLE et le FAUX SMTP (127.0.0.1:2525 : aucun e-mail ne sort).
// Comptes SYNTHÉTIQUES (@chay.test) et export SYNTHÉTIQUE (dossier temporaire) : aucun vrai membre n'est visé.
// Vérifie : garde-fous, simulation, confirmation refusée, interruption puis reprise sans doublon, comptes exclus,
// rythme entre deux envois, attente sur 429, --un-seul, --limite, durée du lien, aucune adresse ni mot de passe affichés.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BASE, decodeMail, http, loadCreds, login, makeChecker, sleep, tokenFrom } from './lib.mjs';
import { main, masquer, parseArgs } from '../scripts/envoyer-mots-de-passe.mjs';

const { check, done } = makeChecker();
const MAIL_DIR = process.env.FAUX_SMTP_DIR || 'C:\\PB-local\\mails';
const suCreds = loadCreds(['superuser']).superuser;
const su = { token: (await login('_superusers', suCreds)).token };
process.env.PB_URL = BASE;
process.env.PB_EMAIL = suCreds.email;
process.env.PB_PASSWORD = suCreds.password;

const smtp = (await http('GET', '/api/settings?fields=smtp.host,smtp.port', su)).data.smtp;
if (smtp.host !== '127.0.0.1' || smtp.port !== 2525) { console.error('Refusé : le bac à sable n\'envoie pas vers le faux SMTP.'); process.exit(2); }

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'chay-invitations-'));
const rnd = crypto.randomBytes(4).toString('hex');
const hex24 = () => crypto.randomBytes(12).toString('hex');
const MDP = `Mdp-${crypto.randomBytes(9).toString('hex')}`;
const compte = (cle, extra = {}) => ({ id: hex24(), email: `invit-${rnd}-${cle}@chay.test`, name: `Invité ${cle} ${rnd}`, verified: true, ...extra });
const C = {
  a: compte('a'), b: compte('b'), g: compte('g'),
  exclMail: compte('exclmail'), exclNom: compte('exclnom'), desactive: compte('desac', { disabled: true }),
  horsExport: compte('horsexport'),
};
const exportIds = [C.a, C.b, C.g, C.exclMail, C.exclNom, C.desactive].map((u) => u.id).concat([hex24()]); // + 1 absent de PocketBase
fs.writeFileSync(path.join(DIR, 'User.json'), JSON.stringify(exportIds.map((id) => ({ id }))));
const EXCL = path.join(DIR, 'exclure.txt');
fs.writeFileSync(EXCL, `# comptes de test\n${C.exclMail.email.toUpperCase()}\n${C.exclNom.name}\n`);
const JOURNAL = path.join(DIR, 'journal.jsonl');
const BASEARGS = ['--export', DIR, '--journal', JOURNAL, '--exclure', EXCL];
const sortie = [];
const run = (argv, opts = {}) => main(argv, { log: (...a) => sortie.push(a.join(' ')), ...opts });
const echoue = async (p, motif) => { try { await p; return false; } catch (e) { return motif.test(e.message); } };
const mails = (u, since) => (fs.existsSync(MAIL_DIR) ? fs.readdirSync(MAIL_DIR) : []).filter((f) => f.endsWith('.eml') && Number(f.split('-')[0]) >= since)
  .map((f) => ({ t: Number(f.split('-')[0]), raw: fs.readFileSync(path.join(MAIL_DIR, f), 'utf8') }))
  .filter((m) => ((/^X-Faux-Smtp-Rcpt: ([^\r\n]*)/m.exec(m.raw) || [])[1] || '').split(', ').includes(u.email));
const attendreMails = async (u, since, n) => { for (let i = 0; i < 50 && mails(u, since).length < n; i++) await sleep(200); return mails(u, since); };
const duree = async () => (await http('GET', '/api/collections/users?fields=passwordResetToken.duration', su)).data.passwordResetToken.duration;
const gabarit = async () => (await http('GET', '/api/collections/users?fields=resetPasswordTemplate', su)).data.resetPasswordTemplate;
let gabarit0 = null;

const T0 = Date.now();
try {
  for (const u of Object.values(C)) {
    const r = await http('POST', '/api/collections/users/records', { ...su, body: { ...u, password: MDP, passwordConfirm: MDP, emailVisibility: false } });
    if (r.status !== 200) throw new Error(`création d'un compte synthétique impossible (HTTP ${r.status})`);
  }

  console.log('\n■ Garde-fous (avant tout envoi)');
  check('masquage : j***@gmail.com', masquer('jean.dupont@gmail.com') === 'j***@gmail.com');
  check('intervalle par défaut : 8 s', parseArgs([]).intervalle === 8);
  check('--appliquer sans --exclure : refusé', await echoue(run(['--export', DIR, '--journal', JOURNAL, '--appliquer']), /exige --exclure/));
  check('fichier --exclure dans le dépôt : refusé', await echoue(run(['--export', DIR, '--journal', JOURNAL, '--exclure', path.resolve('package.json')]), /HORS du dépôt/));
  check('journal dans le dépôt : refusé', await echoue(run(['--export', DIR, '--journal', path.resolve('journal.jsonl')]), /HORS du dépôt/));
  const urlAvant = process.env.PB_URL;
  process.env.PB_URL = 'https://api.chay.fr';
  check('PB_URL publique : refusée', await echoue(run(BASEARGS), /127\.0\.0\.1 ou localhost/));
  process.env.PB_URL = urlAvant;

  console.log('\n■ Simulation');
  const sim = await run(BASEARGS);
  const st = Object.fromEntries(sim.lignes.filter((l) => Object.values(C).some((u) => u.id === l.u.id)).map((l) => [l.u.id, l.statut]));
  check('3 comptes à inviter (a, b, g)', sim.aInviter === 3 && [C.a, C.b, C.g].every((u) => st[u.id] === 'à inviter'), JSON.stringify(st));
  check('exclu par adresse (majuscules ignorées) et par nom', st[C.exclMail.id] === 'exclu (liste)' && st[C.exclNom.id] === 'exclu (liste)');
  check('compte désactivé : non invité', st[C.desactive.id] === 'compte désactivé');
  check('compte absent de l\'export (créé dans PocketBase) : non invité', st[C.horsExport.id] === 'pas dans l\'export Base44');
  check('comptes de test du bac à sable (test1…) : jamais invités', sim.lignes.filter((l) => l.statut === 'à inviter').length === 3);
  check('simulation : aucun e-mail envoyé, journal vide', (await attendreMails(C.a, T0, 0)).length === 0 && !fs.existsSync(JOURNAL));
  check('sortie : adresses masquées', sortie.some((l) => l.includes(masquer(C.a.email))));

  console.log('\n■ Confirmation, interruption, reprise');
  check('confirmation refusée : rien n\'est envoyé',
    await echoue(run([...BASEARGS, '--appliquer'], { confirmer: async () => false }), /Annulé/) && !fs.existsSync(JOURNAL));
  let demande = '';
  const interrompu = await echoue(run([...BASEARGS, '--appliquer'], {
    confirmer: async (t) => { demande = t; return true; },
    apresEnvoi: async (n) => { if (n === 1) throw new Error('interruption simulée'); },
  }), /interruption simulée/);
  check('texte de confirmation : « ENVOYER 3 »', demande === 'ENVOYER 3');
  const premier = [C.a, C.b, C.g].filter((u) => mails(u, T0).length);
  check('interruption après le 1er envoi : 1 e-mail, 1 ligne de journal',
    interrompu && (await attendreMails(C.a, T0, 1)).length === 1 && fs.readFileSync(JOURNAL, 'utf8').trim().split('\n').length === 1, `${premier.length}`);

  const T1 = Date.now();
  const reprise = await run([...BASEARGS, '--appliquer'], { confirmer: async () => true });
  check('reprise : seuls les 2 comptes restants sont envoyés', reprise.envoyes === 2 && reprise.echecs === 0);
  const mb = await attendreMails(C.b, T0, 1);
  const mg = await attendreMails(C.g, T0, 1);
  check('aucun doublon : exactement 1 e-mail par compte', mails(C.a, T0).length === 1 && mb.length === 1 && mg.length === 1);
  check('rythme : au moins 7,5 s entre deux envois', Math.abs(mg[0].t - mb[0].t) >= 7500, `${Math.abs(mg[0].t - mb[0].t)} ms`);
  check('reprise après T1 seulement pour b et g', mb[0].t >= T1 && mg[0].t >= T1);
  const texte = decodeMail(mb[0].raw);
  check('e-mail : gabarit « Choisir un nouveau mot de passe » avec lien /reset-password', /Choisir/.test(texte) && /reset-password\?token=/.test(texte));
  check('aucun e-mail aux comptes exclus, désactivé ou hors export',
    [C.exclMail, C.exclNom, C.desactive, C.horsExport].every((u) => mails(u, T0).length === 0));

  const relance = await run([...BASEARGS, '--appliquer'], { confirmer: async () => { throw new Error('ne doit pas demander'); } });
  check('relance : rien à envoyer (3 déjà invités)', relance.aInviter === 0 && relance.envoyes === 0
    && relance.lignes.filter((l) => l.statut === 'déjà invité').length === 3);

  console.log('\n■ 429, --un-seul, --limite');
  let faux429 = true;
  const fetch429 = async (url, init) => {
    if (faux429 && String(url).endsWith('/request-password-reset')) { faux429 = false; return new Response('{}', { status: 429, headers: { 'Retry-After': '2' } }); }
    return fetch(url, init);
  };
  const T2 = Date.now();
  const seul = await run(['--journal', JOURNAL, '--un-seul', C.horsExport.email.toUpperCase(), '--appliquer'], { fetchImpl: fetch429, confirmer: async () => true });
  check('429 : attente puis nouvel essai réussi', seul.attentes429 === 1 && seul.envoyes === 1 && Date.now() - T2 >= 2000);
  check('--un-seul : un seul e-mail, au seul compte visé', (await attendreMails(C.horsExport, T2, 1)).length === 1
    && [C.a, C.b, C.g, C.exclMail].every((u) => mails(u, T2).length === 0));
  const lim = await run(['--export', DIR, '--journal', path.join(DIR, 'autre.jsonl'), '--exclure', EXCL, '--limite', '1']);
  check('--limite 1 : 3 à inviter, 1 pour ce passage (simulation)', lim.aInviter === 3 && sortie.some((l) => /ce passage : 1 \(--limite\)/.test(l)));

  console.log('\n■ Durée de validité du lien et texte de l\'e-mail (--duree-lien)');
  const d0 = await duree();
  gabarit0 = await gabarit();
  sortie.length = 0;
  await run(['--duree-lien', '72h']);
  check('simulation : durée et texte inchangés, texte « 72 heures » affiché',
    (await duree()) === d0 && JSON.stringify(await gabarit()) === JSON.stringify(gabarit0) && sortie.some((l) => /expire au bout de 72 heures/.test(l)));
  await run(['--duree-lien', '72h', '--appliquer']);
  check('--appliquer : 72 h (259 200 s)', (await duree()) === 259200);
  const g72 = await gabarit();
  check('--appliquer : l\'e-mail annonce « 72 heures », avec le lien de l\'APK et la consigne Android',
    /expire au bout de 72 heures\./.test(g72.body) && g72.body.includes('https://membres.chay.fr/telechargements/chay.apk')
      && g72.body.includes("Si Android refuse l'installation, désinstallez d'abord l'ancienne application, puis réinstallez.") && !/30 minutes/.test(g72.body));
  const T3 = Date.now();
  // Compte qui n'a encore reçu aucun lien : PocketBase ne renvoie pas d'e-mail à un compte qui vient d'en recevoir un.
  const apercu = await run(['--journal', path.join(DIR, 'apercu.jsonl'), '--un-seul', C.exclMail.email, '--appliquer'], { confirmer: async () => true });
  const recu = decodeMail((await attendreMails(C.exclMail, T3, 1))[0]?.raw || '');
  check('e-mail réellement reçu (faux SMTP) : « 72 heures », lien de l\'APK, consigne Android',
    apercu.envoyes === 1 && /72 heures/.test(recu) && recu.includes('https://membres.chay.fr/telechargements/chay.apk') && recu.includes('Si Android refuse'));
  const jeton = tokenFrom(texte);
  const conf = await http('POST', '/api/collections/users/confirm-password-reset', { body: { token: jeton, password: `${MDP}x`, passwordConfirm: `${MDP}x` } });
  check('secret du jeton conservé : un lien envoyé avant le changement reste valable', conf.status === 204, `HTTP ${conf.status}`);
  await run(['--duree-lien', '30min', '--appliquer']);
  check('retour à 30 min (1 800 s)', (await duree()) === 1800);
  check('retour à 30 min : l\'e-mail annonce « 30 minutes »', /expire au bout de 30 minutes\./.test((await gabarit()).body));
  check('durée invalide : refusée', await echoue(run(['--duree-lien', '72']), /72h ou 30min/));

  console.log('\n■ Confidentialité de la sortie');
  const tout = sortie.join('\n');
  check('aucune adresse complète affichée', Object.values(C).every((u) => !tout.toLowerCase().includes(u.email.toLowerCase())));
  check('aucun nom affiché', Object.values(C).every((u) => !tout.includes(u.name)));
  check('aucun mot de passe affiché', !tout.includes(suCreds.password) && !tout.includes(MDP));
} finally {
  if ((await duree()) !== 1800) await http('PATCH', '/api/collections/users', { ...su, body: { passwordResetToken: { duration: 1800 } } });
  if (gabarit0) await http('PATCH', '/api/collections/users', { ...su, body: { resetPasswordTemplate: gabarit0 } }); // texte d'origine du bac à sable
  for (const u of Object.values(C)) await http('DELETE', `/api/collections/users/records/${u.id}`, su);
  fs.rmSync(DIR, { recursive: true, force: true });
  console.log('\n(nettoyage effectué)');
}
done();
