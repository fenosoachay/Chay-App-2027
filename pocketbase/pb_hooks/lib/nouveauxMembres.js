// Nouveaux membres (1.3.24) : règles pures (testées par node --test), utilisées par nouveaux_membres.pb.js.

/** « Prénom Nom », sans espaces en trop ; vide si le compte n'a ni prénom ni nom. */
function nomComplet(prenom, nom) {
  return [prenom, nom].map((x) => String(x || '').trim()).filter(Boolean).join(' ');
}

/** Fin d'inscription : les consentements viennent d'être acceptés (dernière étape, après le code e-mail). */
function inscriptionTerminee(avant, apres) {
  return Boolean(apres && apres.consents_accepted) && !(avant && avant.consents_accepted) && !(apres && apres.systeme);
}

/** Notification aux admins : écran Gérer les membres, sur ce compte. */
function notificationNouveauMembre(id, nom) {
  const qui = nom || 'Un nouveau compte';
  return {
    title: '👋 Nouveau membre',
    body: `${qui} vient de s'inscrire. Classez-le dans Gérer les membres.`,
    route: `/admin/membres?membre=${encodeURIComponent(String(id))}`,
    notification_id: `nouveau_membre_${id}`,
  };
}

/** Le profil public doit-il reprendre le vrai nom ? (« Membre » ou vide, alors que le compte a un nom) */
function profilARetablir(nomAffiche, nom) {
  const n = String(nomAffiche || '').trim();
  return Boolean(nom) && (!n || n === 'Membre');
}

module.exports = { nomComplet, inscriptionTerminee, notificationNouveauMembre, profilARetablir };
