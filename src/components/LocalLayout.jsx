import { Link, Outlet, useLocation } from 'react-router-dom';
import ThemeToggle from '@/components/ThemeToggle';
import BrandLogo from '@/components/BrandLogo';
import FondSection from '@/components/FondSection';
import useSombre from '@/hooks/useSombre';
import { fondPour, sectionDe } from '@/lib/fondsSections';

export default function LocalLayout() {
  // 1.4.0 : sans compte aussi, l'accueil et la Bible gardent leur fond animé (Aube dorée, Parchemin de nuit…),
  // comme dans l'appli connectée (Layout.jsx).
  const location = useLocation();
  const sombre = useSombre();
  const section = sectionDe(location.pathname, location.search);

  // Pour multimédia : utiliser le design choisi par l'admin
  const sectionKey = section === "multimedia"
    ? (typeof window !== "undefined" ? localStorage.getItem("chay_multimedia_design") || "multimediaDesign1" : "multimediaDesign1")
    : section;
  const fondForce = fondPour(sectionKey, sombre)?.force;
  return <div className="min-h-screen bg-background text-foreground overflow-x-clip">
    <FondSection cle={section} sombre={sombre} />
    <header
      className="sticky top-0 z-30 border-b border-border bg-background px-3 pb-3 sm:px-4 sm:pb-4"
      style={{ paddingTop: "calc(var(--sa-top) + 0.75rem)" }}
    >
      <div className="mx-auto max-w-6xl flex flex-nowrap items-center gap-2 sm:gap-4">
        <Link to="/" className="flex items-center gap-2 font-heading font-bold">
          <BrandLogo className="h-10 w-10" />
        </Link>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <ThemeToggle />
        </div>
      </div>
    </header>
    <main className={`relative ${fondForce ? "dark text-foreground" : ""}`}>
      <Outlet />
    </main>
  </div>;
}