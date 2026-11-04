import React from "react";
import AnimatedBlobs from "@/components/home/AnimatedBlobs";

export default function AuthPageBackground({ children, className = "" }) {
  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-background text-foreground">
      <AnimatedBlobs />
      <div className={`relative z-10 min-h-screen ${className}`}>{children}</div>
    </div>
  );
}
