import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight, Clock3, Delete, Lightbulb, Loader2, Play, RefreshCw, Trophy } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { enregistrerScore } from "@/lib/scoreBoard";
import { jouerSon } from "@/lib/sonsJeu";
import { chargerProgresJeu, enregistrerProgresJeu } from "@/lib/progresJeu";
import { getLocalBooks, getLocalChapterVerses } from "@/lib/localBible";
import { analyserReference, textePassage } from "@/lib/versetsEnMasse";
import { routeVersetBible } from "@/lib/rechercheGlobale";
import { VERSIONS } from "@/lib/bibleConstants";
import BoutonSon from "@/components/BoutonSon";
import MOTS_DEPART from "@/data/motsCroises.json";
import {
  TAILLES, caseSuivante, casesDuMot, casesFausses, genererGrille, grilleJuste, motDeCase, motJuste, motRempli, motSuivant, pointsGrille,
} from "@/lib/motsCroises";

// Mots croisés bibliques (1.3.31, Chay Game) : une grille toujours nouvelle (Facile 7 × 7, Moyen 9 × 9,
// Difficile 11 × 11), tirée des mots de l'admin (Admin › Chay Game › Mots croisés ; 215 mots de départ).
// On touche une case (deux fois : change de sens) ou une définition, on tape avec le clavier Chay (la grille
// reste visible). Un mot juste s'allume et on passe au suivant. Indice : une lettre révélée (−10 points).
// À la fin : temps, record par taille, points au Leaderboard et un verset lié à un mot de la grille.

const CLAVIER = ["AZERTYUIOP", "QSDFGHJKLM", "WXCVBN"];
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

async function chargerMots() {
  try {
    const rows = await base44.entities.MotCroise.list(undefined, 2000);
    const liste = (Array.isArray(rows) ? rows : []).filter((m) => m.actif !== false && m.mot && m.definition);
    if (liste.length >= 30) return liste;
  } catch { /* liste de l'admin indisponible : mots de départ */ }
  return MOTS_DEPART;
}

function ChoixTaille({ records, onChoisir, chargement }) {
  return (
    <div className="mx-auto max-w-md space-y-3">
      <p className="text-center text-sm text-foreground/65">Une grille toujours nouvelle, avec des mots de la Bible.</p>
      {TAILLES.map((t) => (
        <button
          key={t.id}
          type="button"
          disabled={chargement}
          onClick={() => onChoisir(t)}
          className="flex w-full items-center gap-4 rounded-[1.5rem] border border-border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/60 disabled:opacity-50"
        >
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#C18B33] to-[#A84D70] text-lg font-black text-white">
            {t.id}×{t.id}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-extrabold">{t.label}</span>
            <span className="block text-sm text-foreground/60">{t.nbMots} mots · {t.base} points</span>
            {records[t.id] > 0 && (
              <span className="mt-0.5 flex items-center gap-1 text-xs font-bold text-primary"><Trophy className="h-3 w-3" /> Record : {fmt(records[t.id])}</span>
            )}
          </span>
          {chargement ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Play className="h-6 w-6 shrink-0 text-primary" fill="currentColor" />}
        </button>
      ))}
    </div>
  );
}

/** Verset lié à un mot de la grille (texte de la Bible Louis Segond de l'app). */
function VersetFin({ mot }) {
  const navigate = useNavigate();
  const [verset, setVerset] = useState(null);
  useEffect(() => {
    let actif = true;
    (async () => {
      try {
        const books = await getLocalBooks("fr");
        const r = analyserReference(mot.reference, books);
        if (!r) return;
        const texte = textePassage(await getLocalChapterVerses("fr", r.bookId, r.chapitre), r.debut, r.fin);
        if (actif && texte) setVerset({ texte, ref: r.ref, route: routeVersetBible(VERSIONS.fr?.[0]?.id, r.bookId, r.chapitre, r.debut) });
      } catch { /* pas de verset : la fin reste complète */ }
    })();
    return () => { actif = false; };
  }, [mot]);
  if (!verset) return null;
  return (
    <div className="mt-4 rounded-2xl border border-border bg-muted/40 p-4 text-left">
      <p className="text-xs font-bold uppercase tracking-wider text-primary">{mot.mot}</p>
      <p className="mt-1 text-sm leading-relaxed">« {verset.texte} »</p>
      <button type="button" onClick={() => navigate(verset.route)} className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-primary">
        <BookOpen className="h-4 w-4" /> {verset.ref}
      </button>
    </div>
  );
}

