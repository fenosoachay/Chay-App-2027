import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, BookOpen, Delete, Heart, Lightbulb, Lock, Star } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { enregistrerScore } from "@/lib/scoreBoard";
import { jouerSon } from "@/lib/sonsJeu";
import { chargerProgresJeu, enregistrerProgresJeu } from "@/lib/progresJeu";
import { getLocalBooks } from "@/lib/localBible";
import { analyserReference } from "@/lib/versetsEnMasse";
import { routeVersetBible } from "@/lib/rechercheGlobale";
import { VERSIONS } from "@/lib/bibleConstants";
import BoutonSon from "@/components/BoutonSon";
import Hieroglyphe from "@/components/jeux/Hieroglyphe";
import {
  ALPHABET, AZERTY, A_VENIR, ENIGMES, GLYPHE, MORSE, TOUCHES, avoter, chiffres, cle, clavierDecale, dumbphone, enigmeFinie, envers,
  etoilesNiveau, fleches, initiales, lettresConnues, morse, normaliser, ouvert, pointsNiveau, reponseJuste, tableAvoter,
} from "@/lib/enigmes";

// Énigmes (1.3.32, Chay Game), façon Duolingo : 8 énigmes de 3 niveaux. Un niveau = un mot caché à décoder.
// Rien n'est expliqué d'avance : la méthode se découvre, ou se demande indice par indice (chaque indice coûte
// une étoile ; le dernier montre la table). 3 cœurs (une erreur = un cœur ; plus de cœur : on recommence le
// niveau). Étoiles = cœurs restants moins les indices ; points au Leaderboard. Les énigmes à venir sont en gris. Les 3 niveaux réussis ouvrent l'énigme suivante.
// Progrès gardé sur le compte (ProgresJeu, jeu « enigmes » : { etoiles: { "e-n": 1..3 } }).

const CLAVIER = ["AZERTYUIOP", "QSDFGHJKLM", "WXCVBN"];
const Etoiles = ({ n, taille = "h-3 w-3" }) => (
  <span className="flex gap-0.5">
    {[1, 2, 3].map((i) => <Star key={i} className={`${taille} ${i <= n ? "fill-[#FFB400] text-[#FFB400]" : "text-foreground/20"}`} />)}
  </span>
);

function Puce({ children, className = "" }) {
  return <span className={`inline-flex min-w-[2.2rem] items-center justify-center rounded-xl bg-card px-2 py-1.5 font-black ring-1 ring-border ${className}`}>{children}</span>;
}

/** L'énigme à décoder, selon son type. */
function Enigme({ e, niveau }) {
  const navigate = useNavigate();
  const rep = niveau.reponse;
  const [refs, setRefs] = useState([]);
  useEffect(() => {
    if (!niveau.refs) return undefined;
    let actif = true;
    getLocalBooks("fr").then((books) => {
      if (!actif) return;
      setRefs(niveau.refs.map(([ref, mot]) => {
        const r = analyserReference(ref, books);
        return { ref, mot, route: r ? routeVersetBible(VERSIONS.fr?.[0]?.id, r.bookId, r.chapitre, r.debut) : null };
      }));
    }).catch(() => setRefs(niveau.refs.map(([ref, mot]) => ({ ref, mot, route: null }))));
    return () => { actif = false; };
  }, [niveau]);

  const lignes = (groupes, rendu) => (
    <div className="flex flex-col items-center gap-2">
      {groupes.map((g, i) => <div key={i} className="flex flex-wrap justify-center gap-1.5">{g.map((x, k) => <React.Fragment key={k}>{rendu(x)}</React.Fragment>)}</div>)}
    </div>
  );

  switch (e.id) {
    case "avoter":
      return lignes(avoter(rep).split(" ").map((m) => [...m]), (l) => <Puce className="text-2xl">{l}</Puce>);
    case "morse":
      return lignes(morse(rep), (f) => <Puce className="text-xl tracking-tight">{f}</Puce>);
    case "dumbphone":
      return lignes(dumbphone(rep), (x) => <Puce className="text-2xl">{x.chiffre}<sup className="ml-0.5 text-sm text-primary">{x.fois}</sup></Puce>);
    case "egypte":
      return (
        lignes(normaliser(rep).split(" ").map((m) => [...m]), (l) => <Puce className="text-[#C18B33]"><Hieroglyphe id={GLYPHE[l]} className="h-8 w-8" /></Puce>)
      );
    case "miroir": {
      const texte = niveau.effet === "envers" ? envers(rep) : normaliser(rep);
      const style = niveau.effet === "miroir" ? "scaleX(-1)" : niveau.effet === "renverse" ? "rotate(180deg)" : "none";
      return <p className="text-center font-display text-4xl font-black tracking-widest" style={{ transform: style }}>{texte}</p>;
    }
    case "chiffres":
      return lignes(chiffres(rep, niveau.calculs), (x) => <Puce className="text-lg">{x}</Puce>);
    case "reference":
      return (
        <div className="space-y-2">
          {(refs.length ? refs : niveau.refs.map(([ref, mot]) => ({ ref, mot, route: null }))).map((r, i) => (
            <div key={i} className="flex items-center gap-2 rounded-2xl bg-card px-3 py-2.5 ring-1 ring-border">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-black text-primary">{i + 1}</span>
              <span className="min-w-0 flex-1 font-bold">{r.ref} · {r.mot === 1 ? "1er" : `${r.mot}e`} mot</span>
              {r.route && (
                <button type="button" onClick={() => navigate(r.route)} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
                  <BookOpen className="h-3.5 w-3.5" /> Ouvrir
                </button>
              )}
            </div>
          ))}
        </div>
      );
    case "clavier":
      return lignes(clavierDecale(rep).split(" ").map((m) => [...m]), (l) => <Puce className="text-2xl">{l}</Puce>);
    default:
      return null;
  }
}

