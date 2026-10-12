import { useEffect, useState } from "react";
import { openDictionary } from "@/lib/dictionaryDb";

// Ouvre la base du dictionnaire. status : "loading" | "ready" | "error".
// `progress` : 0..1 pendant le premier téléchargement (null si inconnu).
export default function useDictionaryDb() {
  const [state, setState] = useState({ db: null, status: "loading", error: "", progress: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setState({ db: null, status: "loading", error: "", progress: null });
    openDictionary((p) => alive && setState((s) => ({ ...s, progress: p })))
      .then((db) => alive && setState({ db, status: "ready", error: "", progress: 1 }))
      .catch((e) =>
        alive &&
        setState({
          db: null,
          status: "error",
          error: e?.message || "Impossible d'ouvrir le dictionnaire.",
          progress: null,
        })
      );
    return () => {
      alive = false;
    };
  }, [attempt]);

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}