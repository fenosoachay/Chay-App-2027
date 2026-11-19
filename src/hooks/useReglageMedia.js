import { useEffect, useReducer } from "react";
import { base44 } from "@/api/base44Client";

// Petit réglage d'une section du multimédia choisi par l'admin et vu par tous (ex. ordre des Versets).
// Rangé dans MediaOrder (en place depuis la 1.3.9) : ligne `cle` (ex. « reglage:verset »), champ `ids` = objet.
const valeurs = new Map();
const lignes = new Map();
const chargements = new Map();
const abonnes = new Set();
const prevenir = () => abonnes.forEach((f) => f());

function charger(cle) {
  if (!chargements.has(cle)) {
    chargements.set(cle, base44.entities.MediaOrder.filter({ key: cle }, "-created_date", 1)
      .then((rows) => {
        const r = Array.isArray(rows) ? rows[0] : null;
        if (r?.id) lignes.set(cle, r.id);
        const v = r?.ids;
        valeurs.set(cle, v && typeof v === "object" && !Array.isArray(v) ? v : {});
      })
      .catch(() => valeurs.set(cle, {}))
      .finally(prevenir));
  }
  return chargements.get(cle);
}

/** Réglage enregistré (objet, vide tant qu'il n'est pas chargé ou jamais choisi). */
export function useReglageMedia(cle) {
  const [, rafraichir] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    abonnes.add(rafraichir);
    charger(cle);
    return () => abonnes.delete(rafraichir);
  }, [cle]);
  return valeurs.get(cle) || {};
}

/** Admin : enregistre le réglage (fusionné avec l'existant). Lève une erreur lisible. */
export async function enregistrerReglage(cle, patch) {
  await charger(cle);
  const avant = valeurs.get(cle) || {};
  const suivant = { ...avant, ...patch };
  valeurs.set(cle, suivant);
  prevenir();
  try {
    const id = lignes.get(cle);
    const rec = id
      ? await base44.entities.MediaOrder.update(id, { ids: suivant })
      : await base44.entities.MediaOrder.create({ key: cle, ids: suivant });
    if (rec?.id) lignes.set(cle, rec.id);
  } catch (err) {
    valeurs.set(cle, avant);
    prevenir();
    throw new Error(`Réglage non enregistré : ${err?.message || err}`);
  }
}
