import React, { lazy, Suspense, useState } from "react";
import { Loader2 } from "lucide-react";
import EntityCrud from "@/components/admin/EntityCrud";
import ReunionsArchivees from "@/components/admin/ReunionsArchivees";
import DashboardHome from "@/components/admin/DashboardHome";
import PublishContent from "@/components/admin/PublishContent";
import BibleSyncPanel from "@/components/bible/BibleSyncPanel";
import DonationRequests from "@/components/admin/DonationRequests";
import AdminThemeRequests from "@/components/requests/AdminThemeRequests";
import JeuxCategoriesAdmin from "@/components/admin/JeuxCategoriesAdmin";
import AdminMissions from "@/components/admin/AdminMissions";
import AnnoncerVersion from "@/components/admin/AnnoncerVersion";
const QuizAdminPanel = lazy(() => import("@/components/admin/quiz/QuizAdminPanel"));
const WordScrambleAdminPanel = lazy(() => import("@/components/admin/wordscramble/WordScrambleAdminPanel"));
const EmojisAdminPanel = lazy(() => import("@/components/admin/emojis/EmojisAdminPanel"));
const PuzzleAdminPanel = lazy(() => import("@/components/admin/puzzles/PuzzleAdminPanel"));
const PersonalityQuizAdminPanel = lazy(() => import("@/components/admin/personality/PersonalityQuizAdminPanel"));
const BlockBlastMessagesAdminPanel = lazy(() => import("@/components/admin/blockblast/BlockBlastMessagesAdminPanel"));

const PanelFallback = () => (
  <div className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></div>
);
import AdminListPanel from "@/components/admin/AdminListPanel";
import GererMembres from "@/components/admin/GererMembres";
import SignalementsTechniques from "@/components/admin/SignalementsTechniques";
import AdminJeuxCarte from "@/components/admin/AdminJeuxCarte";
import DessinsIntegres from "@/components/admin/DessinsIntegres";
import VersetDuJourSection from "@/components/home/VersetDuJourSection";
import ProchaineReunionSection from "@/components/home/ProchaineReunionSection";
import { SECTIONS } from "@/components/admin/adminSections";
import { findNav } from "@/components/admin/nav/adminNavConfig";

// Contenu principal : choisit le panneau selon la page active.
export default function AdminContent({ active, onNavigate, onDonationsChange }) {
  const [announcementsKey, setAnnouncementsKey] = useState(0);

  if (active === "overview") return <DashboardHome onNavigate={onNavigate} />;
  if (active === "donations") return <DonationRequests onChange={onDonationsChange} />;
  if (active === "theme_requests") return <AdminThemeRequests />;
  if (active === "mission_requests") return <AdminMissions />;
  if (active === "publish") return <PublishContent />;
  if (active === "game_categories") return <JeuxCategoriesAdmin />;
  if (active === "bible_sync") return <BibleSyncPanel />;
  if (active === "quiz") return <Suspense fallback={<PanelFallback />}><QuizAdminPanel /></Suspense>;
  if (active === "wordscramble") return <Suspense fallback={<PanelFallback />}><WordScrambleAdminPanel /></Suspense>;
  if (active === "emojis") return <Suspense fallback={<PanelFallback />}><EmojisAdminPanel /></Suspense>;
  if (active === "puzzles") return <Suspense fallback={<PanelFallback />}><PuzzleAdminPanel /></Suspense>;
  if (active === "personalityquiz") return <Suspense fallback={<PanelFallback />}><PersonalityQuizAdminPanel /></Suspense>;
  if (active === "blockblast") return <Suspense fallback={<PanelFallback />}><BlockBlastMessagesAdminPanel /></Suspense>;
  if (active === "admins") return <AdminListPanel />;
  if (active === "membres") return <GererMembres />;
  if (active === "signalements") return <SignalementsTechniques />;
  if (active === "jeux_carte") return <AdminJeuxCarte />;
  if (active === "app_update") return <AnnoncerVersion />;

  const section = SECTIONS.find((s) => s.key === active);
  if (!section) {
    // « Inviter un admin » ouvre la fenêtre d'invitation (géré par la page) ;
    // toute autre page sans contenu affiche un placeholder.
    return (
      <section className="rounded-[2rem] border border-border bg-background/40 p-10 text-center">
        <h2 className="font-display font-extrabold text-xl">{findNav(active).item.label}</h2>
        <p className="mt-2 text-foreground/60">Section en cours de développement</p>
      </section>
    );
  }

  const Icon = section.icon;
  return (
    <section className="rounded-[2rem] border border-border bg-background/40 p-5 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="h-5 w-5 text-primary" />
        <h2 className="font-display font-extrabold text-xl">{section.label}</h2>
      </div>
      {section.key === "Devotional" && <VersetDuJourSection adminOnly />}
      {section.key === "Coloriage" && <DessinsIntegres />}
      {section.key === "Announcement" && (
        <ProchaineReunionSection adminOnly onChanged={() => setAnnouncementsKey((k) => k + 1)} />
      )}
      {section.key === "Announcement" && <ReunionsArchivees refreshKey={announcementsKey} />}
      {section.key !== "Devotional" && (
        <EntityCrud
          key={section.key === "Announcement" ? `Announcement-${announcementsKey}` : section.key}
          entity={section.entity || section.key}
          fixe={section.fixe}
          fields={section.fields}
          listColumns={section.listColumns}
          sort={section.sort}
          readOnly={section.readOnly}
          detailField={section.detailField}
          thumbField={section.thumbField}
          playlistField={section.playlistField}
          showPlaylist={section.showPlaylist}
        />
      )}
    </section>
  );
}
