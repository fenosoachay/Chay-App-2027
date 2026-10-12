import { Link } from 'react-router-dom';
export default function LocalAccessNotice() {
  return <main className="mx-auto max-w-xl p-8 text-center">
    <h1 className="font-heading text-xl font-bold">Connexion requise</h1>
    <p className="mt-3 text-muted-foreground">Cette fonctionnalité nécessite un compte et une connexion internet. Les contenus bibliques restent accessibles sans compte.</p>
    <Link to="/bible" className="mt-6 inline-block rounded-full bg-primary px-5 py-3 text-primary-foreground">Ouvrir la Bible</Link>
    <Link to="/" className="ml-4 text-primary">Accueil</Link>
  </main>;
}