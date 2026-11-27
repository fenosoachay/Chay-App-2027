import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  BookOpen, ChevronRight, Church, Film, Image as ImageIcon, LayoutGrid, ListMusic, Loader2, Megaphone, Mic,
  Music, Newspaper, Search, Type, User, Users, Youtube, FileText,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { chercherRubriques, filtreContient, nettoyerRecherche, SOURCES, versResultats } from "@/lib/rechercheGlobale";

const ICONES = {
  rubrique: LayoutGrid, music: Music, playlist: ListMusic, sermon: Mic, film: Film, youtube: Youtube, paroles: Type,
  verset: BookOpen, article: FileText, image: ImageIcon, actualite: Newspaper, annonce: Megaphone, eglise: Church,
  personne: User, membre: Users, bible: BookOpen,
};
const PAR_GROUPE = 6;

function Resultat({ r, icone, onOuvrir }) {
  const Icone = ICONES[icone] || Search;
  return (
    <li>
      <button type="button" onClick={() => onOuvrir(r.route)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-muted transition">
        {r.image ? (
          <img src={r.image} alt="" loading="lazy" className="h-11 w-11 shrink-0 rounded-xl object-cover bg-muted" />
        ) : (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icone className="h-5 w-5" /></span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{r.titre}</span>
          {r.sousTitre && <span className="block truncate text-xs text-foreground/55">{r.sousTitre}</span>}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-foreground/30" />
      </button>
    </li>
  );
}

function Groupe({ titre, icone, resultats, onOuvrir, lienPlus }) {
  if (!resultats.length) return null;
  return (
    <section className="space-y-1">
      <h2 className="flex items-center gap-2 px-3 text-xs font-bold uppercase tracking-wide text-foreground/50">
        {titre}
      </h2>
      <ul>{resultats.map((r) => <Resultat key={r.id} r={r} icone={icone} onOuvrir={onOuvrir} />)}</ul>
      {lienPlus && (
        <button type="button" onClick={() => onOuvrir(lienPlus.route)} className="ml-3 text-xs font-semibold text-primary hover:underline">
          {lienPlus.texte}
        </button>
      )}
    </section>
  );
}

// Recherche dans toute l'app (1.3.26) : rubriques, contenus (musique, playlists, prédications, films, YouTube, paroles,
// versets du Multimédia, articles, galerie, actualité, annonces, pages de l'Église, personnel, membres).
// La Bible n'est plus cherchée ici (1.3.32) : trop de résultats.
export default function Recherche() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [saisie, setSaisie] = useState(params.get("q") || "");
  const [texte, setTexte] = useState(nettoyerRecherche(params.get("q") || ""));
  const [contenus, setContenus] = useState({});
  const [enCours, setEnCours] = useState(0);
  const champ = useRef(null);

  useEffect(() => { champ.current?.focus(); }, []);

  // Attente de 350 ms après la dernière touche ; l'adresse garde la recherche (retour arrière = mêmes résultats).
  useEffect(() => {
    const t = setTimeout(() => {
      const n = nettoyerRecherche(saisie);
      setTexte(n);
      setParams(n ? { q: saisie.trim() } : {}, { replace: true });
    }, 350);
    return () => clearTimeout(t);
  }, [saisie]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setContenus({});
    if (!texte) return undefined;
    let actif = true;
    setEnCours(SOURCES.length);
    const fini = () => actif && setEnCours((n) => Math.max(0, n - 1));
    for (const s of SOURCES) {
      base44.entities[s.entite]
        .filter(filtreContient(texte, s.champs), undefined, PAR_GROUPE)
        .then((lignes) => actif && setContenus((c) => ({ ...c, [s.entite]: versResultats(s, lignes) })))
        .catch(() => {})
        .finally(fini);
    }
    return () => { actif = false; };
  }, [texte]);

  const rubriques = useMemo(() => chercherRubriques(saisie), [saisie]);
  const nbContenus = Object.values(contenus).reduce((n, l) => n + l.length, 0);
  const rien = texte && !enCours && !rubriques.length && !nbContenus;
  const ouvrir = (route) => navigate(route);

  return (
    <div className="mx-auto max-w-2xl px-4 pb-10 pt-4 md:pt-8">
      <div className="sticky top-[calc(var(--sa-top)+4.25rem)] z-10 -mx-4 bg-background/90 px-4 pb-3 backdrop-blur-xl md:top-28">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-foreground/40" />
          <input
            ref={champ}
            type="search"
            enterKeyHint="search"
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            placeholder="Musique, playlist, verset, article, membre…"
            aria-label="Rechercher dans l'application"
            className="w-full rounded-full border border-border bg-card py-3.5 pl-12 pr-24 text-base outline-none focus:border-primary [&::-webkit-search-cancel-button]:hidden"
          />
          {saisie && (
            <button type="button" onClick={() => { setSaisie(""); champ.current?.focus(); }} 
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-3 py-1.5 text-xs font-semibold text-foreground/60 hover:bg-muted">
              Effacer
            </button>
          )}
        </label>
      </div>

      {!saisie.trim() && (
        <p className="px-3 pt-6 text-center text-sm text-foreground/50">
          Cherchez un titre de musique, une playlist, une prédication, un article, une rubrique ou un membre.
        </p>
      )}

      <div className="space-y-6 pt-2">
        <Groupe titre="Dans l'app" icone="rubrique" resultats={rubriques} onOuvrir={ouvrir} />
        {SOURCES.map((s) => (
          <Groupe key={s.entite} titre={s.groupe} icone={s.icone} resultats={contenus[s.entite] || []} onOuvrir={ouvrir} />
        ))}
      </div>

      {texte && enCours > 0 && (
        <p className="flex items-center justify-center gap-2 pt-6 text-sm text-foreground/50"><Loader2 className="h-4 w-4 animate-spin" /> Recherche…</p>
      )}
      {rien && <p className="pt-10 text-center text-sm text-foreground/55">Aucun résultat pour « {saisie.trim()} ».</p>}
    </div>
  );
}
