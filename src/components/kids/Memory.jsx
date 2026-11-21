import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, RotateCcw, Star, Timer, Trophy } from "lucide-react";
import { useBackHandler } from "@/hooks/useBackHandler";
import { enregistrerScore, lireProfilEnfant } from "@/lib/scoreBoard";
import {
  NIVEAUX, THEMES, disposition, distribuer, duree, etoiles, lireDisposition, lireRecords, noterDisposition, noterRecord,
} from "@/lib/memory";

// Section Enfants › Memory, un écran à la fois :
//   1. la catégorie (10 catégories) ;  2. le niveau (3 niveaux) ;  3. le jeu, en plein écran, sans défilement.
// Retour (téléphone ou flèche) : jeu -> niveaux -> catégories -> accueil Enfants.
// Le plateau s'adapte à l'appareil (téléphone, tablette, ordinateur) en gardant des cartes bien proportionnées.
// À chaque nouvelle partie, aucune image ne retombe à la même place que la partie d'avant (même après fermeture).

function Carte({ carte, visible, trouvee, largeur, hauteur, onClick }) {
  const montree = visible || trouvee;
  const avecNom = largeur >= 56;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={montree}
      aria-label={montree ? carte.nom : "Carte cachée"}
      className="[perspective:800px]"
      style={{ width: largeur, height: hauteur }}
    >
      <span className={`relative block h-full w-full transition-transform duration-500 [transform-style:preserve-3d] ${montree ? "[transform:rotateY(180deg)]" : ""}`}>
        {/* Dos de la carte */}
        <span
          className="absolute inset-0 grid place-items-center rounded-[14%] brand-gradient font-black text-white shadow-md [backface-visibility:hidden]"
          style={{ fontSize: largeur * 0.38 }}
        >
          ?
        </span>
        {/* Face de la carte */}
        <span
          className={`absolute inset-0 flex flex-col items-center justify-center gap-[4%] rounded-[14%] border-2 bg-card px-[6%] shadow-md [backface-visibility:hidden] [transform:rotateY(180deg)] ${trouvee ? "border-emerald-500" : "border-border"}`}
        >
          <span className="leading-none" style={{ fontSize: largeur * (avecNom ? 0.42 : 0.5) }} aria-hidden="true">{carte.emoji}</span>
          {avecNom && (
            <span className="line-clamp-2 text-center font-bold leading-tight" style={{ fontSize: Math.max(9, Math.min(16, largeur * 0.12)) }}>
              {carte.nom}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

/** Écran 1 : choix de la catégorie. */
function ChoixTheme({ onChoisir }) {
  return (
    <div>
      <p className="mb-4 text-lg font-semibold text-foreground/70">Choisis une catégorie</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChoisir(t.id)}
            className="flex flex-col items-center justify-center gap-2 rounded-[1.5rem] border border-border bg-card px-3 py-5 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <span className="text-5xl leading-none" aria-hidden="true">{t.emoji}</span>
            <span className="font-display text-base font-extrabold leading-tight">{t.titre}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Écran 2 : choix du niveau. */
function ChoixNiveau({ theme, onChoisir }) {
  const records = lireRecords();
  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <span className="text-4xl leading-none" aria-hidden="true">{theme.emoji}</span>
        <div>
          <div className="font-display text-xl font-extrabold">{theme.titre}</div>
          <div className="font-semibold text-foreground/60">Choisis un niveau</div>
        </div>
      </div>
      <div className="mx-auto grid max-w-md gap-3">
        {NIVEAUX.map((n, i) => {
          const r = records[`${theme.id}:${n.id}`];
          return (
            <button
              key={n.id}
              type="button"
              onClick={() => onChoisir(n.id)}
              className="flex items-center gap-4 rounded-[1.5rem] border border-border bg-card p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className="flex shrink-0 gap-0.5" aria-hidden="true">
                {[0, 1, 2].map((k) => (
                  <Star key={k} className={`h-6 w-6 ${k <= i ? "fill-yellow-400 text-yellow-400" : "text-foreground/20"}`} />
                ))}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-xl font-extrabold">{n.titre}</span>
                <span className="block text-sm text-foreground/60">{n.paires} paires</span>
              </span>
              {r && (
                <span className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-primary">
                  <Trophy className="h-4 w-4" /> {r.essais}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Écran 3 : la partie, en plein écran. */
function Partie({ theme, niveau, onQuitter }) {
  const [cartes, setCartes] = useState([]);
  const [retournees, setRetournees] = useState([]); // clés des cartes visibles (2 au plus)
  const [trouvees, setTrouvees] = useState(() => new Set()); // identifiants des paires trouvées
  const [essais, setEssais] = useState(0);
  const [secondes, setSecondes] = useState(0);
  const [demarre, setDemarre] = useState(false);
  const [derniere, setDerniere] = useState(null); // dernière paire trouvée (pour l'explication)
  const [record, setRecord] = useState(false);
  const bloque = useRef(false);
  const precedente = useRef(null); // disposition de la partie d'avant (paires par case)

  const nouvellePartie = () => {
    const avant = precedente.current || lireDisposition(theme.id, niveau.id);
    const jeu = distribuer(theme, niveau.paires, Math.random, avant);
    precedente.current = jeu.map((c) => c.paire);
    noterDisposition(theme.id, niveau.id, jeu);
    setCartes(jeu);
    setRetournees([]);
    setTrouvees(new Set());
    setEssais(0);
    setSecondes(0);
    setDemarre(false);
    setDerniere(null);
    setRecord(false);
    bloque.current = false;
  };
  useEffect(nouvellePartie, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fini = cartes.length > 0 && trouvees.size === cartes.length / 2;

  // Chronomètre : de la première carte retournée à la dernière paire.
  useEffect(() => {
    if (!demarre || fini) return undefined;
    const t = setInterval(() => setSecondes((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [demarre, fini]);

  useEffect(() => {
    if (!fini) return;
    setRecord(noterRecord(theme.id, niveau.id, essais, secondes));
    // Score Board : étoiles de la partie, au nom du pseudo de l'enfant (s'il en a choisi un).
    const profil = lireProfilEnfant();
    if (profil) {
      enregistrerScore("memory", { etoiles: etoiles(essais, niveau.paires), niveau: niveau.id, pseudo: profil.pseudo, avatar: profil.avatar });
    }
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

  // Taille du plateau : tout tient dans la zone disponible, sans défilement.
  const zoneRef = useRef(null);
  const [zone, setZone] = useState({ l: 0, h: 0 });
  useEffect(() => {
    const el = zoneRef.current;
    if (!el) return undefined;
    const mesurer = () => {
      const st = globalThis.getComputedStyle(el); // largeur utile : sans les marges intérieures
      setZone({ l: el.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight), h: el.clientHeight - 8 });
    };
    mesurer();
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const large = zone.l >= 700;
  const ecart = large ? 12 : 8;
  const plateau = disposition(niveau.paires * 2, zone.l, zone.h, { ecart, max: large ? 190 : 150 });

  const meilleur = lireRecords()[`${theme.id}:${niveau.id}`];
  const nbEtoiles = fini ? etoiles(essais, niveau.paires) : 0;

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-background"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {/* En-tête */}
      <div className="flex items-center gap-2 px-3 pt-2">
        <button type="button" onClick={onQuitter} aria-label="Retour" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border">
          <ChevronLeft className="h-6 w-6" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-lg font-extrabold">{theme.emoji} {theme.titre}</div>
          <div className="text-xs font-semibold text-foreground/60">{niveau.titre} · {niveau.paires} paires</div>
        </div>
        <button type="button" onClick={nouvellePartie} className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-bold">
          <RotateCcw className="h-4 w-4" /> Recommencer
        </button>
      </div>

      {/* Compteurs */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-3 py-2 text-sm font-semibold text-foreground/70">
        <span>Paires : {trouvees.size} / {niveau.paires}</span>
        <span>Essais : {essais}</span>
        <span className="inline-flex items-center gap-1"><Timer className="h-4 w-4" /> {duree(secondes)}</span>
        {meilleur && <span className="inline-flex items-center gap-1 text-primary"><Trophy className="h-4 w-4" /> {meilleur.essais} essais</span>}
      </div>

      {/* Plateau */}
      <div ref={zoneRef} className="relative mx-auto min-h-0 w-full max-w-6xl flex-1 px-2 md:px-6">
        {plateau.largeurCarte > 0 && (
          <div
            className="absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2"
            style={{ gap: ecart, gridTemplateColumns: `repeat(${plateau.colonnes}, ${plateau.largeurCarte}px)` }}
          >
            {cartes.map((c) => (
              <Carte
                key={c.cle}
                carte={c}
                largeur={plateau.largeurCarte}
                hauteur={plateau.hauteurCarte}
                visible={retournees.includes(c.cle)}
                trouvee={trouvees.has(c.paire)}
                onClick={() => retourner(c)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Ce que la Bible en dit : bande de hauteur fixe (le plateau ne bouge jamais) */}
      <div className="h-[4.75rem] shrink-0 px-3 py-2">
        {derniere ? (
          <div className="mx-auto flex h-full max-w-2xl items-center gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-3">
            <span className="text-3xl" aria-hidden="true">{derniere.emoji}</span>
            <p className="line-clamp-2 min-w-0 text-sm leading-snug text-foreground/85">
              <span className="font-bold">{derniere.nom} : </span>{derniere.info} <span className="font-semibold text-primary">({derniere.ref})</span>
            </p>
          </div>
        ) : (
          <div className="grid h-full place-items-center text-sm font-semibold text-foreground/50">Retourne deux cartes pour trouver les paires.</div>
        )}
      </div>

      {/* Fin de partie */}
      {fini && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-[1.75rem] brand-gradient p-6 text-center text-white shadow-2xl">
            <div className="mb-2 flex justify-center gap-1">
              {[1, 2, 3].map((i) => (
                <Star key={i} className={`h-10 w-10 ${i <= nbEtoiles ? "fill-yellow-300 text-yellow-300" : "text-white/40"}`} />
              ))}
            </div>
            <div className="font-display text-2xl font-extrabold">Bravo, tu as tout trouvé !</div>
            <p className="mt-1 text-white/90">{essais} essais · {duree(secondes)}{record ? " · Nouveau record !" : ""}</p>
            <div className="mt-5 grid gap-2">
              <button type="button" onClick={nouvellePartie} className="rounded-full bg-white px-6 py-3 font-bold text-[#5b3cc4]">
                Rejouer
              </button>
              <button type="button" onClick={onQuitter} className="rounded-full border border-white/70 px-6 py-3 font-bold text-white">
                Changer de niveau
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Memory() {
  const [themeId, setThemeId] = useState(null);
  const [niveauId, setNiveauId] = useState(null);
  const theme = THEMES.find((t) => t.id === themeId) || null;
  const niveau = NIVEAUX.find((n) => n.id === niveauId) || null;

  // Retour : le jeu d'abord (-> niveaux), puis les niveaux (-> catégories).
  useBackHandler(Boolean(themeId), () => { setNiveauId(null); setThemeId(null); });
  useBackHandler(Boolean(niveauId), () => setNiveauId(null));

  if (!theme) return <ChoixTheme onChoisir={setThemeId} />;
  return (
    <>
      <ChoixNiveau theme={theme} onChoisir={setNiveauId} />
      {niveau && <Partie key={`${theme.id}:${niveau.id}`} theme={theme} niveau={niveau} onQuitter={() => window.history.back()} />}
    </>
  );
}
