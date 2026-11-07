// Réessaie une opération qui reçoit un 429 (limites de tentatives du bac à sable). Version sans
// dépendance pour les tests Vitest (lib.mjs vérifie l'URL au chargement et peut quitter le processus).
export async function retry429(op) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await op();
    } catch (err) {
      if (err?.status !== 429 || attempt >= 14) throw err;
      await new Promise((ok) => setTimeout(ok, 5000));
    }
  }
}
