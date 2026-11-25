import React, { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, Images, Music, Paperclip } from "lucide-react";

// Bouton « + » de la barre d'envoi (1.3.35) : photos et vidéos, documents (PDF, Word, Excel…), audio,
// n'importe quel fichier (500 Mo au plus). Les options apparaissent en éventail, l'une après l'autre.

const DOCUMENTS = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.rtf,.txt,.csv,.epub,application/pdf";
export const OPTIONS_PLUS = [
  { id: "medias", label: "Photos et vidéos", icone: Images, accept: "image/*,video/*", teinte: "from-fuchsia-500 to-violet-600" },
  { id: "documents", label: "Document", sousTitre: "PDF, Word, Excel…", icone: FileText, accept: DOCUMENTS, teinte: "from-sky-500 to-blue-600" },
  { id: "audio", label: "Audio", icone: Music, accept: "audio/*", teinte: "from-amber-400 to-orange-500" },
  { id: "fichiers", label: "Tous les fichiers", sousTitre: "jusqu'à 500 Mo", icone: Paperclip, accept: "", teinte: "from-emerald-500 to-teal-600" },
];

export default function MenuPlus({ ouvert, onFermer, onFichiers }) {
  const entrees = useRef({});
  const boite = useRef(null);
  useEffect(() => {
    if (!ouvert) return undefined;
    // Le bouton « + » lui-même referme le menu par son clic : on l'ignore ici (sinon il se rouvrirait aussitôt).
    const dehors = (e) => {
      if (e.target.closest?.("[data-bouton-plus]")) return;
      if (boite.current && !boite.current.contains(e.target)) onFermer();
    };
    const t = setTimeout(() => document.addEventListener("pointerdown", dehors), 0);
    return () => { clearTimeout(t); document.removeEventListener("pointerdown", dehors); };
  }, [ouvert, onFermer]);
  return (
    <>
      {OPTIONS_PLUS.map((o) => (
        <input
          key={o.id}
          ref={(n) => { entrees.current[o.id] = n; }}
          type="file"
          multiple
          accept={o.accept || undefined}
          className="hidden"
          onChange={(e) => {
            const liste = Array.from(e.target.files || []);
            e.target.value = "";
            if (liste.length) onFichiers(liste, o.id);
          }}
        />
      ))}
      <AnimatePresence>
        {ouvert && (
          <motion.div
            ref={boite}
            className="absolute bottom-full left-2 z-20 mb-2 w-60 overflow-hidden rounded-3xl border border-border bg-card/95 p-2 shadow-2xl backdrop-blur-md"
            initial={{ opacity: 0, scale: 0.7, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10, transition: { duration: 0.15 } }}
            transition={{ type: "spring", stiffness: 460, damping: 30 }}
            style={{ transformOrigin: "12% 100%" }}
            role="menu"
            aria-label="Joindre"
          >
            {OPTIONS_PLUS.map((o, i) => {
              const Icone = o.icone;
              return (
                <motion.button
                  key={o.id}
                  type="button"
                  role="menuitem"
                  onClick={() => { onFermer(); entrees.current[o.id]?.click(); }}
                  className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left hover:bg-muted"
                  initial={{ opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.03 + i * 0.045, type: "spring", stiffness: 500, damping: 32 }}
                >
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br ${o.teinte} text-white shadow-md`}>
                    <Icone className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{o.label}</span>
                    {o.sousTitre && <span className="block text-xs text-foreground/50">{o.sousTitre}</span>}
                  </span>
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
