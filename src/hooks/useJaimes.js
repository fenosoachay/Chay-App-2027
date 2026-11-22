import { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { REACTION_PAR_DEFAUT, prochaineReaction, resumeReactions } from "@/lib/reactions";

/**
 * Réactions des vidéos verticales (Drôle, Mindset…) : collection JaimeVideo { track_id, created_by_id, reaction },
 * une ligne par membre et par vidéo (👍 like, ❤️ coeur, 😂 haha ; les anciens « J'aime » comptent comme ❤️).
 * `ids` : identifiants des contenus (PlaylistTrack.track_id).
 * Renvoie { compte(id), maReaction(id), resume(id), reagir(id, reaction) } ; l'affichage change tout de suite,
 * puis le serveur confirme (en cas d'échec, l'état d'avant revient).
 */
export function useJaimes(ids) {
  const { user } = useAuth();
  const [lignes, setLignes] = useState([]);
  const cle = (ids || []).join(",");

  useEffect(() => {
    if (!ids?.length) return undefined;
    let vivant = true;
    base44.entities.JaimeVideo.filter({ track_id: { $in: ids } }, "-created_date", 5000)
      .then((r) => { if (vivant) setLignes(Array.isArray(r) ? r : []); })
      .catch(() => {});
    return () => { vivant = false; };
  }, [cle]); // eslint-disable-line react-hooks/exhaustive-deps

  const deLaVideo = useCallback((id) => lignes.filter((l) => l.track_id === id), [lignes]);
  const compte = useCallback((id) => deLaVideo(id).length, [deLaVideo]);
  const resume = useCallback((id) => resumeReactions(deLaVideo(id)), [deLaVideo]);
  const maReaction = useCallback((id) => {
    const l = lignes.find((x) => x.track_id === id && x.created_by_id === user?.id);
    return l ? l.reaction || REACTION_PAR_DEFAUT : null;
  }, [lignes, user?.id]);

  const reagir = useCallback(async (id, reaction) => {
    if (!user?.id) return;
    const mien = lignes.find((l) => l.track_id === id && l.created_by_id === user.id);
    const action = prochaineReaction(mien ? mien.reaction || REACTION_PAR_DEFAUT : null, reaction);
    const avant = lignes;
    if (action.type === "retirer") {
      setLignes((ls) => ls.filter((l) => l !== mien));
      try { await base44.entities.JaimeVideo.delete(mien.id); } catch { setLignes(avant); }
      return;
    }
    if (action.type === "changer") {
      setLignes((ls) => ls.map((l) => (l === mien ? { ...l, reaction } : l)));
      try { await base44.entities.JaimeVideo.update(mien.id, { reaction }); } catch { setLignes(avant); }
      return;
    }
    const provisoire = { id: `tmp-${id}`, track_id: id, created_by_id: user.id, reaction };
    setLignes((ls) => [...ls, provisoire]);
    try {
      const r = await base44.entities.JaimeVideo.create({ track_id: id, reaction });
      setLignes((ls) => ls.map((l) => (l === provisoire ? { ...r, track_id: id, created_by_id: r?.created_by_id || user.id, reaction } : l)));
    } catch {
      setLignes(avant);
    }
  }, [lignes, user?.id]);

  return { compte, resume, maReaction, reagir };
}
