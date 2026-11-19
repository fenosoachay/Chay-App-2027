import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Lock, Unlock } from "lucide-react";
import GrillePlaylists from "@/components/media/GrillePlaylists";
import ListeTriable from "@/components/media/ListeTriable";
import PlaylistCover from "@/components/media/PlaylistCover";
import { useBackHandler } from "@/hooks/useBackHandler";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import CadenasOrdre from "@/components/media/CadenasOrdre";
import { arbrePlaylists, contenusDe, idsSousPlaylists, liensDe } from "@/lib/playlistsArbre";
import Description from "@/components/media/Description";

/**
 * Navigation membre d'une section (YouTube, Articles, Galerie) : Section > Playlist > Sous-playlist > contenus,
 * au style de Musique. `children` = affichage d'avant, pour les contenus « Non classés » (toujours visibles).
 *  - renderContenus(sousPlaylist, contenus) : contenus d'une sous-playlist, dans l'ordre choisi par l'admin ;
 *  - onChargerManquants(ids) : charge les contenus d'une sous-playlist absents des listes déjà chargées ;
 *  - cibleId : contenu visé par un lien / une notification -> sa sous-playlist s'ouvre ;
 *  - onReorderLiens(sousPlaylistId, contenus) : ordre des contenus (admin, cadenas ouvert) ;
 *  - avantGrille : affiché en haut de la section seulement (pas dans une playlist), ex. « Fond d'écran » en Galerie.
 */
