import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import confetti from "canvas-confetti";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowLeft, BookOpen, Footprints, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { enregistrerScore } from "@/lib/scoreBoard";
import { jouerSon } from "@/lib/sonsJeu";
import { chargerProgresJeu, enregistrerProgresJeu } from "@/lib/progresJeu";
import { getLocalBooks, getLocalChapterVerses } from "@/lib/localBible";
import { analyserReference, textePassage } from "@/lib/versetsEnMasse";
import { routeVersetBible } from "@/lib/rechercheGlobale";
import { VERSIONS } from "@/lib/bibleConstants";
import BoutonSon from "@/components/BoutonSon";
import { DEPARTS, finAtteinte, oublis } from "@/data/ouVasTu";

// « Où vas-tu ? » (1.3.32, Chay Game) : un jeu de décisions. On choisit un point de départ (10), on répond à
// 4 questions ; la fin dépend de tous les choix. Elle montre le chemin parcouru (ce que chaque choix a changé),
// ce qu'on n'a pas pris en compte et un verset. Chaque nouvelle fin découverte rapporte 20 points.
// Fins découvertes gardées sur le compte (ProgresJeu, jeu « ouvastu » : { fins: { "magasin-2": date } }).

const POINTS_FIN = 20;

function Verset({ reference }) {
  const navigate = useNavigate();
  const [v, setV] = useState(null);
  useEffect(() => {
    let actif = true;
    (async () => {
      try {
        const books = await getLocalBooks("fr");
        const r = analyserReference(reference, books);
        if (!r) return;
        const texte = textePassage(await getLocalChapterVerses("fr", r.bookId, r.chapitre), r.debut, r.fin);
        if (actif && texte) setV({ texte, ref: r.ref, route: routeVersetBible(VERSIONS.fr?.[0]?.id, r.bookId, r.chapitre, r.debut) });
      } catch { /* pas de verset */ }
    })();
    return () => { actif = false; };
  }, [reference]);
  if (!v) return null;
  return (
    <div className="rounded-2xl bg-gradient-to-br from-[#C18B33]/15 to-[#A84D70]/15 p-4">
      <p className="text-sm leading-relaxed">« {v.texte} »</p>
      <button type="button" onClick={() => navigate(v.route)} className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-primary">
        <BookOpen className="h-4 w-4" /> {v.ref}
      </button>
    </div>
  );
}

