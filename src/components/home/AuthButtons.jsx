import { useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, Pencil, ArrowRight } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';

const BTN = "group flex w-full items-center justify-between rounded-full px-6 py-3.5 text-sm font-bold text-white shadow-lg transition duration-300 hover:scale-105 active:scale-95";

// Boutons « Se connecter » et « Créer un compte » (mode local / invité).
export default function AuthButtons() {
  const { authError } = useAuth();
  const [message, setMessage] = useState('');

  const connect = () => {
    if (!navigator.onLine) { setMessage('Connexion internet requise pour votre compte.'); return; }
    window.location.href = '/login';
  };

  const register = () => {
    if (!navigator.onLine) { setMessage('Connexion internet requise pour votre compte.'); return; }
    window.location.href = '/register';
  };

  return (
    <section className="mt-8 flex flex-col items-center gap-3 max-w-sm mx-auto">
      <button
        onClick={connect}
        className={`${BTN} bg-gradient-to-r from-[#1E90FF] via-[#4A6CFE] to-[#8A56E2] shadow-[0_0_24px_rgba(74,108,254,0.45)]`}
      >
        <UserPlus className="h-5 w-5" />
        <span>Se connecter</span>
        <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
      </button>
      <button
        onClick={register}
        className={`${BTN} bg-gradient-to-r from-[#8A56E2] via-[#B14FD8] to-[#FF57B2] shadow-[0_0_24px_rgba(177,79,216,0.45)]`}
      >
        <Pencil className="h-5 w-5" />
        <span>Créer un compte</span>
        <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
      </button>
      {message && <p role="status" className="text-center text-xs text-muted-foreground">{message}</p>}
      {authError && (
        <p role="alert" className="text-center text-sm">
          Connexion requise. <Link to="/login" className="text-primary underline">Ouvrir la connexion</Link>
        </p>
      )}
    </section>
  );
}