import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Blocks, CarFront, Clapperboard, Gamepad2, Grid3x3, Palette, Puzzle as IconePuzzle } from "lucide-react";
import { hasNavigationOrigin } from "@/lib/backNavigation";
import { useAuth } from "@/lib/AuthContext";
import { useToast } from "@/components/ui/use-toast";
import Coloriage from "@/components/kids/Coloriage";
import Memory from "@/components/kids/Memory";
import Puzzle from "@/pages/Puzzle";
import Brique from "@/components/kids/Brique";
import Voiture from "@/components/kids/Voiture";
import BoutonSon from "@/components/BoutonSon";
import ScoreBoard from "@/components/jeux/ScoreBoard";
import QuiJoue from "@/components/kids/QuiJoue";
import VideosEnfants from "@/components/kids/VideosEnfants";
import { brancherRecords } from "@/lib/memory";
import {
  ajouterProfil, chargerProfils, choisirEnfantActif, enregistrerProgres, lireEnfantActif, supprimerProfil,
} from "@/lib/profilsEnfants";

// Chay Enfants (1.3.26) : deux grandes cases, Vidéos et Jeux.
//  - Vidéos : comme Multimédia › Vidéo (Admin › Chay Kids › Vidéos) ;
//  - Jeux : « Qui joue ? » (enfants enregistrés sur le compte), le Score Board, puis Coloriage, Jeux Carte et
//    Puzzle. Les points et les records vont à l'enfant choisi.
// Adresse : /kids, /kids?vue=videos, /kids?vue=jeux, /kids?vue=jeux&jeu=coloriage|memory|puzzle|brique|voiture (liens directs,
// recherche, notifications) ; le retour du téléphone remonte d'un niveau à la fois.
const ESPACES = [
  { id: "videos", titre: "Vidéos", desc: "Des vidéos pour grandir avec Dieu", icon: Clapperboard, tone: "from-[#FF4D2D] to-[#FFB800]" },
  { id: "jeux", titre: "Jeux", desc: "Coloriage, Jeux Carte, Puzzle, Brique et Voiture", icon: Gamepad2, tone: "from-[#4A6CFE] to-[#8A56E2]" },
];
const JEUX = [
  { id: "coloriage", titre: "Coloriage", desc: "Colorie les histoires de la Bible", icon: Palette, tone: "from-[#FF4D2D] to-[#FF57B2]" },
  { id: "memory", titre: "Jeux Carte", desc: "Retrouve les paires et apprends la Bible", icon: Grid3x3, tone: "from-[#4A6CFE] to-[#8A56E2]", points: true },
  { id: "puzzle", titre: "Puzzle", desc: "Reconstitue une image de la Bible", icon: IconePuzzle, tone: "from-[#2E6F40] to-[#4A6CFE]", points: true },
  // 1.3.29 : Brique quitte les jeux des adultes.
  { id: "brique", titre: "Brique", desc: "Remplis les lignes avec les pièces", icon: Blocks, tone: "from-[#44916F] to-[#4A6CFE]", points: true },
  // 1.3.30
  { id: "voiture", titre: "Voiture", desc: "Libère la voiture rouge du garage", icon: CarFront, tone: "from-[#FF3B3B] to-[#FFB400]", points: true },
];

/** Case d'une section, comme les sections du Multimédia (carré coloré + nom dessous) (1.3.27). */
function CaseSection({ item, onClick }) {
  const Icon = item.icon;
  return (
    <button type="button" onClick={onClick} className="group flex flex-col items-center gap-2">
      <span
        className={`relative grid aspect-square w-full place-items-center rounded-[1.5rem] bg-gradient-to-br ${item.tone} text-white shadow-sm transition-all group-hover:-translate-y-1 group-hover:shadow-lg`}
      >
        <Icon className="h-9 w-9 md:h-10 md:w-10" />
      </span>
      <span className="max-w-full text-center text-[0.9375rem] font-semibold leading-tight text-foreground/70 md:text-[1.3125rem]">
        {item.titre}
      </span>
    </button>
  );
}

/** Enfants du compte + enfant choisi ; les records de Jeux Carte suivent l'enfant choisi. */
function useEnfants(userId) {
  const { toast } = useToast();
  const [profils, setProfils] = useState([]);
  const [version, setVersion] = useState(0); // Score Board rechargé après un enfant effacé
  const [actifId, setActifId] = useState(() => lireEnfantActif());
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(false);
    try {
      const rows = await chargerProfils(userId);
      setProfils(rows);
      setActifId(lireEnfantActif());
    } catch {
      setErreur(true);
    } finally {
      setChargement(false);
    }
  }, [userId]);
  useEffect(() => { if (userId) charger(); }, [userId, charger]);

  const actif = useMemo(() => profils.find((p) => p.id === actifId) || null, [profils, actifId]);

  // Jeux Carte : records de l'enfant choisi, enregistrés sur le compte.
  useEffect(() => {
    if (!actif) { brancherRecords(null); return undefined; }
    brancherRecords({
      lire: () => actif.progres?.memory || {},
      ecrire: (records) => { enregistrerProgres(actif, "memory", records); },
    });
    return () => brancherRecords(null);
  }, [actif]);

  const choisir = (p) => { choisirEnfantActif(p.id); setActifId(p.id); };
  const ajouter = async (pseudo, avatar) => {
    const p = await ajouterProfil(userId, pseudo, avatar, profils);
    setProfils((l) => [...l, p].sort((a, b) => a.pseudo.localeCompare(b.pseudo, "fr", { sensitivity: "base" })));
    choisir(p);
  };
  const supprimer = async (p) => {
    try {
      await supprimerProfil(p);
    } catch (e) {
      toast({ title: "Effacement impossible", description: e?.message || "Vérifie la connexion.", variant: "destructive" });
      return;
    }
    setProfils((l) => l.filter((x) => x.id !== p.id));
    if (actifId === p.id) setActifId(null);
    setVersion((v) => v + 1);
    toast({ title: `${p.pseudo} a été effacé`, description: "Son prénom et ses points ne sont plus au Score Board." });
  };
  return { profils, actif, chargement, erreur, charger, choisir, ajouter, supprimer, version };
}

