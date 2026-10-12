import { Link } from 'react-router-dom';
import { BookOpen, Search, BookMarked, Star, Heart } from 'lucide-react';

const MODULES = [
  { to: '/bible?view=reader', label: 'Bible', icon: BookOpen, color: 'bg-[#4A6CFE]' },
  { to: '/bible?view=concordance', label: 'Concordance', icon: Search, color: 'bg-[#8A56E2]' },
  { to: '/bible?view=dictionary', label: 'Dictionnaire', icon: BookMarked, color: 'bg-[#FF57B2]' },
  { to: '/bible?view=dictionary&favorites=1', label: 'Favoris', icon: Star, color: 'bg-[#F59E0B]' },
];

export default function LocalBibleAccess() {
  return <section className="mt-6">
    <div className="grid grid-cols-4 gap-1 sm:gap-6 max-w-xl mx-auto">
      {MODULES.map(({ to, label, icon: Icon, color }) => (
        <Link key={label} to={to} className="group flex flex-col items-center gap-2 text-center">
          <span className={`grid h-16 w-16 sm:h-20 sm:w-20 place-items-center rounded-full ${color} text-white shadow-md transition duration-300 group-hover:scale-110 group-active:scale-95`}>
            <Icon className="h-7 w-7 sm:h-8 sm:w-8" />
          </span>
          <span className="text-[0.62rem] sm:text-sm font-bold text-foreground whitespace-nowrap">{label}</span>
        </Link>
      ))}
    </div>
    <Link
      to="/donate"
      className="mx-auto mt-6 flex max-w-xs items-center justify-center gap-2 rounded-full border border-border bg-card px-5 py-3 text-sm font-bold text-foreground transition duration-300 hover:scale-105 active:scale-95"
    >
      <Heart className="h-4 w-4 text-pink-500" fill="currentColor" /> Faire un don
    </Link>
  </section>;
}