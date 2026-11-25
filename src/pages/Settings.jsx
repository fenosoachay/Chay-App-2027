import React from "react";
import { Accordion } from "@/components/ui/accordion";
import { usePreferences } from "@/lib/PreferencesContext";
import SettingsSection from "@/components/settings/SettingsSection";
import AccountSection from "@/components/settings/AccountSection";
import SecuritySection from "@/components/settings/SecuritySection";
import NotificationsSection from "@/components/settings/NotificationsSection";
import DisplaySection from "@/components/settings/DisplaySection";
import SpiritualSection from "@/components/settings/SpiritualSection";
import PrivacySection from "@/components/settings/PrivacySection";
import HelpSection from "@/components/settings/HelpSection";
import StockageSection from "@/components/settings/StockageSection";
import AProposSection from "@/components/settings/AProposSection";
import DangerZone from "@/components/settings/DangerZone";
import {
  User,
  ShieldCheck,
  Bell,
  Palette,
  Heart,
  Lock,
  HardDrive,
  Info,
  LifeBuoy,
  Loader2,
} from "lucide-react";

export default function Settings() {
  const { saving } = usePreferences();

  return (
    <div className="mx-auto max-w-3xl px-4 md:px-8 py-6 md:py-10">
      <header className="mb-6">
        <h1 className="font-display font-extrabold text-3xl md:text-4xl">
          <span className="brand-gradient-text">Paramètres</span>
        </h1>
        <p className="mt-2 text-foreground/60 flex items-center gap-2">
          Gérez votre profil et vos préférences
          {saving && (
            <span className="inline-flex items-center gap-1 text-xs text-foreground/40">
              <Loader2 className="h-3 w-3 animate-spin" /> Enregistrement…
            </span>
          )}
        </p>
      </header>

      <Accordion type="single" collapsible defaultValue="" className="w-full">
        <SettingsSection
          value="account"
          icon={User}
          title="Mon compte"
          description="Vos informations personnelles"
        >
          <AccountSection />
        </SettingsSection>

        <SettingsSection
          value="security"
          icon={ShieldCheck}
          title="Sécurité et connexion"
          description="Mot de passe, e-mail et sécurité"
        >
          <SecuritySection />
        </SettingsSection>

        <SettingsSection
          value="notifications"
          icon={Bell}
          title="Notifications"
          description="Verset, annonces et canaux"
        >
          <NotificationsSection />
        </SettingsSection>

        <SettingsSection
          value="display"
          icon={Palette}
          title="Affichage et accessibilité"
          description="Thème, taille du texte, contraste, animations"
        >
          <DisplaySection />
        </SettingsSection>

        <SettingsSection
          value="spiritual"
          icon={Heart}
          title="Mon parcours spirituel"
          description="Informations privées"
        >
          <SpiritualSection />
        </SettingsSection>

        <SettingsSection
          value="privacy"
          icon={Lock}
          title="Confidentialité et données"
          description="Profil, localisation et consentements"
        >
          <PrivacySection />
        </SettingsSection>

        <SettingsSection
          value="stockage"
          icon={HardDrive}
          title="Stockage et données"
          description="Espace utilisé, vider le cache"
        >
          <StockageSection />
        </SettingsSection>

        <SettingsSection
          value="help"
          icon={LifeBuoy}
          title="Aide"
          description="Questions fréquentes, signaler un problème"
        >
          <HelpSection />
        </SettingsSection>

        <SettingsSection
          value="apropos"
          icon={Info}
          title="À propos"
          description="Version de l'application"
        >
          <AProposSection />
        </SettingsSection>
      </Accordion>

      <DangerZone />
    </div>
  );
}
