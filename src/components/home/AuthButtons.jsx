import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';

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
    <section className="mt-8 flex flex-col items-center gap-3 max-w-xs mx-auto">
      <button
        onClick={connect}
        className="w-full rounded-full brand-gradient px-5 py-3 text-sm font-bold text-white shadow-md transition duration-300 hover:scale-105 active:scale-95 disabled:opacity-50"
      >
        Se connecter
      </button>
      <button
        onClick={register}
        className="w-full rounded-full brand-gradient px-5 py-3 text-sm font-bold text-white shadow-md transition duration-300 hover:scale-105 active:scale-95"
      >
        Créer un compte
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