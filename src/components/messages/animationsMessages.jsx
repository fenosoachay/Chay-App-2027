import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import Avatar from "@/components/messages/Avatar";

// Animations des messages (1.3.35), en CSS (transform et opacité seulement : fluides sur téléphone) :
//  - nouveau message : le mien monte depuis la barre d'envoi, celui de l'autre glisse depuis la gauche ;
//  - « en train d'écrire » : bulle qui apparaît en douceur, trois points en vague, et dans l'en-tête ;
//  - « vu » : la petite photo de chaque lecteur descend jusqu'au dernier message qu'il a lu ;
//  - 👍 envoyé : il rebondit ; bouton Envoyer / 👍 : l'un se transforme en l'autre.
export const CSS_MESSAGES = `
@keyframes chay-msg-moi { from { opacity: 0; transform: translate3d(0, 16px, 0) scale(.9); } to { opacity: 1; transform: none; } }
@keyframes chay-msg-autre { from { opacity: 0; transform: translate3d(-12px, 8px, 0) scale(.94); } to { opacity: 1; transform: none; } }
@keyframes chay-msg-pouce { 0% { opacity: 0; transform: scale(.2) rotate(-25deg); } 55% { opacity: 1; transform: scale(1.25) rotate(8deg); } 80% { transform: scale(.95) rotate(-3deg); } 100% { transform: none; } }
@keyframes chay-point { 0%, 60%, 100% { transform: translate3d(0, 0, 0); opacity: .35; } 30% { transform: translate3d(0, -5px, 0); opacity: 1; } }
@keyframes chay-rec { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .35; transform: scale(.75); } }
@keyframes chay-glisse { 0%, 100% { transform: translate3d(0, 0, 0); opacity: .5; } 50% { transform: translate3d(-6px, 0, 0); opacity: 1; } }
@keyframes chay-onde { 0%, 100% { transform: scaleY(.55); } 50% { transform: scaleY(1); } }
.chay-msg-moi { animation: chay-msg-moi .38s cubic-bezier(.2, .9, .3, 1.2) both; transform-origin: 100% 100%; }
.chay-msg-autre { animation: chay-msg-autre .38s cubic-bezier(.2, .9, .3, 1.1) both; transform-origin: 0 100%; }
.chay-msg-pouce { animation: chay-msg-pouce .6s cubic-bezier(.2, .9, .3, 1.3) both; transform-origin: 70% 90%; }
.chay-point { animation: chay-point 1.2s ease-in-out infinite; will-change: transform, opacity; }
.chay-rec { animation: chay-rec 1.1s ease-in-out infinite; }
.chay-glisse { animation: chay-glisse 1.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .chay-msg-moi, .chay-msg-autre, .chay-msg-pouce, .chay-point, .chay-rec, .chay-glisse { animation: none !important; }
}
`;

/** Trois points qui ondulent. */
export function Points({ taille = 7, couleur = "currentColor" }) {
  return (
    <span className="inline-flex items-center gap-[3px]" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span key={i} className="chay-point rounded-full" style={{ width: taille, height: taille, background: couleur, animationDelay: `${i * 0.16}s` }} />
      ))}
    </span>
  );
}

/** Bulle « en train d'écrire », avec la photo de celui qui écrit. */
export function BulleEcrit({ visible, profil, nom }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="ecrit"
          className="mt-2 flex items-end gap-2"
          initial={{ opacity: 0, y: 14, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.85, transition: { duration: 0.18 } }}
          transition={{ type: "spring", stiffness: 420, damping: 28 }}
          style={{ transformOrigin: "0% 100%" }}
          role="status"
          aria-label={`${nom || "Quelqu'un"} est en train d'écrire`}
        >
          <Avatar name={profil?.display_name || nom} src={profil?.avatar_url} size={28} />
          <div className="rounded-[18px] rounded-bl-[6px] border border-border bg-card px-4 py-3 text-foreground/55">
            <Points />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** « en train d'écrire… » dans l'en-tête : apparaît et disparaît en fondu, à la place du statut. */
export function StatutEnTete({ ecrit, statut }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {ecrit ? (
        <motion.span key="ecrit" className="inline-flex items-center gap-1.5 font-medium text-primary" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
          en train d'écrire <Points taille={4} />
        </motion.span>
      ) : (
        <motion.span key="statut" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}>
          {statut}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

/**
 * Lecteurs sous un message : leur photo glisse d'un message à l'autre (layoutId), comme sur Messenger.
 * `envoye` : mon dernier message, que personne n'a encore lu (petite coche).
 */
export function VuPar({ lecteurs = [], envoye = false, groupe = false }) {
  if (!lecteurs.length && !envoye) return null;
  return (
    <div className="mt-0.5 flex min-h-[16px] items-center justify-end gap-0.5 pr-0.5" aria-label={lecteurs.length ? `Vu par ${lecteurs.map((p) => p.display_name || "Membre").join(", ")}` : "Envoyé"}>
      {lecteurs.slice(0, groupe ? 6 : 1).map((p) => (
        <motion.span
          key={p.created_by_id}
          layoutId={`vu-${p.created_by_id}`}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
          className="inline-block"
        >
          <Avatar name={p.display_name} src={p.avatar_url} size={15} />
        </motion.span>
      ))}
      {groupe && lecteurs.length > 6 && <span className="text-[0.625rem] text-foreground/45">+{lecteurs.length - 6}</span>}
      {!lecteurs.length && envoye && (
        <motion.span initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 26 }} className="grid h-[14px] w-[14px] place-items-center rounded-full border border-foreground/30 text-foreground/45">
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        </motion.span>
      )}
    </div>
  );
}