export default function OuVasTu() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [progres, setProgres] = useState({ id: null, donnees: {} });
  const [depart, setDepart] = useState(null);
  const [choix, setChoix] = useState([]);
  const [nouvelle, setNouvelle] = useState(false);
  const fins = progres.donnees?.fins || {};

  useEffect(() => { chargerProgresJeu(user?.id, "ouvastu").then(setProgres).catch(() => {}); }, [user?.id]);

  const etape = choix.length;
  const finie = depart && etape >= depart.questions.length;
  const indexFin = useMemo(() => (finie ? finAtteinte(depart, choix) : null), [finie, depart, choix]);
  const fin = finie ? depart.fins[indexFin] : null;

  const commencer = (d) => { setDepart(d); setChoix([]); setNouvelle(false); jouerSon("clic"); };

  const choisir = (i) => {
    const suivants = [...choix, i];
    setChoix(suivants);
    if (suivants.length < depart.questions.length) { jouerSon("clic"); return; }
    // Fin : nouvelle fin découverte -> points et collection.
    const idx = finAtteinte(depart, suivants);
    const cleFin = `${depart.id}-${idx}`;
    jouerSon("victoire");
    confetti({ particleCount: 70, spread: 70, origin: { y: 0.4 }, colors: ["#C18B33", "#F6C453", "#A84D70", "#FFFFFF"] });
    if (!fins[cleFin]) {
      setNouvelle(true);
      enregistrerScore("ouvastu", { fin: cleFin });
      if (user?.id) {
        const donnees = { ...progres.donnees, fins: { ...fins, [cleFin]: new Date().toISOString().slice(0, 10) } };
        setProgres((p) => ({ ...p, donnees }));
        enregistrerProgresJeu(user.id, "ouvastu", progres.id, donnees).then((id) => setProgres((p) => ({ ...p, id }))).catch(() => {});
      }
    }
  };

  // ── Choix du départ ─────────────────────────────────────────────────────────
  if (!depart) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6 md:py-10">
        <div className="mb-5 flex items-center gap-3">
          <button type="button" onClick={() => navigate("/games")} aria-label="Retour aux jeux" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border hover:bg-muted">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="min-w-0 flex-1 font-display text-3xl font-extrabold">Où vas-tu ?</h1>
          <BoutonSon />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {DEPARTS.map((d, i) => (
            <motion.button
              key={d.id}
              type="button"
              onClick={() => commencer(d)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              whileTap={{ scale: 0.96 }}
              className="flex flex-col items-center gap-2 rounded-[1.5rem] border border-border bg-card px-3 py-5 text-center hover:border-primary/60"
            >
              <span className="text-4xl" aria-hidden="true">{d.icone}</span>
              <span className="font-extrabold leading-tight">{d.titre}</span>
            </motion.button>
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 py-4">
      <div className="mb-4 flex items-center gap-3">
        <button type="button" onClick={() => setDepart(null)} aria-label="Autres départs" className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-foreground/60 hover:bg-muted">
          <ArrowLeft className="h-6 w-6" />
        </button>
        <div className="flex min-w-0 flex-1 gap-1.5">
          {depart.questions.map((_, i) => (
            <div key={i} className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
              <motion.div className="h-full rounded-full bg-gradient-to-r from-[#C18B33] to-[#A84D70]" initial={false} animate={{ width: i < etape ? "100%" : "0%" }} transition={{ duration: 0.3 }} />
            </div>
          ))}
        </div>
        <span className="text-2xl" aria-hidden="true">{depart.icone}</span>
      </div>

      <AnimatePresence mode="wait">
        {!finie ? (
          <motion.section key={`q${etape}`} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.22 }}>
            {etape === 0 && (
              <p className="mb-4 rounded-2xl bg-muted/60 p-4 text-[0.95rem] leading-relaxed">{depart.contexte}</p>
            )}
            <h2 className="mb-4 font-display text-2xl font-extrabold leading-tight">{depart.questions[etape].q}</h2>
            <div className="space-y-2.5">
              {depart.questions[etape].options.map((o, i) => (
                <motion.button
                  key={o.t}
                  type="button"
                  onClick={() => choisir(i)}
                  whileTap={{ scale: 0.97 }}
                  className="flex w-full items-center gap-3 rounded-2xl border-2 border-border bg-card px-4 py-4 text-left text-base font-bold shadow-[0_3px_0_hsl(var(--border))] transition hover:border-primary/60 active:translate-y-0.5 active:shadow-none"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border-2 border-border text-sm font-black text-foreground/60">{String.fromCharCode(65 + i)}</span>
                  {o.t}
                </motion.button>
              ))}
            </div>
          </motion.section>
        ) : (
          <motion.section key="fin" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="space-y-4 pb-4">
            <div className="text-center">
              <motion.p initial={{ scale: 0.3, rotate: -15 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 300, damping: 15 }} className="text-7xl" aria-hidden="true">{fin.emoji}</motion.p>
              <p className="mt-2 text-sm font-bold uppercase tracking-wider text-primary">Bienvenue</p>
              <h2 className="font-display text-3xl font-extrabold leading-tight">{fin.lieu}</h2>
              {nouvelle && <p className="mt-1 text-sm font-black text-[#C18B33]">✨ Nouvelle fin découverte · +{POINTS_FIN} points</p>}
            </div>
            <p className="rounded-2xl bg-muted/60 p-4 leading-relaxed">{fin.texte}</p>

            <div className="rounded-2xl border border-border p-4">
              <h3 className="mb-2 flex items-center gap-2 font-extrabold"><Footprints className="h-5 w-5 text-primary" /> Comment es-tu arrivé ici ?</h3>
              <ol className="space-y-2.5">
                {depart.questions.map((q, i) => {
                  const o = q.options[choix[i]];
                  return (
                    <li key={i} className="text-sm">
                      <span className="font-bold">{i + 1}. {o.t}</span>
                      <span className="block text-foreground/65">{o.note}</span>
                    </li>
                  );
                })}
              </ol>
            </div>

            {oublis(depart, choix).length > 0 && (
              <div className="rounded-2xl border border-amber-400/40 bg-amber-400/5 p-4">
                <h3 className="mb-2 flex items-center gap-2 font-extrabold"><AlertTriangle className="h-5 w-5 text-amber-500" /> Ce que tu n'as pas pris en compte</h3>
                <ul className="space-y-1.5 text-sm">
                  {oublis(depart, choix).map((t) => <li key={t}>• {t}</li>)}
                </ul>
              </div>
            )}

            <Verset reference={fin.verset} />

            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => commencer(depart)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full brand-gradient font-extrabold text-white">
                <RefreshCw className="h-5 w-5" /> Rejouer ce départ
              </button>
              <button type="button" onClick={() => setDepart(null)} className="min-h-11 rounded-full border border-border font-bold">Choisir un autre départ</button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}
