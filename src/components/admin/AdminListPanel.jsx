import React, { useEffect, useState } from "react";
import { Loader2, Shield } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Équipe > Gérer les administrateurs : liste des comptes ayant le rôle admin.
export default function AdminListPanel() {
  const [admins, setAdmins] = useState(null);

  useEffect(() => {
    base44.entities.User.filter({ role: "admin" }, "-created_date", 100)
      .then((list) => setAdmins(Array.isArray(list) ? list : []))
      .catch(() => setAdmins([]));
  }, []);

  return (
    <section className="rounded-[2rem] border border-border bg-background/40 p-5 md:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        <h2 className="font-display text-xl font-extrabold">Administrateurs</h2>
      </div>
      {!admins ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <ul className="divide-y divide-border">
          {admins.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-3">
              <div className="grid h-10 w-10 place-items-center rounded-full brand-gradient font-bold text-white">
                {(a.full_name || a.email || "?").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="truncate font-bold">{a.full_name || "—"}</div>
                <div className="truncate text-sm text-foreground/60">{a.email}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}