export default function MotsCroises() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mots, setMots] = useState(null);
  const [progres, setProgres] = useState({ id: null, donnees: {} });
  const [taille, setTaille] = useState(null);
  const [grille, setGrille] = useState(null);
  const [saisies, setSaisies] = useState({});
  const [revelees, setRevelees] = useState(() => new Set());
  const [indices, setIndices] = useState(0);
  const [actif, setActif] = useState(null); // { cle, dir }
  const [secondes, setSecondes] = useState(0);
  const [fini, setFini] = useState(null); // { secondes, points, record }
  const [eclair, setEclair] = useState(null); // mot qui vient d'être trouvé (animation)
  const [fautes, setFautes] = useState(null); // cases fausses montrées
  const debut = useRef(0);

  useEffect(() => { chargerMots().then(setMots); }, []);
  useEffect(() => {
    if (!eclair) return undefined;
    const t = globalThis.setTimeout(() => setEclair(null), 450);
    return () => globalThis.clearTimeout(t);
  }, [eclair]);
  useEffect(() => {
    chargerProgresJeu(user?.id, "motscroises").then(setProgres).catch(() => {});
  }, [user?.id]);
  const records = progres.donnees?.records || {};

  // Chronomètre
  useEffect(() => {
    if (!grille || fini) return undefined;
    const t = globalThis.setInterval(() => setSecondes(Math.floor((Date.now() - debut.current) / 1000)), 1000);
    return () => globalThis.clearInterval(t);
  }, [grille, fini]);

  const commencer = (t) => {
    const g = genererGrille(mots || MOTS_DEPART, t.id, t.nbMots);
    const premier = g.mots[0];
    setTaille(t);
    setGrille(g);
    setSaisies({});
    setRevelees(new Set());
    setIndices(0);
    setFini(null);
    setFautes(null);
    setSecondes(0);
    debut.current = Date.now();
    setActif(premier ? { cle: casesDuMot(premier)[0], dir: premier.dir } : null);
  };

  const motActif = useMemo(() => {
    if (!grille || !actif) return null;
    const [r, c] = actif.cle.split("-").map(Number);
    return motDeCase(grille, r, c, actif.dir);
  }, [grille, actif]);
  const casesActives = useMemo(() => new Set(motActif ? casesDuMot(motActif) : []), [motActif]);
  const justes = useMemo(() => (grille ? grille.mots.filter((m) => motJuste(m, saisies)).length : 0), [grille, saisies]);

  const terminer = useCallback((nbIndices) => {
    const sec = Math.max(1, Math.floor((Date.now() - debut.current) / 1000));
    const pts = pointsGrille(taille.id, nbIndices, sec);
    const ancien = records[taille.id] || 0;
    const record = !ancien || sec < ancien;
    setSecondes(sec);
    setFini({ secondes: sec, points: pts, record });
    jouerSon("victoire");
    confetti({ particleCount: 110, spread: 80, origin: { y: 0.55 }, colors: ["#C18B33", "#F6C453", "#A84D70", "#FFFFFF"] });
    enregistrerScore("motscroises", { taille: taille.id, indices: nbIndices, secondes: sec });
    if (record && user?.id) {
      const donnees = { ...progres.donnees, records: { ...records, [taille.id]: sec } };
      setProgres((p) => ({ ...p, donnees }));
      enregistrerProgresJeu(user.id, "motscroises", progres.id, donnees).then((id) => setProgres((p) => ({ ...p, id }))).catch(() => {});
    }
  }, [taille, records, progres, user?.id]);

  /** Nouvelle saisie : vérifie le mot (et la grille), passe au suivant quand il est juste. */
  const apres = (next, m, cle, nbIndices = indices) => {
    setSaisies(next);
    setFautes(null);
    if (grilleJuste(grille, next)) { terminer(nbIndices); return; }
    if (m && motRempli(m, next)) {
      if (motJuste(m, next)) {
        jouerSon("bon");
        setEclair({ id: Date.now(), cases: new Set(casesDuMot(m)) });
        const suivant = motSuivant(grille, m, next);
        if (suivant) {
          const cases = casesDuMot(suivant);
          setActif({ cle: cases.find((k) => !next[k]) || cases[0], dir: suivant.dir });
        }
        return;
      }
      jouerSon("clic");
    } else jouerSon("clic");
    const s = m ? caseSuivante(m, cle, next) : null;
    if (s) setActif((a) => ({ ...a, cle: s }));
  };

  const taper = (lettre) => {
    if (!actif || fini) return;
    if (revelees.has(actif.cle)) {
      const s = motActif ? caseSuivante(motActif, actif.cle, saisies) : null;
      if (s) setActif((a) => ({ ...a, cle: s }));
      return;
    }
    apres({ ...saisies, [actif.cle]: lettre }, motActif, actif.cle);
  };

  const effacer = () => {
    if (!actif || fini || !motActif) return;
    const cases = casesDuMot(motActif);
    const i = cases.indexOf(actif.cle);
    const next = { ...saisies };
    if (next[actif.cle] && !revelees.has(actif.cle)) delete next[actif.cle];
    else if (i > 0) {
      const p = cases[i - 1];
      if (!revelees.has(p)) delete next[p];
      setActif((a) => ({ ...a, cle: p }));
    }
    setSaisies(next);
    setFautes(null);
    jouerSon("clic");
  };

  const indice = () => {
    if (!motActif || fini) return;
    const cases = casesDuMot(motActif);
    const k = cases.find((x, i) => saisies[x] !== motActif.mot[i]);
    if (!k) return;
    const [r, c] = k.split("-").map(Number);
    setIndices((n) => n + 1);
    setRevelees((s) => new Set(s).add(k));
    setActif((a) => ({ ...a, cle: k }));
    apres({ ...saisies, [k]: grille.cases[r][c] }, motActif, k, indices + 1);
  };

  // Clavier de l'ordinateur aussi.
  useEffect(() => {
    if (!grille || fini) return undefined;
    const touche = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^[a-zA-Z]$/.test(e.key)) { e.preventDefault(); taper(e.key.toUpperCase()); }
      else if (e.key === "Backspace") { e.preventDefault(); effacer(); }
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  });

  const toucherCase = (r, c) => {
    if (!grille.cases[r][c] || fini) return;
    const cle = `${r}-${c}`;
    if (actif?.cle === cle) {
      const autre = actif.dir === "h" ? "v" : "h";
      if (motDeCase(grille, r, c, autre)?.dir === autre) setActif({ cle, dir: autre });
    } else {
      const m = motDeCase(grille, r, c, actif?.dir || "h");
      setActif({ cle, dir: m?.dir || "h" });
    }
  };

  const changerMot = (pas) => {
    if (!motActif) return;
    const liste = grille.mots;
    const m = liste[(liste.indexOf(motActif) + pas + liste.length) % liste.length];
    const cases = casesDuMot(m);
    setActif({ cle: cases.find((k) => !saisies[k]) || cases[0], dir: m.dir });
  };

  const toutRempli = grille && grille.cases.every((l, r) => l.every((x, c) => !x || saisies[`${r}-${c}`]));
  const motVerset = useMemo(() => {
    if (!fini || !grille) return null;
    const avecRef = grille.mots.filter((m) => m.reference);
    return avecRef.length ? avecRef[Math.floor(Math.random() * avecRef.length)] : null;
  }, [fini, grille]);

  // ── Écran de choix ──────────────────────────────────────────────────────────
  if (!grille) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6 md:py-10">
        <div className="mb-6 flex items-center gap-3">
          <button type="button" onClick={() => navigate("/games")} aria-label="Retour aux jeux" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="min-w-0 flex-1 font-display text-3xl font-extrabold">Mots croisés</h1>
          <BoutonSon />
        </div>
        <ChoixTaille records={records} onChoisir={commencer} chargement={!mots} />
      </main>
    );
  }

  const n = grille.taille;
  return (
    <main className="mx-auto flex max-w-md select-none flex-col px-3 pb-4 pt-3">
      <div className="mb-2 flex items-center gap-2">
        <button type="button" onClick={() => { setGrille(null); setFini(null); }} aria-label="Changer de grille" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border hover:bg-muted">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-sm font-bold tabular-nums">
          <Clock3 className="h-4 w-4 text-primary" /> {fmt(secondes)}
        </span>
        <span className="min-w-0 flex-1 text-center text-sm font-bold text-foreground/60">{justes} / {grille.mots.length} mots</span>
        <button
          type="button"
          onClick={indice}
          disabled={!motActif || !!fini}
          className="inline-flex h-10 shrink-0 items-center gap-1 rounded-full border border-amber-400/40 px-3 text-sm font-bold text-amber-500 hover:bg-amber-400/10 disabled:opacity-40"
          aria-label="Indice : révéler une lettre (moins 10 points)"
        >
          <Lightbulb className="h-4 w-4" /> −10
        </button>
      </div>

      {/* Définition du mot choisi */}
      <div className="mb-2 flex min-h-[3.75rem] items-stretch gap-1 rounded-2xl bg-gradient-to-r from-[#C18B33] to-[#A84D70] p-1 text-white">
        <button type="button" onClick={() => changerMot(-1)} aria-label="Définition précédente" className="grid w-9 shrink-0 place-items-center rounded-xl hover:bg-white/15">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => motActif && toucherCase(...actif.cle.split("-").map(Number))}
          className="min-w-0 flex-1 px-1 py-1 text-left"
        >
          {motActif && (
            <>
              <span className="mr-1.5 inline-block rounded-md bg-white/20 px-1.5 text-xs font-black">{motActif.num} {motActif.dir === "h" ? "→" : "↓"}</span>
              <span className="text-[0.95rem] font-semibold leading-snug">{motActif.definition}</span>
              {motActif.reference && <span className="ml-1 text-xs font-bold text-white/75">· {motActif.reference}</span>}
            </>
          )}
        </button>
        <button type="button" onClick={() => changerMot(1)} aria-label="Définition suivante" className="grid w-9 shrink-0 place-items-center rounded-xl hover:bg-white/15">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Grille */}
      <div className="relative mx-auto" style={{ width: "min(100%, calc(100dvh - 22rem))" }}>
        <div
          className="grid aspect-square w-full gap-[2px] rounded-xl bg-[#1f1a24] p-[2px]"
          style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
          role="grid"
          aria-label={`Grille de ${n} par ${n}`}
        >
          {grille.cases.flatMap((ligne, r) => ligne.map((lettre, c) => {
            const cle = `${r}-${c}`;
            if (!lettre) return <span key={cle} className="rounded-[3px] bg-transparent" />;
            const num = grille.mots.find((m) => m.r === r && m.c === c)?.num;
            const ici = actif?.cle === cle;
            const dansMot = casesActives.has(cle);
            const brille = eclair?.cases.has(cle);
            const faux = fautes?.has(cle);
            const juste = grille.mots.some((m) => motJuste(m, saisies) && casesDuMot(m).includes(cle));
            return (
              <button
                key={cle}
                type="button"
                onClick={() => toucherCase(r, c)}
                className={`relative grid min-h-0 min-w-0 place-items-center rounded-[4px] font-black uppercase leading-none transition-colors duration-100 ${
                  ici ? "bg-[#F6C453] text-[#21190a]" : faux ? "bg-rose-200 text-rose-700" : dansMot ? "bg-[#f3dfb0] text-[#21190a]" : juste ? "bg-[#d9f2e3] text-[#155c38]" : "bg-white text-[#21190a]"
                }`}
                style={{ fontSize: `min(${n === 7 ? 5.5 : n === 9 ? 4.3 : 3.5}vw, ${n === 7 ? 1.7 : n === 9 ? 1.35 : 1.1}rem)` }}
                aria-label={`Case ${r + 1}, ${c + 1}${saisies[cle] ? ` : ${saisies[cle]}` : ""}`}
              >
                {num && <span className="absolute left-[2px] top-[1px] text-[0.5rem] font-bold leading-none text-[#6b5a3a]">{num}</span>}
                <AnimatePresence mode="popLayout">
                  {saisies[cle] && (
                    <motion.span
                      key={saisies[cle]}
                      initial={{ scale: 0.4, opacity: 0 }}
                      animate={brille ? { scale: [1, 1.35, 1], opacity: 1 } : { scale: 1, opacity: 1 }}
                      transition={{ duration: brille ? 0.35 : 0.12 }}
                      className={revelees.has(cle) ? "text-amber-600" : ""}
                    >
                      {saisies[cle]}
                    </motion.span>
                  )}
                </AnimatePresence>
              </button>
            );
          }))}
        </div>

        <AnimatePresence>
          {fini && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-x-0 top-0 z-20 max-h-[calc(100dvh-10rem)] overflow-y-auto rounded-[1.5rem] border border-border bg-background/97 p-5 text-center shadow-2xl backdrop-blur"
            >
              <Trophy className="mx-auto h-10 w-10 text-[#F6C453]" />
              <h2 className="mt-1 text-2xl font-black">{fini.record ? "Nouveau record !" : "Grille terminée !"}</h2>
              <p className="mt-1 text-4xl font-black tabular-nums text-primary">{fmt(fini.secondes)}</p>
              <p className="mt-1 text-sm text-foreground/60">
                +{fini.points} points{indices ? ` · ${indices} indice${indices > 1 ? "s" : ""}` : ""}{records[taille.id] && !fini.record ? ` · record ${fmt(records[taille.id])}` : ""}
              </p>
              {motVerset && <VersetFin mot={motVerset} />}
              <div className="mt-4 flex flex-col gap-2">
                <button type="button" onClick={() => commencer(taille)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full brand-gradient font-extrabold text-white">
                  <RefreshCw className="h-5 w-5" /> Nouvelle grille
                </button>
                <button type="button" onClick={() => { setGrille(null); setFini(null); }} className="min-h-11 rounded-full border border-border font-bold">Changer de taille</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {toutRempli && !fini && (
        <div className="mt-2 flex items-center justify-center gap-2 text-sm font-bold text-rose-500">
          Quelques lettres ne sont pas justes.
          <button type="button" onClick={() => setFautes(casesFausses(grille, saisies))} className="rounded-full border border-rose-400/50 px-3 py-1 text-xs">Les montrer</button>
        </div>
      )}

      {/* Clavier Chay */}
      <div className="mt-3 space-y-1.5" aria-label="Clavier">
        {CLAVIER.map((rang, i) => (
          <div key={rang} className="flex justify-center gap-1">
            {[...rang].map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => taper(l)}
                className="h-12 min-w-0 max-w-[2.6rem] flex-1 rounded-lg bg-card text-lg font-bold shadow-sm ring-1 ring-border active:scale-95 active:bg-[#F6C453] active:text-[#21190a]"
              >
                {l}
              </button>
            ))}
            {i === 2 && (
              <button type="button" onClick={effacer} aria-label="Effacer" className="grid h-12 w-[3.25rem] shrink-0 place-items-center rounded-lg bg-muted ring-1 ring-border active:scale-95">
                <Delete className="h-5 w-5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
