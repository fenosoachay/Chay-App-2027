import React from "react";
import Avatar from "@/components/messages/Avatar";

// Petit avatar affiché à côté d'un message reçu : photo de profil si elle existe,
// sinon l'initiale du prénom. `visible=false` garde la place (messages groupés).
export default function MessageAvatar({ profile, fallbackName, visible = true, size = 32 }) {
  if (!visible) return <div className="shrink-0" style={{ width: size }} />;
  const name = profile?.display_name || fallbackName || "Membre";
  return <Avatar name={name} src={profile?.avatar_url} size={size} />;
}