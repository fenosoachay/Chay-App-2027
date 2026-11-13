// Requêtes › « Se missionner » : choix proposés et contrôle du formulaire avant l'envoi (le serveur revérifie :
// pocketbase/pb_hooks/lib/missions.js, mêmes règles).

export const TYPES_MISSION = [
  { value: "evangeliser", label: "Évangéliser au nom de l'église" },
  { value: "batir_eglise", label: "Bâtir une église" },
  { value: "association", label: "Travailler avec l'association Chay" },
  { value: "droits_videos", label: "Droit d'utilisation des vidéos" },
  { value: "autre", label: "Autre demande" },
];

export const MISSION_VIDE = { last_name: "", first_name: "", age: "", phone: "", address: "", kind: "", other_text: "", details: "" };

/** Premier problème du formulaire ({ champ, message }) ou null. */
export function erreurMission(f) {
  const v = (k) => String(f?.[k] ?? "").trim();
  if (!v("last_name")) return { champ: "last_name", message: "Le nom est obligatoire." };
  if (!v("first_name")) return { champ: "first_name", message: "Le prénom est obligatoire." };
  const age = Number(v("age"));
  if (!v("age") || !Number.isInteger(age) || age < 1 || age > 120) return { champ: "age", message: "Indiquez un âge entre 1 et 120." };
  if (!v("phone")) return { champ: "phone", message: "Le numéro de téléphone est obligatoire." };
  if (!/^\+?[0-9 .()-]{6,30}$/.test(v("phone")) || (v("phone").match(/[0-9]/g) || []).length < 6) {
    return { champ: "phone", message: "Le numéro de téléphone est invalide." };
  }
  if (!v("address")) return { champ: "address", message: "L'adresse est obligatoire." };
  if (!TYPES_MISSION.some((t) => t.value === v("kind"))) return { champ: "kind", message: "Choisissez le type de demande." };
  if (v("kind") === "autre" && !v("other_text")) return { champ: "other_text", message: "Précisez votre demande." };
  return null;
}

export const libelleTypeMission = (kind) => TYPES_MISSION.find((t) => t.value === kind)?.label || "Demande";
