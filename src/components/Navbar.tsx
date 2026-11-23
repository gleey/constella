"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Home" },
    { href: "/#catalog", label: "Catalog" },
    { href: "/about", label: "About" },
    { href: "/methodology", label: "Methodology" },
    { href: "/status", label: "Status" },
  ];

  return (
    <nav className="sticky top-0 z-40 border-b border-white/5 bg-[#0b0f19]/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center gap-3 sm:gap-7">
        {/* Logo + links */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] text-white flex items-center justify-center text-[13px] font-black shadow-lg shadow-indigo-950/40 ring-1 ring-white/10">
            C
          </span>
          <span className="text-white font-bold tracking-tight text-base sm:text-lg">
            Constella
          </span>
        </Link>

        {/* Mobile: rail bisa digeser horizontal, tidak memotong layar */}
        <div className="flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-2.5 sm:px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${pathname === l.href
                  ? "bg-white/5 text-[#a5b4fc] ring-1 ring-white/10"
                  : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
                }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
