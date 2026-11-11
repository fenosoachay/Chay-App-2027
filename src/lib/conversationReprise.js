// Ouverture d'une conversation par ?c= (notification) quand elle n'est pas (encore) dans la liste.
// « introuvable » seulement si le serveur répond vraiment 404 / 403 ; réseau, 429, 5xx, délai :
// nouveaux essais puis « erreur » (bouton Réessayer), jamais « introuvable ».

export const DELAIS_REPRISE_MS = [0, 1500, 4000];

export const estAbsenceReelle = (erreur) => erreur?.status === 404 || erreur?.status === 403;

const pause = (ms) => new Promise((resoudre) => setTimeout(resoudre, ms));

/**
 * @param {{ id: string, lire: (id: string) => Promise<object>, estAMoi?: (c: object) => boolean,
 *           delais?: number[], attendre?: (ms: number) => Promise<void>, annule?: () => boolean }} options
 * @returns {Promise<{ etat: "ok", conversation: object } | { etat: "introuvable" } | { etat: "erreur", erreur: unknown } | { etat: "annule" }>}
 */
export async function reprendreConversation({ id, lire, estAMoi = () => true, delais = DELAIS_REPRISE_MS, attendre = pause, annule = () => false }) {
  let derniere = null;
  for (const delai of delais) {
    if (delai) await attendre(delai);
    if (annule()) return { etat: "annule" };
    try {
      const conversation = await lire(id);
      if (annule()) return { etat: "annule" };
      if (!conversation?.id || !estAMoi(conversation)) return { etat: "introuvable" };
      return { etat: "ok", conversation };
    } catch (erreur) {
      if (estAbsenceReelle(erreur)) return { etat: "introuvable" };
      derniere = erreur;
    }
  }
  return { etat: "erreur", erreur: derniere };
}
