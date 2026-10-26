import React, { useState, useEffect } from "react";
import { Loader2, Upload, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { uploadToBase44 } from "@/lib/upload";
import RichTextEditor from "@/components/media/RichTextEditor";

function PlaylistSelect({ field, value, onChange, cls }) {
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.Playlist.list({})
      .then((data) => setPlaylists(data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Chargement…
      </div>
    );
  }

  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={cls}
      required={field.required}
    >
      <option value="" disabled={field.required}>
        {field.required ? "— Choisir une playlist —" : "— Aucune playlist —"}
      </option>
      {playlists.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

function FileUploadField({ field, value, onChange, onUploadingChange }) {
  const [status, setStatus] = useState(() => value ? "done" : "idle");
  const [fileName, setFileName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [fileToRetry, setFileToRetry] = useState(null);

  const doUpload = async (file) => {
    if (!file) return;
    setFileName(file.name);
    setStatus("uploading");
    setErrorMsg("");
    onUploadingChange?.(true);
    try {
      // Même méthode que AddPlaylistTrackModal qui fonctionne
      const url = await uploadToBase44(file);
      onChange(url);
      setStatus("done");
      setFileToRetry(null);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err?.message || "Erreur inconnue");
      setFileToRetry(file);
      onChange(""); // reset pour ne pas soumettre une URL vide
    } finally {
      onUploadingChange?.(false);
    }
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (f) doUpload(f);
    e.target.value = "";
  };

  return (
    <div className="space-y-2">
      {/* Bouton choisir fichier — toujours visible sauf pendant upload */}
      {status !== "uploading" && (
        <label className="inline-flex items-center gap-2 rounded-xl border-2 border-dashed border-border bg-card px-4 py-3 text-sm font-semibold cursor-pointer hover:border-primary hover:bg-primary/5 transition w-full">
          <Upload className="h-4 w-4 text-primary shrink-0" />
          <span className="truncate text-foreground/70">
            {status === "done" ? `✓ ${fileName || "Fichier importé"} — Changer` : "Choisir un fichier…"}
          </span>
          <input
            type="file"
            className="hidden"
            onChange={onFile}
            accept={field.accept || "*/*"}
          />
        </label>
      )}

      {/* En cours */}
      {status === "uploading" && (
        <div className="flex items-center gap-3 rounded-xl bg-primary/10 border border-primary/20 px-4 py-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-primary">Envoi en cours…</div>
            <div className="text-xs text-foreground/60 truncate">{fileName}</div>
            <div className="text-xs text-foreground/55 mt-1">
              Vous pouvez remplir les autres champs : l'enregistrement se fera dès que le fichier sera arrivé.
            </div>
          </div>
        </div>
      )}

      {/* Succès */}
      {status === "done" && (
        <div className="flex items-center gap-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-emerald-600">Importé avec succès</div>
            <div className="text-xs text-foreground/60 truncate">{fileName}</div>
          </div>
        </div>
      )}

      {/* Erreur */}
      {status === "error" && (
        <div className="flex items-start gap-3 rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-destructive">Échec de l'import</div>
            <div className="text-xs text-foreground/60 mb-2">{errorMsg}</div>
            <button
              type="button"
              onClick={() => fileToRetry && doUpload(fileToRetry)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
            >
              <RefreshCw className="h-3 w-3" /> Réessayer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FieldInput({ field, value, onChange, onUploadingChange }) {
  const cls =
    "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

  switch (field.type) {
    // Champ « Contenu » des articles : éditeur riche type Word (gras, italique,
    // souligné, titres H1-H3, listes, alignement, liens, taille de police).
    // Le champ produit reste un simple string HTML — aucune modification de
    // l'entité Article ni du stockage.
    case "rich-text":
      return <RichTextEditor value={value} onChange={onChange} />;
    case "boolean":
      return (
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 accent-[hsl(var(--primary))]"
          />
          {field.label}
        </label>
      );
    case "textarea":
      return (
        <textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          className={`${cls} resize-none`}
          placeholder={field.label}
        />
      );
    case "number":
      return (
        <input
          type="number"
          value={value ?? ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? null : Number(e.target.value))
          }
          className={cls}
        />
      );
    case "date":
      return (
        <input
          type="date"
          value={value ? String(value).split("T")[0] : ""}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
        />
      );
    case "select":
      return (
        <select
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
          required={field.required}
        >
          <option value="" disabled={field.required}>
            {field.required ? "— Choisir une option —" : "—"}
          </option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "playlist":
      return (
        <PlaylistSelect
          field={field}
          value={value}
          onChange={onChange}
          cls={cls}
        />
      );
    case "file":
      return (
        <FileUploadField
          field={field}
          value={value}
          onChange={onChange}
          onUploadingChange={onUploadingChange}
        />
      );
    default:
      return (
        <input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          className={cls}
          placeholder={field.label}
        />
      );
  }
}
