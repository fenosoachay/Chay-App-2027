import React, { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { base44 } from "@/api/base44Client";
import { usePreferences } from "@/lib/PreferencesContext";
import PrefSwitch from "@/components/settings/PrefSwitch";
import { useToast } from "@/components/ui/use-toast";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";

export default function PrivacySection() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { prefs, setPref } = usePreferences();
  const [comments, setComments] = useState(!!user?.accepte_commentaires_respect);
  const [busy, setBusy] = useState(false);

  const update = async (patch) => {
    setBusy(true);
    try {
      await base44.auth.updateMe(patch);
      toast({ title: "Préférence enregistrée" });
      return true;
    } catch (e) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const setLocationPersonalization = async (enabled) => {
    if (!enabled) {
      const saved = await update({
        localisation_activee: false,
        location_lat: null,
        location_lng: null,
        location_label: null,
      });
      if (saved) setPref("location_personalization", false);
      return;
    }

    if (!navigator.geolocation) {
      toast({
        title: "Localisation indisponible",
        description: "Votre appareil ne permet pas d'obtenir votre position.",
        variant: "destructive",
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const saved = await update({
          localisation_activee: true,
          location_lat: coords.latitude,
          location_lng: coords.longitude,
        });
        if (saved) setPref("location_personalization", true);
      },
      (error) => toast({
        title: "Position non partagée",
        description: error.message || "Autorisez l'accès à la localisation pour activer cette option.",
        variant: "destructive",
      }),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
    );
  };

  return (
    <div className="space-y-1">
      <PrefSwitch
        label="Afficher mon statut en ligne"
        description="Si désactivé, vous êtes invisible et ne voyez pas le statut des autres (réciprocité)."
        checked={prefs.presence_visible !== false}
        onChange={(v) => setPref("presence_visible", v)}
      />
      <PrefSwitch
        label="Personnalisation basée sur la localisation"
        description="Facultatif. Votre position précise est demandée uniquement à l'activation et supprimée lorsque vous désactivez cette option."
        checked={prefs.location_personalization}
        disabled={busy}
        onChange={setLocationPersonalization}
      />

      <div className="border-t border-border my-2" />
      <div className="py-2">
        <p className="text-sm font-semibold">Contrôle de la localisation</p>
        <p className="text-xs text-foreground/50">
          Vous pouvez retirer l'accès à tout moment dans les paramètres de votre
          appareil ou désactiver cette option ici. Les coordonnées enregistrées
          sont alors supprimées du profil.
        </p>
      </div>

      <div className="border-t border-border my-2" />
      <PrefSwitch
        label="Accepter les commentaires respectueux"
        checked={comments}
        disabled={busy}
        disabled={busy}
        onChange={(v) => {
          setComments(v);
          update({ accepte_commentaires_respect: v });
        }}
      />

      <div className="border-t border-border my-2" />
      <div className="py-2">
        <p className="text-sm font-semibold">Copie de mes données</p>
        <p className="text-xs text-foreground/50">
          Pour demander une copie de vos données, contactez l'équipe via la page
          Contact.
        </p>
        <Link
          to="/contact"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary mt-1"
        >
          Demander une copie <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
