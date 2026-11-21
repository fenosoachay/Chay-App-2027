import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { uploadToBase44 } from "@/lib/upload";
import { ImagePlus, Send, Loader2, X, Users, Trash2, AlertTriangle, Search } from "lucide-react";
import { Image } from "@/components/ui/image";
import { useToast } from "@/components/ui/use-toast";
import PostCard from "@/components/community/PostCard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export default function Community() {
  const { toast } = useToast();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [selectedImages, setSelectedImages] = useState([]);
  const previewUrls = useRef(new Set());
  const [publishing, setPublishing] = useState(false);
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("actualites"); // "actualites" | "utilisateurs"
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingUser, setDeletingUser] = useState(false);
  // Admins : liste complète. Membres : recherche seulement (au moins 2 lettres), sans liste.
  const [recherche, setRecherche] = useState("");
  const estAdmin = user?.role === "admin";
  const sansAccents = (v) => String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const termes = sansAccents(recherche).trim();
  const membresAffiches = estAdmin
    ? users
    : termes.length < 2
      ? []
      : users.filter((m) => sansAccents([m.first_name, m.last_name].filter(Boolean).join(" ")).includes(termes)).slice(0, 20);

  const loadPosts = async () => {
    const p = await base44.entities.CommunityPost
      .list("-created_date", 50)
      .catch(() => []);
    setPosts(Array.isArray(p) ? p : []);
    setLoading(false);
  };


  const loadUsers = async () => {
    setUsersLoading(true);
    setUsersError("");
    try {
      const result = await base44.functions.invoke("listCommunityUsers", {});
      const list = result?.data?.users;
      if (!Array.isArray(list)) {
        throw new Error(result?.data?.error || "Réponse invalide du serveur.");
      }
      // Ordre alphabétique du prénom (accents et majuscules ignorés), puis du nom ; sans prénom : à la fin.
      const cle = (v) => String(v || "").trim();
      const parPrenom = (x, y) => {
        const a = cle(x.first_name), b = cle(y.first_name);
        if (!a !== !b) return a ? -1 : 1;
        return a.localeCompare(b, "fr", { sensitivity: "base" })
          || cle(x.last_name).localeCompare(cle(y.last_name), "fr", { sensitivity: "base" })
          || cle(x.email).localeCompare(cle(y.email), "fr");
      };
      setUsers([...list].sort(parPrenom));
    } catch (error) {
      setUsersError(error?.message || "Erreur inconnue.");
    } finally {
      setUsersLoading(false);
    }
  };

  // La suppression de compte reste une action réservée aux administrateurs.
  const confirmDeleteUser = async () => {
    if (!deleteTarget || deletingUser) return;
    setDeletingUser(true);
    try {
      await base44.entities.User.delete(deleteTarget.id);
      setUsers((prev) => prev.filter((m) => m.id !== deleteTarget.id));
      toast({ title: `Le compte de ${deleteTarget.first_name || "cet utilisateur"} a été supprimé.` });
      setDeleteTarget(null);
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setDeletingUser(false);
    }
  };

  useEffect(() => {
    (async () => {
      const me = await base44.auth.me().catch(() => null);
      setUser(me);
      await Promise.all([loadPosts(), loadUsers()]);
    })();
  }, []);

  useEffect(() => () => {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const handleImagePick = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const images = files.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      previewUrls.current.add(previewUrl);
      return { file, previewUrl };
    });
    setSelectedImages((current) => [...current, ...images]);
    e.target.value = "";
  };

  const removeSelectedImage = (previewUrl) => {
    URL.revokeObjectURL(previewUrl);
    previewUrls.current.delete(previewUrl);
    setSelectedImages((current) => current.filter((image) => image.previewUrl !== previewUrl));
  };

  const clearSelectedImages = () => {
    selectedImages.forEach(({ previewUrl }) => {
      URL.revokeObjectURL(previewUrl);
      previewUrls.current.delete(previewUrl);
    });
    setSelectedImages([]);
  };

  const publish = async () => {
    if (!draft.trim() && !selectedImages.length) return;
    setPublishing(true);
    try {
      const image_urls = await Promise.all(
        selectedImages.map(({ file }) => uploadToBase44(file)),
      );
      const result = await base44.functions.invoke("createCommunityPost", {
        text: draft.trim(),
        image_urls,
        image_url: image_urls[0] || null,
      });
      const notificationError = result?.data?.notification_error;

      setDraft("");
      clearSelectedImages();
      await loadPosts();
      toast({
        title: "Publication partagée",
        ...(notificationError
          ? {
              description:
                "Les notifications aux autres utilisateurs n'ont pas pu être envoyées.",
              variant: "destructive",
            }
          : {}),
      });
    } catch (e) {
      toast({
        title: "Erreur",
        description: e.message,
        variant: "destructive",
      });
    }
    setPublishing(false);
  };

  return (
    <div className="mx-auto max-w-3xl px-6 md:px-8 py-8 md:py-12">
      <header className="mb-8">
        <h1 className="display-fluid">
          <span className="brand-gradient-text">Communauté</span>
        </h1>
        <p className="mt-3 text-lg text-foreground/60">
          Partagez, encouragez et grandissez ensemble.
        </p>
      </header>

      {/* Onglets */}
      {/* Deux onglets de même largeur, texte sur une seule ligne quel que soit le téléphone (taille d'écran,
          taille du texte) : trop long, il est coupé avec « … » au lieu de passer à la ligne. */}
      <div className="grid w-full max-w-md grid-cols-2 rounded-full border border-border bg-card p-1 gap-1 mb-6">
        <button
          onClick={() => setActiveTab("actualites")}
          className={`flex min-w-0 items-center justify-center whitespace-nowrap px-3 py-2 rounded-full text-sm font-bold transition ${
            activeTab === "actualites"
              ? "bg-primary text-primary-foreground"
              : "text-foreground/60"
          }`}
        >
          <Send className="h-4 w-4 mr-1.5 shrink-0" /> <span className="truncate">Actualités</span>
        </button>
        <button
          onClick={() => setActiveTab("utilisateurs")}
          className={`flex min-w-0 items-center justify-center whitespace-nowrap px-3 py-2 rounded-full text-sm font-bold transition ${
            activeTab === "utilisateurs"
              ? "bg-primary text-primary-foreground"
              : "text-foreground/60"
          }`}
        >
          {estAdmin ? (
            <>
              <Users className="h-4 w-4 mr-1.5 shrink-0" />
              <span className="truncate">Utilisateurs ({usersLoading ? "…" : usersError ? "—" : users.length})</span>
            </>
          ) : (
            <>
              <Search className="h-4 w-4 mr-1.5 shrink-0" /> <span className="truncate">Chercher</span>
            </>
          )}
        </button>
      </div>

      {activeTab === "actualites" && (
        <>
          {/* Composer */}
          <div className="rounded-[1.5rem] border border-border bg-card p-5 mb-6">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Partagez quelque chose avec l'église…"
              rows={3}
              className="w-full bg-transparent outline-none resize-none text-foreground/85 placeholder:text-foreground/40 font-medium"
            />
            {selectedImages.length > 0 && (
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
                {selectedImages.map(({ file, previewUrl }) => (
                  <div key={previewUrl} className="relative aspect-square rounded-xl overflow-hidden border border-border">
                    <Image
                      src={previewUrl}
                      alt={file.name}
                      fittingType="fill"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeSelectedImage(previewUrl)}
                      disabled={publishing}
                      aria-label={`Retirer ${file.name}`}
                      className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/60 text-white grid place-items-center disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-foreground/60 hover:text-primary transition cursor-pointer">
                <ImagePlus className="h-4 w-4" /> Photos
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImagePick}
                  disabled={publishing}
                  className="hidden"
                />
              </label>
              <button
                onClick={publish}
                disabled={(!draft.trim() && !selectedImages.length) || publishing}
                className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-bold hover:scale-105 transition disabled:opacity-50"
              >
                {publishing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}{" "}
                Publier
              </button>
            </div>
          </div>

          {/* Feed */}
          <div className="space-y-5">
            {loading ? (
              <div className="space-y-5">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="rounded-[1.5rem] border border-border bg-card p-5 md:p-6 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 rounded-full bg-muted animate-pulse" />
                      <div className="space-y-2">
                        <div className="h-3 w-24 bg-muted rounded animate-pulse" />
                        <div className="h-2 w-16 bg-muted rounded animate-pulse" />
                      </div>
                    </div>
                    <div className="h-3 w-full bg-muted rounded animate-pulse" />
                    <div className="h-3 w-2/3 bg-muted rounded animate-pulse" />
                  </div>
                ))}
              </div>
            ) : posts.length ? (
              posts.map((p) => (
                <PostCard
                  key={p.id}
                  post={p}
                  currentUser={user}
                  onPostUpdated={(updated) =>
                    setPosts((items) => items.map((item) => item.id === updated.id ? updated : item))
                  }
                  onPostDeleted={(postId) =>
                    setPosts((items) => items.filter((item) => item.id !== postId))
                  }
                />
              ))
            ) : (
              <p className="text-center text-foreground/50 py-12">
                Aucune publication pour le moment. Soyez le premier à partager !
              </p>
            )}
          </div>
        </>
      )}

      {activeTab === "utilisateurs" && (
        <div className="space-y-3">
          {!estAdmin && (
            <label className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2.5">
              <Search className="h-4 w-4 shrink-0 text-foreground/40" aria-hidden="true" />
              <input
                type="search"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Chercher un membre…"
                aria-label="Chercher un membre"
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
            </label>
          )}
          {!estAdmin && !usersLoading && !usersError && termes.length < 2 ? (
            <p className="text-center text-foreground/50 py-8">Tapez au moins 2 lettres du prénom ou du nom.</p>
          ) : usersLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : usersError ? (
            <p role="alert" className="text-center text-foreground/50 py-12">
              Impossible de charger les utilisateurs : {usersError}{" "}
              <button
                type="button"
                onClick={loadUsers}
                className="ml-1 text-primary underline underline-offset-2"
              >
                Réessayer
              </button>
            </p>
          ) : membresAffiches.length === 0 ? (
            <p className="text-center text-foreground/50 py-12">Aucun membre trouvé.</p>
          ) : (
            membresAffiches.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                <Link
                  to={`/profile/${m.id}`}
                  className="flex items-center gap-3 flex-1 min-w-0"
                >
                  <div className="h-10 w-10 rounded-full bg-muted overflow-hidden shrink-0">
                    {m.profile_photo_url ? (
                      <img
                        src={m.profile_photo_url}
                        alt={m.first_name || "Utilisateur"}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full grid place-items-center text-foreground/40 text-sm font-bold">
                        {(m.first_name || "?")[0]}
                      </div>
                    )}
                  </div>
                  {/* Seulement le nom (ni « Utilisateur » ni « Administrateur »). */}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate hover:underline">
                      {[m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || "Membre"}
                    </div>
                  </div>
                </Link>
                {user?.role === "admin" && m.id !== user.id && (
                  <div className="shrink-0 flex items-center gap-1.5">
                    <button
                      onClick={() => setDeleteTarget(m)}
                      title="Supprimer ce compte"
                      className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 text-destructive hover:bg-destructive hover:text-white px-3 py-1.5 text-xs font-bold transition"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Supprimer
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Confirmation de suppression du compte */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Supprimer ce compte ?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-foreground/75">
            Voulez-vous vraiment éjecter{" "}
            <strong>
              {[deleteTarget?.first_name, deleteTarget?.last_name].filter(Boolean).join(" ") ||
                deleteTarget?.email ||
                "cet utilisateur"}
            </strong>{" "}
            ? Cette action est irrévocable et la personne ne peut plus revenir dans
            l'application, sauf avec une autre adresse e-mail.
          </p>
          <DialogFooter>
            <button
              onClick={() => setDeleteTarget(null)}
              disabled={deletingUser}
              className="flex-1 rounded-full border border-border py-2.5 text-sm font-bold hover:bg-muted disabled:opacity-50"
            >
              Non, annuler
            </button>
            <button
              onClick={confirmDeleteUser}
              disabled={deletingUser}
              className="flex-1 rounded-full bg-destructive text-white py-2.5 text-sm font-bold hover:bg-destructive/90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {deletingUser ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Oui, supprimer
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
