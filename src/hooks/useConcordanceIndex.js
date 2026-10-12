import { useEffect, useState } from "react";
import { loadConcordance } from "@/lib/bibleConcordance";

// Charge l'index de concordance d'une langue (mémoire → cache persistant →
// fichier local). Expose { index, status, error, retry } avec status :
// "loading" | "ready" | "error".
export default function useConcordanceIndex(lang) {
  const [state, setState] = useState({ index: null, status: "loading", error: "" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setState({ index: null, status: "loading", error: "" });
    loadConcordance(lang)
      .then((index) => alive && setState({ index, status: "ready", error: "" }))
      .catch((e) =>
        alive &&
        setState({
          index: null,
          status: "error",
          error: e?.message || "Impossible de charger l'index de recherche.",
        })
      );
    return () => {
      alive = false;
    };
  }, [lang, attempt]);

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}