export default function Kids() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const vue = ["videos", "jeux"].includes(searchParams.get("vue")) ? searchParams.get("vue") : null;
  const jeuDemande = vue === "jeux" ? JEUX.find((j) => j.id === searchParams.get("jeu")) || null : null;
  const enfants = useEnfants(user?.id);
  const [attire, setAttire] = useState(false);
  // 1.3.34 : les jeux n'apparaissent qu'après « Qui joue ? » (à chaque visite de Chay Enfants ; un aller-retour
  // dans un jeu ne redemande pas).
  const [choisiIci, setChoisiIci] = useState(false);
  const haut = useRef(null);

  // Un jeu à points s'ouvre seulement pour un enfant choisi (« Qui joue ? »).
  const jeu = jeuDemande && (!jeuDemande.points || enfants.actif) ? jeuDemande : null;
  useEffect(() => {
    if (jeuDemande && jeuDemande.points && !enfants.actif && !enfants.chargement) {
      setSearchParams({ vue: "jeux" }, { replace: true });
      setAttire(true);
    }
  }, [jeuDemande, enfants.actif, enfants.chargement, setSearchParams]);
  useEffect(() => { if (enfants.actif) setAttire(false); }, [enfants.actif]);
  useEffect(() => { if (attire) haut.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [attire]);

  const ouvrir = (params) => setSearchParams(params, { state: { chayKids: true } });
  const ouvrirJeu = (j) => {
    if ((j.points && !enfants.actif) || !choisiIci) { setAttire(true); return; }
    ouvrir({ vue: "jeux", jeu: j.id });
  };
  const retour = () => {
    if (hasNavigationOrigin(window.history.state, "chayKids")) navigate(-1);
    else setSearchParams(jeu ? { vue: "jeux" } : {}, { replace: true });
  };

  const titre = jeu ? jeu.titre : vue === "videos" ? "Vidéos" : vue === "jeux" ? "Jeux" : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-12" ref={haut}>
      {titre ? (
        <header className="mb-5 flex items-center gap-3">
          <button
            type="button"
            onClick={retour}
            aria-label="Retour"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border hover:bg-muted"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="min-w-0 flex-1 truncate font-display text-3xl font-extrabold">{titre}</h1>
          {jeu?.points && enfants.actif && (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-sm font-bold">
              <span className="text-lg leading-none" aria-hidden="true">{enfants.actif.avatar}</span>
              {enfants.actif.pseudo}
            </span>
          )}
          {vue === "jeux" && <BoutonSon />}
        </header>
      ) : (
        <header className="mb-8">
          <h1 className="display-fluid"><span className="brand-gradient-text">CHAY</span> Enfants</h1>
          <p className="mt-3 text-lg text-foreground/60">Un espace sûr et joyeux pour apprendre à connaître Dieu.</p>
        </header>
      )}

      {!vue && (
        <div className="grid grid-cols-3 gap-4 md:grid-cols-6 md:gap-6 lg:grid-cols-8">
          {ESPACES.map((e) => <CaseSection key={e.id} item={e} onClick={() => ouvrir({ vue: e.id })} />)}
        </div>
      )}

      {vue === "videos" && <VideosEnfants />}

      {vue === "jeux" && !jeu && (
        <>
          {/* 1.3.34 : le Score Board d'abord, puis « Qui joue ? » ; les jeux arrivent ensuite, un à un. */}
          <div className="mb-4">
            <ScoreBoard key={enfants.version} espace="enfant" pseudo={choisiIci ? enfants.actif?.pseudo || "" : ""} />
          </div>
          <div className="mb-6">
            <QuiJoue
              profils={enfants.profils}
              actifId={choisiIci ? enfants.actif?.id : null}
              chargement={enfants.chargement}
              erreur={enfants.erreur}
              attire={attire}
              onChoisir={(p) => { enfants.choisir(p); setChoisiIci(true); }}
              onAjouter={async (pseudo, avatar) => { await enfants.ajouter(pseudo, avatar); setChoisiIci(true); }}
              onSupprimer={enfants.supprimer}
              onReessayer={enfants.charger}
            />
          </div>
          {choisiIci && enfants.actif && (
            <div key={enfants.actif.id} className="grid grid-cols-3 gap-4 md:grid-cols-6 md:gap-6 lg:grid-cols-8">
              {JEUX.map((j, i) => (
                <motion.div
                  key={j.id}
                  initial={{ opacity: 0, scale: 0.3, y: 24 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 520, damping: 17, delay: 0.08 + i * 0.09 }}
                >
                  <CaseSection item={j} onClick={() => ouvrirJeu(j)} />
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}

      {jeu?.id === "coloriage" && <Coloriage />}
      {jeu?.id === "memory" && <Memory profil={enfants.actif} />}
      {jeu?.id === "puzzle" && <Puzzle profil={enfants.actif} integre />}
      {jeu?.id === "brique" && <Brique profil={enfants.actif} />}
      {jeu?.id === "voiture" && <Voiture profil={enfants.actif} />}
    </div>
  );
}
