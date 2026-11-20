import Link from "next/link";

export const metadata = {
  title: "Page not found — Constella",
};

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#0b0f19] aurora text-slate-100 flex items-center justify-center px-4">
      <div className="max-w-lg w-full text-center">
        <div className="relative inline-flex items-center justify-center">
          <div className="absolute inset-0 blur-3xl bg-[#6366f1]/30 rounded-full" />
          <span className="relative text-[88px] sm:text-[120px] font-black leading-none bg-gradient-to-br from-white via-[#c7d2fe] to-[#818cf8] bg-clip-text text-transparent">
            404
          </span>
        </div>

        <h1 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight text-white">
          This page drifted out of the constellation
        </h1>
        <p className="mt-3 text-sm sm:text-base text-slate-400">
          The link may be broken, the series may have moved, or the page never
          existed. Try heading back to the catalog.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="px-5 py-2.5 rounded-full text-sm font-semibold bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] text-white hover:brightness-110 transition"
          >
            Back to home
          </Link>
          <Link
            href="/#catalog"
            className="px-5 py-2.5 rounded-full text-sm font-medium text-slate-300 bg-white/5 ring-1 ring-white/10 hover:bg-white/10 transition"
          >
            Browse catalog
          </Link>
        </div>
      </div>
    </div>
  );
}
