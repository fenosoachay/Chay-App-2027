import React, { useState } from "react";
import { Camera, Check, Loader2, Pencil, Search, UserMinus, UserPlus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { uploadToBase44 } from "@/lib/upload";
import { confirmFr } from "@/lib/confirmFr";
import { useToast } from "@/components/ui/use-toast";
import Avatar from "@/components/messages/Avatar";
import RognerPhotoGroupe from "@/components/messages/RognerPhotoGroupe";
import { isOnline } from "@/hooks/usePresence";

const simplifier = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Nom et photo du groupe, modifiables par l'admin du groupe (ou un admin de l'app). */
export function EnteteGroupe({ conversation, peutGerer, onUpdated }) {
  const { toast } = useToast();
  const [edition, setEdition] = useState(false);
  const [nom, setNom] = useState(conversation?.name || "");
  const [envoi, setEnvoi] = useState(false);
  const [aRogner, setARogner] = useState(null); // photo choisie, en attente du recadrage carré

  const enregistrer = async (champs) => {
    setEnvoi(true);
    try {
      await base44.entities.Conversation.update(conversation.id, champs);
      toast({ title: "Groupe mis à jour" });
      setEdition(false);
      onUpdated?.();
    } catch (e) {
      toast({ title: "Modification impossible", description: e.message, variant: "destructive" });
    } finally {
      setEnvoi(false);
    }
  };
  const changerPhoto = async (fichier) => {
    if (!fichier) return;
    setARogner(null);
    setEnvoi(true);
    try {
      const photo_url = await uploadToBase44(fichier);
      await enregistrer({ photo_url });
    } catch (e) {
      toast({ title: "Photo non envoyée", description: e.message, variant: "destructive" });
      setEnvoi(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 px-4 pb-4 pt-6 text-center">
      <div className="relative">
        {conversation?.photo_url ? (
          <img src={conversation.photo_url} alt="" data-photo-profil className="h-24 w-24 rounded-full object-cover ring-2 ring-border" />
        ) : (
          <div className="grid h-24 w-24 place-items-center rounded-full brand-gradient text-3xl font-bold text-white">
            {String(conversation?.name || "?").charAt(0).toUpperCase()}
          </div>
        )}
        {peutGerer && (
          <label className="absolute -bottom-1 -right-1 grid h-9 w-9 cursor-pointer place-items-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow" aria-label="Changer la photo du groupe">
            {envoi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setARogner(f); }} />
          </label>
        )}
      </div>
      {edition ? (
        <div className="flex w-full max-w-xs items-center gap-2">
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value.slice(0, 60))}
            autoFocus
            placeholder="Nom du groupe"
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm font-semibold outline-none focus:border-primary"
          />
          <button
            type="button"
            disabled={!nom.trim() || envoi}
            onClick={() => enregistrer({ name: nom.trim() })}
            aria-label="Enregistrer le nom"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full brand-gradient text-white disabled:opacity-40"
          >
            {envoi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </button>
        </div>
      ) : (
        <div className="flex max-w-full items-center gap-1.5">
          <span className="truncate font-display text-xl font-extrabold">{conversation?.name || "Groupe"}</span>
          {peutGerer && (
            <button type="button" onClick={() => { setNom(conversation?.name || ""); setEdition(true); }} aria-label="Renommer le groupe" className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-foreground/60 hover:bg-muted">
              <Pencil className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
      <p className="text-sm text-foreground/60">{(conversation?.participant_ids || []).length} membres</p>
      <RognerPhotoGroupe file={aRogner} onCancel={() => setARogner(null)} onConfirm={changerPhoto} />
    </div>
  );
}

/**
 * Membres d'un groupe (1.3.27, dans « i » de la conversation) : tout le monde voit la liste ; l'admin du groupe
 * (ou un admin de l'app) peut retirer un membre et en ajouter (route serveur updateConversationParticipants).
 */
export default function GroupeMembres({ conversation, user, profiles, peutGerer, onUpdated }) {
  const { toast } = useToast();
  const [ajout, setAjout] = useState(false);
  const [filtre, setFiltre] = useState("");
  const [occupe, setOccupe] = useState(null);
  const ids = conversation?.participant_ids || [];
  const profil = (uid) => profiles.find((p) => p.created_by_id === uid);
  const membres = ids
    .map((uid) => ({ uid, p: profil(uid) }))
    .sort((a, b) => {
      if (a.uid === conversation?.admin_id) return -1;
      if (b.uid === conversation?.admin_id) return 1;
      return String(a.p?.display_name || "").localeCompare(String(b.p?.display_name || ""), "fr");
    });
  const f = simplifier(filtre).trim();
  const candidats = profiles
    .filter((p) => p.created_by_id && !ids.includes(p.created_by_id) && !p.systeme)
    .filter((p) => !f || simplifier(p.display_name).includes(f))
    .sort((a, b) => String(a.display_name || "").localeCompare(String(b.display_name || ""), "fr"));

  const changer = async (suivants, message, uid) => {
    setOccupe(uid);
    try {
      await base44.entities.Conversation.update(conversation.id, { participant_ids: suivants });
      toast({ title: message });
      onUpdated?.();
    } catch (e) {
      toast({ title: "Modification impossible", description: e.message, variant: "destructive" });
    } finally {
      setOccupe(null);
    }
  };
  const retirer = async (uid, nom) => {
    if (!(await confirmFr({ title: `Retirer ${nom} du groupe ?`, message: "Cette personne ne verra plus les nouveaux messages du groupe.", confirmLabel: "Retirer" }))) return;
    await changer(ids.filter((x) => x !== uid), `${nom} a été retiré du groupe`, uid);
  };
  const ajouter = (p) => changer([...ids, p.created_by_id], `${p.display_name || "Membre"} a été ajouté`, p.created_by_id);

  return (
    <div className="space-y-3">
      {peutGerer && (
        <button
          type="button"
          onClick={() => setAjout((v) => !v)}
          aria-expanded={ajout}
          className={`flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold ${ajout ? "border border-border" : "brand-gradient text-white"}`}
        >
          <UserPlus className="h-4 w-4" /> {ajout ? "Terminé" : "Ajouter des membres"}
        </button>
      )}

      {ajout && (
        <div className="rounded-[14px] border border-border bg-card p-2">
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
            <input
              type="search"
              value={filtre}
              onChange={(e) => setFiltre(e.target.value)}
              placeholder="Chercher un membre"
              className="w-full rounded-full border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="max-h-72 space-y-0.5 overflow-y-auto">
            {candidats.length ? candidats.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={occupe === p.created_by_id}
                onClick={() => ajouter(p)}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-muted disabled:opacity-50"
              >
                <Avatar name={p.display_name} src={p.avatar_url} size={36} online={isOnline(p.last_seen_at)} />
                <span className="min-w-0 flex-1 truncate font-semibold">{p.display_name || "Membre"}</span>
                {occupe === p.created_by_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="text-sm font-bold text-primary">Ajouter</span>}
              </button>
            )) : <p className="py-4 text-center text-sm text-foreground/50">Aucun autre membre trouvé.</p>}
          </div>
        </div>
      )}

      <div className="divide-y divide-border overflow-hidden rounded-[12px] border border-border">
        {membres.map(({ uid, p }) => {
          const nom = uid === user?.id ? "Vous" : p?.display_name || "Membre";
          const estAdmin = uid === conversation?.admin_id;
          return (
            <div key={uid} className="flex items-center gap-3 bg-card px-3 py-2.5">
              <Avatar name={p?.display_name || "?"} src={p?.avatar_url} size={40} online={isOnline(p?.last_seen_at)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{nom}</span>
                {estAdmin && <span className="text-xs font-bold text-primary">Admin du groupe</span>}
              </span>
              {peutGerer && !estAdmin && uid !== user?.id && (
                <button
                  type="button"
                  disabled={occupe === uid}
                  onClick={() => retirer(uid, p?.display_name || "Ce membre")}
                  aria-label={`Retirer ${p?.display_name || "ce membre"}`}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  {occupe === uid ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />} Retirer
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
