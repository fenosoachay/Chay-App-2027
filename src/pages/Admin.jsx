import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2, Menu } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useDonationAlerts } from "@/hooks/useDonationAlerts";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import AdminSidebarNav from "@/components/admin/nav/AdminSidebarNav";
import AdminBreadcrumb from "@/components/admin/nav/AdminBreadcrumb";
import { ADMIN_NAV, findNav, findNavByPath } from "@/components/admin/nav/adminNavConfig";
import AdminContent from "@/components/admin/AdminContent";
import InviteAdminDialog from "@/components/admin/InviteAdminDialog";

const PATH_BY_KEY = Object.fromEntries(
  ADMIN_NAV.flatMap((e) => (e.items ? e.items : [e])).map((i) => [i.key, i.path])
);

export default function Admin() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const { unread, refresh: refreshDonations } = useDonationAlerts(user?.role === "admin");

  if (!user) {
    return (
      <div className="py-20 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary mx-auto" />
      </div>
    );
  }
  if (user.role !== "admin") {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="text-foreground/60">Accès réservé aux administrateurs.</p>
      </div>
    );
  }

  const active = findNavByPath(location.pathname);

  const select = (key) => {
    setMenuOpen(false);
    // « Inviter un admin » ouvre la fenêtre d'invitation sans quitter la page.
    if (key === "invite") {
      setInviteOpen(true);
      return;
    }
    navigate(PATH_BY_KEY[key] || "/admin");
  };

  const nav = <AdminSidebarNav active={active} onSelect={select} donationsUnread={unread} />;

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-8 py-6 md:py-10">
      <header className="flex items-center gap-3 mb-6">
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Ouvrir le menu"
          className="lg:hidden h-11 w-11 grid place-items-center rounded-full border border-border bg-card hover:bg-muted transition"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div>
          <h1 className="display-fluid"><span className="brand-gradient-text">Administration</span></h1>
          <p className="mt-1 text-foreground/60">Gérez tout le contenu de l'application CHAY.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 items-start">
        <aside className="hidden lg:block sticky top-6 self-start">
          <div className="rounded-[1.5rem] border border-border bg-card p-3">{nav}</div>
        </aside>

        <main className="min-w-0">
          <AdminBreadcrumb active={active} onHome={() => navigate("/admin")} />
          <div key={active} className="animate-float-in">
            <AdminContent active={active} onNavigate={select} onDonationsChange={refreshDonations} />
          </div>
        </main>
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-[280px] overflow-y-auto p-3 pt-12">
          <SheetTitle className="sr-only">Menu d'administration</SheetTitle>
          {nav}
        </SheetContent>
      </Sheet>

      <InviteAdminDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  );
}