import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Lock, Search, Smartphone, Unlock } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Image } from "@/components/ui/image";
import ArticleCard from "@/components/media/ArticleCard";
import RadioPlayer from "@/components/radio/RadioPlayer";
import PlaylistCategoryView from "@/components/media/PlaylistCategoryView";
import YouTubeCategoryView from "@/components/media/YouTubeCategoryView";
import FavoritesView from "@/components/media/FavoritesView";
import ActualiteChretienne from "@/components/media/ActualiteChretienne";
import FondsEcran from "@/components/media/FondsEcran";
import GalleryViewer from "@/components/media/GalleryViewer";
import ListeTriable from "@/components/media/ListeTriable";
import NavigationPlaylists from "@/components/media/NavigationPlaylists";
import ParolesCategoryView from "@/components/media/ParolesCategoryView";
import VersetCategoryView from "@/components/media/VersetCategoryView";
import { useLibellesMedia } from "@/hooks/useLibellesMedia";
import { arbrePlaylists, contenusNonRanges, playlistDe } from "@/lib/playlistsArbre";
import { hasOpenOverlay, useBackHandler } from "@/hooks/useBackHandler";
import { useAuth } from "@/lib/AuthContext";
import { YOUTUBE_SECTIONS, normalizeSection } from "@/lib/mediaConstants";
import { appliquerOrdre, cleGalerie } from "@/lib/ordreMedia";
import { enregistrerOrdreMedia, useOrdresMedia } from "@/hooks/useOrdreMedia";
import { useToast } from "@/components/ui/use-toast";
import BlocOrdonnable from "@/components/media/BlocOrdonnable";

const TITLES = {
  radio: "Radio",
  music: "Musique",
  sermons: "Prédication",
  films: "Films",
  youtube: "YouTube",
  articles: "Articles",
  gallery: "Galerie",
  playlist: "Votre Playlist",
  actualite: "Actualité chrétienne",
  fonds: "Fond d'écran",
  paroles: "Paroles",
  verset: "Verset",
};

function SearchBar({ query, setQuery, placeholder, className = "mb-5" }) {
  return (
    <div className={`flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 ${className}`}>
      <Search className="h-4 w-4 text-foreground/40" />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder || "Rechercher…"}
        className="bg-transparent outline-none text-sm font-medium flex-1"
      />
    </div>
  );
}

// Tuile de section au même gabarit que la grille Multimédia (CategoryGrid) :
// pastille carrée aspect-square + icône h-9/h-10 + libellé text-2xs/md:text-sm.
function SectionTile({ item, onClick }) {
  const Icon = item.icon;
  return (
    <button onClick={onClick} className="group flex flex-col items-center gap-2">
      <span
        className={`relative aspect-square w-full rounded-[1.5rem] bg-gradient-to-br ${item.tone} grid place-items-center text-white shadow-sm group-hover:-translate-y-1 group-hover:shadow-lg transition-all`}
      >
        <Icon className="h-9 w-9 md:h-10 md:w-10" />
      </span>
      <span className="text-2xs md:text-sm font-semibold text-foreground/70 text-center leading-tight whitespace-nowrap">
        {item.label}
      </span>
    </button>
  );
}

