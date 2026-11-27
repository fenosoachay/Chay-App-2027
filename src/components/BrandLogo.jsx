// Novembre 2026 : logo plat (sans effet 3D) : bleu du logo en mode clair, blanc en mode sombre.
import blueLogo from "../public/assets/egc-logo-plat.png";

export default function BrandLogo({ className }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className || ""}`}
      role="img"
      aria-label="Église Chay"
    >
      <img
        src={blueLogo}
        alt=""
        className="h-full w-full object-contain dark:brightness-0 dark:invert"
      />
    </span>
  );
}
