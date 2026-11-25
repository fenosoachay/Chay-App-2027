import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Blocks, Play, RotateCcw, Trophy } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { enregistrerScore } from "@/lib/scoreBoard";
import { enregistrerProgres } from "@/lib/profilsEnfants";
import { jouerSon } from "@/lib/sonsJeu";
import {
  BLOCK_BLAST_CATEGORIES,
  BLOCK_BLAST_SHAPES,
  BRIQUE_MODES,
  canPlaceBlockBlastShape,
  clearCompletedBlockBlastLines,
  createBlockBlastMessagePicker,
  createEmptyBlockBlastBoard,
  generateBlockBlastPieces,
  hasAnyBlockBlastMove,
  lignesCompletees,
  placeBlockBlastShape,
  pointsPose,
} from "@/lib/blockBlast";

// Brique dans Chay Enfants (1.3.29) : la pièce se glisse au doigt (elle passe au-dessus du doigt pour rester
// visible), son ombre montre où elle va se poser et les lignes qui vont s'effacer s'allument. Toucher une pièce
// puis une case marche aussi. Lignes qui éclatent, points qui s'envolent, combos, sons et vibration légère.
// Deux modes : Facile (8 × 8, petites pièces) et Normal (10 × 10). Les points vont à l'enfant choisi
// (« Qui joue ? ») ; son record de chaque mode est gardé sur le compte (ProfilEnfant.progres.brique).

const COULEURS = ["#FF5A5F", "#FFB400", "#3EC28F", "#4A90E2", "#A066E8", "#FF7AC6"];
const ECART = 3; // px entre les cases
const BRAVOS = ["Bravo !", "Génial !", "Bien joué !", "Super !", "Waouh !"];

const formeDe = (piece) => BLOCK_BLAST_SHAPES.find((f) => f.id === piece?.shapeId);
const dimensions = (forme) => ({
  lignes: Math.max(...forme.cells.map(([r]) => r)) + 1,
  colonnes: Math.max(...forme.cells.map(([, c]) => c)) + 1,
});
const nouvellesPieces = (mode) =>
  generateBlockBlastPieces(Math.random, BRIQUE_MODES[mode].formes).map((p) => ({
    ...p,
    couleur: COULEURS[Math.floor(Math.random() * COULEURS.length)],
  }));

async function chargerMessages() {
  const page = await base44.entities.BlockBlastMessage.filter({ active: true }, "message_id", 200).catch(() => []);
  const items = Array.isArray(page) ? page : page?.items || [];
  return items
    .map((m) => ({ id: m.message_id || m.id, category: m.category, message: m.message, active: m.active !== false }))
    .filter((m) => BLOCK_BLAST_CATEGORIES.includes(m.category) && String(m.message || "").trim());
}

/** Dessin d'une pièce (cases de `taille` px). */
function DessinPiece({ piece, taille, ecart = ECART, ombre = false }) {
  const forme = formeDe(piece);
  if (!forme) return null;
  const { lignes, colonnes } = dimensions(forme);
  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: `repeat(${colonnes}, ${taille}px)`, gridTemplateRows: `repeat(${lignes}, ${taille}px)`, gap: ecart }}
    >
      {forme.cells.map(([r, c]) => (
        <span
          key={`${r}-${c}`}
          className="rounded-[22%]"
          style={{
            gridRow: r + 1,
            gridColumn: c + 1,
            backgroundColor: piece.couleur,
            boxShadow: ombre ? "0 6px 14px rgba(0,0,0,.35), inset 0 -3px 0 rgba(0,0,0,.18)" : "inset 0 -3px 0 rgba(0,0,0,.18)",
          }}
        />
      ))}
    </div>
  );
}

