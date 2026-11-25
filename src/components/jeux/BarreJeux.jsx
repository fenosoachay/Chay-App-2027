import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";

// 1.3.34 : barres horizontales de la page Jeux, dans l'esprit du widget « Verset du jour » (Nuit dorée) :
// dégradé profond, reflet de lumière qui passe, petites étoiles dorées qui scintillent. Couleurs proches du
// widget mais variées d'une barre à l'autre. Entrée animée (glisse et apparaît, l'une après l'autre).

export const TEINTES = {
  classement: "linear-gradient(100deg, #0C0E2C 0%, #2E1A5C 55%, #6B4A12 100%)",
  game: "linear-gradient(100deg, #071A33 0%, #10325E 55%, #1E6A7A 100%)",
  playmobile: "linear-gradient(100deg, #1A0F3A 0%, #3B1C6E 55%, #7A2E6B 100%)",
};

export function Etincelles({ n = 6, graine = 1 }) {
  const points = useMemo(() => Array.from({ length: n }, (_, i) => ({
    x: (i * 41 + graine * 17) % 96 + 2,
    y: (i * 67 + graine * 29) % 80 + 10,
    t: 2 + ((i + graine) % 3),
    d: (i * 0.7 + graine * 0.3) % 3,
  })), [n, graine]);
  return points.map((p, i) => (
    <motion.span
      key={i}
      aria-hidden="true"
      className="pointer-events-none absolute rounded-full bg-[#FFD66E]"
      style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.t, height: p.t, boxShadow: "0 0 8px 2px rgba(255,184,0,0.55)" }}
      animate={{ opacity: [0.15, 1, 0.15], scale: [0.6, 1.25, 0.6] }}
      transition={{ duration: 2.4 + (i % 3), repeat: Infinity, delay: p.d, ease: "easeInOut" }}
    />
  ));
}

/** Reflet de lumière qui traverse la barre, comme sur le widget. */
export function Reflet({ duree = 5.5, delai = 0 }) {
  return (
    <motion.span
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3"
      style={{ background: "linear-gradient(100deg, transparent, rgba(255,255,255,0.22), transparent)", filter: "blur(4px)" }}
      animate={{ x: ["0%", "420%"] }}
      transition={{ duration: duree, repeat: Infinity, repeatDelay: 1.5, ease: "easeInOut", delay: delai }}
    />
  );
}

export default function BarreJeux({ titre, icone: Icone, teinte, ordre = 0, ouvert, onClick, droite }) {
  const contenu = (
    <>
      <Reflet delai={ordre * 0.8} />
      <Etincelles graine={ordre + 1} />
      <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#C9A052]/60 bg-white/10 text-[#FFD66E] shadow-[0_0_16px_rgba(255,184,0,0.25)]">
        <Icone className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="relative min-w-0 flex-1 truncate text-left font-display text-xl font-extrabold tracking-wide text-[#F3E2B5]">{titre}</span>
      {droite}
      {onClick && (
        <motion.span className="relative text-[#F3E2B5]/80" animate={{ rotate: ouvert ? 180 : 0 }} transition={{ duration: 0.25 }}>
          <ChevronDown className="h-6 w-6" aria-hidden="true" />
        </motion.span>
      )}
    </>
  );
  const classe = "relative flex w-full items-center gap-3 overflow-hidden rounded-[1.4rem] border border-[#C9A052]/45 px-4 py-3.5 shadow-[0_10px_30px_-12px_rgba(12,14,44,0.7)]";
  const anim = {
    initial: { opacity: 0, x: -40, scale: 0.96 },
    animate: { opacity: 1, x: 0, scale: 1 },
    transition: { type: "spring", stiffness: 260, damping: 24, delay: ordre * 0.12 },
    style: { background: teinte },
  };
  return onClick ? (
    <motion.button type="button" onClick={onClick} aria-expanded={!!ouvert} whileTap={{ scale: 0.98 }} className={classe} {...anim}>
      {contenu}
    </motion.button>
  ) : (
    <motion.div className={classe} {...anim}>{contenu}</motion.div>
  );
}

/** Phrase d'accueil dans un rectangle qui brille, avec des étoiles. */
export function PhraseBrillante({ texte, ordre = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.25 + ordre * 0.12 }}
      className="relative mx-auto w-full max-w-3xl overflow-hidden rounded-2xl border border-[#C9A052]/50 px-4 py-3 text-center"
      style={{ background: "linear-gradient(100deg, rgba(12,14,44,0.92), rgba(46,26,92,0.92))" }}
    >
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-2xl"
        animate={{ boxShadow: ["inset 0 0 12px rgba(255,214,110,0.15)", "inset 0 0 26px rgba(255,214,110,0.45)", "inset 0 0 12px rgba(255,214,110,0.15)"] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
      <Reflet duree={4} delai={1 + ordre} />
      <Etincelles n={9} graine={ordre + 5} />
      <p className="relative font-serif text-[1.05rem] italic leading-snug text-[#F3E2B5]">{texte}</p>
    </motion.div>
  );
}
