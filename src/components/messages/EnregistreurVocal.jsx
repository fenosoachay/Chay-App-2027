import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, Lock, Mic, Send, Trash2 } from "lucide-react";
import { DUREE_VOCAL_MAX, extensionVocal, formatDuree, typeEnregistrement } from "@/lib/piecesJointes";

// Message vocal (1.3.35), comme Messenger :
//  - maintenir le micro : on enregistre ; relâcher : c'est envoyé ;
//  - glisser vers la gauche en maintenant : annulé ;
//  - simple appui : l'enregistrement continue mains libres (corbeille ou Envoyer) ;
//  - 10 minutes au plus (envoyé tout seul à 10:00).
// L'onde suit la voix en direct (AnalyserNode), mise à jour sans redessiner React à chaque image.

const SEUIL_ANNULER = 90; // px vers la gauche
const APPUI_COURT = 350; // ms

export function useEnregistreur({ onTermine, onErreur }) {
  const [etat, setEtat] = useState("repos"); // repos | demarrage | enregistre | mainsLibres
  const [secondes, setSecondes] = useState(0);
  const rec = useRef(null);
  const flux = useRef(null);
  const morceaux = useRef([]);
  const debut = useRef(0);
  const annule = useRef(false);
  const niveaux = useRef(null); // éléments de l'onde en direct
  const contexte = useRef(null);
  const raf = useRef(0);
  const minuteur = useRef(0);

  const nettoyer = useCallback(() => {
    cancelAnimationFrame(raf.current);
    clearInterval(minuteur.current);
    flux.current?.getTracks().forEach((t) => t.stop());
    flux.current = null;
    contexte.current?.close().catch(() => {});
    contexte.current = null;
  }, []);

  useEffect(() => () => { annule.current = true; try { rec.current?.stop(); } catch (_) { /* déjà arrêté */ } nettoyer(); }, [nettoyer]);

  const arreter = useCallback((envoyer) => {
    annule.current = !envoyer;
    const r = rec.current;
    if (r && r.state !== "inactive") r.stop();
    else { nettoyer(); setEtat("repos"); }
  }, [nettoyer]);

  const demarrer = useCallback(async () => {
    if (rec.current && rec.current.state !== "inactive") return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      onErreur?.("L'enregistrement vocal n'est pas disponible sur cet appareil.");
      return;
    }
    setEtat("demarrage");
    annule.current = false;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      // Annulé pendant la demande d'autorisation du micro.
      if (annule.current) { s.getTracks().forEach((t) => t.stop()); setEtat("repos"); return; }
      flux.current = s;
      const type = typeEnregistrement((t) => MediaRecorder.isTypeSupported?.(t));
      const r = new MediaRecorder(s, type ? { mimeType: type, audioBitsPerSecond: 48000 } : undefined);
      rec.current = r;
      morceaux.current = [];
      r.ondataavailable = (e) => { if (e.data?.size) morceaux.current.push(e.data); };
      r.onstop = () => {
        const duree = Math.min(DUREE_VOCAL_MAX, (Date.now() - debut.current) / 1000);
        const mime = r.mimeType || type || "audio/webm";
        nettoyer();
        setEtat("repos");
        setSecondes(0);
        if (annule.current || duree < 0.8 || !morceaux.current.length) return;
        const blob = new Blob(morceaux.current, { type: mime.split(";")[0] });
        const fichier = new File([blob], `vocal_${Date.now()}.${extensionVocal(mime)}`, { type: blob.type, lastModified: Date.now() });
        onTermine?.(fichier, Math.round(duree * 10) / 10);
      };
      r.start(1000);
      debut.current = Date.now();
      setSecondes(0);
      setEtat((e) => (e === "mainsLibres" ? e : "enregistre"));
      minuteur.current = setInterval(() => {
        const t = (Date.now() - debut.current) / 1000;
        setSecondes(t);
        if (t >= DUREE_VOCAL_MAX) arreter(true);
      }, 250);
      // Onde en direct.
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx();
        contexte.current = ctx;
        const an = ctx.createAnalyser();
        an.fftSize = 256;
        ctx.createMediaStreamSource(s).connect(an);
        const data = new Uint8Array(an.frequencyBinCount);
        const image = () => {
          an.getByteTimeDomainData(data);
          let max = 0;
          for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i] - 128));
          const niv = Math.min(1, max / 60);
          const barres = niveaux.current?.children;
          if (barres?.length) {
            // Décalage : la dernière barre prend le niveau du moment, les autres glissent vers la gauche.
            for (let i = 0; i < barres.length - 1; i++) barres[i].style.transform = barres[i + 1].style.transform;
            barres[barres.length - 1].style.transform = `scaleY(${(0.15 + niv * 0.85).toFixed(2)})`;
          }
          raf.current = requestAnimationFrame(image);
        };
        raf.current = requestAnimationFrame(image);
      } catch (_) { /* onde décorative seulement */ }
    } catch (e) {
      nettoyer();
      setEtat("repos");
      onErreur?.(e?.name === "NotAllowedError" ? "Autorisez le micro pour envoyer un message vocal." : "Le micro n'a pas pu démarrer.");
    }
  }, [arreter, nettoyer, onErreur, onTermine]);

  return { etat, secondes, demarrer, arreter, setEtat, niveaux, actif: etat !== "repos" };
}

