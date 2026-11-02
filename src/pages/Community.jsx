import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { uploadToBase44 } from "@/lib/upload";
import { ImagePlus, Send, Loader2, X, Users, UserMinus, AlertTriangle } from "lucide-react";
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
  const [activeTab, setActiveTab] = useState("actualites"); // "actualites" | "membres"
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState("");
  const [ejectTarget, setEjectTarget] = useState(null);
  const [ejecting, setEjecting] = useState(false);

  const loadPosts = async () => {
    const p = await base44.entities.CommunityPost
      .list("-created_date", 50)
      .catch(() => []);
    setPosts(Array.isArray(p) ? p : []);
    setLoading(false);
  };


  const loadMembers = async () => {
    setMembersLoading(true);
    setMembersError("");
    try {
      const result = await base44.functions.invoke("listCommunityMembers", {});
      const list = result?.data?.members;
      if (!Array.isArray(list)) {
        throw new Error(result?.data?.error || "Réponse invalide du serveur.");
      }
      setMembers(list);
    } catch (error) {
      setMembersError(error?.message || "Erreur inconnue.");
    } finally {
      setMembersLoading(false);
    }
  };

  const toggleMembre = async (targetUser, currentlyMembre) => {
    if (!user || user.role !== "admin") return;
    try {
      await base44.entities.User.update(targetUser.id, {
        is_membre: !currentlyMembre,
      });
      setMembers((prev) =>
        prev.map((m) =>
          m.id === targetUser.id ? { ...m, is_membre: !currentlyMembre } : m
        )
      );
      toast({ title: currentlyMembre ? "Retiré du membre" : "Ajouté comme membre" });
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  // Éjection définitive d'un membre par un administrateur : supprime le
  // compte (mêmes conséquences que l'auto-suppression dans « Mon compte »).
  const confirmEject = async () => {
    if (!ejectTarget || ejecting) return;
    setEjecting(true);
    try {
      await base44.entities.User.delete(ejectTarget.id);
      setMembers((prev) => prev.filter((m) => m.id !== ejectTarget.id));
      toast({ title: `${ejectTarget.first_name || "Membre"} a été éjecté(e) de l'application.` });
      setEjectTarget(null);
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setEjecting(false);
    }
  };

  useEffect(() => {
    (async () => {
      const me = await base44.auth.me().catch(() => null);
      setUser(me);
      await Promise.all([loadPosts(), loadMembers()]);
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
                "Les notifications aux autres membres n'ont pas pu être envoyées.",
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
      <div className="inline-flex rounded-full border border-border bg-card p-1 gap-1 mb-6">
        <button
          onClick={() => setActiveTab("actualites")}
          className={`inline-flex items-center px-5 py-2 rounded-full text-sm font-bold transition ${
            activeTab === "actualites"
              ? "bg-primary text-primary-foreground"
              : "text-foreground/60"
          }`}
        >
          <Send className="h-4 w-4 mr-1.5" /> Actualités
        </button>
        <button
          onClick={() => setActiveTab("membres")}
          className={`inline-flex items-center px-5 py-2 rounded-full text-sm font-bold transition ${
            activeTab === "membres"
              ? "bg-primary text-primary-foreground"
              : "text-foreground/60"
          }`}
        >
          <Users className="h-4 w-4 mr-1.5" /> Membres (
          {membersLoading ? "…" : membersError ? "—" : members.length})
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

      {activeTab === "membres" && (
        <div className="space-y-3">
          {membersLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : membersError ? (
            <p role="alert" className="text-center text-foreground/50 py-12">
              Impossible de charger les membres : {membersError}{" "}
              <button
                type="button"
                onClick={loadMembers}
                className="ml-1 text-primary underline underline-offset-2"
              >
                Réessayer
              </button>
            </p>
          ) : members.length === 0 ? (
            <p className="text-center text-foreground/50 py-12">Aucun membre trouvé.</p>
          ) : (
            members.map((m) => (
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
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate hover:underline">
                      {[m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || "Utilisateur"}
                    </div>
                    <div className="text-xs text-foreground/55">
                      {m.role === "admin" ? "Administrateur" : "Utilisateur"}
                    </div>
                  </div>
                </Link>
                {user?.role === "admin" && m.id !== user.id && (
                  <div className="shrink-0 flex items-center gap-1.5">
                    <button
                      onClick={() => toggleMembre(m, m.is_membre)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                        m.is_membre
                          ? "bg-emerald-600 text-white hover:bg-emerald-700"
                          : "bg-muted text-foreground/60 hover:bg-border"
                      }`}
                    >
                      {m.is_membre ? "✓ Membre" : "Non-membre"}
                    </button>
                    <button
                      onClick={() => setEjectTarget(m)}
                      title="Éjecter ce membre"
                      className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 text-destructive hover:bg-destructive hover:text-white px-3 py-1.5 text-xs font-bold transition"
                    >
                      <UserMinus className="h-3.5 w-3.5" /> Éjecter
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Confirmation d'éjection définitive d'un membre */}
      <Dialog open={Boolean(ejectTarget)} onOpenChange={(v) => !v && setEjectTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Éjecter ce membre ?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-foreground/75">
            Voulez-vous vraiment éjecter{" "}
            <strong>
              {[ejectTarget?.first_name, ejectTarget?.last_name].filter(Boolean).join(" ") ||
                ejectTarget?.email ||
                "ce membre"}
            </strong>{" "}
            ? Cette action est irrévocable et la personne ne peut plus revenir dans
            l'application, sauf avec une autre adresse e-mail.
          </p>
          <DialogFooter>
            <button
              onClick={() => setEjectTarget(null)}
              disabled={ejecting}
              className="flex-1 rounded-full border border-border py-2.5 text-sm font-bold hover:bg-muted disabled:opacity-50"
            >
              Non, annuler
            </button>
            <button
              onClick={confirmEject}
              disabled={ejecting}
              className="flex-1 rounded-full bg-destructive text-white py-2.5 text-sm font-bold hover:bg-destructive/90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {ejecting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Oui, éjecter
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