/** Table d'aide (toujours visible). */
function Aide({ e, n, niveau }) {
  const grille = (items, cols = "grid-cols-6") => <div className={`grid ${cols} gap-1 text-center text-xs`}>{items}</div>;
  const cas = (k, a, b) => (
    <span key={k} className="rounded-lg bg-muted/60 px-1 py-1 font-bold"><span className="text-foreground/50">{a}</span> {b}</span>
  );
  switch (e.id) {
    case "avoter":
      return grille(tableAvoter().map(([a, t]) => cas(a, `${a} =`, t)), "grid-cols-6");
    case "morse":
      return grille(Object.entries(MORSE).map(([l, c]) => cas(l, l, fleches(c))), "grid-cols-4");
    case "dumbphone":
      return (
        <div className="mx-auto grid max-w-[15rem] grid-cols-3 gap-1.5 text-center">
          {["1", ...Object.keys(TOUCHES)].map((c) => (
            <span key={c} className="rounded-xl bg-muted/60 py-1.5">
              <span className="block text-lg font-black">{c}</span>
              <span className="block text-[0.65rem] font-bold tracking-widest text-foreground/55">{TOUCHES[c] || "·"}</span>
            </span>
          ))}
        </div>
      );
    case "egypte": {
      const connues = lettresConnues(ENIGMES[n.e].niveaux.map((x) => x.reponse), n.n, niveau.cachees);
      const ici = [...new Set(normaliser(niveau.reponse).replace(/ /g, ""))];
      const montrees = [...new Set([...connues, ...ici])].sort();
      return grille(montrees.map((l) => (
        <span key={l} className="flex flex-col items-center rounded-lg bg-muted/60 py-1 text-[#C18B33]">
          <Hieroglyphe id={GLYPHE[l]} className="h-5 w-5" />
          <span className={`text-xs font-black ${connues.has(l) ? "text-foreground" : "text-rose-500"}`}>{connues.has(l) ? l : "?"}</span>
        </span>
      )), "grid-cols-6");
    }
    case "chiffres":
      return grille([...ALPHABET].map((l, i) => cas(l, l, i + 1)), "grid-cols-6");
    case "clavier":
      return (
        <div className="space-y-1">
          {AZERTY.map((r) => (
            <div key={r} className="flex justify-center gap-1">
              {[...r].map((l) => <span key={l} className="grid h-7 w-7 place-items-center rounded-md bg-muted/60 text-xs font-black">{l}</span>)}
            </div>
          ))}
          <p className="pt-1 text-center text-xs text-foreground/55">Chaque lettre a pris la place de sa voisine de gauche ; au bout de la ligne, on revient au début.</p>
        </div>
      );
    default:
      return null;
  }
}

