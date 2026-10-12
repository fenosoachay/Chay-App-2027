import { useState } from 'react';
import { getAccessToken } from '@base44/sdk';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import ThemeToggle from '@/components/ThemeToggle';
import BrandLogo from '@/components/BrandLogo';

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
    <header className="sticky top-0 z-30 border-b border-border bg-background p-4">
      <div className="mx-auto max-w-6xl flex flex-wrap items-center gap-4">
        <Link to="/" className="flex items-center gap-2 font-heading font-bold">
          <BrandLogo className="h-10 w-10" />CHAY
        </Link>
        <NavLink to="/" end className="text-sm">Accueil</NavLink>
        <NavLink to="/bible" className="text-sm">Bible</NavLink>
        <div className="ml-auto flex items-center gap-2"><ThemeToggle />
          <button onClick={connect} disabled={connecting} className="rounded-full brand-gradient px-4 py-2 text-sm font-bold text-white transition duration-300 hover:scale-105 active:scale-95 disabled:opacity-50">{connecting ? 'Connexion…' : 'Se connecter ou créer un compte'}</button>
        </div>
      </div>
      {message && <p role="status" className="mx-auto max-w-6xl mt-2 text-xs text-muted-foreground">{message}</p>}
      {authError && <p role="alert" className="mx-auto max-w-6xl mt-2 text-sm">Connexion requise. <Link to="/login" className="text-primary underline">Ouvrir la connexion</Link></p>}
    </header>
    <Outlet />
  </div>;
}