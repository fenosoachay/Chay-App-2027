import React from "react";
import { Link } from "react-router-dom";
import { Menu } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ENTREES_MENU_EGLISE } from "@/lib/menuEglise";

// Icône ☰ à côté des icônes de l'en-tête : « Histoire de l'église », « Personnel », Vision, But, Confession.
export default function MenuEglise({ className = "" }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={`h-9 w-9 grid place-items-center rounded-full border border-border ${className}`}
        aria-label="Menu de l'église"
      >
        <Menu className="h-[17px] w-[17px]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[12rem]">
        {ENTREES_MENU_EGLISE.map((e) => {
          const Icon = e.icon;
          return (
            <DropdownMenuItem key={e.to} asChild>
              <Link to={e.to} className="flex items-center gap-2 cursor-pointer py-2.5 text-sm font-semibold">
                {Icon && <Icon className="h-4 w-4" />}
                <span>{e.label}</span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
