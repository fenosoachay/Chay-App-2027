import React, { useEffect, useRef, useState } from "react";
import { RotateCcw, Star, Timer, Trophy } from "lucide-react";
import { NIVEAUX, THEMES, distribuer, duree, etoiles, lireRecords, noterRecord } from "@/lib/memory";

// Section Enfants › Memory : retourner deux cartes ; si elles sont pareilles, la paire reste visible et on
// apprend ce que la Bible en dit. Trois thèmes, trois niveaux, étoiles et meilleurs scores (sur ce téléphone).

function Carte({ carte, visible, trouvee, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={visible || trouvee}
      aria-label={visible || trouvee ? carte.nom : "Carte cachée"}
      className="aspect-[3/4] w-full [perspective:800px]"
    >
      <span
        className={`relative block h-full w-full rounded-2xl transition-transform duration-500 [transform-style:preserve-3d] ${visible || trouvee ? "[transform:rotateY(180deg)]" : ""}`}
      >
        {/* Dos de la carte */}
        <span className="absolute inset-0 grid place-items-center rounded-2xl brand-gradient text-3xl font-black text-white shadow-md [backface-visibility:hidden]">
          ?
        </span>
        {/* Face de la carte */}
        <span
          className={`absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-2xl border-2 bg-card p-1 shadow-md [backface-visibility:hidden] [transform:rotateY(180deg)] ${trouvee ? "border-emerald-500" : "border-border"}`}
        >
          <span className="text-[2.2rem] leading-none md:text-5xl" aria-hidden="true">{carte.emoji}</span>
          <span className="line-clamp-2 text-center text-[0.7rem] font-bold leading-tight md:text-sm">{carte.nom}</span>
        </span>
      </span>
    </button>
  );
}

export default function Memory() {
  const [themeId, setThemeId] = useState(THEMES[0].id);
  const [niveauId, setNiveauId] = useState(NIVEAUX[0].id);
  const theme = THEMES.find((t) => t.id === themeId);
  const niveau = NIVEAUX.find((n) => n.id === niveauId);

  const [cartes, setCartes] = useState([]);
  const [retournees, setRetournees] = useState([]); // clés des cartes visibles (2 au plus)
  const [trouvees, setTrouvees] = useState(() => new Set()); // identifiants des paires trouvées
  const [essais, setEssais] = useState(0);
  const [secondes, setSecondes] = useState(0);
  const [demarre, setDemarre] = useState(false);
  const [derniere, setDerniere] = useState(null); // dernière paire trouvée (pour l'explication)
  const [record, setRecord] = useState(false);
  const bloque = useRef(false);

  const nouvellePartie = () => {
    setCartes(distribuer(theme, niveau.paires));
    setRetournees([]);
    setTrouvees(new Set());
    setEssais(0);
    setSecondes(0);
    setDemarre(false);
    setDerniere(null);
    setRecord(false);
    bloque.current = false;
  };
  useEffect(nouvellePartie, [themeId, niveauId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fini = cartes.length > 0 && trouvees.size === cartes.length / 2;

  // Chronomètre : de la première carte retournée à la dernière paire.
  useEffect(() => {
    if (!demarre || fini) return undefined;
    const t = setInterval(() => setSecondes((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [demarre, fini]);

  useEffect(() => {
    if (fini) setRecord(noterRecord(themeId, niveauId, essais, secondes));
  }, [fini]); // eslint-disable-line react-hooks/exhaustive-deps

  const retourner = (carte) => {
    if (bloque.current || retournees.includes(carte.cle) || trouvees.has(carte.paire)) return;
    if (!demarre) setDemarre(true);
    const suivantes = [...retournees, carte.cle];
    setRetournees(suivantes);
    if (suivantes.length < 2) return;
    setEssais((n) => n + 1);
    const [a, b] = suivantes.map((cle) => cartes.find((c) => c.cle === cle));
    if (a.paire === b.paire) {
      setTrouvees((s) => new Set(s).add(a.paire));
      setDerniere(a);
      setRetournees([]);
    } else {
      bloque.current = true;
      setTimeout(() => { setRetournees([]); bloque.current = false; }, 900);
    }
  };

  const meilleur = lireRecords()[`${themeId}:${niveauId}`];
  const nbEtoiles = fini ? etoiles(essais, niveau.paires) : 0;

  return (
    <div>
      {/* Thème et niveau */}
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setThemeId(t.id)}
            className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition ${themeId === t.id ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`}
          >
            {t.emoji} {t.titre}
          </button>
        ))}
      </div>
      <div className="mb-4 grid w-full max-w-sm grid-cols-3 gap-1 rounded-full border border-border bg-card p-1">
        {NIVEAUX.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => setNiveauId(n.id)}
            className={`rounded-full px-2 py-1.5 text-sm font-bold transition ${niveauId === n.id ? "bg-foreground text-background" : "text-foreground/70"}`}
          >
            {n.titre}
          </button>
        ))}
      </div>

      {/* Compteurs */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold text-foreground/70">
        <span>Paires : {trouvees.size} / {niveau.paires}</span>
        <span>Essais : {essais}</span>
        <span className="inline-flex items-center gap-1"><Timer className="h-4 w-4" /> {duree(secondes)}</span>
        {meilleur && <span className="inline-flex items-center gap-1 text-primary"><Trophy className="h-4 w-4" /> Record : {meilleur.essais} essais</span>}
        <button type="button" onClick={nouvellePartie} className="ml-auto inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-bold">
          <RotateCcw className="h-3.5 w-3.5" /> Recommencer
        </button>
      </div>

      {/* Plateau */}
      <div className="mx-auto grid max-w-xl gap-2 md:gap-3" style={{ gridTemplateColumns: `repeat(${niveau.colonnes}, minmax(0, 1fr))` }}>
        {cartes.map((c) => (
          <Carte
            key={c.cle}
            carte={c}
            visible={retournees.includes(c.cle)}
            trouvee={trouvees.has(c.paire)}
            onClick={() => retourner(c)}
          />
        ))}
      </div>

      {/* Ce que la Bible en dit (dernière paire trouvée) */}
      {derniere && !fini && (
        <div className="mx-auto mt-4 flex max-w-xl items-start gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3">
          <span className="text-3xl" aria-hidden="true">{derniere.emoji}</span>
          <div className="min-w-0">
            <div className="font-display font-bold">Bravo ! {derniere.nom}</div>
            <p className="text-sm text-foreground/80">{derniere.info} <span className="font-semibold text-primary">({derniere.ref})</span></p>
          </div>
        </div>
      )}

      {/* Fin de partie */}
      {fini && (
        <div className="mx-auto mt-5 max-w-xl rounded-[1.5rem] brand-gradient p-6 text-center text-white shadow-lg">
          <div className="mb-2 flex justify-center gap-1">
            {[1, 2, 3].map((i) => (
              <Star key={i} className={`h-9 w-9 ${i <= nbEtoiles ? "fill-yellow-300 text-yellow-300" : "text-white/40"}`} />
            ))}
          </div>
          <div className="font-display text-2xl font-extrabold">Bravo, tu as tout trouvé !</div>
          <p className="mt-1 text-white/90">{essais} essais · {duree(secondes)}{record ? " · Nouveau record !" : ""}</p>
          <button type="button" onClick={nouvellePartie} className="mt-4 rounded-full bg-white px-6 py-2.5 font-bold text-[#5b3cc4]">
            Rejouer
          </button>
        </div>
      )}
    </div>
  );
}
