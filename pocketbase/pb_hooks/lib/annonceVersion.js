// Annonce d'une nouvelle version de l'APK (lot E) : règles pures (testées hors de PocketBase) et envoi des e-mails
// par lots. Route et tâche planifiée : versions.pb.js. Collection : VersionAnnonce (une ligne par version_code,
// index unique : une version n'est annoncée qu'une fois).
//
// Destinataires : membres actifs qui n'ont pas coupé les notifications ni « Nouvelle version » (réglages de l'app) ;
// e-mail si « E-mail » n'est pas coupé et qu'une adresse existe ; push si « Push » n'est pas coupé (appareils
// enregistrés). Les e-mails partent par lots de LOT_EMAILS chaque minute (une grande liste ne bloque pas la requête).

// Taille des lots : 40 par défaut ; ANNONCE_LOT_EMAILS (variable d'environnement) pour la changer (tests : 5).
const LOT_EMAILS = (() => {
  const n = typeof $os !== 'undefined' ? Number($os.getenv('ANNONCE_LOT_EMAILS')) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 500 ? n : 40;
})();
const APK_URL = 'https://membres.chay.fr/telechargements/chay.apk';

/** { version_name, version_code } ou { erreur }. */
function validerVersion(body) {
  const b = body && typeof body === 'object' ? body : {};
  const name = typeof b.version_name === 'string' ? b.version_name.trim() : '';
  const code = Number(b.version_code);
  if (!/^\d+(\.\d+){0,3}$/.test(name)) return { erreur: 'Numéro de version invalide (ex. 1.3.7).' };
  if (!Number.isSafeInteger(code) || code < 1 || code > 2100000000) return { erreur: 'Code de version invalide (entier positif).' };
  return { version_name: name, version_code: code };
}

/** Réglages d'un membre (objet `settings`) -> { email, push } : canaux acceptés pour l'annonce d'une version. */
function canaux(settings) {
  const s = settings && typeof settings === 'object' ? settings : {};
  const annonce = s.notifications_enabled !== false && s.notif_new_version !== false;
  return { email: annonce && s.notif_email !== false, push: annonce && s.notif_push !== false };
}

/** Textes de l'annonce. `mail` = lib/courriel.js (pour l'e-mail). */
function contenus(v) {
  // 1.4.0 : les mises à jour sont obligatoires (l'ancienne version ne fonctionne plus).
  const titre = `Mise à jour obligatoire de l'app Chay : ${v.version_name}`;
  const corps = 'Chay ne fonctionne plus sans cette mise à jour. Touchez pour l\'installer.';
  return { titre, corps };
}

function courriel(mail, v) {
  const { titre } = contenus(v);
  const html = mail.shell(titre,
    mail.paragraph(`La version <strong>${mail.escapeHtml(v.version_name)}</strong> de l'application Android Chay est disponible.`)
    + mail.paragraph('Téléchargez-la puis ouvrez le fichier pour mettre l\'app à jour : vos données sont conservées.')
    + mail.button(APK_URL, 'Télécharger la mise à jour'));
  const texte = `La version ${v.version_name} de l'application Android Chay est disponible.\n\nTéléchargez-la : ${APK_URL}`;
  return { sujet: titre, html, texte };
}

/** Liste d'identifiants lue dans un champ json (valeur brute de PocketBase, texte JSON ou tableau). */
function lireListe(brut) {
  let v = brut;
  for (let i = 0; i < 2 && typeof v !== 'object'; i++) {
    try { v = JSON.parse(String(v)); } catch (_) { return []; }
  }
  if (v && !Array.isArray(v) && typeof v === 'object') {
    try { v = JSON.parse(String(brut)); } catch (_) { return []; }
  }
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : [];
}

/** Découpe la file : { lot, reste }. */
function prochainLot(restants, taille) {
  const liste = Array.isArray(restants) ? restants.filter((x) => typeof x === 'string' && x) : [];
  const n = Math.max(1, taille || LOT_EMAILS);
  return { lot: liste.slice(0, n), reste: liste.slice(n) };
}

/**
 * Envoie un lot d'e-mails d'une annonce en cours (enregistrement VersionAnnonce) et met à jour la file.
 * Hors PocketBase : non appelé par les tests unitaires.
 */
function envoyerLot(rec, taille) {
  const mail = require(`${__hooks}/lib/courriel.js`);
  const { lot, reste } = prochainLot(lireListe(rec.getString('restants')), taille);
  const v = { version_name: rec.getString('version_name'), version_code: rec.getInt('version_code') };
  const c = courriel(mail, v);
  let envoyes = 0;
  for (const id of lot) {
    let u = null;
    try { u = $app.findRecordById('users', id); } catch (_) { u = null; }
    if (u && !u.getBool('disabled') && u.email() && mail.trySend('annoncerVersion', u.email(), c.sujet, c.html, c.texte)) envoyes++;
  }
  rec.set('restants', reste);
  rec.set('emails_envoyes', rec.getInt('emails_envoyes') + envoyes);
  if (!reste.length) rec.set('statut', 'termine');
  $app.save(rec);
  return { envoyes, restants: reste.length };
}

module.exports = { LOT_EMAILS, APK_URL, validerVersion, canaux, contenus, courriel, lireListe, prochainLot, envoyerLot };
