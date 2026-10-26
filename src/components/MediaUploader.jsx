import React, { useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { uploadToBase44, formatBytes } from "@/lib/upload";
import { X, Loader2, Upload, Music2, Mic, Film, RotateCcw, Ban } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";

const TYPES = [
  { id: "music", label: "Musique", icon: Music2, entity: "MusicTrack" },
  { id: "sermon", label: "Prédication", icon: Mic, entity: "Sermon" },
  { id: "video", label: "Vidéo", icon: Film, entity: "Video" },
];

export default function MediaUploader({ onClose, onSaved }) {
  const [type, setType] = useState("music");
  const [form, setForm] = useState({ title: "", artist: "", speaker: "", category: "", description: "", date: "" });
  const [mediaFile, setMediaFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  // ── PROBLÈME 2 : progression détaillée + annulation/reprise ─────────────
  // stats = { uploadedBytes, totalBytes, speedBps (Mo/s lissé), etaSec }
  const [stats, setStats] = useState(null);
  const [uploadError, setUploadError] = useState(null); // message FR si échec
  const abortRef = useRef(null);   // AbortController du run en cours
  const resumedRef = useRef(false); // true après un "Reprendre" → force chunked
  useEffect(() => () => abortRef.current?.abort(), []); // nettoyage à la fermeture

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Calcul vitesse lissée + ETA à partir des octets déjà envoyés.
  const speedRef = useRef({ lastBytes: 0, lastTs: 0, smoothBps: 0 });
  const handleDetail = ({ uploadedBytes, totalBytes }) => {
    const now = performance.now();
    const s = speedRef.current;
    if (s.lastTs) {
      const dt = (now - s.lastTs) / 1000;
      if (dt > 0.2) {
        const inst = Math.max(0, (uploadedBytes - s.lastBytes) / dt);
        // Moyenne mobile exponentielle → chiffre stable mais réactif.
        s.smoothBps = s.smoothBps ? s.smoothBps * 0.7 + inst * 0.3 : inst;
        s.lastBytes = uploadedBytes;
        s.lastTs = now;
      }
    } else {
      s.lastBytes = uploadedBytes;
      s.lastTs = now;
    }
    const etaSec = s.smoothBps > 0 ? Math.round((totalBytes - uploadedBytes) / s.smoothBps) : null;
    setStats({ uploadedBytes, totalBytes, speedBps: s.smoothBps, etaSec });
  };

  const runUpload = async () => {
    setLoading(true);
    setProgress(0);
    setStats(null);
    setUploadError(null);
    speedRef.current = { lastBytes: 0, lastTs: 0, smoothBps: 0 };
    // PROBLÈME 2 : un AbortController par tentative → bouton "Annuler" actif.
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      // Gros médias (> 15 Mo, films MP4 multi-Go) : upload morcelé + reprenable
      // via la fonction backend `upload_chunk` — plus aucun WriteTimeout ni
      // "[BUF] malloc failure" / HTTP 404 sur gros fichiers. Petits fichiers :
      // Core.UploadFile officiel. Après une reprise ("Reprendre"), on force le
      // mode chunké : les chunks déjà partis sont sautés côté serveur.
      const isVideo = type === "video";
      const mediaUrl = await uploadToBase44(mediaFile, {
        forceChunked: isVideo || resumedRef.current,
        onProgress: (p) => setProgress(p),
        onDetail: handleDetail,
        signal: controller.signal,
      });
      resumedRef.current = false;
      let coverUrl = "";
      if (coverFile) {
        coverUrl = await uploadToBase44(coverFile);
      }

      // Durée du fichier audio (utile au lecteur), lue localement avant l'envoi.
      let durationSeconds = null;
      if (type !== "video") {
        durationSeconds = await new Promise((resolve) => {
          const url = URL.createObjectURL(mediaFile);
          const probe = new Audio();
          probe.preload = "metadata";
          probe.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(Number.isFinite(probe.duration) ? Math.round(probe.duration) : null); };
          probe.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
          probe.src = url;
          setTimeout(() => { URL.revokeObjectURL(url); resolve(null); }, 5000);
        });
      }

      let created = null;
      if (type === "music") {
        created = await base44.entities.MusicTrack.create({
          title: form.title, artist: form.artist || "CHAY", album: "", category: form.category || "Louange",
          cover_url: coverUrl, audio_url: mediaUrl,
          ...(durationSeconds ? { duration_seconds: durationSeconds } : {}),
          // Champs requis par le schéma de l'entité : sans eux la création est
          // rejetée (422) ou le contenu reste invisible dans l'app.
          visibility: "non-membre", created_by_admin: true,
        });
      } else if (type === "sermon") {
        created = await base44.entities.Sermon.create({
          title: form.title, speaker: form.speaker || "Pasteur", category: form.category || "Prédication",
          date: form.date || new Date().toISOString().slice(0, 10),
          cover_url: coverUrl, audio_url: mediaUrl,
          ...(durationSeconds ? { duration_minutes: Math.max(1, Math.round(durationSeconds / 60)) } : {}),
          visibility: "non-membre", created_by_admin: true,
        });
      } else {
        created = await base44.entities.Video.create({
          title: form.title, description: form.description || "", category: form.category || "Enseignement",
          cover_url: coverUrl, video_url: mediaUrl,
          visibility: "non-membre", created_by_admin: true,
        });
      }

      // Vérification : le serveur a-t-il réellement enregistré l'URL du média ?
      const savedUrl = type === "video" ? created?.video_url : created?.audio_url;
      if (!savedUrl) {
        try {
          await (type === "music" ? base44.entities.MusicTrack : type === "sermon" ? base44.entities.Sermon : base44.entities.Video)
            .update(created.id, type === "video" ? { video_url: mediaUrl } : { audio_url: mediaUrl });
        } catch {
          toast({
            title: "Média non enregistré côté serveur",
            description: "Le champ audio_url/video_url semble absent de l'entité. Ouvrez le dashboard Base44 → Entities → ajoutez le champ, puis Publish.",
            variant: "destructive",
          });
          onSaved?.();
          onClose?.();
          return;
        }
      }

      toast({ title: "Importé avec succès !", description: form.title });
      onSaved?.();
      onClose?.();
    } catch (err) {
      console.error("[MediaUploader] échec import:", err);
      if (err?.cancelled) {
        // Annulation volontaire : pas de toast rouge, l'UI montre "Reprendre".
        setUploadError("Envoi annulé. Vos morceaux déjà envoyés sont conservés 24 h — cliquez « Reprendre » pour continuer sans tout renvoyer.");
      } else {
        setUploadError(
          `L'envoi a été interrompu (${err?.message || "erreur réseau"}). Vérifiez votre connexion puis cliquez « Reprendre » : le upload reprend là où il s'est arrêté.`
        );
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  // Validation du formulaire puis lancement de l'upload.
  const submit = (e) => {
    e.preventDefault();
    if (!mediaFile) { toast({ title: "Sélectionnez un fichier à importer.", variant: "destructive" }); return; }
    if (!form.title.trim()) { toast({ title: "Le titre est requis.", variant: "destructive" }); return; }
    runUpload();
  };

  // Bouton "Annuler" : coupe la requête en cours ; les chunks déjà reçus par
  // le serveur restent dans la session → "Reprendre" ne renvoie que le reste.
  const cancelUpload = () => abortRef.current?.abort();
  // Bouton "Reprendre" : relance runUpload() — session déterministe identique.
  const resumeUpload = () => { resumedRef.current = true; runUpload(); };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-[1.5rem] bg-background border border-border shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-display font-extrabold text-xl flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" /> Importer un contenu
          </h2>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded-full hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          <div className="inline-flex rounded-full border border-border bg-card p-1 gap-1">
            {TYPES.map((t) => {
              const Icon = t.icon;
              return (
                <button type="button" key={t.id} onClick={() => setType(t.id)}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition ${
                    type === t.id ? "bg-primary text-primary-foreground" : "text-foreground/60"
                  }`}>
                  <Icon className="h-4 w-4" /> {t.label}
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Titre *</Label>
            <Input id="title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Titre du contenu" required />
          </div>

          {type === "music" && (
            <div className="space-y-2">
              <Label htmlFor="artist">Artiste</Label>
              <Input id="artist" value={form.artist} onChange={(e) => set("artist", e.target.value)} placeholder="CHAY Worship" />
            </div>
          )}
          {type === "sermon" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="speaker">Prédicateur</Label>
                <Input id="speaker" value={form.speaker} onChange={(e) => set("speaker", e.target.value)} placeholder="Pasteur Jean" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input id="date" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
              </div>
            </>
          )}
          {type === "video" && (
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input id="description" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Courte description" />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="category">Catégorie</Label>
            <Input id="category" value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="Louange / Enseignement…" />
          </div>

          <div className="space-y-2">
            <Label>{type === "video" ? "Fichier vidéo *" : "Fichier audio *"} <span className="text-xs text-muted-foreground font-normal">(depuis votre ordinateur)</span></Label>
            <label className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-background px-4 py-4 cursor-pointer hover:border-primary transition">
              <Upload className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium truncate flex-1">{mediaFile ? mediaFile.name : "Choisir un fichier…"}</span>
              <input
                type="file"
                accept={type === "video" ? "video/*" : "audio/*"}
                className="hidden"
                onChange={(e) => setMediaFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          <div className="space-y-2">
            <Label>Cover image <span className="text-xs text-muted-foreground font-normal">(optionnel)</span></Label>
            <label className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-background px-4 py-4 cursor-pointer hover:border-primary transition">
              <Upload className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium truncate flex-1">{coverFile ? coverFile.name : "Choisir une image…"}</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          {/* ── PROBLÈME 2 : barre de progression détaillée ─────────────────
              % + taille envoyée/totale + vitesse + ETA + bouton Annuler ;
              message d'erreur FR + bouton Reprendre en cas d'échec. */}
          {(loading || uploadError) && (
            <div className="space-y-2 rounded-2xl border border-border bg-muted/30 p-4">
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {stats && (
                <div className="flex flex-wrap items-center justify-between gap-x-3 text-xs font-medium text-muted-foreground tabular-nums">
                  <span>{progress}% — {formatBytes(stats.uploadedBytes)} / {formatBytes(stats.totalBytes)}</span>
                  {stats.speedBps > 0 && <span>{formatBytes(stats.speedBps)}/s</span>}
                  {Number.isFinite(stats.etaSec) && stats.etaSec >= 0 && (
                    <span>restant ≈ {stats.etaSec >= 60 ? `${Math.ceil(stats.etaSec / 60)} min` : `${stats.etaSec} s`}</span>
                  )}
                </div>
              )}
              {!uploadError && (
                <p className="text-xs text-muted-foreground">
                  Les gros fichiers sont envoyés par morceaux de 8 Mo : en cas de coupure,
                  l'envoi reprend automatiquement là où il s'est arrêté (aucun morceau déjà reçu n'est renvoyé).
                </p>
              )}
              {uploadError && (
                <p className="text-xs font-semibold text-destructive">{uploadError}</p>
              )}
              <div className="flex gap-2 pt-1">
                {loading && (
                  <Button type="button" variant="outline" size="sm" onClick={cancelUpload} className="gap-2">
                    <Ban className="h-4 w-4" /> Annuler
                  </Button>
                )}
                {uploadError && !loading && (
                  <Button type="button" variant="secondary" size="sm" onClick={resumeUpload} className="gap-2">
                    <RotateCcw className="h-4 w-4" /> Reprendre l'envoi
                  </Button>
                )}
              </div>
            </div>
          )}

          <Button type="submit" className="w-full h-12 font-bold" disabled={loading}>
            {loading ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Import en cours… {progress}%</>) : "Importer"}
          </Button>
        </form>
      </div>
    </div>
  );
}