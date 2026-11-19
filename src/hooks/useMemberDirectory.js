import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";

// Annuaire partagé des profils publics (MemberProfile), indexé par id d'utilisateur.
// Une seule lecture + un seul abonnement temps réel pour toute l'application :
// quand un membre change son nom dans « Mon compte », son profil public est mis
// à jour et tous les noms affichés suivent automatiquement.
let byUser = {};
// Photo du COMPTE (users.profile_photo_url, via listCommunityUsers) : secours quand aucun profil public n'en a.
let photosComptes = {};
let loaded = false;
let loading = null;
let unsub = null;
const listeners = new Set();

const emit = () => listeners.forEach((fn) => fn(byUser));

const ingest = (list) => {
  const next = { ...byUser };
  list.forEach((p) => {
    if (!p?.created_by_id) return;
    const kept = next[p.created_by_id];
    // Plusieurs profils pour un même membre : on garde le plus ancien (stable)…
    const garde = !kept || kept.id === p.id || String(p.created_date) < String(kept.created_date) ? p : kept;
    const autre = garde === p ? kept : p;
    // … mais sans perdre la photo : si le profil gardé n'en a pas, on prend celle de l'autre profil.
    next[p.created_by_id] = !garde.avatar_url && autre?.avatar_url ? { ...garde, avatar_url: autre.avatar_url } : garde;
  });
  byUser = next;
};

function ensureLoaded() {
  if (!loading) {
    loading = base44.entities.MemberProfile
      .list("-last_seen_at", 500)
      .catch(() => [])
      .then((all) => {
        ingest(Array.isArray(all) ? all : []);
        loaded = true;
        emit();
      });
    base44.functions
      .invoke("listCommunityUsers", {})
      .then((r) => {
        const users = r?.data?.users;
        if (!Array.isArray(users)) return;
        const next = {};
        users.forEach((u) => { if (u?.id && u.profile_photo_url) next[u.id] = u.profile_photo_url; });
        photosComptes = next;
        byUser = { ...byUser }; // nouvel objet : les écrans se redessinent avec les photos
        emit();
      })
      .catch(() => {});
  }
  if (!unsub) {
    unsub = base44.entities.MemberProfile.subscribe((event) => {
      if (event.type === "delete") {
        const next = { ...byUser };
        Object.keys(next).forEach((k) => { if (next[k].id === event.data.id) delete next[k]; });
        byUser = next;
      } else {
        ingest([event.data]);
      }
      emit();
    });
  }
}

export default function useMemberDirectory() {
  const [dir, setDir] = useState(byUser);
  useEffect(() => {
    ensureLoaded();
    listeners.add(setDir);
    if (loaded) setDir(byUser);
    return () => listeners.delete(setDir);
  }, []);

  return {
    // Nom actuel du membre ; `fallback` = nom copié sur le message/post (anciens contenus).
    nameOf: (userId, fallback) => dir[userId]?.display_name || fallback || "Membre",
    avatarOf: (userId) => dir[userId]?.avatar_url || photosComptes[userId] || "",
    profileOf: (userId) => dir[userId] || null,
  };
}