/** Bouton micro : maintenir pour enregistrer, glisser à gauche pour annuler, appui court = mains libres. */
export function BoutonMicro({ enr, onGlisse }) {
  const depart = useRef(null);
  const quand = useRef(0);
  const bas = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    depart.current = e.clientX;
    quand.current = Date.now();
    onGlisse?.(0);
    enr.demarrer();
  };
  const bouge = (e) => {
    if (depart.current === null) return;
    const dx = Math.min(0, e.clientX - depart.current);
    onGlisse?.(dx);
    if (dx < -SEUIL_ANNULER) { depart.current = null; onGlisse?.(0); enr.arreter(false); }
  };
  const haut = () => {
    if (depart.current === null) return;
    depart.current = null;
    onGlisse?.(0);
    // Appui court, ou micro pas encore prêt (autorisation demandée) : on continue mains libres.
    if (enr.etat === "demarrage" || Date.now() - quand.current < APPUI_COURT) enr.setEtat("mainsLibres");
    else enr.arreter(true);
  };
  return (
    <button
      type="button"
      onPointerDown={bas}
      onPointerMove={bouge}
      onPointerUp={haut}
      onPointerCancel={() => { depart.current = null; onGlisse?.(0); enr.arreter(false); }}
      onContextMenu={(e) => e.preventDefault()}
      className={`relative grid h-10 w-10 shrink-0 touch-none select-none place-items-center rounded-full transition ${enr.actif ? "scale-110 bg-red-500 text-white shadow-[0_0_0_6px_rgba(239,68,68,0.18)]" : "text-foreground/60 hover:bg-muted"}`}
      aria-label="Message vocal : maintenir pour enregistrer"
    >
      <Mic className="h-5 w-5" />
    </button>
  );
}

/** Barre d'enregistrement (remplace le champ de saisie pendant l'enregistrement). */
export function BarreEnregistrement({ enr, glisse = 0 }) {
  const mainsLibres = enr.etat === "mainsLibres";
  const presqueFin = enr.secondes >= DUREE_VOCAL_MAX - 30;
  return (
    <motion.div
      className="flex min-w-0 flex-1 items-center gap-2 rounded-3xl border border-red-500/30 bg-red-500/[0.07] px-3 py-1.5"
      initial={{ opacity: 0, scaleX: 0.6 }}
      animate={{ opacity: 1, scaleX: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      style={{ transformOrigin: "100% 50%", x: mainsLibres ? 0 : glisse * 0.6 }}
      role="status"
      aria-live="polite"
      aria-label="Enregistrement du message vocal"
    >
      {mainsLibres ? (
        <button type="button" onClick={() => enr.arreter(false)} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-red-500 hover:bg-red-500/10" aria-label="Supprimer l'enregistrement">
          <Trash2 className="h-5 w-5" />
        </button>
      ) : (
        <span className="chay-rec h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" aria-hidden="true" />
      )}
      <span className={`shrink-0 text-sm font-semibold tabular-nums ${presqueFin ? "text-red-500" : "text-foreground/80"}`}>
        {formatDuree(enr.secondes)}<span className="text-foreground/35"> / 10:00</span>
      </span>
      <span ref={enr.niveaux} className="flex h-6 min-w-0 flex-1 items-center gap-[2px] overflow-hidden" aria-hidden="true">
        {Array.from({ length: 32 }, (_, i) => (
          <span key={i} className="h-full flex-1 rounded-full bg-red-500/70" style={{ transform: "scaleY(0.15)", transition: "transform 80ms linear" }} />
        ))}
      </span>
      {mainsLibres ? (
        <span className="flex shrink-0 items-center gap-1 text-[0.6875rem] text-foreground/45"><Lock className="h-3 w-3" /> mains libres</span>
      ) : (
        <span className="chay-glisse flex shrink-0 items-center text-[0.6875rem] font-medium text-foreground/50" style={{ opacity: Math.max(0.3, 1 + glisse / 90) }}>
          <ChevronLeft className="h-3.5 w-3.5" /> glisser pour annuler
        </span>
      )}
    </motion.div>
  );
}

/** Bouton Envoyer du mode mains libres. */
export function EnvoyerVocal({ enr }) {
  return (
    <motion.button
      type="button"
      onClick={() => enr.arreter(true)}
      initial={{ scale: 0.4, rotate: -90, opacity: 0 }}
      animate={{ scale: 1, rotate: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 480, damping: 24 }}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full brand-gradient text-white shadow-lg"
      aria-label="Envoyer le message vocal"
    >
      <Send className="ml-0.5 h-5 w-5" />
    </motion.button>
  );
}
