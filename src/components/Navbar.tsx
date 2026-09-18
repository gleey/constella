"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Home" },
    { href: "/#catalog", label: "Catalog" },
  ];

  return (
    <nav className="sticky top-0 z-40 border-b border-[#1e293b] bg-[#0b0f19]/90 backdrop-blur-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Logo + links */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 font-bold text-lg tracking-tight">
            <span className="w-8 h-8 rounded-lg bg-[#1e293b] border border-[#334155] text-[#a5b4fc] flex items-center justify-center text-sm font-black shadow-inner">
              SF
            </span>
            <span className="text-white font-black tracking-tight text-base sm:text-lg">
              SpoilerFree <span className="text-[#818cf8] font-medium text-sm">Map</span>
            </span>
          </Link>
          <div className="flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  pathname === l.href
                    ? "bg-[#1e293b] text-[#a5b4fc]"
                    : "text-slate-400 hover:text-slate-200 hover:bg-[#161f30]"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Right side placeholder / future links */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 font-medium hidden md:inline">
            Zero-Spoiler Dynamic Map
          </span>
        </div>
      </div>
    </nav>
  );
}
