import React from "react";
import { ExternalLink as ExternalLinkIcon } from "lucide-react";
import { openExternal } from "@/lib/openExternal";
import { useToast } from "@/components/ui/use-toast";

export default function ExternalLink({
  href,
  label,
  children,
  className,
  showIcon = false,
  ...props
}) {
  const { toast } = useToast();

  const handleClick = (e) => {
    e.preventDefault();
    openExternal(href).catch((error) => {
      toast({
        title: "Impossible d'ouvrir le lien",
        description: error?.message,
        variant: "destructive",
      });
    });
  };

  return (
    <a
      href={href}
      onClick={handleClick}
      aria-label={label}
      className={className}
      {...props}
    >
      {children}
      {showIcon && <ExternalLinkIcon className="h-3.5 w-3.5 ml-1 inline opacity-70" />}
    </a>
  );
}