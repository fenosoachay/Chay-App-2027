import React, { useEffect, useState } from "react";
import { User, UserPlus, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useBackHandler } from "@/hooks/useBackHandler";
import { useNavigate } from "react-router-dom";

// Nom affiché : champ `name` (StaffMember) ; prenom/nom gardés en secours.
const nomDe = (s) => s?.name || [s?.prenom, s?.nom].filter(Boolean).join(" ");

// Page Personnel : grille 2 colonnes, fiches cliquables vers /profile/{user_id}
export default function StaffView() {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    // Liste gérée dans l'admin : Engagement › Personnel (entité StaffMember : name, role, photo_url, order).
    base44.entities.StaffMember.list("order", 100)
      .then((rows) => setItems(Array.isArray(rows) ? rows : []))
      .catch(() => setItems([]));
  }, []);

  useBackHandler(detail !== null, () => setDetail(null));

  if (items === null) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-8 py-6 md:py-10">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="h-11 w-11 shrink-0 rounded-2xl brand-gradient grid place-items-center text-white">
            <User className="h-5 w-5" aria-hidden="true" />
          </span>
          <h1 className="font-display font-extrabold text-3xl brand-gradient-text">En service</h1>
        </div>
        {/* Admin : bouton pour créer/modifier (optionnel, via admin) */}
      </header>

      {!items.length ? (
        <p className="text-foreground/60 text-center py-12">Aucun membre du personnel pour le moment.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:gap-4">
          {items.map((staff) => (
            <StaffCard key={staff.id} staff={staff} onOpen={() => setDetail(staff)} />
          ))}
        </div>
      )}

      {/* Modal détail : ouvre le profil utilisateur lié */}
      <Dialog open={detail !== null} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-2xl">
              {nomDe(detail)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {detail?.photo_url && (
              <img src={detail.photo_url} alt="" className="mx-auto h-32 w-32 rounded-full object-cover border-4 border-primary/20" />
            )}
            <div className="text-center">
              <p className="font-bold text-lg">{nomDe(detail)}</p>
              {detail?.role && <p className="text-foreground/60">{detail.role}</p>}
            </div>
            {detail?.user_id && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setDetail(null);
                    navigate(`/profile/${detail.user_id}`);
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 font-bold text-primary-foreground hover:opacity-90"
                >
                  <UserPlus className="h-4 w-4" /> Voir le profil complet
                </button>
              </div>
            )}
            <p className="text-xs text-foreground/50 text-center">Fermez pour revenir à la liste.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StaffCard({ staff, onOpen }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col items-center gap-2 text-center md:flex-row md:items-start md:gap-4 md:text-left rounded-2xl border border-border bg-card p-3 md:p-4 transition-colors hover:bg-muted/40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {staff.photo_url ? (
        <img src={staff.photo_url} alt="" className="h-16 w-16 md:h-20 md:w-20 shrink-0 rounded-full object-cover" />
      ) : (
        <div className="h-16 w-16 md:h-20 md:w-20 shrink-0 rounded-full bg-primary/10 grid place-items-center text-primary">
          <User className="h-8 w-8" />
        </div>
      )}
      <div className="flex-1 min-w-0 w-full">
        <h3 className="font-display font-bold text-base md:text-lg truncate">{nomDe(staff)}</h3>
        {staff.role && <p className="mt-1 text-xs md:text-sm text-foreground/60">{staff.role}</p>}
      </div>
      <span className="hidden md:inline text-foreground/40">›</span>
    </button>
  );
}