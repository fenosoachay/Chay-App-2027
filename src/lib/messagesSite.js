// Réponse à un message du formulaire « Nous contacter » (admin › Messages, 1.3.42) : lien mailto: avec le sujet
// « Re : … » et le message d'origine cité, comme une réponse dans une messagerie.
export function lienReponse(m) {
  const sujet = `Re : ${String(m?.subject || "Votre message à l'Église Chay").trim()}`;
  const date = new Date(m?.created_date || m?.created || Date.now());
  const cite = String(m?.message || "").split(/\r?\n/).map((l) => `> ${l}`).join("\n");
  const prenom = String(m?.name || "").trim().split(/\s+/)[0];
  const corps = `Bonjour${prenom ? ` ${prenom}` : ""},\n\n\n\nFraternellement,\nL'Église Chay\n\n`
    + `Le ${date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}, vous avez écrit :\n${cite}`;
  return `mailto:${encodeURIComponent(String(m?.email || "").trim()).replace(/%40/g, "@")}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
}
