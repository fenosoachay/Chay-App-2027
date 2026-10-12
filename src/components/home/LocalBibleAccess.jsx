import { Link } from 'react-router-dom';
import { BookOpen, Search, BookMarked } from 'lucide-react';
const MODULES = [
  { view: 'reader', label: 'Bible · Français et Malagasy', icon: BookOpen },
  { view: 'concordance', label: 'Concordance', icon: Search },
  { view: 'dictionary', label: 'Dictionnaire', icon: BookMarked },
];
export default function LocalBibleAccess() {
  return <section className="mt-6">
    <h2 className="font-heading text-xl font-bold">Contenus bibliques hors ligne</h2>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      {MODULES.map(({ view, label, icon: Icon }) => <Link key={view} to={`/bible?view=${view}`} className="rounded-2xl border border-border bg-card p-5 text-sm font-bold">
        <Icon className="mb-3 h-6 w-6 text-primary" />{label}
      </Link>)}
    </div>
    <div className="mt-5 flex flex-wrap gap-4 text-sm text-muted-foreground">
      {['Communauté', 'Messages', 'Favoris cloud'].map(label => <span key={label} aria-disabled="true" className="opacity-60">{label} · Connexion requise</span>)}
    </div>
  </section>;
}