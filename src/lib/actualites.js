// Multimédia › « Actualité chrétienne » (collection ChristianNews).

/** Ordre de l'admin (`order`), puis la plus récente d'abord ; publications sans titre écartées. */
export function trierActualites(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((n) => n && String(n.title || "").trim())
    .sort((a, b) => (a.order ?? 99999) - (b.order ?? 99999)
      || new Date(b.created_date || b.created || 0) - new Date(a.created_date || a.created || 0));
}

/** Lien externe affichable : http(s) seulement, sinon null. */
export function lienSur(url) {
  const u = String(url || "").trim();
  return /^https?:\/\/[^\s]+$/i.test(u) ? u : null;
}
