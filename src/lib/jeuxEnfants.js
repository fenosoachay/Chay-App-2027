// Gestion des jeux enfants par l'admin (1.3.22) :
//  - JeuEnfantReglage : dessins de coloriage et catégories de Jeux Carte INTÉGRÉS masqués (jeu + integre_id + cache) ;
//  - MemoryTheme / MemoryCarte : catégories et cartes de Jeux Carte ajoutées par l'admin.
// Une catégorie de l'admin n'apparaît chez les enfants qu'à partir de 6 cartes (niveau Facile).
import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

export const MIN_CARTES = 6;

/** Identifiants intégrés masqués pour ce jeu ({ jeu: "coloriage" | "memory" }). */
export async function lireMasques(jeu) {
  const rows = await base44.entities.JeuEnfantReglage.list("integre_id", 500).catch(() => []);
  return new Set((Array.isArray(rows) ? rows : []).filter((r) => r.jeu === jeu && r.cache).map((r) => r.integre_id));
}

/** Masque ou réaffiche un élément intégré (crée la ligne de réglage si besoin). */
export async function definirMasque(jeu, integreId, cache) {
  const rows = await base44.entities.JeuEnfantReglage.list("integre_id", 500).catch(() => []);
  const r = (Array.isArray(rows) ? rows : []).find((x) => x.jeu === jeu && x.integre_id === integreId);
  if (r) await base44.entities.JeuEnfantReglage.update(r.id, { cache });
  else await base44.entities.JeuEnfantReglage.create({ jeu, integre_id: integreId, cache });
}

export function useMasques(jeu) {
  const [masques, setMasques] = useState(null);
  useEffect(() => {
    let vivant = true;
    lireMasques(jeu).then((m) => { if (vivant) setMasques(m); }).catch(() => { if (vivant) setMasques(new Set()); });
    return () => { vivant = false; };
  }, [jeu]);
  return masques;
}

/** Carte de l'admin -> carte du jeu (émoji ou image). */
export function carteDeLigne(c) {
  return {
    id: `a-${c.id}`,
    emoji: String(c.emoji || "").trim(),
    image: /^https?:\/\//.test(String(c.image_url || "")) ? c.image_url : "",
    nom: String(c.nom || "").trim() || "Carte",
    info: String(c.info || "").trim(),
    ref: String(c.ref || "").trim(),
  };
}

/** Catégories de l'admin avec leurs cartes (actives seulement si `seulementActives`). */
export async function lireThemesAdmin({ seulementActives = true } = {}) {
  const [themes, cartes] = await Promise.all([
    base44.entities.MemoryTheme.list("ordre", 200).catch(() => []),
    base44.entities.MemoryCarte.list("ordre", 2000).catch(() => []),
  ]);
  const parTheme = {};
  for (const c of Array.isArray(cartes) ? cartes : []) (parTheme[c.theme_id] = parTheme[c.theme_id] || []).push(c);
  return (Array.isArray(themes) ? themes : [])
    .filter((t) => !seulementActives || t.actif !== false)
    .map((t) => ({
      id: `admin-${t.id}`,
      ligneId: t.id,
      titre: String(t.titre || "").trim() || "Catégorie",
      emoji: String(t.emoji || "").trim() || "🃏",
      actif: t.actif !== false,
      lignesCartes: parTheme[t.id] || [],
      cartes: (parTheme[t.id] || []).map(carteDeLigne).filter((c) => c.emoji || c.image),
    }));
}
