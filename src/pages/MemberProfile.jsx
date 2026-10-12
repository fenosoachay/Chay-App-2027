import React, { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { findOrCreateDirect } from "@/lib/conversations";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useBackHandler } from "@/hooks/useBackHandler";
import useKeyboardShortcuts from "@/hooks/useKeyboardShortcuts";
import { Loader2, Pencil, UserX, X, MessageCircle } from "lucide-react";
import PostCard from "@/components/community/PostCard";

// Recherche tolérante : un membre éjecté/supprimé n'existe plus, la page doit
// afficher un message clair plutôt qu'une erreur ou un écran vide.
async function fetchMember(userId) {
  const list = await base44.entities.User
    .filter({ id: userId }, "-created_date", 1)
    .catch(() => []);
  const user = Array.isArray(list) && list.length ? list[0] : null;
  // Les non-administrateurs ne peuvent pas lire l'entité User : on utilise le
  // profil public du membre (nom, photo, couverture, bio).
  const profiles = await base44.entities.MemberProfile
    .filter({ created_by_id: userId }, "-created_date", 1)
    .catch(() => []);
  const p = Array.isArray(profiles) ? profiles[0] : null;
  // Le profil public (MemberProfile) est la source commune avec la communauté
  // et les publications : on le fusionne pour que photo/couverture/bio soient
  // identiques partout, même quand le compte User est lisible.
  if (user) {
    return {
      ...user,
      profile_photo_url: p?.avatar_url || user.profile_photo_url,
      cover_photo_url: p?.cover_url || user.cover_photo_url,
      profile_bio: p?.bio || user.profile_bio,
    };
  }
  if (p) {
    return {
      id: userId,
      first_name: p.display_name,
      profile_photo_url: p.avatar_url,
      cover_photo_url: p.cover_url,
      profile_bio: p.bio,
    };
  }
  // Pas encore de profil public (membre jamais reconnecté depuis la mise à jour) :
  // on retrouve son nom grâce à ses publications, commentaires ou messages.
  const [posts, comments, messages] = await Promise.all([
    base44.entities.CommunityPost.filter({ created_by_id: userId }, "-created_date", 1).catch(() => []),
    base44.entities.Comment.filter({ created_by_id: userId }, "-created_date", 1).catch(() => []),
    base44.entities.Message.filter({ sender_id: userId }, "-created_date", 1).catch(() => []),
  ]);
  const name =
    posts?.[0]?.author_name || comments?.[0]?.author_name || messages?.[0]?.sender_name;
  if (!name) return null;
  return { id: userId, first_name: name };
}

