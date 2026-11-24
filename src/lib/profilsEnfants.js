// Enfants du compte (1.3.26) : « Qui joue ? » dans Chay Enfants › Jeux.
// Chaque enfant (pseudo + animal) est enregistré sur le compte du parent (collection ProfilEnfant : chacun ne
// voit que les enfants de son compte), avec la progression de ses jeux (`progres`). Rien ne dépend donc plus du
// téléphone : après une mise à jour, une réinstallation ou sur un autre appareil, les enfants sont toujours là.
//  - l'ancien profil gardé sur le téléphone (avant 1.3.26) est recopié une fois sur le compte ;
//  - le serveur recrée aussi l'enfant à chaque score (scores.pb.js) et la migration 1.3.26 recrée ceux qui
//    avaient déjà des points ;
//  - l'enfant choisi est retenu sur ce téléphone (simple confort : sinon, on le choisit dans la liste).
import { base44 } from "@/api/base44Client";
import { AVATARS, lireProfilEnfant, pseudoValide } from "@/lib/scoreBoard";

const CLE_ACTIF = "chay_enfant_actif";
const CLE_ANCIEN = "chay_profil_enfant";
const CLE_ANCIENS_RECORDS = "chay_memory_records";

export const memePseudo = (a, b) => pseudoValide(a).toLocaleLowerCase("fr") === pseudoValide(b).toLocaleLowerCase("fr");

/** Liste triée par pseudo, sans doublon (même pseudo à la casse près : le premier est gardé). */
export function trierProfils(rows) {
  const vus = new Set();
  return (Array.isArray(rows) ? rows : [])
    .filter((p) => p && p.id && pseudoValide(p.pseudo))
    .filter((p) => {
      const k = pseudoValide(p.pseudo).toLocaleLowerCase("fr");
      if (vus.has(k)) return false;
      vus.add(k);
      return true;
    })
    .map((p) => ({ ...p, pseudo: pseudoValide(p.pseudo), avatar: AVATARS.includes(p.avatar) ? p.avatar : AVATARS[0], progres: p.progres && typeof p.progres === "object" ? p.progres : {} }))
    .sort((a, b) => a.pseudo.localeCompare(b.pseudo, "fr", { sensitivity: "base" }));
}

function lireLocal(cle) {
  try { return localStorage.getItem(cle); } catch { return null; }
}
function ecrireLocal(cle, valeur) {
  try {
    if (valeur === null) localStorage.removeItem(cle);
    else localStorage.setItem(cle, valeur);
  } catch { /* stockage indisponible : l'enfant sera redemandé */ }
}

export const lireEnfantActif = () => lireLocal(CLE_ACTIF);
export const choisirEnfantActif = (id) => ecrireLocal(CLE_ACTIF, id || null);

function anciensRecords() {
  try { return JSON.parse(lireLocal(CLE_ANCIENS_RECORDS) || "{}") || {}; } catch { return {}; }
}

/**
 * Enfants du compte. L'ancien profil du téléphone (avant 1.3.26), s'il n'est pas encore sur le compte, y est
 * recopié avec ses records de Jeux Carte. Hors connexion : liste vide et `erreur`.
 */
export async function chargerProfils(userId) {
  const rows = trierProfils(await base44.entities.ProfilEnfant.list(undefined, 100));
  const ancien = lireProfilEnfant();
  if (userId && ancien && !rows.some((p) => memePseudo(p.pseudo, ancien.pseudo))) {
    try {
      const cree = await base44.entities.ProfilEnfant.create({
        user_id: userId, pseudo: ancien.pseudo, avatar: ancien.avatar, progres: { memory: anciensRecords() },
      });
      if (!lireEnfantActif() && cree?.id) choisirEnfantActif(cree.id);
      return trierProfils([...rows, cree]);
    } catch {
      return rows; // déjà créé par ailleurs (score envoyé) : il apparaîtra au prochain chargement
    }
  }
  if (ancien && !lireEnfantActif()) {
    const p = rows.find((r) => memePseudo(r.pseudo, ancien.pseudo));
    if (p) choisirEnfantActif(p.id);
  }
  return rows;
}

/** Nouvel enfant sur le compte. Erreur lisible si le pseudo est invalide ou déjà pris sur ce compte. */
export async function ajouterProfil(userId, pseudo, avatar, existants = []) {
  const p = pseudoValide(pseudo);
  if (!p) throw new Error("2 à 20 lettres ou chiffres.");
  if (existants.some((e) => memePseudo(e.pseudo, p))) throw new Error("Ce prénom est déjà dans la liste.");
  const cree = await base44.entities.ProfilEnfant.create({
    user_id: userId, pseudo: p, avatar: AVATARS.includes(avatar) ? avatar : AVATARS[0], progres: {},
  });
  const profil = trierProfils([cree])[0];
  if (!profil) throw new Error("Enregistrement impossible. Vérifie la connexion.");
  return profil;
}

export async function changerAvatar(profil, avatar) {
  const a = AVATARS.includes(avatar) ? avatar : AVATARS[0];
  await base44.entities.ProfilEnfant.update(profil.id, { avatar: a });
  return { ...profil, avatar: a };
}

/** Efface l'enfant du compte ET ses points du Score Board (route serveur : les scores ne sont pas modifiables). */
export async function supprimerProfil(profil) {
  await base44.functions.invoke("supprimerEnfant", { id: profil.id });
  if (lireEnfantActif() === profil.id) choisirEnfantActif(null);
}

/** Progression d'un jeu (ex. « memory ») : copie locale immédiate, puis enregistrement sur le compte. */
export async function enregistrerProgres(profil, jeu, valeur) {
  if (!profil?.id) return profil;
  const progres = { ...(profil.progres || {}), [jeu]: valeur };
  profil.progres = progres; // l'objet partagé suit tout de suite (écrans ouverts)
  try { await base44.entities.ProfilEnfant.update(profil.id, { progres }); } catch { /* réessayé au prochain record */ }
  return profil;
}

export const ANCIEN_PROFIL = CLE_ANCIEN;
