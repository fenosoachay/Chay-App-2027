import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Clapperboard, Gamepad2, Grid3x3, Palette, Puzzle as IconePuzzle } from "lucide-react";
import { hasNavigationOrigin } from "@/lib/backNavigation";
import { useAuth } from "@/lib/AuthContext";
import Coloriage from "@/components/kids/Coloriage";
import Memory from "@/components/kids/Memory";
import Puzzle from "@/pages/Puzzle";
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
// Adresse : /kids, /kids?vue=videos, /kids?vue=jeux, /kids?vue=jeux&jeu=coloriage|memory|puzzle (liens directs,
// recherche, notifications) ; le retour du téléphone remonte d'un niveau à la fois.
const ESPACES = [
  { id: "videos", titre: "Vidéos", desc: "Des vidéos pour grandir avec Dieu", icon: Clapperboard, tone: "from-[#FF4D2D] to-[#FFB800]" },
  { id: "jeux", titre: "Jeux", desc: "Coloriage, Jeux Carte et Puzzle", icon: Gamepad2, tone: "from-[#4A6CFE] to-[#8A56E2]" },
];
const JEUX = [
  { id: "coloriage", titre: "Coloriage", desc: "Colorie les histoires de la Bible", icon: Palette, tone: "from-[#FF4D2D] to-[#FF57B2]" },
  { id: "memory", titre: "Jeux Carte", desc: "Retrouve les paires et apprends la Bible", icon: Grid3x3, tone: "from-[#4A6CFE] to-[#8A56E2]", points: true },
  { id: "puzzle", titre: "Puzzle", desc: "Reconstitue une image de la Bible", icon: IconePuzzle, tone: "from-[#2E6F40] to-[#4A6CFE]", points: true },
];

function GrandeCase({ item, onClick }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-4 rounded-[1.75rem] bg-gradient-to-br ${item.tone} p-6 text-left text-white shadow-lg transition hover:-translate-y-1 hover:shadow-xl`}
    >
      <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white/20">
        <Icon className="h-9 w-9" />
      </span>
      <span className="min-w-0">
        <span className="block font-display text-2xl font-extrabold">{item.titre}</span>
        <span className="block text-sm text-white/85">{item.desc}</span>
      </span>
    </button>
  );
}

/** Enfants du compte + enfant choisi ; les records de Jeux Carte suivent l'enfant choisi. */
function useEnfants(userId) {
  const [profils, setProfils] = useState([]);
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
    await supprimerProfil(p);
    setProfils((l) => l.filter((x) => x.id !== p.id));
    if (actifId === p.id) setActifId(null);
  };
  return { profils, actif, chargement, erreur, charger, choisir, ajouter, supprimer };
}

export default function Kids() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const vue = ["videos", "jeux"].includes(searchParams.get("vue")) ? searchParams.get("vue") : null;
  const jeuDemande = vue === "jeux" ? JEUX.find((j) => j.id === searchParams.get("jeu")) || null : null;
  const enfants = useEnfants(user?.id);
  const [attire, setAttire] = useState(false);
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
    if (j.points && !enfants.actif) { setAttire(true); return; }
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
        </header>
      ) : (
        <header className="mb-8">
          <h1 className="display-fluid"><span className="brand-gradient-text">CHAY</span> Enfants</h1>
          <p className="mt-3 text-lg text-foreground/60">Un espace sûr et joyeux pour apprendre à connaître Dieu.</p>
        </header>
      )}

      {!vue && (
        <div className="grid gap-4 sm:grid-cols-2 md:gap-5">
          {ESPACES.map((e) => <GrandeCase key={e.id} item={e} onClick={() => ouvrir({ vue: e.id })} />)}
        </div>
      )}

      {vue === "videos" && <VideosEnfants />}

      {vue === "jeux" && !jeu && (
        <>
          <div className="mb-4">
            <QuiJoue
              profils={enfants.profils}
              actifId={enfants.actif?.id}
              chargement={enfants.chargement}
              erreur={enfants.erreur}
              attire={attire}
              onChoisir={enfants.choisir}
              onAjouter={enfants.ajouter}
              onSupprimer={enfants.supprimer}
              onReessayer={enfants.charger}
            />
          </div>
          {enfants.actif && (
            <div className="mb-6">
              <ScoreBoard espace="enfant" pseudo={enfants.actif.pseudo} />
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-3 md:gap-5">
            {JEUX.map((j) => <GrandeCase key={j.id} item={j} onClick={() => ouvrirJeu(j)} />)}
          </div>
        </>
      )}

      {jeu?.id === "coloriage" && <Coloriage />}
      {jeu?.id === "memory" && <Memory profil={enfants.actif} />}
      {jeu?.id === "puzzle" && <Puzzle profil={enfants.actif} integre />}
    </div>
  );
}
