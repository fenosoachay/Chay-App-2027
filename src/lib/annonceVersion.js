// Panneau admin › « Annoncer une mise à jour » : texte de la confirmation (le serveur décide des destinataires :
// pocketbase/pb_hooks/lib/annonceVersion.js).

/** « Envoyer à N membres ? » avec le détail e-mails / appareils. */
export function messageConfirmationVersion(apercu) {
  const n = Number(apercu?.destinataires) || 0;
  const a = Number(apercu?.appareils) || 0;
  const membres = `${n} membre${n > 1 ? "s" : ""}`;
  const appareils = `${a} appareil${a > 1 ? "s" : ""}`;
  return `Envoyer à ${membres} ? Version ${apercu?.version_name || "?"} : un e-mail à ${membres} et une notification à ${appareils}. `
    + "Cette version ne pourra plus être annoncée ensuite.";
}