// Liste des articles avec cadenas de réorganisation réservé aux admins :
// verrouillé = ordre figé ; déverrouillé = glisser-déposer via la poignée,
// puis sauvegarde du nouvel ordre (champ `order` de l'entité Article).
// Pour les non-admins, le rendu est exactement celui d'avant (aucun cadenas).
function ArticlesGrid({
  isAdmin,
  articles,
  query,
  setQuery,
  searchParams,
  onReorderArticles,
  ordreFixe = false, // sous-playlist : ordre des liens, déjà appliqué
  afficherIndisponible = true,
}) {
  const [locked, setLocked] = useState(true);
  const [orderedArticles, setOrderedArticles] = useState([]);

  useEffect(() => {
    setOrderedArticles(articles);
  }, [articles]);

  const q = query.trim().toLowerCase();
  const match = (t) => (q ? (t || "").toLowerCase().includes(q) : true);
  // Ordre admin prioritaire (plus petit indice en premier), puis date de création.
  const fArticles = useMemo(
    () =>
      orderedArticles
        .filter((a) => match(a.title) || match(a.category))
        .sort((a, b) => (ordreFixe ? 0 : (a.order ?? 99999) - (b.order ?? 99999)
          || new Date(b.created_date || 0) - new Date(a.created_date || 0))),
    [orderedArticles, q, ordreFixe] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const canDrag = isAdmin && !locked && fArticles.length > 1;

  const handleReorder = useCallback((nextVisible) => {
    const orderById = new Map(nextVisible.map((a, index) => [a.id, index]));
    setOrderedArticles((current) => current.map((a) =>
      orderById.has(a.id) ? { ...a, order: orderById.get(a.id) } : a
    ));
    onReorderArticles?.(nextVisible);
  }, [onReorderArticles]);

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <SearchBar
          query={query}
          setQuery={setQuery}
          placeholder="Rechercher un article…"
          className="flex-1 mb-0"
        />
        {isAdmin && fArticles.length > 1 && (
          <button
            type="button"
            onClick={() => setLocked((value) => !value)}
            title={locked ? "Déverrouiller pour réorganiser" : "Verrouiller l’ordre"}
            aria-label={locked ? "Déverrouiller pour réorganiser" : "Verrouiller l’ordre"}
            aria-pressed={!locked}
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition ${
              locked
                ? "border-border bg-card text-muted-foreground hover:bg-muted"
                : "border-primary bg-primary/10 text-primary hover:bg-primary/20"
            }`}
          >
            {locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
          </button>
        )}
      </div>
      {fArticles.length && canDrag ? (
        // Même mécanisme que la réorganisation YouTube (@hello-pangea/dnd, poignée touch-none).
        <ListeTriable
          id="articles"
          items={fArticles}
          onReorder={handleReorder}
          renderRow={(a) => <span className="min-w-0 flex-1 truncate text-sm font-bold">{a.title}</span>}
        />
      ) : fArticles.length ? (
        <div className="space-y-2">
          {fArticles.map((a) => (
            <div key={a.id} className="flex min-w-0 items-center gap-2">
              <ArticleCard article={a} />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-foreground/50 text-sm">Aucun article publié.</p>
      )}
      {afficherIndisponible && searchParams.get("article") && !articles.some((article) => article.id === searchParams.get("article")) && (
        <p role="status" className="mt-4 text-sm text-foreground/60">
          Cet article n'est plus disponible.
        </p>
      )}
    </>
  );
}

/** Photos d'une sous-playlist : même grille et même visionneuse que les sections de la galerie. */
function GalerieSousPlaylist({ images, targetImageId, clearTarget, onItemUpdated, onItemDeleted }) {
  const [idx, setIdx] = useState(null);
  useEffect(() => {
    if (!targetImageId) return;
    const i = images.findIndex((g) => g.id === targetImageId);
    if (i >= 0) setIdx(i);
  }, [targetImageId, images]);
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {images.map((g, i) => (
          <button
            key={g.id}
            onClick={() => { clearTarget("image"); setIdx(i); }}
            className="block aspect-square overflow-hidden bg-muted group"
            aria-label={g.title || "Photo"}
          >
            <Image src={g.image_url} fittingType="fill" className="w-full h-full object-cover md:group-hover:scale-105 transition-transform" />
          </button>
        ))}
      </div>
      <GalleryViewer
        items={images}
        index={idx}
        onItemUpdated={onItemUpdated}
        onItemDeleted={onItemDeleted}
        onClose={() => { clearTarget("image"); setIdx(null); }}
      />
    </>
  );
}

export default function MediaCategory({
  cat, data, query, setQuery, onBack,
  currentTrack, isPlaying, play, playQueue, toggle,
  addToPlaylist, removeFromPlaylist, playPlaylistItem, isPinned,
  playlists = [], playlistTracks = [],
  onGalleryItemUpdated, onGalleryItemDeleted,
  onReorderFavoriteItems, onReorderFavoritePlaylists,
  onReorderArticles,
  onChargerContenus,
  onReorderLiens,
}) {
  const libelles = useLibellesMedia();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = user?.role === "admin";
  const { articles: tousArticles, youtube: tousYoutube, gallery: touteGalerie, playlist } = data;
  // Contenus rangés dans une sous-playlist : affichés dans leur sous-playlist ; l'affichage d'avant (sections
  // YouTube et Galerie, liste des articles) ne garde que les contenus « Non classés », toujours visibles.
  const nonRanges = (categorie, liste) => contenusNonRanges(liste, playlistTracks, arbrePlaylists(playlists, categorie));
  const youtube = useMemo(() => nonRanges("youtube", tousYoutube), [tousYoutube, playlists, playlistTracks]); // eslint-disable-line react-hooks/exhaustive-deps
  const articles = useMemo(() => nonRanges("articles", tousArticles), [tousArticles, playlists, playlistTracks]); // eslint-disable-line react-hooks/exhaustive-deps
  const gallery = useMemo(() => nonRanges("gallery", touteGalerie), [touteGalerie, playlists, playlistTracks]); // eslint-disable-line react-hooks/exhaustive-deps
  const nav = (categorie, contenus, nbNonClasses, cibleId, entite) => ({
    categorie, playlists, playlistTracks, contenus, nbNonClasses, cibleId, isAdmin,
    onChargerManquants: (ids) => onChargerContenus?.(entite, ids),
    onReorderLiens,
  });
  const targetVideoId = searchParams.get("video");
  const targetImageId = searchParams.get("image");
  const [ytSection, setYtSection] = useState(null);
  const [gallerySection, setGallerySection] = useState(null);
  const [galleryIdx, setGalleryIdx] = useState(null);
  const [orphanIdx, setOrphanIdx] = useState(null);
  // Galerie › Fond d'écran ouvert (le bouton retour du téléphone revient à la Galerie).
  const [fondsOuverts, setFondsOuverts] = useState(false);
  useBackHandler(fondsOuverts, () => setFondsOuverts(false));

  const clearTarget = (key) => {
    const next = new URLSearchParams(searchParams);
    next.delete(key);
    setSearchParams(next, { replace: true });
  };

  // Retour imbriqué : depuis une section (Église/Mindset, Culte/Louange),
  // le retour va d'abord à la liste des sections, puis quitte la catégorie —
  // le bouton rond du titre et le bouton matériel suivent la même logique.
  const backFromSection = () => {
    if (gallerySection) {
      clearTarget("image");
      setGallerySection(null);
      setGalleryIdx(null);
    } else if (ytSection) {
      clearTarget("video");
      setYtSection(null);
    }
  };
  // ⚠️ Ne PAS conditionner ce handler à `galleryIdx == null` : faire passer
  // `open` de true à false au moment où la photo s'ouvre déclencherait le
  // nettoyage du hook (history.back()) et refermerait la photo aussitôt.
  // Chaque superposition a sa propre entrée d'historique et la pile est
  // ordonnée par ouverture : le retour ferme d'abord la photo, puis la
  // section — sans garde.
  useBackHandler(Boolean(gallerySection), backFromSection);
  useBackHandler(orphanIdx !== null, () => {
    clearTarget("image");
    setOrphanIdx(null);
  });
  useBackHandler(Boolean(ytSection), () => {
    clearTarget("video");
    setYtSection(null);
  });

  // Bouton retour du titre : même chemin que le retour du téléphone — un niveau à la fois (sous-playlist,
  // playlist, section, Fond d'écran…), et seulement au dernier niveau, retour au Multimédia.
  const handleBack = () => {
    if (hasOpenOverlay()) window.history.back();
    else onBack();
  };

  // Photos sans playlist : apparaissent dans « Non classées ».
  // Photos avec playlist : affichées dans leur sous-playlist correspondante.
  // Ordre de l'admin (1.3.12, MediaOrder) : photos sans playlist (nouvelles en tête).
  const { toast } = useToast();
  const ordreDe = useOrdresMedia();
  // Arbre des playlists de la galerie (pour retrouver la playlist/sous-playlist d'une photo)
  const arbreGalerie = useMemo(() => arbrePlaylists(playlists, "gallery"), [playlists]);
  const photosDe = (section) => {
    if (section === null) {
      // Non classées : photos SANS AUCUNE playlist (ni racine, ni sous-playlist)
      return appliquerOrdre(
        gallery.filter((g) => !playlistDe(g.id, playlistTracks, arbreGalerie)),
        ordreDe(cleGalerie(null))
      );
    }
    // Section spécifique : photos avec playlist de cette section (racine OU sous-playlist)
    const ordre = ordreDe(cleGalerie(section));
    return appliquerOrdre(
      gallery.filter((g) => {
        const plId = playlistDe(g.id, playlistTracks, arbreGalerie);
        if (!plId) return false;
        // Trouver la playlist racine de ce lien
        const pl = (arbreGalerie || []).find((p) => p.id === plId || (p.sous || []).some((s) => s.id === plId));
        return pl && pl.id === section;
      }),
      ordre
    );
  };
  const reordonnerGalerie = (section) => (liste) => enregistrerOrdreMedia(cleGalerie(section), liste.map((g) => g.id))
    .catch((e) => toast({ title: "Ordre non enregistré", description: e.message, variant: "destructive" }));
  const sectionImages = photosDe(gallerySection);
  const uncategorizedImages = photosDe(null);

  useEffect(() => {
    if (!targetVideoId) return;
    const target = youtube.find((video) => video.id === targetVideoId);
    setYtSection(target?.section || "culte");
  }, [targetVideoId, youtube]);

  useEffect(() => {
    if (!targetImageId) return;
    const target = gallery.find((image) => image.id === targetImageId);
    if (!target) {
      setGallerySection(null);
      setGalleryIdx(null);
      setOrphanIdx(null);
      return;
    }

    const section = normalizeSection(target.category);
    if (section) {
      // Même ordre que l'affichage (ordre de l'admin) : l'indice ouvert est celui de la photo visée.
      const sectionItems = photosDe(section);
      setGallerySection(section);
      setGalleryIdx(sectionItems.findIndex((image) => image.id === targetImageId));
      setOrphanIdx(null);
    } else {
      setGallerySection(null);
      setGalleryIdx(null);
      setOrphanIdx(uncategorizedImages.findIndex((image) => image.id === targetImageId));
    }
  }, [targetImageId, gallery]);

  return (
    <div>
      {cat !== "paroles" && (
      <div className="flex items-center gap-3 mb-5">
        <button onClick={handleBack} className="h-9 w-9 grid place-items-center rounded-full border border-border hover:bg-muted">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="font-display font-extrabold text-2xl">{libelles[cat] || TITLES[cat]}</h2>
      </div>
      )}

      {cat === "radio" && <RadioPlayer />}

      {cat === "music" && (
        <PlaylistCategoryView
          category="music" kind="audio" favoriteCategory="music"
          playlists={playlists} playlistTracks={playlistTracks}
          currentTrack={currentTrack} isPlaying={isPlaying} playQueue={playQueue} toggle={toggle}
          isAdmin={isAdmin}
          onToggleFavorite={addToPlaylist} isFavorite={isPinned}
        />
      )}

      {cat === "sermons" && (
        <PlaylistCategoryView
          category="sermons" kind="audio" favoriteCategory="sermons"
          playlists={playlists} playlistTracks={playlistTracks}
          currentTrack={currentTrack} isPlaying={isPlaying} playQueue={playQueue} toggle={toggle}
          isAdmin={isAdmin}
          onToggleFavorite={addToPlaylist} isFavorite={isPinned}
        />
      )}

      {cat === "films" && (
        <PlaylistCategoryView
          category="films" kind="video" favoriteCategory="films"
          playlists={playlists} playlistTracks={playlistTracks}
          currentTrack={currentTrack} isPlaying={isPlaying} playQueue={playQueue} toggle={toggle}
          isAdmin={isAdmin}
          onToggleFavorite={addToPlaylist} isFavorite={isPinned}
        />
      )}

      {cat === "youtube" && (
        <NavigationPlaylists
          {...nav("youtube", tousYoutube, youtube.length, targetVideoId, "YouTubeVideo")}
          vignette={(v) => v.cover_url || v.thumbnail_url || `https://img.youtube.com/vi/${v.youtube_id}/mqdefault.jpg`}
          renderContenus={(sp, videos) => (
            // Même lecteur que les sections YouTube ; la sous-playlist sert de section (ordre, aléatoire).
            <YouTubeCategoryView
              section={`pl-${sp.id}`}
              libelle={sp.name}
              sansGestion
              youtube={videos.map((v) => ({ ...v, section: `pl-${sp.id}` }))}
              targetVideoId={targetVideoId}
            />
          )}
        >
        <div>
          {!ytSection ? (
            <div className="grid grid-cols-3 gap-4 md:gap-6 max-w-sm">
              {YOUTUBE_SECTIONS.map((s) => (
                <SectionTile
                  key={s.id}
                  item={s}
                  onClick={() => {
                    clearTarget("video");
                    setYtSection(s.id);
                  }}
                />
              ))}
            </div>
          ) : (
            <div>
              <button
                onClick={() => setYtSection(null)}
                className="inline-flex items-center gap-1 mb-4 text-sm font-bold text-primary hover:bg-primary/10 rounded-xl px-2 py-2"
              >
                <ChevronLeft className="h-5 w-5" /> YouTube
              </button>
              <YouTubeCategoryView
                section={ytSection}
                youtube={youtube}
                targetVideoId={targetVideoId}
              />
            </div>
          )}
        </div>
        </NavigationPlaylists>
      )}

      {cat === "articles" && (
        <NavigationPlaylists
          {...nav("articles", tousArticles, articles.length, searchParams.get("article"), "Article")}
          vignette={(a) => a.cover_url}
          renderContenus={(sp, liste) => (
            <ArticlesGrid
              isAdmin={false}
              articles={liste}
              query={query}
              setQuery={setQuery}
              searchParams={searchParams}
              ordreFixe
              afficherIndisponible={false}
            />
          )}
        >
        <ArticlesGrid
          isAdmin={isAdmin}
          articles={articles}
          query={query}
          setQuery={setQuery}
          searchParams={searchParams}
          onReorderArticles={onReorderArticles}
        />
        </NavigationPlaylists>
      )}

      {cat === "gallery" && fondsOuverts && (
        <div>
          <h3 className="font-display font-extrabold text-xl mb-4">Fond d'écran</h3>
          <FondsEcran />
        </div>
      )}

      {cat === "gallery" && !fondsOuverts && (
        <NavigationPlaylists
          {...nav("gallery", touteGalerie, gallery.length, targetImageId, "GalleryImage")}
          vignette={(g) => g.image_url}
          avantGrille={(
            // Fond d'écran : rangé dans la Galerie (n'est plus une section du Multimédia).
            <button
              type="button"
              onClick={() => setFondsOuverts(true)}
              className="mb-5 flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left hover:bg-muted"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#C18B33] to-[#FF57B2] text-white">
                <Smartphone className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 truncate font-bold">Fond d'écran</span>
              <ChevronRight className="h-5 w-5 shrink-0 text-foreground/40" aria-hidden="true" />
            </button>
          )}
          renderContenus={(sp, images) => (
            <GalerieSousPlaylist
              images={images}
              targetImageId={targetImageId}
              clearTarget={clearTarget}
              onItemUpdated={onGalleryItemUpdated}
              onItemDeleted={onGalleryItemDeleted}
            />
          )}
        >
        <div>
          {targetImageId && !gallery.some((image) => image.id === targetImageId) && (
            <p role="status" className="mb-4 text-sm text-foreground/60">
              Cette photo n'est plus disponible.
            </p>
          )}
          {!gallerySection ? (
            <>
              {uncategorizedImages.length > 0 && (
                <BlocOrdonnable
                  id="galerie-non-classees"
                  isAdmin={isAdmin}
                  items={uncategorizedImages}
                  onReorder={reordonnerGalerie(null)}
                  libelle="les photos non classées"
                  vignette={(g) => g.image_url}
                  titre={(g) => g.title}
                >
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {uncategorizedImages.map((g, i) => (
                      <button
                        key={g.id}
                        onClick={() => {
                          clearTarget("image");
                          setOrphanIdx(i);
                        }}
                        className="block aspect-square overflow-hidden bg-muted group rounded-xl"
                      >
                        <Image
                          src={g.image_url}
                          fittingType="fill"
                          className="w-full h-full object-cover md:group-hover:scale-105 transition-transform"
                        />
                      </button>
                    ))}
                  </div>
                  <GalleryViewer
                    items={uncategorizedImages}
                    index={orphanIdx}
                    onItemUpdated={onGalleryItemUpdated}
                    onItemDeleted={onGalleryItemDeleted}
                    onClose={() => {
                      clearTarget("image");
                      setOrphanIdx(null);
                    }}
                  />
                </BlocOrdonnable>
              )}
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  clearTarget("image");
                  setGallerySection(null);
                  setGalleryIdx(null);
                }}
                className="inline-flex items-center gap-1 mb-4 text-sm font-bold text-primary hover:bg-primary/10 rounded-xl px-2 py-2"
              >
                <ChevronLeft className="h-5 w-5" /> Galerie
              </button>

              {sectionImages.length ? (
                <BlocOrdonnable
                  id={`galerie-${gallerySection}`}
                  isAdmin={isAdmin}
                  items={sectionImages}
                  onReorder={reordonnerGalerie(gallerySection)}
                  libelle="les photos de cette section"
                  vignette={(g) => g.image_url}
                  titre={(g) => g.title}
                >
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {sectionImages.map((g, i) => (
                    <button
                      key={g.id}
                      onClick={() => {
                        clearTarget("image");
                        setGalleryIdx(i);
                      }}
                      className="block aspect-square overflow-hidden bg-muted group"
                    >
                      <Image
                        src={g.image_url}
                        fittingType="fill"
                        className="w-full h-full object-cover md:group-hover:scale-105 transition-transform"
                      />
                    </button>
                  ))}
                </div>
                </BlocOrdonnable>
              ) : (
                <p className="text-foreground/50 text-sm">
                  Aucune image dans cette playlist.
                </p>
              )}

              <GalleryViewer
                items={sectionImages}
                index={galleryIdx}
                onItemUpdated={onGalleryItemUpdated}
                onItemDeleted={onGalleryItemDeleted}
                onClose={() => {
                  clearTarget("image");
                  setGalleryIdx(null);
                }}
              />
            </>
          )}
        </div>
        </NavigationPlaylists>
      )}

      {cat === "actualite" && (
        <ActualiteChretienne cibleId={searchParams.get("news")} onFermerCible={() => clearTarget("news")} />
      )}

      {cat === "fonds" && <FondsEcran />}

      {cat === "paroles" && <ParolesCategoryView titre={libelles.paroles || TITLES.paroles} onBack={handleBack} />}

      {cat === "verset" && <VersetCategoryView category="verset" data={data} onBack={onBack} />}

      {cat === "playlist" && (
        <FavoritesView
          playlist={playlist}
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          playPlaylistItem={playPlaylistItem}
          removeFromPlaylist={removeFromPlaylist}
          onReorderItems={onReorderFavoriteItems}
          onReorderPlaylists={onReorderFavoritePlaylists}
        />
      )}
    </div>
  );
}