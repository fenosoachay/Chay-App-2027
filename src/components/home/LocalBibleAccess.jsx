import { Link } from 'react-router-dom';
import { BookOpen, Search, BookMarked, Star } from 'lucide-react';

const MODULES = [
  { to: '/bible?view=reader', label: 'Bible', icon: BookOpen, circle: 'bg-gradient-to-b from-[#2E7BFF] to-[#0A4BE0] shadow-[0_0_18px_rgba(74,108,254,0.5)]' },
  { to: '/bible?view=concordance', label: 'Concordance', icon: Search, circle: 'bg-gradient-to-b from-[#A66BF0] to-[#7A3FD6] shadow-[0_0_18px_rgba(138,86,226,0.5)]' },
  { to: '/bible?view=dictionary', label: 'Dictionnaire', icon: BookMarked, circle: 'bg-gradient-to-b from-[#FF6BBE] to-[#E0338F] shadow-[0_0_18px_rgba(255,87,178,0.5)]' },
  { to: '/bible?view=dictionary&favorites=1', label: 'Favoris', icon: Star, circle: 'bg-gradient-to-b from-[#FFB020] to-[#F57C00] shadow-[0_0_18px_rgba(245,158,11,0.5)]' },
];

// Les 4 modules d'accès à la Bible : icône ronde lumineuse + libellé, sans cadre.
export default function LocalBibleAccess() {
  return <section className="mt-5">
    <div className="grid grid-cols-4 gap-1 sm:gap-5 max-w-2xl mx-auto">
      {MODULES.map(({ to, label, icon: Icon, circle }) => (
        <Link
          key={label}
          to={to}
          className="group flex flex-col items-center gap-1.5 py-2 text-center transition duration-300 hover:-translate-y-1 hover:scale-105 active:scale-95"
        >
          <span className={`grid h-11 w-11 sm:h-16 sm:w-16 place-items-center rounded-full ${circle} text-white`}>
            <Icon className="h-5 w-5 sm:h-8 sm:w-8" />
          </span>
          <span className="text-[0.62rem] sm:text-sm font-bold text-foreground whitespace-nowrap">{label}</span>
        </Link>
      ))}
    </div>
  </section>;
}