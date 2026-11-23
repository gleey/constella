import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DEFAULT_ABOUT_CONTENT } from "@/lib/site-page";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "About — Constella",
  description:
    "How Constella keeps character maps spoiler-free and where its data comes from.",
};

export default async function AboutPage() {
  let page: { title: string; content: string } = DEFAULT_ABOUT_CONTENT;

  try {
    const stored = await prisma.sitePage.findUnique({ where: { slug: "about" } });
    if (stored) {
      page = { title: stored.title, content: stored.content };
    }
  } catch (error) {
    console.error("Failed to load about page:", error);
  }

  const paragraphs = page.content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <div className="min-h-screen bg-[#0b0f19] aurora text-slate-100">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
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

        <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-[#818cf8]">
          About the project
        </p>
        <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-white">
          {page.title}
        </h1>

        <div className="mt-8 space-y-5 text-[15px] leading-7 text-slate-300">
          {paragraphs.map((paragraph, index) => (
            <p key={index} className="whitespace-pre-line">
              {paragraph}
            </p>
          ))}
        </div>

        {/* Atribusi Sumber Data & Lisensi (Wajib) */}
        <div className="mt-10 rounded-2xl bg-[#0e1626]/80 ring-1 ring-white/10 p-6 sm:p-7 space-y-5">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-400" />
            <h2 className="text-base font-bold text-white tracking-tight">
              Atribusi Sumber Data &amp; Lisensi
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {/* AniList Credit */}
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">AniList GraphQL API</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                  Metadata
                </span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                Kredit penuh kepada{" "}
                <a
                  href="https://anilist.co"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 font-medium"
                >
                  AniList API
                </a>{" "}
                untuk penyediaan metadata resmi judul, cover sampul, genre, negara asal, dan informasi status rilis manhwa &amp; manga.
              </p>
            </div>

            {/* Fandom Wiki Credit */}
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">Fandom Community Wikis</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  CC-BY-SA 3.0
                </span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                Kredit penuh kepada komunitas penggemar di Fandom Wikis untuk sumber teks biografi profil karakter dan ringkasan alur cerita di bawah lisensi{" "}
                <a
                  href="https://creativecommons.org/licenses/by-sa/3.0/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 font-medium"
                >
                  Creative Commons Attribution-ShareAlike (CC-BY-SA 3.0)
                </a>
                .
              </p>
            </div>

            {/* Wikipedia Credit */}
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">Wikipedia</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-300 border border-sky-500/30">
                  CC-BY-SA 4.0
                </span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                Sumber cadangan karakter: artikel{" "}
                <span className="font-medium">&quot;List of ... characters&quot;</span>{" "}
                dan bagian karakter pada artikel seri, dipakai ketika wiki Fandom tidak memadai, di bawah lisensi{" "}
                <a
                  href="https://creativecommons.org/licenses/by-sa/4.0/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400 hover:text-sky-300 underline underline-offset-2 font-medium"
                >
                  Creative Commons Attribution-ShareAlike (CC-BY-SA 4.0)
                </a>
                .
              </p>
            </div>

            {/* Kitsu Credit */}
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">Kitsu API</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-violet-500/15 text-violet-300 border border-violet-500/30">
                  Roster &amp; Status
                </span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                Sumber cadangan daftar karakter per media, nama alternatif, potret karakter, dan bio singkat, serta status rilis dan verifikasi identitas seri via mapping{" "}
                <span className="font-mono text-[11px]">anilist/manga</span> —{" "}
                <a
                  href="https://kitsu.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-violet-400 hover:text-violet-300 underline underline-offset-2 font-medium"
                >
                  Kitsu
                </a>
                .
              </p>
            </div>

            {/* MangaUpdates Credit */}
            <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">MangaUpdates API</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  Chapter Count
                </span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                Jumlah bab terkini untuk seri yang masih{" "}
                <span className="italic">ongoing</span>, ketika AniList tidak menyediakan angka (AniList melaporkan{" "}
                <span className="font-mono text-[11px]">chapters: null</span> untuk seri yang belum tamat) —{" "}
                <a
                  href="https://www.mangaupdates.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 hover:text-amber-300 underline underline-offset-2 font-medium"
                >
                  MangaUpdates
                </a>
                .
              </p>
            </div>
          </div>
        </div>

        <div className="mt-10 rounded-2xl bg-white/[0.03] ring-1 ring-white/10 p-5 sm:p-6">
          <h2 className="text-sm font-semibold text-white">Keep exploring</h2>
          <p className="mt-2 text-sm text-slate-400">
            Jump into the catalog, pick a series, and move the chapter slider to
            see the cast as it is revealed.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/#catalog"
              className="px-4 py-2 rounded-full text-sm font-semibold bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] text-white hover:brightness-110 transition"
            >
              Browse catalog
            </Link>
            <Link
              href="/"
              className="px-4 py-2 rounded-full text-sm font-medium text-slate-300 bg-white/5 ring-1 ring-white/10 hover:bg-white/10 transition"
            >
              Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
