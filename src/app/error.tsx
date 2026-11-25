"use client";

import Link from "next/link";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[70vh] bg-[#0b0f19] text-slate-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-400">
          Unexpected Error
        </p>
        <h1 className="text-2xl font-bold text-white">
          Something went wrong while loading this page
        </h1>
        <p className="text-sm text-slate-400">
          Please try again in a moment or return to the catalog.
        </p>
        <div className="pt-2 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 rounded-full text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer"
          >
            Try again
          </button>
          <Link
            href="/#catalog"
            className="px-4 py-2 rounded-full text-sm font-medium text-slate-300 bg-white/5 ring-1 ring-white/10 hover:bg-white/10 transition"
          >
            Back to catalog
          </Link>
        </div>
      </div>
    </div>
  );
}
