import { Link } from 'react-router-dom';
import { BookOpen, Search, BookMarked, Star, ChevronRight } from 'lucide-react';

const MODULES = [
  { to: '/bible?view=reader', label: 'Bible', icon: BookOpen },
  { to: '/bible?view=concordance', label: 'Concordance', icon: Search },
  { to: '/bible?view=dictionary', label: 'Dictionnaire', icon: BookMarked },
  { to: '/bible?view=dictionary&favorites=1', label: 'Favoris', icon: Star },
];

export default function LocalBibleAccess() {
  return <section className="mt-6">
    <Link
      to="/bible?view=reader"
      className="group flex items-center justify-between gap-4 rounded-[1.75rem] brand-gradient p-6 md:p-8 text-white shadow-lg transition duration-300 hover:scale-[1.01] hover:shadow-xl active:scale-[0.98]"
    >
      <span className="flex items-center gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-white/20">
          <BookOpen className="h-7 w-7" />
        </span>
        <span>
          <span className="block font-display text-xl md:text-2xl font-extrabold">Ouvrir la Bible</span>
          <span className="block text-sm md:text-base text-white/85">Français et Malagasy, hors ligne</span>
        </span>
      </span>
      <ChevronRight className="h-7 w-7 shrink-0 transition-transform duration-300 group-hover:translate-x-1" />
    </Link>

    <div className="mt-8 grid grid-cols-4 gap-1 sm:gap-6 max-w-xl mx-auto">
      {MODULES.map(({ to, label, icon: Icon }) => (
        <Link key={label} to={to} className="group flex flex-col items-center gap-2 text-center">
          <span className="grid h-16 w-16 sm:h-20 sm:w-20 place-items-center rounded-full brand-gradient text-white shadow-md transition duration-300 group-hover:scale-110 group-active:scale-95">
            <Icon className="h-7 w-7 sm:h-8 sm:w-8" />
          </span>
          <span className="text-[0.62rem] sm:text-sm font-bold text-foreground whitespace-nowrap">{label}</span>
        </Link>
      ))}
    </div>
  </section>;
}