import React from "react";

/**
 * Lien externe. Le dialogue de confirmation est géré nativement par Capacitor
 * et traduit en français via les ressources Android (values-fr/strings.xml).
 */
export default function ExternalLink({ href, label, children, className, ...props }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      className={className}
      {...props}
    >
      {children}
    </a>
  );
}