function Carte({ etoiles, onChoisir }) {
  return (
    <div className="mx-auto max-w-md space-y-3">
      {ENIGMES.map((e, i) => {
        const ouverte = ouvert(etoiles, i, 0);
        const finie = enigmeFinie(etoiles, i);
        return (
          <div key={e.id} className={`rounded-[1.5rem] border p-3 ${ouverte ? "border-border bg-card" : "border-border/50 bg-muted/30 opacity-60"}`}>
            <div className="flex items-center gap-3">
              <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-2xl ${finie ? "bg-gradient-to-br from-[#FFB400] to-[#FF5A5F]" : ouverte ? "bg-gradient-to-br from-[#4A6CFE] to-[#8A56E2]" : "bg-muted"}`}>
                {ouverte ? e.icone : <Lock className="h-5 w-5 text-foreground/50" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold text-foreground/50">Énigme {i + 1}</span>
                <span className="block truncate text-lg font-extrabold">{e.titre}</span>
              </span>
            </div>
            <div className="mt-2.5 grid grid-cols-3 gap-2">
              {[0, 1, 2].map((k) => {
                const ok = ouvert(etoiles, i, k);
                const nb = etoiles?.[cle(i, k)] || 0;
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={!ok}
                    onClick={() => onChoisir(i, k)}
                    className={`flex flex-col items-center gap-0.5 rounded-xl py-2 text-sm font-black transition active:scale-95 ${
                      nb ? "bg-[#FFB400]/15 text-[#b37d00]" : ok ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/30"
                    }`}
                  >
                    {ok ? `Niveau ${k + 1}` : <Lock className="h-4 w-4" />}
                    {nb > 0 && <Etoiles n={nb} />}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {Array.from({ length: A_VENIR }, (_, k) => (
        <div key={`venir-${k}`} className="flex items-center gap-3 rounded-[1.5rem] border border-dashed border-border/60 bg-muted/20 p-3 opacity-50">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-muted"><Lock className="h-5 w-5 text-foreground/40" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold text-foreground/50">Énigme {ENIGMES.length + k + 1}</span>
            <span className="block text-lg font-extrabold text-foreground/40">Bientôt…</span>
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Enigmes() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [progres, setProgres] = useState({ id: null, donnees: {} });
  const [ici, setIci] = useState(null); // { e, n }
  const [saisie, setSaisie] = useState("");
  const [coeurs, setCoeurs] = useState(3);
  const [retour, setRetour] = useState(null); // "juste" | "faux" | "perdu"
  const [secoue, setSecoue] = useState(0);
  const [indicesVus, setIndicesVus] = useState(0);
  const etoiles = progres.donnees?.etoiles || {};

  useEffect(() => { chargerProgresJeu(user?.id, "enigmes").then(setProgres).catch(() => {}); }, [user?.id]);

  const enigme = ici ? ENIGMES[ici.e] : null;
  const niveau = enigme ? enigme.niveaux[ici.n] : null;
  const lettres = useMemo(() => (niveau ? normaliser(niveau.reponse).replace(/ /g, "").length : 0), [niveau]);
  const motsSlots = useMemo(() => (niveau ? normaliser(niveau.reponse).split(" ").map((m) => m.length) : []), [niveau]);

  const ouvrir = (e, n) => { setIci({ e, n }); setSaisie(""); setCoeurs(3); setRetour(null); setIndicesVus(0); };

  const taper = (l) => { if (!retour && saisie.length < lettres) { setSaisie((s) => s + l); jouerSon("clic"); } };
  const effacer = () => { if (!retour) setSaisie((s) => s.slice(0, -1)); };

  const verifier = () => {
    if (retour || saisie.length < lettres) return;
    // Remet les espaces aux bons endroits pour comparer.
    if (reponseJuste(saisie, niveau.reponse)) {
      const nb = etoilesNiveau(coeurs, indicesVus);
      setRetour("juste");
      jouerSon(ici.n === 2 ? "victoire" : "bon");
      confetti({ particleCount: ici.n === 2 ? 120 : 60, spread: 70, origin: { y: 0.7 }, colors: ["#FFB400", "#3EC28F", "#4A6CFE", "#FFFFFF"] });
      const avant = etoiles[cle(ici.e, ici.n)] || 0;
      if (!avant) enregistrerScore("enigmes", { enigme: ici.e + 1, niveau: ici.n + 1, etoiles: nb });
      if (nb > avant && user?.id) {
        const donnees = { ...progres.donnees, etoiles: { ...etoiles, [cle(ici.e, ici.n)]: nb } };
        setProgres((p) => ({ ...p, donnees }));
        enregistrerProgresJeu(user.id, "enigmes", progres.id, donnees).then((id) => setProgres((p) => ({ ...p, id }))).catch(() => {});
      }
      return;
    }
    const reste = coeurs - 1;
    setCoeurs(reste);
    setSecoue((s) => s + 1);
    jouerSon(reste ? "faux" : "fin");
    setRetour(reste ? "faux" : "perdu");
  };

  // Clavier de l'ordinateur aussi.
  useEffect(() => {
    if (!ici) return undefined;
    const touche = (ev) => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (/^[a-zA-Z]$/.test(ev.key)) taper(ev.key.toUpperCase());
      else if (ev.key === "Backspace") effacer();
      else if (ev.key === "Enter") (retour ? continuer : verifier)();
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  });

  const continuer = () => {
    if (retour === "faux") { setRetour(null); setSaisie(""); return; }
    if (retour === "perdu") { ouvrir(ici.e, ici.n); return; }
    // Juste : niveau suivant, énigme suivante, ou la carte.
    if (ici.n < 2) ouvrir(ici.e, ici.n + 1);
    else if (ici.e < ENIGMES.length - 1) ouvrir(ici.e + 1, 0);
    else setIci(null);
  };

  if (!ici) {
    const finies = ENIGMES.filter((_, i) => enigmeFinie(etoiles, i)).length;
    return (
      <main className="mx-auto max-w-3xl px-4 py-6 md:py-10">
        <div className="mb-4 flex items-center gap-3">
          <button type="button" onClick={() => navigate("/games")} aria-label="Retour aux jeux" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="min-w-0 flex-1 font-display text-3xl font-extrabold">Énigmes</h1>
          <BoutonSon />
        </div>
        <p className="mb-4 text-center text-sm text-foreground/65">{finies} énigme{finies > 1 ? "s" : ""} résolue{finies > 1 ? "s" : ""} sur {ENIGMES.length}</p>
        <Carte etoiles={etoiles} onChoisir={ouvrir} />
      </main>
    );
  }

  // Lettres tapées réparties dans les cases des mots.
  let k = 0;
  const cases = motsSlots.map((len) => Array.from({ length: len }, () => saisie[k++] || ""));
  const nbEtoiles = etoilesNiveau(coeurs, indicesVus);
  const pts = pointsNiveau(ici.e + 1, ici.n + 1, nbEtoiles);
  const indices = enigme.indices || [];
  const demanderIndice = () => {
    if (retour || indicesVus >= indices.length) return;
    setIndicesVus((n) => n + 1);
    jouerSon("clic");
  };

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-9rem)] max-w-md select-none flex-col px-3 pb-3 pt-3">
      {/* Barre du haut : quitter, progression de l'énigme (3 niveaux), cœurs */}
      <div className="mb-3 flex items-center gap-3">
        <button type="button" onClick={() => setIci(null)} aria-label="Quitter" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-foreground/60 hover:bg-muted">
          <ArrowLeft className="h-6 w-6" />
        </button>
        <div className="flex min-w-0 flex-1 gap-1.5">
          {[0, 1, 2].map((x) => (
            <div key={x} className="h-3.5 flex-1 overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-[#3EC28F] to-[#7ED957]"
                initial={false}
                animate={{ width: x < ici.n || (x === ici.n && retour === "juste") ? "100%" : x === ici.n ? `${(saisie.length / lettres) * 60}%` : "0%" }}
                transition={{ duration: 0.3 }}
              />
            </div>
          ))}
        </div>
        <span className="flex shrink-0 items-center gap-1 font-black text-rose-500">
          <motion.span key={coeurs} initial={{ scale: 1.6 }} animate={{ scale: 1 }}><Heart className="h-5 w-5 fill-rose-500" /></motion.span> {coeurs}
        </span>
      </div>

      <p className="text-xs font-bold uppercase tracking-wider text-primary">{enigme.titre} · niveau {ici.n + 1}</p>
      <p className="mt-0.5 text-sm text-foreground/70">Trouve le mot caché.</p>

      <motion.div key={`${ici.e}-${ici.n}-${secoue}`} animate={secoue ? { x: [0, -10, 10, -6, 6, 0] } : {}} transition={{ duration: 0.35 }} className="mt-4">
        <Enigme e={enigme} niveau={niveau} />
      </motion.div>

      {/* Indices : rien n'est donné d'avance ; chaque indice coûte une étoile. */}
      <div className="mt-4 space-y-2">
        {indices.slice(0, indicesVus).map((ind, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-amber-400/40 bg-amber-400/5 p-2.5">
            <p className="mb-1 flex items-center gap-1 text-[0.7rem] font-bold uppercase tracking-wider text-amber-600"><Lightbulb className="h-3 w-3" /> Indice {i + 1}</p>
            {ind === "table" ? <Aide e={enigme} n={ici} niveau={niveau} />
              : ind === "definition" ? <p className="text-sm font-bold">{niveau.indice}</p>
                : ind === "initiales" ? <p className="text-sm font-bold">Les mots commencent par : {initiales(niveau.reponse)}</p>
                  : <p className="text-sm font-bold">{ind}</p>}
          </motion.div>
        ))}
        {indicesVus < indices.length && (
          <button
            type="button"
            onClick={demanderIndice}
            disabled={!!retour}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/50 px-4 py-2 text-sm font-bold text-amber-600 hover:bg-amber-400/10 disabled:opacity-40"
          >
            <Lightbulb className="h-4 w-4" /> Indice {indicesVus + 1}/{indices.length} · −1 <Star className="h-3.5 w-3.5 fill-current" />
          </button>
        )}
      </div>

      {/* Réponse */}
      <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2">
        {cases.map((mot, i) => (
          <div key={i} className="flex gap-1">
            {mot.map((l, j) => (
              <span key={j} className={`grid h-10 w-8 place-items-center border-b-[3px] text-xl font-black ${l ? "border-primary" : "border-foreground/25"}`}>
                <AnimatePresence mode="popLayout">{l && <motion.span key={l + j} initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>{l}</motion.span>}</AnimatePresence>
              </span>
            ))}
          </div>
        ))}
      </div>

      <div className="mt-auto pt-4">
        <div className="space-y-1.5">
          {CLAVIER.map((r, i) => (
            <div key={r} className="flex justify-center gap-1">
              {[...r].map((l) => (
                <button key={l} type="button" onClick={() => taper(l)} className="h-11 min-w-0 max-w-[2.6rem] flex-1 rounded-lg bg-card text-lg font-bold shadow-sm ring-1 ring-border active:scale-95">
                  {l}
                </button>
              ))}
              {i === 2 && (
                <button type="button" onClick={effacer} aria-label="Effacer" className="grid h-11 w-[3.25rem] shrink-0 place-items-center rounded-lg bg-muted ring-1 ring-border active:scale-95">
                  <Delete className="h-5 w-5" />
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={verifier}
          disabled={saisie.length < lettres || !!retour}
          className="mt-3 h-13 min-h-[3.25rem] w-full rounded-2xl bg-[#3EC28F] text-lg font-black uppercase tracking-wide text-white shadow-[0_4px_0_#2a9a6f] transition active:translate-y-0.5 active:shadow-none disabled:bg-muted disabled:text-foreground/40 disabled:shadow-none"
        >
          Vérifier
        </button>
      </div>

      {/* Retour façon Duolingo */}
      <AnimatePresence>
        {retour && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className={`fixed inset-x-0 bottom-0 z-[70] rounded-t-[1.75rem] px-5 pb-[calc(1.25rem+var(--sa-bottom))] pt-5 shadow-2xl ${
              retour === "juste" ? "bg-[#d7ffb8] text-[#2b6a12]" : "bg-[#ffdfe0] text-[#a8323a]"
            }`}
          >
            <div className="mx-auto max-w-md">
              {retour === "juste" ? (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-2xl font-black">{ici.n === 2 ? "Énigme résolue !" : "Bravo !"}</p>
                    <Etoiles n={nbEtoiles} taille="h-6 w-6" />
                  </div>
                  <p className="mt-1 font-bold">« {niveau.reponse} » · +{pts} points</p>
                </>
              ) : retour === "faux" ? (
                <>
                  <p className="text-2xl font-black">Pas tout à fait…</p>
                  <p className="mt-1 font-bold">Encore {coeurs} cœur{coeurs > 1 ? "s" : ""}. Regarde bien l'aide !</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-black">Plus de cœurs !</p>
                  <p className="mt-1 font-bold">Recommence ce niveau, tu y es presque.</p>
                </>
              )}
              <button
                type="button"
                onClick={continuer}
                autoFocus
                className={`mt-4 min-h-[3.25rem] w-full rounded-2xl text-lg font-black uppercase tracking-wide text-white ${
                  retour === "juste" ? "bg-[#58cc02] shadow-[0_4px_0_#46a302]" : "bg-[#ff4b4b] shadow-[0_4px_0_#d33131]"
                }`}
              >
                {retour === "juste" ? "Continuer" : retour === "faux" ? "Réessayer" : "Recommencer"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
