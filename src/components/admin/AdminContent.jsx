import React, { lazy, Suspense, useState } from "react";
import { Loader2 } from "lucide-react";
import EntityCrud from "@/components/admin/EntityCrud";
import DashboardHome from "@/components/admin/DashboardHome";
import PublishContent from "@/components/admin/PublishContent";
import BibleSyncPanel from "@/components/bible/BibleSyncPanel";
import DonationRequests from "@/components/admin/DonationRequests";
const QuizAdminPanel = lazy(() => import("@/components/admin/quiz/QuizAdminPanel"));
const WordScrambleAdminPanel = lazy(() => import("@/components/admin/wordscramble/WordScrambleAdminPanel"));

const PanelFallback = () => (
  <div className="py-16 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /></div>
);
import AdminListPanel from "@/components/admin/AdminListPanel";
import VersetDuJourSection from "@/components/home/VersetDuJourSection";
import ProchaineReunionSection from "@/components/home/ProchaineReunionSection";
import { SECTIONS } from "@/components/admin/adminSections";
import { findNav } from "@/components/admin/nav/adminNavConfig";

// Contenu principal : choisit le panneau selon la page active.
export default function AdminContent({ active, onNavigate, onDonationsChange }) {
  const [announcementsKey, setAnnouncementsKey] = useState(0);

  if (active === "overview") return <DashboardHome onNavigate={onNavigate} />;
  if (active === "donations") return <DonationRequests onChange={onDonationsChange} />;
  if (active === "publish") return <PublishContent />;
  if (active === "bible_sync") return <BibleSyncPanel />;
  if (active === "quiz") return <Suspense fallback={<PanelFallback />}><QuizAdminPanel /></Suspense>;
  if (active === "wordscramble") return <Suspense fallback={<PanelFallback />}><WordScrambleAdminPanel /></Suspense>;
  if (active === "admins") return <AdminListPanel />;

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
      {section.key === "Announcement" && (
        <ProchaineReunionSection adminOnly onChanged={() => setAnnouncementsKey((k) => k + 1)} />
      )}
      {section.key !== "Devotional" && (
        <EntityCrud
          key={section.key === "Announcement" ? `Announcement-${announcementsKey}` : section.key}
          entity={section.key}
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