import React from "react";
import { Link } from "react-router-dom";
import useMemberDirectory from "@/hooks/useMemberDirectory";

// Nom d'un membre, toujours à jour (nom + prénom de « Mon compte ») et cliquable
// vers son profil. `fallback` sert pour les membres sans profil public.
export default function MemberName({ userId, fallback, className = "", onClick }) {
  const { nameOf } = useMemberDirectory();
  const name = nameOf(userId, fallback);
  if (!userId) return <span className={className}>{name}</span>;
  return (
    <Link
      to={`/profile/${userId}`}
      onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
      className={`hover:underline ${className}`}
    >
      {name}
    </Link>
  );
}