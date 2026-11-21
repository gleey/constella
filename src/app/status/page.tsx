import { prisma } from "@/lib/prisma";
import Link from "next/link";
import StatusClient from "@/components/StatusClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Catalog & Lore Coverage — Constella",
  description:
    "View which series have full character relationship graphs (Tier 3) vs. base metadata only (Tier 1).",
};

interface MediaCoverage {
  id: string;
  title: string;
  coverImage: string | null;
  totalChapters: number;
  characterCount: number;
  relationshipCount: number;
}

function getTier(media: MediaCoverage): "tier3" | "tier2" | "tier1" {
  if (media.relationshipCount > 0) return "tier3";
  if (media.characterCount > 0) return "tier2";
  return "tier1";
}

const TIER_LABELS = {
  tier3: "Tier 3 — Relasi Aktif",
  tier2: "Tier 2 — Karakter Saja",
  tier1: "Tier 1 — Metadata Saja",
} as const;

const TIER_BADGE_STYLE = {
  tier3: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  tier2: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  tier1: "bg-slate-500/15 text-slate-300 border-slate-500/30",
} as const;

const TIER_DESCRIPTIONS = {
  tier3: "Graph relasi karakter penuh tersedia. Geser chapter untuk mengeksplorasi aliansi, rivalitas, dan lineage tanpa spoiler.",
  tier2: "Daftar karakter dan profil dasar tersedia, namun relasi antar karakter belum diekstrak/ditingkatkan.",
  tier1: "Hanya metadata katalog dasar (judul, cover, genre, status rilis) dari AniList. Lore & relasi belum diisi.",
} as const;

export default async function StatusPage() {
  const allMedia = await prisma.media.findMany({
    select: {
      id: true,
      title: true,
      coverImage: true,
      totalChapters: true,
      _count: {
        select: { characters: true, relationships: true },
      },
    },
    orderBy: { title: "asc" },
  });

  const mediaWithCoverage: MediaCoverage[] = allMedia.map((m) => ({
    id: m.id,
    title: m.title,
    coverImage: m.coverImage,
    totalChapters: m.totalChapters,
    characterCount: m._count.characters,
    relationshipCount: m._count.relationships,
  }));

  const stats = {
    total: mediaWithCoverage.length,
    tier3: mediaWithCoverage.filter((m) => getTier(m) === "tier3").length,
    tier2: mediaWithCoverage.filter((m) => getTier(m) === "tier2").length,
    tier1: mediaWithCoverage.filter((m) => getTier(m) === "tier1").length,
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] aurora text-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="w-4 h-4"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to home
        </Link>

        <div className="mt-8 flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#818cf8]">
            Status Katalog & Lore Coverage
          </p>
        </div>

        <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-white">
          Catalog & Lore Coverage
        </h1>
        <p className="mt-2 text-slate-400 max-w-2xl">
          Memahami kedalaman data setiap seri. {stats.tier3} dari {stats.total} seri telah memiliki graph relasi
          interaktif (Tier 3). Sisanya masih pada tahap pengumpulan karakter (Tier 2) atau metadata dasar (Tier 1).
        </p>

        {/* Stats Cards */}
        <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { key: "total", label: "Total Seri", value: stats.total, color: "indigo" },
            { key: "tier3", label: "Tier 3 — Relasi Aktif", value: stats.tier3, color: "emerald" },
            { key: "tier2", label: "Tier 2 — Karakter Saja", value: stats.tier2, color: "amber" },
            { key: "tier1", label: "Tier 1 — Metadata Saja", value: stats.tier1, color: "slate" },
          ].map((s) => (
            <div
              key={s.key}
              className="p-5 rounded-2xl bg-[#111827] ring-1 ring-white/5 hover:ring-indigo-500/30 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {s.label}
                </span>
                <span
                  className={`w-2 h-2 rounded-full bg-${s.color}-500/60 ${
                    s.key !== "total" ? "animate-pulse" : ""
                  }`}
                />
              </div>
              <div className="mt-2 text-3xl sm:text-4xl font-bold text-white">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Tier Legend */}
        <div className="mt-8 p-4 rounded-xl bg-white/[0.02] border border-white/5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Penjelasan Tier
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            {["tier3", "tier2", "tier1"].map((tier) => (
              <div
                key={tier}
                className={`p-3 rounded-xl border ${
                  TIER_BADGE_STYLE[tier as keyof typeof TIER_BADGE_STYLE]
                }`}
              >
                <div className="font-semibold text-white mb-1">
                  {TIER_LABELS[tier as keyof typeof TIER_LABELS]}
                </div>
                <p className="text-slate-300 leading-relaxed">
                  {TIER_DESCRIPTIONS[tier as keyof typeof TIER_DESCRIPTIONS]}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Client-side Filter/Search Component */}
        <StatusClient
          initialMedia={mediaWithCoverage}
        />
      </div>
    </div>
  );
}