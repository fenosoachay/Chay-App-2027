import { useState } from 'react';
import { getAccessToken } from '@base44/sdk';
import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import ThemeToggle from '@/components/ThemeToggle';
import BrandLogo from '@/components/BrandLogo';
import { CapacitorBackHandler } from '@/components/CapacitorBackHandler';

export default function LocalLayout() {
  const { authError, checkAppState } = useAuth();
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState('');
  const connect = async () => {
    if (!navigator.onLine) { setMessage('Connexion internet requise pour votre compte.'); return; }
    if (!getAccessToken()) { window.location.href = '/login'; return; }
    setConnecting(true);
    await checkAppState();
    setConnecting(false);
    setMessage('Si le serveur est indisponible, la lecture locale reste accessible.');
  };
  return <div className="min-h-screen bg-background text-foreground">
    <CapacitorBackHandler />
    <header
      className="sticky top-0 z-30 border-b border-border bg-background px-3 pb-3 sm:px-4 sm:pb-4"
      style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
    >
      <div className="mx-auto max-w-6xl flex flex-nowrap items-center gap-2 sm:gap-4">
        <Link to="/" className="flex items-center gap-2 font-heading font-bold">
          <BrandLogo className="h-10 w-10" />
        </Link>
        <div className="ml-auto flex min-w-0 items-center gap-2"><ThemeToggle />
          <button onClick={connect} disabled={connecting} className="whitespace-nowrap rounded-full brand-gradient px-3 py-2 text-xs sm:px-4 sm:text-sm font-bold text-white transition duration-300 hover:scale-105 active:scale-95 disabled:opacity-50">{connecting ? 'Connexion…' : 'Se connecter ou créer un compte'}</button>
        </div>
      </div>
      {message && <p role="status" className="mx-auto max-w-6xl mt-2 text-xs text-muted-foreground">{message}</p>}
      {authError && <p role="alert" className="mx-auto max-w-6xl mt-2 text-sm">Connexion requise. <Link to="/login" className="text-primary underline">Ouvrir la connexion</Link></p>}
    </header>
    <Outlet />
  </div>;
}