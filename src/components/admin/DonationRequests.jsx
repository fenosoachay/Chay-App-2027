import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Heart, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

const STATUS_LABEL = { pending: "En attente", contacted: "Contacté", processed: "Traité" };

const formatDate = (iso) => {
  const d = new Date(iso);
  const date = d.toLocaleDateString("fr-FR");
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return `${date} à ${time}`;
};

// Section admin « Demandes de don » : liste, lien vers le profil, changement de statut.
export default function DonationRequests({ onChange }) {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const page = await base44.entities.DonationRequest.filter({}, { sort: "-created_date", limit: 100 });
    setItems(page.items);
    setLoading(false);
    // Les demandes affichées sont considérées comme vues.
    const unseen = page.items.filter((r) => !r.is_read);
    if (unseen.length) {
      await base44.entities.DonationRequest.updateMany(
        { is_read: { $ne: true } },
        { $set: { is_read: true } }
      );
      onChange?.();
    }
  }, [onChange]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => base44.entities.DonationRequest.subscribe(() => { load(); }), [load]);

  const markContacted = async (id) => {
    await base44.entities.DonationRequest.update(id, { status: "contacted" });
    toast({ title: "Statut mis à jour", description: "Demande marquée comme contactée." });
    load();
  };

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <section className="rounded-[2rem] border border-border bg-background/40 p-5 md:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Heart className="h-5 w-5 text-pink-500" fill="currentColor" />
        <h2 className="font-display text-xl font-extrabold">Demandes de don</h2>
      </div>
      {items.length === 0 ? (
        <p className="py-8 text-center text-foreground/60">Aucune demande pour le moment.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((r) => (
            <li key={r.id} className="rounded-2xl border border-border bg-card p-4">
              <p className="font-semibold">
                ❤️{" "}
                <Link to={`/profile/${r.userId}`} className="text-primary underline">{r.username}</Link>
                {" — "}{r.message}
              </p>
              <p className="mt-1 text-sm text-foreground/60">
                📅 {formatDate(r.created_date)} &nbsp;|&nbsp; Statut : {STATUS_LABEL[r.status] || r.status}
              </p>
              {r.status === "pending" && (
                <button
                  onClick={() => markContacted(r.id)}
                  className="mt-3 rounded-full brand-gradient px-4 py-2 text-sm font-bold text-white"
                >
                  Marquer comme contacté
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}