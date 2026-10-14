import React, { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { ADMIN_NAV, findNav } from "@/components/admin/nav/adminNavConfig";

const linkBase =
  "w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition-colors text-left border-l-4";
const linkIdle = "border-transparent text-foreground/70 hover:bg-primary/10";
const linkActive = "border-primary bg-primary/15 text-primary";

function Badge({ n }) {
  if (!n) return null;
  return <span className="ml-auto rounded-full bg-pink-500 px-2 py-0.5 text-xs font-bold text-white">{n}</span>;
}

// Sidebar à accordéons : une seule section ouverte à la fois.
export default function AdminSidebarNav({ active, onSelect, donationsUnread = 0 }) {
  const activeGroup = findNav(active).group?.id || null;
  const [openId, setOpenId] = useState(activeGroup);

  // La section parente reste ouverte tant qu'un de ses sous-liens est actif.
  useEffect(() => {
    if (activeGroup) setOpenId(activeGroup);
  }, [activeGroup]);

  return (
    <nav className="space-y-1" aria-label="Navigation administration">
      {ADMIN_NAV.map((entry) => {
        const Icon = entry.icon;
        if (!entry.items) {
          return (
            <button
              key={entry.key}
              onClick={() => onSelect(entry.key)}
              className={`${linkBase} ${active === entry.key ? linkActive : linkIdle}`}
            >
              <Icon className="h-4 w-4 shrink-0" /> {entry.label}
            </button>
          );
        }
        const open = openId === entry.id;
        const groupBadge = entry.items.some((i) => i.key === "donations") ? donationsUnread : 0;
        return (
          <div key={entry.id}>
            <button
              onClick={() => setOpenId(open ? null : entry.id)}
              aria-expanded={open}
              className={`${linkBase} ${activeGroup === entry.id ? "border-transparent text-primary" : linkIdle} hover:bg-primary/10`}
            >
              <Icon className="h-4 w-4 shrink-0" /> {entry.label}
              {!open && <Badge n={groupBadge} />}
              <ChevronRight
                className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""} ${!open && groupBadge ? "" : "ml-auto"}`}
              />
            </button>
            <div
              className={`grid transition-all duration-200 ease-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
            >
              <div className="overflow-hidden">
                <div className="ml-4 mt-1 space-y-0.5 border-l border-border pl-2">
                  {entry.items.map((item) => {
                    const SubIcon = item.icon;
                    return (
                      <button
                        key={item.key}
                        tabIndex={open ? 0 : -1}
                        onClick={() => onSelect(item.key)}
                        className={`${linkBase} py-2 font-semibold ${active === item.key ? linkActive : linkIdle}`}
                      >
                        <SubIcon className="h-4 w-4 shrink-0" /> {item.label}
                        {item.key === "donations" && <Badge n={donationsUnread} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}