export default function NavigationPlaylists({
  categorie, playlists, playlistTracks, contenus, nbNonClasses, isAdmin,
  renderContenus, onChargerManquants, cibleId, onReorderLiens, vignette, children, avantGrille = null,
}) {
  // Ordre des playlists et sous-playlists (admin, 1.3.9) : Playlist.order, appliqué tout de suite ici.
  const [ordresLocaux, setOrdresLocaux] = useState(() => new Map());
  const avecOrdres = useMemo(
    () => (playlists || []).map((p) => (ordresLocaux.has(p.id) ? { ...p, order: ordresLocaux.get(p.id) } : p)),
    [playlists, ordresLocaux]
  );
  const arbre = useMemo(() => arbrePlaylists(avecOrdres, categorie), [avecOrdres, categorie]);
  const [parent, setParent] = useState(null);
  const [sous, setSous] = useState(null);
  const [verrou, setVerrou] = useState(true);
  const [verrouPl, setVerrouPl] = useState(true);
  const { toast } = useToast();
  const reordonnerPlaylists = async (next) => {
    setOrdresLocaux((m) => { const n = new Map(m); next.forEach((p, i) => n.set(p.id, i)); return n; });
    const res = await Promise.all(next.map((p, i) => (p.order === i ? true : base44.entities.Playlist.update(p.id, { order: i }).then(() => true, () => false))));
    if (res.includes(false)) toast({ title: "Ordre non enregistré", description: "Réessayez.", variant: "destructive" });
  };
  const cadenasPl = (n, libelle) => (isAdmin && n > 1 ? (
    <div className="mb-3 flex justify-end">
      <CadenasOrdre verrouille={verrouPl} onBascule={() => setVerrouPl((v) => !v)} libelle={libelle} />
    </div>
  ) : null);

  // Contenu visé : on ouvre sa sous-playlist (et sa playlist).
  useEffect(() => {
    if (!cibleId) return;
    const valides = idsSousPlaylists(arbre);
    const racines = new Set(arbre.map((p) => p.id));
    const lien = (playlistTracks || []).find((t) => t.track_id === cibleId && valides.has(t.playlist_id))
      || (playlistTracks || []).find((t) => t.track_id === cibleId && racines.has(t.playlist_id));
    if (!lien) return;
    if (racines.has(lien.playlist_id)) {
      // Contenu rangé directement dans une playlist de 1er niveau (sans sous-playlist).
      setParent(arbre.find((x) => x.id === lien.playlist_id) || null);
      setSous(null);
      return;
    }
    const p = arbre.find((x) => x.sous.some((s) => s.id === lien.playlist_id));
    setParent(p || null);
    setSous(p?.sous.find((s) => s.id === lien.playlist_id) || null);
  }, [cibleId, arbre, playlistTracks]);

  const contenusSous = useMemo(
    () => (sous ? contenusDe(sous.id, playlistTracks, contenus) : []),
    [sous, playlistTracks, contenus]
  );

  // Contenus rangés DIRECTEMENT dans la playlist ouverte (playlist de 1er niveau, sans passer par une sous-playlist).
  const contenusParent = useMemo(
    () => (parent ? contenusDe(parent.id, playlistTracks, contenus) : []),
    [parent, playlistTracks, contenus]
  );

  // Contenus pas encore chargés (listes paginées) : chargés par leur id (sous-playlist ouverte, sinon playlist ouverte).
  useEffect(() => {
    const ouverte = sous || parent;
    if (!ouverte) return;
    const connus = new Set((contenus || []).map((c) => c.id));
    const manquants = liensDe(ouverte.id, playlistTracks).map((t) => t.track_id).filter((id) => !connus.has(id));
    if (manquants.length) onChargerManquants?.(manquants);
  }, [sous, parent, playlistTracks]); // eslint-disable-line react-hooks/exhaustive-deps

  const retour = () => {
    if (sous) setSous(null);
    else setParent(null);
  };
  // Bouton retour d'Android : une entrée d'historique par niveau ouvert (sous-playlist -> playlist -> section).
  useBackHandler(Boolean(parent), () => { setSous(null); setParent(null); });
  useBackHandler(Boolean(sous), () => setSous(null));

  const enTete = (titre, description) => (
    <>
    <div className="flex items-center gap-3 mb-5">
      <button
        type="button"
        onClick={retour}
        aria-label="Retour"
        className="h-9 w-9 grid place-items-center rounded-full border border-border hover:bg-muted"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <h3 className="font-display font-extrabold text-2xl truncate flex-1">{titre}</h3>
      {isAdmin && (sous ? contenusSous.length > 1 : contenusParent.length > 1) && (
        <button
          type="button"
          onClick={() => setVerrou((v) => !v)}
          aria-pressed={!verrou}
          aria-label={verrou ? "Déverrouiller pour réorganiser" : "Verrouiller l'ordre"}
          className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition ${
            verrou ? "border-border bg-card text-muted-foreground hover:bg-muted" : "border-primary bg-primary/10 text-primary"
          }`}
        >
          {verrou ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
        </button>
      )}
    </div>
    <Description texte={description} className="-mt-2 mb-5" />
    </>
  );

  if (sous) {
    return (
      <div>
        {enTete(sous.name, sous.description)}
        {!contenusSous.length ? (
          <p className="text-foreground/50 text-sm">Aucun contenu dans cette sous-playlist pour le moment.</p>
        ) : isAdmin && !verrou ? (
          <ListeTriable
            id={`contenus-${sous.id}`}
            items={contenusSous}
            onReorder={(next) => onReorderLiens?.(sous.id, next)}
            renderRow={(c) => (
              <>
                <PlaylistCover playlist={{ cover_url: vignette?.(c), name: c.title }} className="h-10 w-10 shrink-0 rounded-[10px]" />
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{c.title || "Sans titre"}</span>
              </>
            )}
          />
        ) : (
          renderContenus(sous, contenusSous)
        )}
      </div>
    );
  }

  if (parent) {
    const sp = arbre.find((p) => p.id === parent.id)?.sous || [];
    return (
      <div>
        {enTete(parent.name, parent.description)}
        {sp.length > 0 && (
          <>
            {cadenasPl(sp.length, "les sous-playlists")}
            <GrillePlaylists id={`sous-${parent.id}`} items={sp} onOuvrir={setSous} reorganiser={isAdmin && !verrouPl} onReorder={reordonnerPlaylists} />
          </>
        )}
        {contenusParent.length > 0 && (
          <div className={sp.length ? "mt-8" : ""}>
            {isAdmin && !verrou ? (
              <ListeTriable
                id={`contenus-${parent.id}`}
                items={contenusParent}
                onReorder={(next) => onReorderLiens?.(parent.id, next)}
                renderRow={(c) => (
                  <>
                    <PlaylistCover playlist={{ cover_url: vignette?.(c), name: c.title }} className="h-10 w-10 shrink-0 rounded-[10px]" />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold">{c.title || "Sans titre"}</span>
                  </>
                )}
              />
            ) : (
              renderContenus(parent, contenusParent)
            )}
          </div>
        )}
        {!sp.length && !contenusParent.length && (
          <p className="text-foreground/50 text-sm">Aucun contenu dans cette playlist pour le moment.</p>
        )}
      </div>
    );
  }

  // Aucune playlist encore : l'affichage d'avant, inchangé.
  if (!arbre.length) return <>{avantGrille}{children}</>;

  return (
    <div>
      {avantGrille}
      {cadenasPl(arbre.length, "les playlists")}
      <GrillePlaylists id={`playlists-${categorie}`} items={arbre} onOuvrir={setParent} reorganiser={isAdmin && !verrouPl} onReorder={reordonnerPlaylists} />
      {nbNonClasses > 0 && (
        <div className="mt-8">
          <h3 className="font-display font-extrabold text-lg mb-3">Non classés</h3>
          {children}
        </div>
      )}
    </div>
  );
}
