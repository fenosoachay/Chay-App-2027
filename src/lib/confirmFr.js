// Boîte de confirmation en français, indépendante de la langue du téléphone.
// Remplace window.confirm (dont le titre et les boutons sont natifs).
// Le composant <ConfirmHost /> (monté une fois à la racine) écoute cet émetteur.
let listener = null;

export function registerConfirmHost(fn) {
  listener = fn;
  return () => { if (listener === fn) listener = null; };
}

// confirmFr("Supprimer ?") ou confirmFr({ title, message, confirmLabel, cancelLabel })
// Renvoie une promesse résolue à true (confirmé) ou false (annulé).
export function confirmFr(options) {
  const opts = typeof options === "string" ? { message: options } : options;
  return new Promise((resolve) => {
    if (!listener) {
      resolve(false);
      return;
    }
    listener({ ...opts, resolve });
  });
}