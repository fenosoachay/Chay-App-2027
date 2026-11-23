// Totaux des visites du site (lignes SiteVisite : { jour: "AAAA-MM-JJ", visites }).
// Semaine = depuis lundi ; mois et année calendaires ; dates du jour de l'appareil de l'admin.
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function totauxVisites(lignes, maintenant) {
  const aujourdhui = iso(maintenant);
  const lundi = new Date(maintenant);
  lundi.setDate(lundi.getDate() - ((lundi.getDay() + 6) % 7));
  const debutSemaine = iso(lundi);
  const mois = aujourdhui.slice(0, 7);
  const annee = aujourdhui.slice(0, 4);
  const t = { jour: 0, semaine: 0, mois: 0, annee: 0 };
  for (const l of lignes || []) {
    const j = String(l?.jour || "");
    const n = Number(l?.visites) || 0;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(j) || j > aujourdhui) continue;
    if (j === aujourdhui) t.jour += n;
    if (j >= debutSemaine) t.semaine += n;
    if (j.startsWith(mois)) t.mois += n;
    if (j.startsWith(annee)) t.annee += n;
  }
  return t;
}
