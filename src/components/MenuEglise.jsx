import React from "react";
import { Link } from "react-router-dom";
import { Menu } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ENTREES_MENU_EGLISE } from "@/lib/menuEglise";

// Icône ☰ à côté des icônes de l'en-tête : « Histoire de l'église » et « Personnel ».
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
        {ENTREES_MENU_EGLISE.map((e) => (
          <DropdownMenuItem key={e.to} asChild>
            <Link to={e.to} className="cursor-pointer py-2.5 text-sm font-semibold">{e.label}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
