import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, GripVertical, Lock, Search, Unlock } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Image } from "@/components/ui/image";
import ArticleCard from "@/components/media/ArticleCard";
import RadioPlayer from "@/components/radio/RadioPlayer";
import PlaylistCategoryView from "@/components/media/PlaylistCategoryView";
import YouTubeCategoryView from "@/components/media/YouTubeCategoryView";
import FavoritesView from "@/components/media/FavoritesView";
import GalleryViewer from "@/components/media/GalleryViewer";
import { useBackHandler } from "@/hooks/useBackHandler";
import { useAuth } from "@/lib/AuthContext";
import { YOUTUBE_SECTIONS, GALLERY_SECTIONS, normalizeSection } from "@/lib/mediaConstants";

const TITLES = {
  radio: "Radio",
  music: "Musique",
  sermons: "Prédication",
  films: "Films",
  youtube: "YouTube",
  articles: "Articles",
  gallery: "Galerie",
  playlist: "Votre Playlist",
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

// Copie locale du hook de réorganisation par glisser-déposer (même comportement
// que le cadenas des favoris musicaux de FavoritesView.jsx — fichier volontairement
// non modifié). Utilisé uniquement par la grille des articles, pour les admins.
function useDragSort(items, onReorder) {
  const listRef = useRef(null);
  const dragIndex = useRef(null);

  const finishDrag = useCallback((clientY) => {
    const container = listRef.current;
    const from = dragIndex.current;
    if (!container || from === null) return;

    const children = [...container.children];
    let to = children.length - 1;
    for (let i = 0; i < children.length; i += 1) {
      const rect = children[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        to = i;
        break;
      }
    }
    children.forEach((child) => child.classList.remove("opacity-50", "scale-[0.98]"));
    dragIndex.current = null;
    if (from !== to && to >= 0 && to < items.length) {
      const next = [...items];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      onReorder(next);
    }
  }, [items, onReorder]);

  const onMouseDown = (index) => (event) => {
    event.preventDefault();
    dragIndex.current = index;
    listRef.current?.children[index]?.classList.add("opacity-50", "scale-[0.98]");
    const onUp = (upEvent) => {
      window.removeEventListener("mouseup", onUp);
      finishDrag(upEvent.clientY);
    };
    window.addEventListener("mouseup", onUp);
  };

  const onTouchStart = (index) => () => {
    dragIndex.current = index;
    listRef.current?.children[index]?.classList.add("opacity-50", "scale-[0.98]");
    const onMove = (moveEvent) => moveEvent.preventDefault();
    const onEnd = (endEvent) => {
      listRef.current?.removeEventListener("touchmove", onMove);
      listRef.current?.removeEventListener("touchend", onEnd);
      finishDrag(endEvent.changedTouches[0].clientY);
    };
    listRef.current?.addEventListener("touchmove", onMove, { passive: false });
    listRef.current?.addEventListener("touchend", onEnd, { once: true });
  };

  return { listRef, onMouseDown, onTouchStart };
}

// Grille des articles avec cadenas de réorganisation réservé aux admins :
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
        .sort((a, b) => (a.order ?? 99999) - (b.order ?? 99999)
          || new Date(b.created_date || 0) - new Date(a.created_date || 0)),
    [orderedArticles, q]
  );

  const canDrag = isAdmin && !locked && fArticles.length > 1;

  const handleReorder = useCallback((nextVisible) => {
    const orderById = new Map(nextVisible.map((a, index) => [a.id, index]));
    setOrderedArticles((current) => current.map((a) =>
      orderById.has(a.id) ? { ...a, order: orderById.get(a.id) } : a
    ));
    onReorderArticles?.(nextVisible);
  }, [onReorderArticles]);

  const drag = useDragSort(fArticles, handleReorder);

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
      {fArticles.length ? (
        <div
          ref={canDrag ? drag.listRef : null}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {fArticles.map((a, index) => (
            <div key={a.id} className="relative">
              {canDrag && (
                <button
                  type="button"
                  aria-label={`Réorganiser ${a.title}`}
                  className="absolute left-2 top-2 z-10 cursor-grab touch-none rounded-full bg-background/90 p-1 shadow-sm text-foreground/60 hover:text-foreground"
                  onMouseDown={drag.onMouseDown(index)}
                  onTouchStart={drag.onTouchStart(index)}
                >
                  <GripVertical className="h-5 w-5" />
                </button>
              )}
              <ArticleCard article={a} />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-foreground/50 text-sm">Aucun article publié.</p>
      )}
      {searchParams.get("article") && !articles.some((article) => article.id === searchParams.get("article")) && (
        <p role="status" className="mt-4 text-sm text-foreground/60">
          Cet article n'est plus disponible.
        </p>
      )}
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
}) {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = user?.role === "admin";
  const { articles, youtube, gallery, playlist } = data;
  const targetVideoId = searchParams.get("video");
  const targetImageId = searchParams.get("image");
  const [ytSection, setYtSection] = useState(null);
  const [gallerySection, setGallerySection] = useState(null);
  const [galleryIdx, setGalleryIdx] = useState(null);
  const [orphanIdx, setOrphanIdx] = useState(null);

  const clearTarget = (key) => {
    const next = new URLSearchParams(searchParams);
    next.delete(key);
    setSearchParams(next, { replace: true });
  };

  // Retour imbriqué : depuis une section (Église/Mindset, Culte/Louange),
  // le retour va d'abord à la liste des sections, puis quitte la catégorie —
  // le bouton rond du titre et le bouton matériel suivent la même logique.
  const inSection = Boolean(gallerySection || ytSection);
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

  const handleBack = () => {
    if (inSection) backFromSection();
    else onBack();
  };

  // Une photo n'apparaît que dans SA section : celles dont le champ
  // `category` est vide (les photos publiées avant l'ajout des sections)
  // étaient donc visibles nulle part — on les regroupe sous « Non classées ».
  const sectionImages = gallery.filter(
    (g) => normalizeSection(g.category) === gallerySection
  );
  const uncategorizedImages = gallery.filter(
    (g) => !normalizeSection(g.category)
  );

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
      const sectionItems = gallery.filter(
        (image) => normalizeSection(image.category) === section
      );
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
      <div className="flex items-center gap-3 mb-5">
        <button onClick={handleBack} className="h-9 w-9 grid place-items-center rounded-full border border-border hover:bg-muted">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h2 className="font-display font-extrabold text-2xl">{TITLES[cat]}</h2>
      </div>

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
      )}

      {cat === "articles" && (
        <ArticlesGrid
          isAdmin={isAdmin}
          articles={articles}
          query={query}
          setQuery={setQuery}
          searchParams={searchParams}
          onReorderArticles={onReorderArticles}
        />
      )}

      {cat === "gallery" && (
        <div>
          {targetImageId && !gallery.some((image) => image.id === targetImageId) && (
            <p role="status" className="mb-4 text-sm text-foreground/60">
              Cette photo n'est plus disponible.
            </p>
          )}
          {!gallerySection ? (
            <>
              <div className="grid grid-cols-2 gap-4 md:gap-6 max-w-[13rem]">
                {GALLERY_SECTIONS.map((s) => (
                  <SectionTile
                    key={s.id}
                    item={s}
                    onClick={() => {
                      clearTarget("image");
                      setGallerySection(s.id);
                      setGalleryIdx(null);
                    }}
                  />
                ))}
              </div>

              {/* Photos publiées avant l'existence des sections : sans ce
                  bloc, elles n'étaient visibles dans AUCUNE section. */}
              {uncategorizedImages.length > 0 && (
                <div className="mt-8">
                  <div className="flex items-baseline justify-between gap-3 mb-3">
                    <h3 className="font-display font-extrabold text-lg">
                      Non classées
                    </h3>
                    <span className="text-xs text-foreground/50">
                      {uncategorizedImages.length} photo
                      {uncategorizedImages.length > 1 ? "s" : ""}
                    </span>
                  </div>
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
                </div>
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
                      {/* Au doigt, le zoom au survol reste « collé » après le
                          tap et la vignette saute à la fermeture : on le garde
                          donc sur bureau uniquement (md:). */}
                      <Image
                        src={g.image_url}
                        fittingType="fill"
                        className="w-full h-full object-cover md:group-hover:scale-105 transition-transform"
                      />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-foreground/50 text-sm">
                  Aucune image dans cette section.
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
      )}

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