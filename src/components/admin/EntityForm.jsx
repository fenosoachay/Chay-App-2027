import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import FieldInput from "@/components/admin/FieldInput";
import { findMissingRequiredField } from "@/lib/requiredFormField";

export default function EntityForm({
  fields,
  initial,
  onSubmit,
  onCancel,
  saving,
  onPlaylistChange,
  retryingPlaylistAttachment,
}) {
  const [data, setData] = useState(() => {
    const d = {};
    fields.forEach((f) => {
      d[f.name] = initial?.[f.name] ?? (f.type === "number" ? null : "");
    });
    return d;
  });
  // The save may resume from the upload-complete effect; always submit the
  // latest values, including playlist selection made while the file uploads.
  const dataRef = React.useRef(data);
  const [uploading, setUploading] = useState(false);
  // L'utilisateur a cliqué « Enregistrer » pendant un envoi : on enregistre dès qu'il est terminé.
  const [pending, setPending] = useState(false);
  const [missing, setMissing] = useState("");

  const set = (name) => (v) => {
    dataRef.current = { ...dataRef.current, [name]: v };
    setData(dataRef.current);
    if (name === "playlist_id") onPlaylistChange?.(v || "");
  };

  const submit = (e) => {
    e.preventDefault();
    setMissing("");
    if (uploading) {
      setPending(true);
      return;
    }
    const currentData = dataRef.current;
    const m = findMissingRequiredField(fields, currentData);
    if (m) {
      setMissing(m.missingMessage || `Le champ « ${m.label} » est obligatoire.`);
      return;
    }
    onSubmit(currentData);
  };

  useEffect(() => {
    if (!pending || uploading) return;
    setPending(false);
    const currentData = dataRef.current;
    const m = findMissingRequiredField(fields, currentData);
    if (m) {
      setMissing(
        m.type === "file"
          ? `L'envoi de « ${m.label} » a échoué. Réessayez avant d'enregistrer.`
          : m.missingMessage || `Le champ « ${m.label} » est obligatoire.`
      );
      return;
    }
    onSubmit(currentData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, uploading]);

  return (
    // noValidate : nos propres messages (champ obligatoire, sous-playlist) remplacent la bulle du navigateur.
    <form onSubmit={submit} noValidate className="space-y-4">
      {fields.map((f) => (
        <div key={f.name}>
          <label className="block text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1.5">
            {f.label}
            {f.required && " *"}
          </label>
          <FieldInput
            field={f}
            value={data[f.name]}
            onChange={set(f.name)}
            onChangeChamp={(nom, v) => set(nom)(v)}
            onUploadingChange={f.type === "file" || f.type === "images" ? setUploading : undefined}
          />
          {f.help && <p className="mt-1 text-xs text-muted-foreground">{f.help}</p>}
        </div>
      ))}
      {missing && <p className="text-sm font-semibold text-destructive">{missing}</p>}
      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={saving || pending}>
          {pending ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enregistrement dès que le fichier est envoyé…</>
          ) : saving ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enregistrement…</>
          ) : retryingPlaylistAttachment ? (
            "Réessayer l'ajout à la playlist"
          ) : (
            "Enregistrer"
          )}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
