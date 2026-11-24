// Petits sons des jeux (1.3.29), fabriqués par le téléphone (Web Audio) : aucun fichier à télécharger.
// Coupés si l'enfant (ou le parent) a touché le bouton son ; le choix est gardé sur l'appareil.
// Vibration légère (Android) quand le téléphone le permet ; sinon rien, sans erreur.

const CLE = "chay_sons_jeux";
let contexte = null;

export function sonsActifs() {
  try { return globalThis.localStorage.getItem(CLE) !== "off"; } catch { return true; }
}
export function reglerSons(actif) {
  try { globalThis.localStorage.setItem(CLE, actif ? "on" : "off"); } catch { /* préférence non gardée */ }
}

function ctx() {
  if (contexte) return contexte;
  const C = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!C) return null;
  try { contexte = new C(); } catch { contexte = null; }
  return contexte;
}

/** Une note : fréquence (Hz), début (s après maintenant), durée (s), type d'onde, volume. */
function note(c, freq, debut, duree, type = "sine", volume = 0.18) {
  const t = c.currentTime + debut;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(volume, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duree);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + duree + 0.02);
}

function vibrer(ms) {
  try { globalThis.navigator?.vibrate?.(ms); } catch { /* pas de vibration */ }
}

const SONS = {
  // Pièce posée : petit « toc ».
  pose: (c) => { note(c, 520, 0, 0.08, "triangle", 0.2); },
  // Pièce refusée (case occupée) : note grave courte.
  refus: (c) => { note(c, 180, 0, 0.12, "sine", 0.12); },
  // Ligne(s) effacée(s) : arpège montant, plus long avec plusieurs lignes.
  ligne: (c, n = 1) => {
    const gamme = [523, 659, 784, 1047, 1319, 1568];
    for (let i = 0; i < Math.min(gamme.length, 2 + n); i += 1) note(c, gamme[i], i * 0.06, 0.18, "triangle", 0.16);
  },
  // Nouveau record : petite fanfare.
  record: (c) => { [784, 988, 1175, 1568].forEach((f, i) => note(c, f, i * 0.09, 0.22, "square", 0.08)); },
  // Fin de partie : notes qui descendent.
  fin: (c) => { [523, 440, 349, 262].forEach((f, i) => note(c, f, i * 0.14, 0.25, "sine", 0.15)); },
};
const VIBRATIONS = { pose: 12, refus: [20, 40, 20], ligne: 35, record: [30, 50, 30], fin: 80 };

/** Joue un son (« pose », « refus », « ligne », « record », « fin ») et la vibration qui va avec. */
export function jouerSon(nom, n = 1) {
  if (!sonsActifs()) return;
  vibrer(VIBRATIONS[nom] || 0);
  const c = ctx();
  if (!c || !SONS[nom]) return;
  try {
    if (c.state === "suspended") c.resume();
    SONS[nom](c, n);
  } catch { /* son impossible : le jeu continue */ }
}
