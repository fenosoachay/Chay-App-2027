import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import {
  loadYoutubePrefs,
  mergeYoutubePrefs,
  saveYoutubePrefs,
  syncYoutubePrefs,
} from "@/lib/youtubePrefs";

// Lit/écrit les préférences YouTube de l'utilisateur courant.
export function useYoutubePrefs() {
  const { user } = useAuth();
  const userId = user?.id;
  const [prefs, setPrefs] = useState(() => loadYoutubePrefs(userId));

  useEffect(() => {
    const merged = mergeYoutubePrefs(loadYoutubePrefs(userId), user?.youtube_prefs);
    setPrefs(merged);
    saveYoutubePrefs(userId, merged);
  }, [userId, user?.youtube_prefs]);

  const update = useCallback((section, key, value) => {
    setPrefs((current) => {
      const next = { ...current, [section]: { ...current[section] } };
      if (value === undefined) delete next[section][key];
      else next[section][key] = value;
      saveYoutubePrefs(userId, next);
      syncYoutubePrefs(userId, next);
      return next;
    });
  }, [userId]);

  return { prefs, update };
}