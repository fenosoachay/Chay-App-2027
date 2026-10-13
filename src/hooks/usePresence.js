import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { formatTimestamp, parseTimestamp } from "@/lib/formatTimestamp";

const ONLINE_WINDOW_MS = 2 * 60 * 1000;
const pendingCreate = new Map();

export function isOnline(lastSeenAt) {
  if (!lastSeenAt) return false;
  const t = new Date(lastSeenAt).getTime();
  return Date.now() - t < ONLINE_WINDOW_MS;
}

export function lastSeenLabel(lastSeenAt) {
  if (!lastSeenAt) return "hors ligne";
  if (isOnline(lastSeenAt)) return "Actif maintenant";
  const diff = Date.now() - new Date(lastSeenAt).getTime();
  if (diff < 60000) return "Actif à l'instant";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) {
    if (mins <= 5) return "Actif il y a quelques minutes";
    return `Actif il y a ${mins} min`;
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return hours === 1 ? "Actif il y a 1 heure" : `Actif il y a ${hours} heures`;
  }
  const days = Math.floor(hours / 24);
  if (days < 7) {
    return days === 1 ? "Actif il y a 1 jour" : `Actif il y a ${days} jours`;
  }
  const d = new Date(lastSeenAt);
  return `Vu le ${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`;
}

// Heartbeat: ensure a MemberProfile exists for the user, then refresh last_seen_at periodically.
export function usePresenceHeartbeat(user, enabled = true) {
  useEffect(() => {
    if (!user?.id || !enabled) return;
    let profileId = null;
    let interval = null;
    let stopped = false;

    const ensure = async () => {
      const name =
        [user.first_name, user.last_name].filter(Boolean).join(" ") ||
        user.full_name ||
        (user.email ? user.email.split("@")[0] : "Membre");
      // Infos publiques copiées depuis le compte : lisibles par tous les membres
      // (l'entité User n'est pas lisible par les non-administrateurs).
      const publicInfo = {
        display_name: name,
        avatar_url: user.profile_photo_url || "",
        cover_url: user.cover_photo_url || "",
        bio: user.profile_bio || "",
      };
      const existing = await base44.entities.MemberProfile
        .filter({ created_by_id: user.id }, "-created_date", 1)
        .catch(() => []);
      if (existing && existing[0]) {
        profileId = existing[0].id;
        const p = existing[0];
        const changed = Object.keys(publicInfo).some((k) => (p[k] || "") !== publicInfo[k]);
        if (changed) {
          await base44.entities.MemberProfile.update(profileId, publicInfo).catch(() => {});
        }
        return;
      }
      // Une seule création à la fois par utilisateur (évite les profils en double).
      if (!pendingCreate.has(user.id)) {
        pendingCreate.set(
          user.id,
          base44.entities.MemberProfile
            .create({ ...publicInfo, last_seen_at: new Date().toISOString() })
            .catch(() => null)
            .finally(() => setTimeout(() => pendingCreate.delete(user.id), 5000))
        );
      }
      const created = await pendingCreate.get(user.id);
      profileId = created?.id || null;
    };

    const beat = () => {
      if (profileId) {
        base44.entities.MemberProfile
          .update(profileId, { last_seen_at: new Date().toISOString() })
          .catch(() => {});
      }
    };

    (async () => {
      await ensure();
      if (stopped) return;
      beat();
      interval = setInterval(beat, 30000);
      const onUnload = () => beat();
      window.addEventListener("beforeunload", onUnload);
      window.__chayUnload = onUnload;
    })();

    return () => {
      stopped = true;
      if (interval) clearInterval(interval);
      if (window.__chayUnload) {
        window.removeEventListener("beforeunload", window.__chayUnload);
        delete window.__chayUnload;
      }
    };
  }, [user?.id, user?.profile_photo_url, user?.cover_photo_url, user?.profile_bio, user?.full_name, user?.first_name, user?.last_name]);
}

// Un seul profil par utilisateur (le plus ancien) : évite d'afficher un membre en double.
export function dedupeProfiles(list) {
  const byUser = new Map();
  list.forEach((p) => {
    const key = p.created_by_id || p.id;
    const kept = byUser.get(key);
    if (!kept || String(p.created_date) < String(kept.created_date)) byUser.set(key, p);
  });
  return list.filter((p) => byUser.get(p.created_by_id || p.id) === p);
}

// Loads all member profiles and live-updates them via realtime subscription.
export function useProfiles() {
  const [profiles, setProfiles] = useState([]);

  useEffect(() => {
    const load = async () => {
      const all = await base44.entities.MemberProfile
        .list("-last_seen_at", 200)
        .catch(() => []);
      setProfiles(Array.isArray(all) ? all : []);
    };
    load();
    const unsub = base44.entities.MemberProfile.subscribe((event) => {
      setProfiles((prev) => {
        const map = new Map(prev.map((p) => [p.id, p]));
        if (event.type === "delete") map.delete(event.data.id);
        else map.set(event.data.id, event.data);
        return Array.from(map.values());
      });
    });
    return unsub;
  }, []);

  return dedupeProfiles(profiles);
}

export function relTime(d) {
  const date = parseTimestamp(d);
  if (!date) return "";
  const diff = Date.now() - date.getTime();
  if (diff < 60000) return "à l'instant";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} min`;
  if (diff < 86400000) return formatTimestamp(date, { date: false });
  return formatTimestamp(date, { time: false });
}