function ChoixMode({ records, onChoisir }) {
  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="rounded-[1.5rem] border border-border bg-card p-4 text-center">
        <span className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#44916F] to-[#4A6CFE] text-white">
          <Blocks className="h-7 w-7" />
        </span>
        <p className="text-sm text-foreground/70">
          Glisse les pièces sur la grille avec ton doigt. Remplis une ligne ou une colonne : elle éclate et tu gagnes des points !
        </p>
      </div>
      {Object.values(BRIQUE_MODES).map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChoisir(m.id)}
          className="flex w-full items-center gap-4 rounded-[1.5rem] border border-border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/60"
        >
          <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-lg font-black text-white ${m.id === "facile" ? "bg-gradient-to-br from-[#3EC28F] to-[#4A90E2]" : "bg-gradient-to-br from-[#FF5A5F] to-[#A066E8]"}`}>
            {m.taille}×{m.taille}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-extrabold">{m.label}</span>
            <span className="block text-sm text-foreground/60">{m.id === "facile" ? "Petite grille, petites pièces" : "Grande grille, toutes les pièces"}</span>
            {records[m.id] > 0 && <span className="mt-0.5 flex items-center gap-1 text-xs font-bold text-primary"><Trophy className="h-3 w-3" /> Record : {records[m.id]}</span>}
          </span>
          <Play className="h-6 w-6 shrink-0 text-primary" fill="currentColor" />
        </button>
      ))}
    </div>
  );
}

export default function Brique({ profil = null }) {
  const [mode, setMode] = useState(null);
  const taille = mode ? BRIQUE_MODES[mode].taille : 10;
  const [plateau, setPlateau] = useState(() => createEmptyBlockBlastBoard(10));
  const [pieces, setPieces] = useState([]);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [fini, setFini] = useState(false);
  const [choisie, setChoisie] = useState(null); // pièce touchée (mode « toucher puis case »)
  const [glisse, setGlisse] = useState(null); // { piece, x, y, souris }
  const [cible, setCible] = useState(null); // { row, col } valide pendant le glisser
  const [pose, setPose] = useState({ id: 0, cases: new Set() }); // dernière pose (animation)
  const [eclats, setEclats] = useState([]); // cases qui éclatent
  const [gains, setGains] = useState([]); // « +25 » qui s'envolent
  const [bandeau, setBandeau] = useState(null); // { id, texte }
  const [nouveauRecord, setNouveauRecord] = useState(false);
  const records = { facile: 0, normal: 0, ...(profil?.progres?.brique || {}) };
  const record = mode ? records[mode] || 0 : 0;

  const grilleRef = useRef(null);
  const messagesRef = useRef(createBlockBlastMessagePicker([]));
  const partieRef = useRef({ score: 0, envoyee: true, mode: null });
  const compteur = useRef(0);
  const profilRef = useRef(profil);
  profilRef.current = profil;
  const nouvelId = () => { compteur.current += 1; return compteur.current; };

  useEffect(() => {
    let actif = true;
    chargerMessages().then((m) => { if (actif) messagesRef.current = createBlockBlastMessagePicker(m); });
    return () => { actif = false; };
  }, []);

  // Fin de partie (ou départ du jeu en pleine partie) : score envoyé une seule fois, record gardé.
  const terminer = useCallback((scoreFinal, modeJoue) => {
    const p = partieRef.current;
    if (p.envoyee) return;
    p.envoyee = true;
    const profil = profilRef.current;
    if (scoreFinal > 0 && profil) {
      enregistrerScore("brique", { score: scoreFinal, pseudo: profil.pseudo, avatar: profil.avatar });
      const anciens = { facile: 0, normal: 0, ...(profil.progres?.brique || {}) };
      if (scoreFinal > (anciens[modeJoue] || 0)) enregistrerProgres(profil, "brique", { ...anciens, [modeJoue]: scoreFinal });
    }
  }, []);
  useEffect(() => () => terminer(partieRef.current.score, partieRef.current.mode), [terminer]);

  const commencer = (m) => {
    terminer(partieRef.current.score, partieRef.current.mode);
    const t = BRIQUE_MODES[m].taille;
    setMode(m);
    setPlateau(createEmptyBlockBlastBoard(t));
    setPieces(nouvellesPieces(m));
    setScore(0);
    setCombo(0);
    setFini(false);
    setChoisie(null);
    setGlisse(null);
    setCible(null);
    setEclats([]);
    setGains([]);
    setBandeau(null);
    setNouveauRecord(false);
    partieRef.current = { score: 0, envoyee: false, mode: m };
  };

  const montrer = (texte) => {
    const id = nouvelId();
    setBandeau({ id, texte });
    setTimeout(() => setBandeau((b) => (b?.id === id ? null : b)), 1800);
  };

  const poser = (piece, row, col) => {
    const forme = formeDe(piece);
    if (!forme || fini || !canPlaceBlockBlastShape(plateau, forme, row, col)) {
      jouerSon("refus");
      return false;
    }
    const place = placeBlockBlastShape(plateau, forme, row, col, piece.couleur);
    const efface = clearCompletedBlockBlastLines(place);
    const nbLignes = efface.rows.length + efface.columns.length;
    const gagne = pointsPose(forme.cells.length, nbLignes, nbLignes ? combo : 0);
    const total = score + gagne;
    const idPose = nouvelId();

    // Cases qui éclatent (avec leur couleur).
    if (nbLignes) {
      const r = new Set(efface.rows);
      const c = new Set(efface.columns);
      const liste = [];
      place.forEach((ligne, i) => ligne.forEach((couleur, j) => {
        if (couleur && (r.has(i) || c.has(j))) liste.push({ id: `${idPose}-${i}-${j}`, row: i, col: j, couleur });
      }));
      setEclats((e) => [...e, ...liste]);
      setTimeout(() => setEclats((e) => e.filter((x) => !String(x.id).startsWith(`${idPose}-`))), 420);
    }
    setGains((g) => [...g, { id: idPose, pts: gagne, row, col }]);
    setTimeout(() => setGains((g) => g.filter((x) => x.id !== idPose)), 650);
    setPose({ id: idPose, cases: new Set(forme.cells.map(([a, b]) => `${row + a}-${col + b}`)) });

    // Sons, combos, encouragements.
    const nouveauCombo = nbLignes ? combo + 1 : 0;
    if (nbLignes) {
      jouerSon("ligne", nbLignes);
      const admin = messagesRef.current(nbLignes > 1 ? "multiple_lines" : efface.rows.length ? "line_completed" : "column_completed");
      if (nouveauCombo >= 2) montrer(`Combo ×${nouveauCombo} !`);
      else if (nbLignes >= 2) montrer(`Super ! ${nbLignes} lignes d'un coup !`);
      else montrer(admin?.message || BRAVOS[Math.floor(Math.random() * BRAVOS.length)]);
    } else jouerSon("pose");
    if (!nouveauRecord && record > 0 && total > record) {
      setNouveauRecord(true);
      jouerSon("record");
      montrer("Nouveau record !");
    }

    // Pièces suivantes, fin de partie.
    let suivantes = pieces.map((p) => (p?.id === piece.id ? null : p));
    if (suivantes.every((p) => !p)) suivantes = nouvellesPieces(mode);
    setPlateau(efface.board);
    setPieces(suivantes);
    setScore(total);
    setCombo(nouveauCombo);
    setChoisie(null);
    partieRef.current.score = total;
    if (!hasAnyBlockBlastMove(efface.board, suivantes)) {
      setFini(true);
      setTimeout(() => jouerSon("fin"), 350);
      terminer(total, mode);
    }
    return true;
  };

  // ── Glisser au doigt ────────────────────────────────────────────────────────
  // Fluide : la pièce qui suit le doigt est déplacée directement (transform, sans redessiner la grille) ; la
  // grille ne se redessine que quand la case visée change.
  const glisseRef = useRef(null); // { piece, x0, y0, souris, bouge, m: mesure de la grille }
  const flottantRef = useRef(null);
  const cibleRef = useRef(null);
  const poserRef = useRef(null);
  poserRef.current = poser;
  const plateauRef = useRef(plateau);
  plateauRef.current = plateau;

  const mesure = () => {
    const el = grilleRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cote = (r.width - ECART * (taille - 1)) / taille;
    return { left: r.left, top: r.top, width: r.width, cote };
  };
  /** Coin haut-gauche de la pièce qui suit le pointeur (au-dessus du doigt sur téléphone). */
  const coinPiece = (g, x, y) => {
    const { lignes, colonnes } = dimensions(formeDe(g.piece));
    const w = colonnes * g.m.cote + (colonnes - 1) * ECART;
    const h = lignes * g.m.cote + (lignes - 1) * ECART;
    return { x: x - w / 2, y: g.souris ? y - h / 2 : y - h - 56 };
  };
  const caseVisee = (g, coin) => {
    const pas = g.m.cote + ECART;
    const row = Math.round((coin.y - g.m.top) / pas);
    const col = Math.round((coin.x - g.m.left) / pas);
    return canPlaceBlockBlastShape(plateauRef.current, formeDe(g.piece), row, col) ? { row, col } : null;
  };
  const placerFlottant = (coin) => {
    const el = flottantRef.current;
    if (el) el.style.transform = `translate3d(${coin.x}px, ${coin.y}px, 0)`;
  };

  const debutGlisser = (e, piece) => {
    if (fini || !piece) return;
    e.preventDefault();
    const m = mesure();
    if (!m) return;
    glisseRef.current = { piece, x0: e.clientX, y0: e.clientY, souris: e.pointerType === "mouse", bouge: false, m, dernier: null };
    cibleRef.current = null;
    setGlisse({ piece, bouge: false });
    setCible(null);
  };

  useEffect(() => {
    if (!glisse) return undefined;
    let image = 0;
    const bouger = (e) => {
      const g = glisseRef.current;
      if (!g) return;
      if (!g.bouge && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > 6) {
        g.bouge = true;
        setGlisse({ piece: g.piece, bouge: true });
      }
      if (!g.bouge) return;
      const x = e.clientX;
      const y = e.clientY;
      cancelAnimationFrame(image);
      image = requestAnimationFrame(() => {
        const coin = coinPiece(g, x, y);
        g.dernier = coin;
        placerFlottant(coin);
        const c = caseVisee(g, coin);
        const avant = cibleRef.current;
        if ((c?.row ?? -1) !== (avant?.row ?? -1) || (c?.col ?? -1) !== (avant?.col ?? -1)) {
          cibleRef.current = c;
          setCible(c);
        }
      });
    };
    const finir = () => {
      cancelAnimationFrame(image);
      glisseRef.current = null;
      cibleRef.current = null;
      setGlisse(null);
      setCible(null);
    };
    const lacher = (e) => {
      const g = glisseRef.current;
      if (!g) return finir();
      if (!g.bouge) {
        finir();
        setChoisie((c) => (c === g.piece.id ? null : g.piece.id));
        return undefined;
      }
      const coin = coinPiece(g, e.clientX, e.clientY);
      const c = caseVisee(g, coin);
      finir();
      if (c) poserRef.current(g.piece, c.row, c.col);
      else if (e.clientY > g.m.top && e.clientY < g.m.top + g.m.width) jouerSon("refus");
      return undefined;
    };
    window.addEventListener("pointermove", bouger, { passive: true });
    window.addEventListener("pointerup", lacher);
    window.addEventListener("pointercancel", finir);
    return () => {
      cancelAnimationFrame(image);
      window.removeEventListener("pointermove", bouger);
      window.removeEventListener("pointerup", lacher);
      window.removeEventListener("pointercancel", finir);
    };
  }, [glisse?.piece?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Aperçu : ombre de la pièce et lignes qui vont éclater.
  const apercu = useMemo(() => {
    if (!glisse || !cible) return null;
    const forme = formeDe(glisse.piece);
    const cases = new Set(forme.cells.map(([a, b]) => `${cible.row + a}-${cible.col + b}`));
    const { rows, columns } = lignesCompletees(plateau, forme, cible.row, cible.col);
    return { cases, rows: new Set(rows), columns: new Set(columns), couleur: glisse.piece.couleur };
  }, [glisse, cible, plateau]);

  const toucherCase = (row, col) => {
    const piece = pieces.find((p) => p?.id === choisie);
    if (piece) poser(piece, row, col);
  };

  if (!mode) return <ChoixMode records={records} onChoisir={commencer} />;

  const gEnCours = glisseRef.current;

  return (
    <div className="mx-auto max-w-md select-none">
      <div className="mb-3 flex items-center gap-2">
        <div className="min-w-0 flex-1 rounded-2xl bg-card px-3 py-1.5 text-center ring-1 ring-border">
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-foreground/50">Score</p>
          <motion.p key={score} initial={{ scale: 1.25 }} animate={{ scale: 1 }} transition={{ duration: 0.18 }} className="text-2xl font-black tabular-nums">{score}</motion.p>
        </div>
        <div className="min-w-0 flex-1 rounded-2xl bg-card px-3 py-1.5 text-center ring-1 ring-border">
          <p className="flex items-center justify-center gap-1 text-[0.65rem] font-bold uppercase tracking-wider text-foreground/50"><Trophy className="h-3 w-3" /> Record</p>
          <p className="text-2xl font-black tabular-nums">{Math.max(record, score)}</p>
        </div>
        <button type="button" onClick={() => commencer(mode)} aria-label="Recommencer" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-card ring-1 ring-border">
          <RotateCcw className="h-5 w-5" />
        </button>
      </div>

      <div className="relative rounded-[1.5rem] bg-muted/60 p-2 ring-1 ring-border">
        <div
          ref={grilleRef}
          className="relative grid aspect-square w-full touch-none"
          style={{ gridTemplateColumns: `repeat(${taille}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${taille}, minmax(0, 1fr))`, gap: ECART }}
          aria-label={`Grille de ${taille} par ${taille}`}
        >
          {plateau.flatMap((ligne, r) => ligne.map((couleur, c) => {
            const cle = `${r}-${c}`;
            const ombre = apercu?.cases.has(cle);
            const allumee = apercu && (apercu.rows.has(r) || apercu.columns.has(c));
            const neuve = couleur && pose.cases.has(cle);
            return (
              <button
                key={cle}
                type="button"
                tabIndex={-1}
                aria-label={`Ligne ${r + 1}, colonne ${c + 1}${couleur ? ", occupée" : ""}`}
                onClick={() => toucherCase(r, c)}
                className={`relative min-h-0 min-w-0 rounded-[22%] ${couleur ? "" : "bg-background/70"} ${allumee ? "ring-2 ring-white/90" : ""}`}
              >
                {couleur && (
                  <motion.span
                    key={neuve ? `p${pose.id}` : "fixe"}
                    initial={neuve ? { scale: 0.4, opacity: 0.4 } : false}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 800, damping: 26 }}
                    className="absolute inset-0 rounded-[22%]"
                    style={{ backgroundColor: couleur, boxShadow: "inset 0 -3px 0 rgba(0,0,0,.18)", filter: allumee ? "brightness(1.35)" : undefined }}
                  />
                )}
                {!couleur && ombre && <span className="absolute inset-0 rounded-[22%] opacity-45" style={{ backgroundColor: apercu.couleur }} />}
              </button>
            );
          }))}

          {/* Éclats des lignes effacées et points gagnés, posés sur la même grille. */}
          <div className="pointer-events-none absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${taille}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${taille}, minmax(0, 1fr))`, gap: ECART }}>
            <AnimatePresence>
              {eclats.map((e) => (
                <motion.span
                  key={e.id}
                  initial={{ scale: 1, opacity: 1, rotate: 0 }}
                  animate={{ scale: 1.6, opacity: 0, rotate: (e.row + e.col) % 2 ? 25 : -25 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className="rounded-[22%]"
                  style={{ gridRow: e.row + 1, gridColumn: e.col + 1, backgroundColor: e.couleur, boxShadow: `0 0 16px ${e.couleur}` }}
                />
              ))}
              {gains.map((g) => (
                <motion.span
                  key={`g${g.id}`}
                  initial={{ y: 0, opacity: 1, scale: 0.8 }}
                  animate={{ y: -50, opacity: 0, scale: 1.3 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                  className="z-10 self-center justify-self-center whitespace-nowrap text-xl font-black text-white"
                  style={{ gridRow: g.row + 1, gridColumn: `${g.col + 1} / span 2`, textShadow: "0 2px 6px rgba(0,0,0,.6)" }}
                >
                  +{g.pts}
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
        </div>

        <AnimatePresence>
          {bandeau && !fini && (
            <motion.div
              key={bandeau.id}
              initial={{ y: -12, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              className="pointer-events-none absolute inset-x-4 top-4 z-20 rounded-full bg-gradient-to-r from-[#FFB400] to-[#FF5A5F] px-4 py-2 text-center text-base font-black text-white shadow-lg"
            >
              {bandeau.texte}
            </motion.div>
          )}
          {fini && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-[1.5rem] bg-background/92 p-5 text-center backdrop-blur-sm"
            >
              <Trophy className="h-12 w-12 text-[#FFB400]" />
              <h2 className="mt-2 text-2xl font-black">{nouveauRecord ? "Nouveau record !" : "Partie terminée"}</h2>
              <p className="mt-1 text-5xl font-black text-primary tabular-nums">{score}</p>
              {profil && <p className="mt-1 text-sm text-foreground/60">Points pour {profil.avatar} {profil.pseudo}</p>}
              <div className="mt-5 flex w-full max-w-xs flex-col gap-2">
                <button type="button" onClick={() => commencer(mode)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full brand-gradient font-extrabold text-white">
                  <RotateCcw className="h-5 w-5" /> Rejouer
                </button>
                <button type="button" onClick={() => { terminer(score, mode); setMode(null); }} className="min-h-11 rounded-full border border-border font-bold">
                  Changer de mode
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {pieces.map((piece, i) => (
          <div
            key={piece?.id || `vide-${i}`}
            onPointerDown={(e) => debutGlisser(e, piece)}
            className={`grid h-28 touch-none place-items-center ${piece ? "cursor-grab active:cursor-grabbing" : ""}`}
            role={piece ? "button" : undefined}
            aria-label={piece ? "Pièce à poser" : undefined}
          >
            {piece && (
              <motion.div
                key={piece.id}
                initial={{ scale: 0.3, opacity: 0 }}
                animate={{
                  scale: glisse?.piece.id === piece.id && glisse.bouge ? 0.8 : choisie === piece.id ? 1.15 : 1,
                  opacity: glisse?.piece.id === piece.id && glisse.bouge ? 0 : 1,
                }}
                transition={{ type: "spring", stiffness: 700, damping: 30, delay: glisse ? 0 : i * 0.03 }}
              >
                <DessinPiece piece={piece} taille={taille === 8 ? 24 : 20} ecart={2} />
              </motion.div>
            )}
          </div>
        ))}
      </div>

      {glisse?.bouge && gEnCours && (
        <div
          ref={(el) => { flottantRef.current = el; if (el && gEnCours.dernier) el.style.transform = `translate3d(${gEnCours.dernier.x}px, ${gEnCours.dernier.y}px, 0)`; }}
          className="pointer-events-none fixed left-0 top-0 z-[200] will-change-transform"
          style={{ transform: "translate3d(-999px, -999px, 0)" }}
        >
          <DessinPiece piece={glisse.piece} taille={gEnCours.m.cote} ombre />
        </div>
      )}
    </div>
  );
}
