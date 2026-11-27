// Enfants partagés et marque du foyer (1.4.1). Pur : testé par pocketbase/tests/famille.test.mjs.
//  - marque du foyer : au classement des enfants, « Léa · famille R. » (initiale du nom de famille du titulaire du
//    compte, sinon de son prénom) : deux Léa de deux familles se distinguent ;
//  - code famille : le parent crée un code à 6 chiffres (24 h, une seule fois) ; un autre compte (grand-mère, tante…)
//    le tape et rejoint le MÊME profil : mêmes points, même progression, une seule ligne au classement. Les comptes
//    invités sont gardés dans ProfilEnfant.invites (texte « ,id1,id2, ») ; seul le parent peut retirer un accès
//    (l'invité peut aussi se retirer lui-même).

const CODE_DUREE_MS = 24 * 3600 * 1000;
const ESSAIS_MAX = 8; // codes faux par heure et par compte (au-delà : 429)
const INVITES_MAX = 10;

/** « R » pour Rakoto (nom de famille), sinon l'initiale du prénom, sinon du nom affiché ; '' si rien. */
function initialeFamille(prenom, nom, nomAffiche) {
  for (const v of [nom, prenom, nomAffiche]) {
    const s = String(v || '').trim();
    const m = s.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/);
    if (m) return m[0].toLocaleUpperCase('fr');
  }
  return '';
}

/** Liste des comptes invités (ids) à partir du texte stocké. */
function listeInvites(texte) {
  return String(texte || '').split(',').map((s) => s.trim()).filter(Boolean);
}
const texteInvites = (ids) => (ids.length ? `,${ids.join(',')},` : '');

function aAcces(proprietaire, invites, uid) {
  if (!uid) return false;
  return proprietaire === uid || listeInvites(invites).indexOf(uid) !== -1;
}

function ajouterInvite(invites, uid) {
  const ids = listeInvites(invites);
  if (ids.indexOf(uid) === -1) ids.push(uid);
  return texteInvites(ids.slice(-INVITES_MAX));
}

function retirerInvite(invites, uid) {
  return texteInvites(listeInvites(invites).filter((x) => x !== uid));
}

/** Code saisi : 6 chiffres (espaces ignorés), sinon ''. */
function codeValide(c) {
  const s = String(c || '').replace(/\s+/g, '');
  return /^\d{6}$/.test(s) ? s : '';
}

/** Compteur d'essais faux { n, depuis } : remis à zéro après une heure. */
function essaiSuivant(etat, maintenant) {
  const e = etat && maintenant - etat.depuis < 3600 * 1000 ? etat : { n: 0, depuis: maintenant };
  return { n: e.n + 1, depuis: e.depuis };
}
const tropDEssais = (etat, maintenant) => Boolean(etat && maintenant - etat.depuis < 3600 * 1000 && etat.n >= ESSAIS_MAX);

module.exports = {
  CODE_DUREE_MS, ESSAIS_MAX, INVITES_MAX,
  initialeFamille, listeInvites, aAcces, ajouterInvite, retirerInvite, codeValide, essaiSuivant, tropDEssais,
};
