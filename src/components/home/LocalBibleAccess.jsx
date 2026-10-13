import { Link } from 'react-router-dom';
import { BookOpen, Search, BookMarked, Star } from 'lucide-react';

const MODULES = [
  { to: '/bible?view=reader', label: 'Bible', icon: BookOpen, circle: 'bg-gradient-to-b from-[#2E7BFF] to-[#0A4BE0]', tile: 'border-[#4A6CFE]/60 bg-[#4A6CFE]/10 shadow-[0_0_22px_rgba(74,108,254,0.35)]' },
  { to: '/bible?view=concordance', label: 'Concordance', icon: Search, circle: 'bg-gradient-to-b from-[#A66BF0] to-[#7A3FD6]', tile: 'border-[#8A56E2]/60 bg-[#8A56E2]/10 shadow-[0_0_22px_rgba(138,86,226,0.35)]' },
  { to: '/bible?view=dictionary', label: 'Dictionnaire', icon: BookMarked, circle: 'bg-gradient-to-b from-[#FF6BBE] to-[#E0338F]', tile: 'border-[#FF57B2]/60 bg-[#FF57B2]/10 shadow-[0_0_22px_rgba(255,87,178,0.35)]' },
  { to: '/bible?view=dictionary&favorites=1', label: 'Favoris', icon: Star, circle: 'bg-gradient-to-b from-[#FFB020] to-[#F57C00]', tile: 'border-[#F59E0B]/60 bg-[#F59E0B]/10 shadow-[0_0_22px_rgba(245,158,11,0.35)]' },
];

// Les 4 modules d'accès à la Bible : tuiles en verre dépoli, icône lumineuse.
export default function LocalBibleAccess() {
  return <section className="mt-6">
    <div className="grid grid-cols-4 gap-2 sm:gap-5 max-w-2xl mx-auto">
      {MODULES.map(({ to, label, icon: Icon, circle, tile }) => (
        <Link
          key={label}
          to={to}
          className={`group flex flex-col items-center gap-2 rounded-2xl border px-1 py-3 sm:py-5 text-center backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:scale-105 active:scale-95 ${tile}`}
        >
          <span className={`grid h-12 w-12 sm:h-16 sm:w-16 place-items-center rounded-full ${circle} text-white shadow-lg`}>
            <Icon className="h-6 w-6 sm:h-8 sm:w-8" />
          </span>
          <span className="text-[0.62rem] sm:text-sm font-bold text-foreground whitespace-nowrap">{label}</span>
        </Link>
      ))}
    </div>
  </section>;
}