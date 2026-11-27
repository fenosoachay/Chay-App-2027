import React, { useCallback, useEffect, useState } from "react";
import { BellRing, Eye, EyeOff, Heart, Loader2, Music, Pencil, Plus, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import FieldInput from "@/components/admin/FieldInput";
import { confirmFr } from "@/lib/confirmFr";
import { AUDIENCES, libelleAudience } from "@/lib/audience";
import { notifyAdminUpload } from "@/lib/adminNotify";
import { DUREES, etatAdmin } from "@/lib/coupDeCoeur";
import { PREFIXE_ATTENTION } from "@/lib/notificationAttention";

// 1.4.1 : Admin › Application › Accueil › Coup de cœur (carte « Coup de cœur de ce mois » sous le verset du jour).
// Choisir un chant (dans Multimédia › Musique ou en envoyant un fichier), petit mot, « C'est pour », durée
// d'affichage (1 jour… 1 mois, autre, toujours), afficher / retirer à la main, cloche « Chay attire ton attention ».
// À la publication, la notification part automatiquement (comme pour tous les contenus).

const VIDE = { source: "musique", track_id: "", title: "", artist: "", audio_url: "", mot: "", audience: "tous", duree_jours: 30, autre: "", actif: true };
const cls = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
const Etiquette = ({ children }) => <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-muted-foreground">{children}</label>;

export default function AdminCoupDeCoeur() {
  const { toast } = useToast();
  const [liste, setListe] = useState(null);
  const [form, setForm] = useState(null); // { ...champs, id? }
  const [envoi, setEnvoi] = useState(false);
  const [enregistre, setEnregistre] = useState(false);
  const [notif, setNotif] = useState(null);

  const charger = useCallback(() => {
    base44.entities.CoupDeCoeur.list("-created_date", 100)
      .then((r) => setListe(Array.isArray(r) ? r : []))
      .catch(() => setListe([]));
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const maj = (champ, v) => setForm((f) => ({ ...f, [champ]: v }));

  const choisirMusique = async (id) => {
    maj("track_id", id || "");
    if (!id) return;
    try {
      const m = await base44.entities.MusicTrack.get(id);
      setForm((f) => ({
        ...f,
        track_id: id,
        title: m.title || f.title,
        artist: m.artist || "",
        audio_url: m.audio_url || "",
        audience: m.audience || "tous",
      }));
    } catch {
      toast({ title: "Musique introuvable", variant: "destructive" });
    }
  };

  const ouvrir = (c) => {
    if (!c) { setForm({ ...VIDE }); return; }
    const connue = DUREES.some((d) => d.jours === Number(c.duree_jours || 0));
    setForm({
      id: c.id,
      source: c.track_id ? "musique" : "fichier",
      track_id: c.track_id || "",
      title: c.title || "",
      artist: c.artist || "",
      audio_url: c.audio_url || "",
      mot: c.mot || "",
      audience: c.audience || "tous",
      duree_jours: connue ? Number(c.duree_jours || 0) : "autre",
      autre: connue ? "" : String(c.duree_jours || ""),
      actif: Boolean(c.actif),
      debut: c.debut,
      etaitActif: Boolean(c.actif),
    });
  };

  const notifier = async (c, attention) => {
    const texte = `${PREFIXE_ATTENTION} le coup de cœur du mois : « ${c.title} »${c.artist ? ` de ${c.artist}` : ""}.`;
    return notifyAdminUpload({
      kind: "coup_de_coeur",
      title: c.title,
      artist: c.artist,
      contentId: c.id,
      audience: c.audience,
      attention: attention ? texte : undefined,
    });
  };

  const enregistrer = async (e) => {
    e.preventDefault();
    if (envoi) { toast({ title: "Envoi du fichier en cours", description: "Attendez la fin de l'envoi." }); return; }
    if (!form.title.trim()) { toast({ title: "Le titre est obligatoire", variant: "destructive" }); return; }
    if (!form.audio_url) { toast({ title: "Choisissez une musique ou envoyez un fichier audio", variant: "destructive" }); return; }
    const jours = form.duree_jours === "autre" ? Math.floor(Number(form.autre)) : Number(form.duree_jours);
    if (!(jours >= 0) || (form.duree_jours === "autre" && !(jours >= 1))) { toast({ title: "Nombre de jours invalide", variant: "destructive" }); return; }
    const demarre = form.actif && (!form.id || !form.etaitActif);
    const donnees = {
      title: form.title.trim(),
      artist: form.artist.trim(),
      audio_url: form.audio_url,
      cover_url: "", // novembre 2026 : plus de pochette (une ancienne est effacée à l'enregistrement)
      mot: form.mot.trim().slice(0, 300),
      track_id: form.source === "musique" ? form.track_id : "",
      audience: form.audience || "tous",
      duree_jours: jours,
      actif: Boolean(form.actif),
      ...(demarre ? { debut: new Date().toISOString() } : {}),
    };
    setEnregistre(true);
    try {
      const c = form.id
        ? await base44.entities.CoupDeCoeur.update(form.id, donnees)
        : await base44.entities.CoupDeCoeur.create(donnees);
      // Publication : notification automatique (comme pour tous les contenus).
      if (!form.id && donnees.actif) notifier({ ...donnees, id: c?.id }, false);
      toast({ title: form.id ? "Coup de cœur modifié" : donnees.actif ? "Coup de cœur publié" : "Coup de cœur enregistré (retiré)" });
      setForm(null);
      charger();
    } catch (err) {
      toast({ title: "Enregistrement impossible", description: err?.message, variant: "destructive" });
    } finally {
      setEnregistre(false);
    }
  };

  const basculer = async (c) => {
    const actif = !c.actif;
    try {
      await base44.entities.CoupDeCoeur.update(c.id, actif ? { actif, debut: new Date().toISOString() } : { actif });
      toast({ title: actif ? "Affiché sur l'accueil" : "Retiré de l'accueil" });
      charger();
    } catch (err) {
      toast({ title: "Modification impossible", description: err?.message, variant: "destructive" });
    }
  };

  const cloche = async (c) => {
    if (!(await confirmFr({ title: "Envoyer la notification ?", message: `${PREFIXE_ATTENTION} le coup de cœur du mois : « ${c.title} ».`, confirmLabel: "Envoyer" }))) return;
    setNotif(c.id);
    const ok = await notifier(c, true);
    setNotif(null);
    toast(ok ? { title: "Notification envoyée" } : { title: "Notification non envoyée", description: "Vérifiez la connexion et réessayez.", variant: "destructive" });
  };

  const supprimer = async (c) => {
    if (!(await confirmFr({ title: "Supprimer ce coup de cœur ?", message: `« ${c.title} » ne sera plus proposé. La musique elle-même reste dans Multimédia.`, confirmLabel: "Supprimer" }))) return;
    try {
      await base44.entities.CoupDeCoeur.delete(c.id);
      toast({ title: "Supprimé" });
      charger();
    } catch (err) {
      toast({ title: "Suppression impossible", description: err?.message, variant: "destructive" });
    }
  };

  if (form) {
    return (
      <form onSubmit={enregistrer} noValidate className="space-y-4">
        <div>
          <Etiquette>Le chant</Etiquette>
          <div className="mb-2 flex gap-2">
            {[["musique", "Choisir dans Musique"], ["fichier", "Envoyer un fichier"]].map(([v, l]) => (
              <button key={v} type="button" onClick={() => maj("source", v)}
                className={`rounded-full px-4 py-2 text-sm font-bold ${form.source === v ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted"}`}>
                {l}
              </button>
            ))}
          </div>
          {form.source === "musique" ? (
            <FieldInput field={{ name: "track_id", type: "musique" }} value={form.track_id} onChange={choisirMusique} />
          ) : (
            <FieldInput
              field={{ name: "audio_url", label: "Fichier audio", type: "file", accept: "audio/*" }}
              value={form.audio_url}
              onChange={(v) => maj("audio_url", v || "")}
              onUploadingChange={setEnvoi}
            />
          )}
        </div>
        <div>
          <Etiquette>Titre *</Etiquette>
          <input value={form.title} onChange={(e) => maj("title", e.target.value)} className={cls} placeholder="Titre du chant" />
        </div>
        <div>
          <Etiquette>Artiste</Etiquette>
          <input value={form.artist} onChange={(e) => maj("artist", e.target.value)} className={cls} placeholder="Chorale Chay…" />
        </div>
        <div>
          <Etiquette>Petit mot (facultatif)</Etiquette>
          <textarea value={form.mot} maxLength={300} rows={2} onChange={(e) => maj("mot", e.target.value)} className={cls} placeholder="Un chant qui nous a portés tout ce mois." />
        </div>
        <div>
          <Etiquette>C'est pour</Etiquette>
          <select value={form.audience} onChange={(e) => maj("audience", e.target.value)} className={cls}>
            {AUDIENCES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>
        <div>
          <Etiquette>Durée d'affichage</Etiquette>
          <div className="flex flex-wrap gap-2">
            {[...DUREES.filter((d) => d.jours), { jours: "autre", label: "Autre" }, DUREES.find((d) => !d.jours)].map((d) => (
              <button key={d.label} type="button" onClick={() => maj("duree_jours", d.jours)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-bold ${form.duree_jours === d.jours ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted"}`}>
                {d.label}
              </button>
            ))}
          </div>
          {form.duree_jours === "autre" && (
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="number" min={1} max={3650} inputMode="numeric" value={form.autre} onChange={(e) => maj("autre", e.target.value)} className={`${cls} max-w-[7rem]`} />
              jours
            </label>
          )}
          <p className="mt-1 text-xs text-muted-foreground">À partir du moment où il est affiché. « Toujours » : jusqu'à ce que vous le retiriez.</p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={form.actif} onChange={(e) => maj("actif", e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />
          Afficher sur l'accueil
        </label>
        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={enregistre}>
            {enregistre ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Enregistrement…</> : form.id ? "Enregistrer" : "Publier"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setForm(null)}>Annuler</Button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-foreground/60">Le chant mis en avant sur l'accueil, juste avant l'Accès rapide.</p>
        <Button onClick={() => ouvrir(null)} className="shrink-0 rounded-full"><Plus className="mr-1.5 h-4 w-4" /> Nouveau</Button>
      </div>
      {!liste ? (
        <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-foreground/50" /></div>
      ) : !liste.length ? (
        <p className="py-8 text-center text-sm text-foreground/55">Aucun coup de cœur pour le moment.</p>
      ) : liste.map((c) => {
        const etat = etatAdmin(c);
        return (
          <article key={c.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl brand-gradient"><Music className="h-5 w-5 text-white" /></div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{c.title}</p>
              <p className="truncate text-xs text-foreground/55">{[c.artist, libelleAudience(c.audience)].filter(Boolean).join(" · ")}</p>
              <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-bold ${etat.cle === "affiche" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-foreground/60"}`}>
                {etat.cle === "affiche" && <Heart className="h-3 w-3" fill="currentColor" />} {etat.texte}
              </span>
            </div>
            <div className="flex w-full justify-end gap-1 border-t border-border pt-2">
            <button type="button" onClick={() => basculer(c)} title={c.actif ? "Retirer de l'accueil" : "Afficher sur l'accueil"} aria-label={c.actif ? "Retirer de l'accueil" : "Afficher sur l'accueil"} className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-muted">
              {c.actif ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <button type="button" onClick={() => cloche(c)} disabled={notif === c.id} title="Envoyer une notification" aria-label={`Envoyer une notification pour ${c.title}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-primary hover:bg-muted disabled:opacity-50">
              {notif === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
            </button>
            <button type="button" onClick={() => ouvrir(c)} title="Modifier" aria-label={`Modifier ${c.title}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-full hover:bg-muted">
              <Pencil className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => supprimer(c)} title="Supprimer" aria-label={`Supprimer ${c.title}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-red-600 hover:bg-red-500/10 dark:text-red-400">
              <Trash2 className="h-4 w-4" />
            </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
