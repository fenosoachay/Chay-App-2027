import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { usePreferences } from "@/lib/PreferencesContext";
import PrefSwitch from "@/components/settings/PrefSwitch";
import { useToast } from "@/components/ui/use-toast";
import { Loader2 } from "lucide-react";

const FIELDS = [
  { key: "in_app_messages", label: "Messages dans l'app", desc: "Notifications in-app pour les nouveaux messages privés." },
  { key: "in_app_nouveautes", label: "Nouveautés dans l'app", desc: "Notifications in-app pour les nouveautés publiées." },
  { key: "email_messages", label: "Messages par e-mail", desc: "Recevoir un e-mail pour les nouveaux messages privés." },
  { key: "email_nouveautes", label: "Nouveautés par e-mail", desc: "Recevoir un e-mail pour les nouveautés publiées." },
];

// Préférences de notifications (messages & nouveautés) persistées sur le compte
// utilisateur (lues par les fonctions backend). Valeurs par défaut : tout activé.
export default function NotificationDeliveryPrefs() {
  const { user } = useAuth();
  // 1.3.35 : canal « E-mail » coupé (ou toutes les notifications) : aucun e-mail ne part, quel que soit le réglage ici.
  const { prefs } = usePreferences();
  const emailsCoupes = prefs?.notif_email === false || prefs?.notifications_enabled === false;
  const { toast } = useToast();
  const [vals, setVals] = useState(() => ({
    in_app_messages: user?.in_app_messages !== false,
    in_app_nouveautes: user?.in_app_nouveautes !== false,
    email_messages: user?.email_messages !== false,
    email_nouveautes: user?.email_nouveautes !== false,
  }));
  const [saving, setSaving] = useState(null);

  const toggle = async (key, val) => {
    setVals((v) => ({ ...v, [key]: val }));
    setSaving(key);
    try {
      await base44.auth.updateMe({ [key]: val });
      toast({ title: "Préférence enregistrée" });
    } catch (e) {
      setVals((v) => ({ ...v, [key]: !val }));
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-1">
      <p className="text-xs font-bold uppercase tracking-wide text-foreground/50 py-1">
        Messages & nouveautés
      </p>
      {FIELDS.map((f) => (
        <PrefSwitch
          key={f.key}
          label={f.label}
          description={f.desc}
          checked={f.key.startsWith("email_") && emailsCoupes ? false : vals[f.key]}
          disabled={f.key.startsWith("email_") && emailsCoupes}
          onChange={(v) => toggle(f.key, v)}
        />
      ))}
      {emailsCoupes && (
        <p className="px-1 pt-1 text-xs font-medium text-primary">Le canal E-mail est coupé : vous ne recevez aucun e-mail.</p>
      )}
      {saving && (
        <p className="text-xs text-foreground/40 flex items-center gap-1 px-1 pt-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Enregistrement…
        </p>
      )}
      <p className="text-xs text-foreground/45 px-1 pt-1">
        Ces préférences s'appliquent aux notifications de messages privés et de
        nouveautés.
      </p>
    </div>
  );
}