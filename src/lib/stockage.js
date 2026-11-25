// Paramètres › Stockage et données (1.3.34) : taille lisible (« 12,4 Mo »).
export function octetsLisibles(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return "—";
  if (v < 1024) return `${Math.round(v)} o`;
  const unites = ["Ko", "Mo", "Go"];
  let x = v / 1024;
  let i = 0;
  while (x >= 1024 && i < unites.length - 1) { x /= 1024; i += 1; }
  return `${x.toLocaleString("fr-FR", { maximumFractionDigits: x < 10 ? 1 : 0 })} ${unites[i]}`;
}
