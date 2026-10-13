import { Link, Outlet } from 'react-router-dom';
import ThemeToggle from '@/components/ThemeToggle';
import BrandLogo from '@/components/BrandLogo';

export default function LocalLayout() {
  return <div className="min-h-screen bg-background text-foreground">
    <header
      className="sticky top-0 z-30 border-b border-border bg-background px-3 pb-3 sm:px-4 sm:pb-4"
      style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
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
    <Outlet />
  </div>;
}