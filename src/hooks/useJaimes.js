import { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";

/**
 * « J'aime » des vidéos (playlist Drôle) : collection JaimeVideo { track_id, created_by_id }, une ligne par membre
 * et par vidéo. `ids` : identifiants des contenus (PlaylistTrack.track_id).
 * Renvoie { compte(id), aime(id), basculer(id) } ; l'affichage change tout de suite, puis le serveur confirme.
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

  const compte = useCallback((id) => lignes.filter((l) => l.track_id === id).length, [lignes]);
  const aime = useCallback((id) => lignes.some((l) => l.track_id === id && l.created_by_id === user?.id), [lignes, user?.id]);

  const basculer = useCallback(async (id) => {
    if (!user?.id) return;
    const mien = lignes.find((l) => l.track_id === id && l.created_by_id === user.id);
    if (mien) {
      setLignes((ls) => ls.filter((l) => l !== mien));
      try { await base44.entities.JaimeVideo.delete(mien.id); } catch { setLignes((ls) => [...ls, mien]); }
      return;
    }
    const provisoire = { id: `tmp-${id}`, track_id: id, created_by_id: user.id };
    setLignes((ls) => [...ls, provisoire]);
    try {
      const r = await base44.entities.JaimeVideo.create({ track_id: id });
      setLignes((ls) => ls.map((l) => (l === provisoire ? { ...r, track_id: id, created_by_id: r?.created_by_id || user.id } : l)));
    } catch {
      setLignes((ls) => ls.filter((l) => l !== provisoire));
    }
  }, [lignes, user?.id]);

  return { compte, aime, basculer };
}
