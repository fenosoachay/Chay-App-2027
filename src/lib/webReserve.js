// Site web réservé aux admins (1.3.35) : sur membres.chay.fr, un membre connecté (ou un visiteur) voit
// « Télécharge l'application » avec le lien de l'APK ; les admins entrent normalement. L'APK n'est pas concerné.
// Connexion, inscription et mot de passe oublié restent ouverts sur le web (liens des e-mails, admins).

/** Le site doit-il montrer la page « Télécharge l'application » à la place de l'appli ? */
export function webFerme({ natif, user }) {
  if (natif) return false;
  return !(user && user.role === "admin");
}
