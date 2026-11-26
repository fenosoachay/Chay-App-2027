// 1.4.0 : les anciennes versions de l'application Android (avant 1.4.0) ne fonctionnent plus : le serveur refuse
// leurs demandes avec un message « Mise à jour obligatoire ». Seules elles sont visées :
//  - l'appli Android (Capacitor) appelle l'API depuis l'origine https://localhost ;
//  - depuis la 1.4.0, son navigateur intégré ajoute « ChayApp/… » à son identité (capacitor.config.json,
//    appendUserAgent) ; les versions suivantes sont tenues à jour par l'écran de mise à jour obligatoire.
// Ne sont jamais visés : le site membres.chay.fr (autre origine), les appels du téléphone lui-même (widget,
// réponse rapide aux notifications : sans origine), le service d'envoi des notifications.
// Arrêt d'urgence : variable d'environnement CHAY_BLOCAGE_VERSIONS=off (puis redémarrer PocketBase).

const ORIGINE_APPLI = 'https://localhost';
const MARQUEUR = /\bChayApp\/\d/;

const MESSAGE = 'Mise à jour obligatoire : ouvrez le menu de Chay, puis « À propos », et touchez « Mettre à jour ».';

/** Demande venant d'une version de l'appli Android antérieure à la 1.4.0 ? */
function estAncienneAppli(origine, identite) {
  if (String(origine || '').trim().toLowerCase() !== ORIGINE_APPLI) return false;
  return !MARQUEUR.test(String(identite || ''));
}

function reponse() {
  return { status: 426, message: MESSAGE, data: { reason: 'mise_a_jour_obligatoire' } };
}

module.exports = { estAncienneAppli, reponse, MESSAGE };
