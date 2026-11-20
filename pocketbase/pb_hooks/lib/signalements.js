// Outils de « Signaler au responsable un problème technique » (routes : pb_hooks/signalements.pb.js).
//  - compte automatique « Chay » (users.systeme) : expéditeur des messages automatiques, sans réponse possible ;
//  - responsable(s) technique(s) (users.responsable_technique) : seuls prévenus, seuls à voir et régler.
// Champs et compte créés par pocketbase/scripts/migrer-1-3-22.mjs.

const MAX_MESSAGE = 3000;
const MAX_REPONSE = 2000;
const MAX_PAR_JOUR = 5;

/** Message automatique envoyé au membre quand le responsable clique « Réglé ». */
function texteRegle(reponse) {
  const r = String(reponse || '').trim();
  return 'Shalom, le problème technique que vous avez signalé au responsable a été résolu, voici le message du responsable : '
    + `« ${r || 'Merci pour votre signalement.'} »`;
}

function compteSysteme(app) {
  const rows = app.findRecordsByFilter('users', 'systeme = true', 'created', 1, 0);
  return rows && rows.length ? rows[0] : null;
}

/** Identifiants des comptes automatiques (pour interdire d'y répondre). */
function idsSysteme(app) {
  try {
    return (app.findRecordsByFilter('users', 'systeme = true', '', 10, 0) || []).map((r) => r.id);
  } catch (_) {
    return [];
  }
}

function responsables(app) {
  try {
    return app.findRecordsByFilter('users', 'responsable_technique = true', '', 10, 0) || [];
  } catch (_) {
    return [];
  }
}

function estResponsable(record) {
  return Boolean(record) && record.getBool('responsable_technique') === true;
}

module.exports = { MAX_MESSAGE, MAX_REPONSE, MAX_PAR_JOUR, texteRegle, compteSysteme, idsSysteme, responsables, estResponsable };
