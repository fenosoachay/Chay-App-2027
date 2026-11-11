// Politique de session (AuthContext) : une coupure réseau, un délai dépassé, une limite de requêtes (429) ou
// une panne serveur (5xx) NE déconnectent JAMAIS. Seule une révocation réelle le fait : 401 / 403 / 404 du
// rafraîchissement du jeton (authRefresh), que l'adaptateur PocketBase signale par code « auth_required ».

/** Le serveur a-t-il réellement refusé la session (jeton expiré, révoqué, compte supprimé) ? */
export function estRevocation(error) {
  if (!error) return false;
  if (error.code === "auth_required" || error.data?.extra_data?.reason === "auth_required") return true;
  return error.status === 401 || error.status === 403 || error.status === 404;
}

// Nouvel essai après un échec temporaire : 15 s, 30 s, 1 min, 2 min, puis toutes les 5 min.
export const DELAIS_NOUVEL_ESSAI_MS = [15000, 30000, 60000, 120000, 300000];
export const delaiNouvelEssai = (essai) => DELAIS_NOUVEL_ESSAI_MS[Math.min(Math.max(0, essai), DELAIS_NOUVEL_ESSAI_MS.length - 1)];

// Retour dans l'app (appStateChange actif, onglet visible) : au plus une vérification par minute.
export const INTERVALLE_MIN_VERIFICATION_MS = 60000;
export const doitVerifierAuRetour = (derniereVerification, maintenant = Date.now()) =>
  !derniereVerification || maintenant - derniereVerification >= INTERVALLE_MIN_VERIFICATION_MS;

/**
 * État au lancement.
 * @param {{ jeton: string|null, enLigne: boolean, profil: object|null }} p  profil = dernier profil mémorisé
 * @returns {{ verifier: boolean, connecte: boolean, modeLocal: boolean, chargement: boolean }}
 */
export function etatInitial({ jeton, enLigne, profil }) {
  if (jeton && enLigne) return { verifier: true, connecte: false, modeLocal: false, chargement: true };
  // Hors ligne avec une session connue : l'app complète, avec le profil mémorisé (vérification au retour du réseau).
  if (jeton && profil) return { verifier: false, connecte: true, modeLocal: false, chargement: false };
  return { verifier: false, connecte: false, modeLocal: true, chargement: false };
}

/**
 * Décision après une vérification de session en échec (auth.me / authRefresh).
 * @returns {{ action: "deconnecter" | "garder" | "invite", reessayerDans: number|null }}
 *  - deconnecter : révocation réelle -> jeton retiré, accueil invité ;
 *  - garder : session conservée (profil connu), nouvel essai plus tard ;
 *  - invite : aucun profil connu pour continuer (mode local, comme avant) ; nouvel essai plus tard.
 */
export function decisionApresEchec({ erreur, jeton, profil, essai = 0 }) {
  if (estRevocation(erreur)) return { action: "deconnecter", reessayerDans: null };
  const reessayerDans = jeton ? delaiNouvelEssai(essai) : null;
  if (jeton && profil) return { action: "garder", reessayerDans };
  return { action: "invite", reessayerDans };
}

/** Passage hors ligne (évènement « offline ») : la session est gardée si elle est connue. */
export const decisionHorsLigne = ({ jeton, profil }) => (jeton && profil ? "garder" : "invite");