export default function MemberProfile() {
  const { userId } = useParams();
  const { user: currentUser } = useAuth();
  const [member, setMember] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null); // "cover" | "avatar" | null
  const [openingChat, setOpeningChat] = useState(false);
  const navigate = useNavigate();

  const sendMessage = async () => {
    if (openingChat) return;
    setOpeningChat(true);
    const id = await findOrCreateDirect(currentUser, userId).catch(() => null);
    setOpeningChat(false);
    if (id) navigate(`/messages?c=${id}`);
  };
  useBackHandler(Boolean(lightbox), () => setLightbox(null));
  useKeyboardShortcuts(Boolean(lightbox), { Escape: () => setLightbox(null) });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setNotFound(false);
      const m = await fetchMember(userId);
      if (cancelled) return;
      if (!m) {
        setNotFound(true);
        setMember(null);
        setLoading(false);
        setPostsLoading(false);
        return;
      }
      setMember(m);
      setLoading(false);
      setPostsLoading(true);
      const p = await base44.entities.CommunityPost
        .filter({ created_by_id: userId }, "-created_date", 50)
        .catch(() => []);
      if (!cancelled) {
        setPosts(Array.isArray(p) ? p : []);
        setPostsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-lg px-6 py-20 text-center">
        <UserX className="h-10 w-10 text-foreground/30 mx-auto mb-4" />
        <h1 className="text-xl font-bold mb-2">Membre introuvable</h1>
        <p className="text-foreground/60">
          Ce profil n'existe plus. Le compte a peut-être été supprimé.
        </p>
        <Link
          to="/community"
          className="inline-flex mt-6 items-center rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-bold"
        >
          Retour à la communauté
        </Link>
      </div>
    );
  }

  const displayName =
    [member.first_name, member.last_name].filter(Boolean).join(" ") ||
    member.email ||
    "Membre";
  const initial = (member.first_name || member.email || "?")[0]?.toUpperCase();
  const isOwnProfile = currentUser?.id === member.id;

  return (
    <div className="mx-auto max-w-2xl pb-12">
      {/* Photo de couverture */}
      <div
        className={`relative h-40 md:h-56 w-full bg-muted ${
          member.cover_photo_url ? "cursor-zoom-in" : ""
        }`}
        onClick={() => member.cover_photo_url && setLightbox("cover")}
      >
        {member.cover_photo_url ? (
          <img
            src={member.cover_photo_url}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full brand-gradient opacity-30" />
        )}
      </div>

      <div className="px-6">
        {/* Avatar chevauchant la couverture, façon profil "réseau social".
            z-[5] : garanti au-dessus de la photo de couverture (qui crée son
            propre contexte d'empilement via transform/filter), même si un
            thème ou une animation ajoute un stacking context intermédiaire. */}
        <div className="-mt-12 relative z-[5] flex justify-center">
          <button
            type="button"
            onClick={() => member.profile_photo_url && setLightbox("avatar")}
            className={`h-24 w-24 rounded-full border-4 border-background overflow-hidden bg-card brand-gradient grid place-items-center text-white text-3xl font-bold shrink-0 shadow-lg ${
              member.profile_photo_url ? "cursor-zoom-in" : "cursor-default"
            }`}
            aria-label="Photo de profil"
          >
            {member.profile_photo_url ? (
              <img
                src={member.profile_photo_url}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              initial
            )}
          </button>

          {isOwnProfile && (
            <Link
              to="/settings"
              className="absolute right-0 top-14 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-bold hover:bg-muted transition"
            >
              <Pencil className="h-3.5 w-3.5" /> Modifier mon profil
            </Link>
          )}
        </div>

        <div className="text-center">
        <h1 className="mt-3 text-xl font-bold">{displayName}</h1>
        {member.role === "admin" && (
          <span className="mt-1 inline-block text-xs font-bold text-primary">
            Administrateur
          </span>
        )}

        {currentUser && !isOwnProfile && (
          <button
            type="button"
            onClick={sendMessage}
            disabled={openingChat}
            className="mt-4 inline-flex items-center gap-2 rounded-full brand-gradient px-5 py-2.5 text-sm font-bold text-white transition hover:scale-105 active:scale-95 disabled:opacity-60"
          >
            {openingChat ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
            Envoyer un message
          </button>
        )}

        {member.profile_bio && (
          <p className="mt-3 mx-auto max-w-xl text-sm text-foreground/75 whitespace-pre-wrap text-center">
            {member.profile_bio}
          </p>
        )}
        </div>

        {/* Publications de ce membre dans Actualités */}
        <div className="mt-8 space-y-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-foreground/50">
            Publications
          </h2>
          {postsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-foreground/40" />
            </div>
          ) : posts.length === 0 ? (
            <p className="text-sm text-foreground/50 py-4">
              Aucune publication pour le moment.
            </p>
          ) : (
            posts.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                currentUser={currentUser}
                onPostUpdated={(updated) =>
                  setPosts((items) => items.map((item) => item.id === updated.id ? updated : item))
                }
                onPostDeleted={(postId) =>
                  setPosts((items) => items.filter((item) => item.id !== postId))
                }
              />
            ))
          )}
        </div>
      </div>

      {/* Visionneuse plein écran couverture / avatar */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setLightbox(null);
            }}
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white grid place-items-center transition-all shadow-lg border border-white/20 z-10"
            aria-label="Fermer"
          >
            <X className="h-6 w-6" />
          </button>
          <img
            src={
              lightbox === "cover"
                ? member.cover_photo_url
                : member.profile_photo_url
            }
            alt=""
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}