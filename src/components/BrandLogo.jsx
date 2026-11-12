import blueLogo from "../public/assets/egc-logo.png";

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
