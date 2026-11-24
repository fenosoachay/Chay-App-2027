// Tableau de bord de l'app (1.3.25) : mise en forme des chiffres. Fichier pur, testé par node --test.

/** 754 -> « 12 min 34 s » ; 3720 -> « 1 h 2 min » ; 0 -> « — ». */
export function dureeLisible(secondes) {
  const s = Math.max(0, Math.round(Number(secondes) || 0));
  if (!s) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return m ? `${h} h ${m} min` : `${h} h`;
  if (m) return r ? `${m} min ${r} s` : `${m} min`;
  return `${r} s`;
}
