import React from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Reflet } from "@/components/jeux/BarreJeux";

// 1.3.34 : habillage « Nuit dorée » de Chay Game (page Jeux, widget Verset du jour) pour la Bible :
// Sagesse en audio, Dictionnaire et Concordance. Fond nuit marine-violet, liserés et textes dorés, étoiles qui
// scintillent, reflet de lumière, entrées animées.

export const OR = "#FFD66E";
export const OR_PALE = "#F3E2B5";
export const LISERE = "rgba(201,160,82,0.45)";
/**
 * Page Nuit dorée. 1.3.35 : plus de carte : le fond est plein écran (FondSection dans Layout : « Ondes » pour
 * Sagesse en audio, « Bibliothèque » pour le Dictionnaire, « Constellation » pour la Concordance), le contenu
 * reste centré.
 */
export function CadreNuit({ children, className = "" }) {
  return (
    <main className={`relative mx-auto min-h-[80vh] max-w-3xl text-white ${className}`}>
      {children}
    </main>
  );
}

/** Barre du haut : retour doré, contenu (titre ou recherche), actions à droite. */
export function BarreNuit({ onBack, children, droite }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 24 }}
      className="relative mx-3 mt-3 flex items-center gap-2 overflow-hidden rounded-[1.4rem] border px-2.5 py-2.5 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.7)]"
      style={{ borderColor: LISERE, background: "linear-gradient(100deg, rgba(12,14,44,0.95), rgba(46,26,92,0.95) 60%, rgba(107,74,18,0.75))" }}
    >
      <Reflet duree={6} />
      <button
        type="button"
        onClick={onBack}
        aria-label="Retour"
        className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border bg-white/10 shadow-[0_0_14px_rgba(255,184,0,0.25)]"
        style={{ borderColor: LISERE, color: OR }}
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div className="relative min-w-0 flex-1">{children}</div>
      {droite && <div className="relative flex shrink-0 items-center">{droite}</div>}
    </motion.div>
  );
}

/** Titre dans la barre. */
export const TitreNuit = ({ children, sousTitre }) => (
  <div className="min-w-0">
    <h1 className="truncate font-display text-xl font-extrabold tracking-wide" style={{ color: OR_PALE }}>{children}</h1>
    {sousTitre && <p className="truncate text-xs text-white/55">{sousTitre}</p>}
  </div>
);

/** Champ de recherche doré (dans la barre). */
export function ChampNuit({ icone: Icone, ...props }) {
  return (
    <label className="relative block">
      {Icone && <Icone className="pointer-events-none absolute left-1 top-1/2 h-5 w-5 -translate-y-1/2" style={{ color: OR }} />}
      <input
        {...props}
        className="w-full border-b bg-transparent py-1.5 pl-9 pr-8 text-base text-white outline-none placeholder:text-white/40"
        style={{ borderColor: LISERE }}
      />
    </label>
  );
}

/** Fil d'Ariane en pastilles dorées. `crumbs` = [{ label, onClick }] ; la dernière est l'écran courant. */
export function FilNuit({ crumbs, droite }) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 pb-1 pt-3">
      <nav aria-label="Fil d'Ariane" className="flex min-w-0 flex-wrap items-center gap-1 text-xs">
        {crumbs.map((c, i) => {
          const dernier = i === crumbs.length - 1;
          return (
            <React.Fragment key={`${c.label}-${i}`}>
              {i > 0 && <ChevronRight className="h-3 w-3 text-white/35" />}
              {dernier ? (
                <span className="rounded-full border px-2.5 py-1 font-bold" style={{ borderColor: LISERE, color: OR_PALE, background: "rgba(255,214,110,0.08)" }}>{c.label}</span>
              ) : (
                <button type="button" onClick={c.onClick} className="rounded-full px-2 py-1 font-semibold hover:bg-white/10" style={{ color: OR }}>{c.label}</button>
              )}
            </React.Fragment>
          );
        })}
      </nav>
      {droite}
    </div>
  );
}

/** Grille des 26 lettres : tuiles de verre aux lettres dorées, qui apparaissent en vague. */
export function GrilleLettres({ lettres, desactivee, onPick, libelle }) {
  return (
    <div className="grid grid-cols-5 gap-2.5 p-4 sm:grid-cols-6">
      {lettres.map((l, i) => {
        const vide = desactivee(l);
        return (
          <motion.button
            key={l}
            type="button"
            onClick={() => onPick(l)}
            disabled={vide}
            aria-label={libelle(l)}
            initial={{ opacity: 0, scale: 0.6, y: 10 }}
            animate={{ opacity: vide ? 0.25 : 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 22, delay: i * 0.018 }}
            whileTap={{ scale: 0.9 }}
            className="relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl border text-xl font-extrabold transition hover:-translate-y-0.5 hover:shadow-[0_0_18px_rgba(255,214,110,0.3)] disabled:hover:translate-y-0"
            style={{
              borderColor: LISERE,
              color: OR_PALE,
              background: "radial-gradient(circle at 30% 25%, rgba(255,255,255,0.14), rgba(255,255,255,0.03) 45%, rgba(46,26,92,0.55))",
            }}
          >
            {l}
          </motion.button>
        );
      })}
    </div>
  );
}

/** Liste de lignes (mots, livres, versets) : cartes légères qui arrivent l'une après l'autre. */
export function ListeNuit({ children, label }) {
  return <ul aria-label={label} className="space-y-1.5 px-3 pb-8 pt-2">{children}</ul>;
}

export function LigneNuit({ i = 0, children, className = "" }) {
  return (
    <motion.li
      initial={{ opacity: 0, x: 14 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22, delay: Math.min(i, 14) * 0.025 }}
      className={`flex items-center overflow-hidden rounded-2xl border bg-white/[0.04] backdrop-blur-[1px] ${className}`}
      style={{ borderColor: "rgba(201,160,82,0.22)" }}
    >
      {children}
    </motion.li>
  );
}

export const VideNuit = ({ children }) => <p className="px-4 py-10 text-center text-sm text-white/55">{children}</p>;
