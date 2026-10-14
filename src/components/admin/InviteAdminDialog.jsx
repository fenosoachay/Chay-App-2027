import React, { useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

export default function InviteAdminDialog({ open, onOpenChange }) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);

  const invite = async () => {
    if (!email.trim()) return;
    setInviting(true);
    try {
      await base44.users.inviteUser(email.trim(), "admin");
      toast({ title: "Invitation envoyée", description: `${email.trim()} a été invité en tant qu'administrateur.` });
      onOpenChange(false);
      setEmail("");
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Inviter un administrateur</DialogTitle>
          <DialogDescription>
            L'invité recevra un lien pour rejoindre l'équipe d'administration de CHAY.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="adresse@email.com"
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <button
            onClick={invite}
            disabled={inviting || !email.trim()}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-bold disabled:opacity-50"
          >
            {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Envoyer l'invitation
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}