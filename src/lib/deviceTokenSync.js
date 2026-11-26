// Enregistrement du jeton FCM de l'appareil (APK Android) dans DeviceToken.
//
// Règles PocketBase de DeviceToken :
//  - lecture : seulement ses propres lignes (user_id = moi) ;
//  - création : user_id et created_by_id = moi ;
//  - mise à jour : seulement ses propres lignes, et JAMAIS user_id dans le corps (« user_id:isset = false »).
// Une mise à jour qui envoie user_id est donc refusée (404) : le jeton n'était plus réactivé après une
// déconnexion, et le membre ne recevait plus de push. Ici : mise à jour sans user_id ; en cas de 404 (ligne
// supprimée entre-temps, ou plus accessible), une nouvelle ligne est créée.

const estIntrouvable = (e) => e?.status === 404 || e?.response?.status === 404 || e?.originalError?.status === 404;
const message = (e) => e?.message || JSON.stringify(e);

/**
 * Crée ou réactive la ligne DeviceToken de ce jeton pour l'utilisateur connecté.
 * @param {object} entities  base44.entities (adaptateur)
 * @returns {Promise<{ action: "creee" | "mise-a-jour" | "recreee", id: string, doublons: number }>}
 */
export async function upsertDeviceToken(entities, { token, platform, userId, now = new Date().toISOString() }) {
  if (!userId) throw new Error("Utilisateur non connecté : impossible d'enregistrer le token.");
  if (!token) throw new Error("Jeton FCM absent.");
  let rows;
  try {
    rows = await entities.DeviceToken.filter({ token }, null, 25);
  } catch (e) {
    throw new Error(`Recherche du token existant échouée : ${message(e)}`);
  }
  rows = Array.isArray(rows) ? rows : [];
  const [existing, ...duplicates] = rows;

  let action = "creee";
  let id = null;
  if (existing) {
    try {
      // Jamais user_id : interdit par la règle de mise à jour (ce sont déjà nos propres lignes).
      await entities.DeviceToken.update(existing.id, { is_active: true, last_seen: now, platform });
      action = "mise-a-jour";
      id = existing.id;
    } catch (e) {
      if (!estIntrouvable(e)) throw new Error(`Mise à jour du token échouée : ${message(e)}`);
      action = "recreee"; // ligne disparue ou plus accessible : on en recrée une
    }
  }
  if (!id) {
    try {
      const created = await entities.DeviceToken.create({ user_id: userId, token, platform, is_active: true, last_seen: now });
      id = created?.id || null;
    } catch (e) {
      throw new Error(`Création du token échouée : ${message(e)}`);
    }
  }

  // Auto-guérison : une seule ligne active par jeton (évite les notifications en double).
  for (const dup of duplicates) {
    if (dup.id === id) continue;
    await entities.DeviceToken.update(dup.id, { is_active: false }).catch(() => {});
  }
  return { action, id, doublons: duplicates.length };
}

// 1.3.43 : jeton de cet appareil, gardé pour la déconnexion : il faut le désactiver AVANT de quitter le compte
// (après, la session n'existe plus et le serveur refuse de modifier la ligne : l'appareil recevait encore les
// notifications de l'ancien compte).
let jetonAppareil = null;
export function memoriserJetonAppareil(token) { jetonAppareil = token || null; }

/** Déconnexion : désactive le jeton de cet appareil pour le compte qui part (2,5 s au plus). */
export async function desactiverAvantDeconnexion(entities, delaiMs = 2500) {
  const t = jetonAppareil;
  if (!t) return;
  jetonAppareil = null;
  await Promise.race([deactivateDeviceToken(entities, t), new Promise((r) => setTimeout(r, delaiMs))]);
}

/** Désactive la ligne de ce jeton (déconnexion, push coupé). Ne lève jamais d'erreur. */
export async function deactivateDeviceToken(entities, token) {
  const rows = await entities.DeviceToken.filter({ token }, null, 25).catch(() => []);
  for (const row of Array.isArray(rows) ? rows : []) {
    await entities.DeviceToken.update(row.id, { is_active: false }).catch(() => {});
  }
}
