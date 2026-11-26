import React, { useCallback, useEffect, useRef, useState } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { APK_URL, fetchLatest } from "@/lib/apkRelease";
import { ChayMiseAJour } from "@/lib/chayConversation";
import { INTERVALLE_VERIFICATION_MS, doitBloquer, versionAndroid } from "@/lib/majObligatoire";
import { MiseAJourApp } from "@/components/home/AboutDialog";

// 1.4.0 : mise à jour obligatoire (appli Android). Quand une version plus récente est publiée, cet écran
// couvre toute l'appli : « La dernière mise à jour est disponible », avec le bouton « Mettre à jour » (même
// téléchargement que dans « À propos » : barre de progression, puis fenêtre d'installation d'Android).
// Vérifié au lancement puis à chaque retour dans l'appli (au plus toutes les 10 minutes).
// Hors connexion, ou si latest.json est illisible, l'appli n'est jamais bloquée.
// 1.4.1 : version Google Play : c'est Google Play qui dit si une mise à jour existe (latest.json décrit l'APK du
// site, qui peut sortir avant que Google ait validé la même version) ; « Mettre à jour » ouvre l'écran de Google.
export default function MiseAJourObligatoire() {
  const natif = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
  const [latest, setLatest] = useState(null);
  const [maj, setMaj] = useState({ etat: "repos" });
  const majRef = useRef(maj);
  majRef.current = maj;
  const derniere = useRef(0);

  const verifier = useCallback(async (force = false) => {
    if (!force && Date.now() - derniere.current < INTERVALLE_VERIFICATION_MS) return;
    derniere.current = Date.now();
    let play = false;
    try { play = Boolean((await ChayMiseAJour.source())?.play); } catch { play = false; }
    if (play) {
      let r = null;
      try { r = await ChayMiseAJour.verifierPlay(); } catch { r = null; }
      if (r) setLatest(r.disponible ? { versionName: null, play: true } : null);
      return;
    }
    const l = await fetchLatest();
    if (!l) return; // hors connexion : on ne change rien
    let info = null;
    try { info = await CapacitorApp.getInfo(); } catch { info = null; }
    const android = versionAndroid(globalThis.navigator?.userAgent);
    setLatest(doitBloquer(l, info, android) ? l : null);
  }, []);

  const lancer = async () => {
    setMaj({ etat: "telechargement", recus: 0, total: 0 });
    try {
      const r = await ChayMiseAJour.installer({ url: APK_URL });
      if (r?.etat === "autorisation") setMaj({ etat: "autorisation" });
      else if (r?.etat === "play") setMaj({ etat: "repos" }); // écran de Google Play ouvert
      else setMaj((m) => ({ ...m, etat: "confirmation" }));
    } catch (e) {
      setMaj({ etat: "erreur", message: e?.message || "La mise à jour n'a pas pu être téléchargée." });
    }
  };
  const lancerRef = useRef(lancer);
  lancerRef.current = lancer;

  useEffect(() => {
    if (!natif) return undefined;
    verifier(true);
    const ecoutes = [
      ChayMiseAJour.addListener("progression", (d) => {
        setMaj((m) => (m.etat === "telechargement" ? { ...m, recus: d?.recus || 0, total: d?.total || 0 } : m));
      }),
      ChayMiseAJour.addListener("echec", (d) => {
        setMaj({ etat: "erreur", message: d?.message || "L'installation n'a pas abouti." });
      }),
      CapacitorApp.addListener("appStateChange", async ({ isActive }) => {
        if (!isActive) return;
        if (majRef.current.etat === "autorisation") {
          try {
            const { autorise } = await ChayMiseAJour.autorise();
            if (autorise) lancerRef.current();
          } catch { /* on reste sur l'explication */ }
          return;
        }
        verifier(false);
      }),
    ];
    return () => { ecoutes.forEach((p) => Promise.resolve(p).then((h) => h?.remove?.()).catch(() => {})); };
  }, [natif, verifier]);

  if (!natif || !latest) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="maj-obligatoire-titre"
      className="fixed inset-0 z-[100000] flex flex-col items-center justify-center overflow-y-auto bg-background px-6 text-foreground"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 1.5rem)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)" }}
    >
      <div className="w-full max-w-sm text-center">
        <img src="/branding/logo-connexion.png" alt="" className="mx-auto mb-5 h-20 w-20 rounded-2xl shadow-lg" />
        <h1 id="maj-obligatoire-titre" className="font-display text-2xl font-extrabold">
          La dernière mise à jour est disponible
        </h1>
        <p className="mt-3 text-[0.9375rem] leading-relaxed text-foreground/70">
          {latest.versionName ? <>La version <strong>{latest.versionName}</strong> de Chay est sortie.</> : "Une nouvelle version de Chay est sortie."}{" "}
          Mets à jour l'application pour continuer à l'utiliser : ça ne prend qu'une minute, et tes messages, ta Bible et
          tes progrès restent.
        </p>
        <div className="mt-6 text-left">
          <MiseAJourApp
            maj={maj}
            nouvelle
            inconnue={false}
            versionName={latest.versionName}
            admin={false}
            onLancer={lancer}
            onVerifier={() => verifier(true)}
          />
        </div>
      </div>
    </div>
  );
}
