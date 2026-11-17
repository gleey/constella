"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ChapterSliderProps {
  currentChapter: number;
  totalChapters: number;
  onChange: (chapter: number) => void;
  disabled?: boolean;
}

export default function ChapterSlider({
  currentChapter,
  totalChapters,
  onChange,
  disabled = false,
}: ChapterSliderProps) {
  const [showJump, setShowJump] = useState(false);
  const [jumpVal, setJumpVal] = useState("");

  // Nilai sementara selama slider di-hold/digeser. onChange baru dipanggil
  // saat jari/mouse dilepas, supaya grafik tidak refetch di setiap pixel
  // (yang tadinya men-disable slider di tengah drag).
  const [draft, setDraftState] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const draftRef = useRef<number | null>(null);

  const setDraft = (value: number | null) => {
    draftRef.current = value;
    setDraftState(value);
  };

  const finishDrag = useCallback(() => {
    const value = draftRef.current;
    draftRef.current = null;
    setDraftState(null);
    if (value !== null && value !== currentChapter) onChange(value);
  }, [currentChapter, onChange]);

  // Lepas mouse/jari di luar slider tetap menyelesaikan drag.
  useEffect(() => {
    if (!isDragging) return;
    const end = () => {
      setIsDragging(false);
      finishDrag();
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [isDragging, finishDrag]);

  // Ganti seri → buang draft dari seri sebelumnya.
  useEffect(() => {
    draftRef.current = null;
    setDraftState(null);
  }, [totalChapters]);

  const clamp = (val: number) => Math.min(totalChapters, Math.max(1, val));

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ch = parseInt(jumpVal, 10);
    if (!isNaN(ch) && ch >= 1 && ch <= totalChapters) {
      onChange(ch);
      setShowJump(false);
      setJumpVal("");
    }
  };

  // Progress fill for the range track (ikuti draft saat sedang digeser)
  const shownChapter = draft ?? currentChapter;
  const pct =
    totalChapters > 1 ? ((shownChapter - 1) / (totalChapters - 1)) * 100 : 0;

  const navBtn =
    "w-8 h-8 rounded-lg flex items-center justify-center bg-white/5 hover:bg-white/10 ring-1 ring-white/10 hover:ring-indigo-500/50 disabled:opacity-40 disabled:pointer-events-none text-slate-300 hover:text-white transition-colors cursor-pointer";

  return (
    <div className="flex items-center gap-2.5 bg-white/[0.04] backdrop-blur-xl ring-1 ring-white/10 rounded-full px-3 py-1.5 shadow-lg shadow-black/30">
      {/* Prev button */}
      <button
        onClick={() => onChange(clamp(currentChapter - 1))}
        disabled={disabled || currentChapter <= 1}
        title="Previous Chapter (←)"
        className={navBtn}
        aria-label="Previous chapter"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Slider + counter */}
      <div className="flex items-center gap-2.5 min-w-[180px] sm:min-w-[240px]">
        <input
          id="chapter-slider"
          type="range"
          min={1}
          max={totalChapters}
          value={shownChapter}
          disabled={disabled}
          onPointerDown={() => setIsDragging(true)}
          onChange={(e) => setDraft(parseInt(e.target.value, 10))}
          onPointerUp={finishDrag}
          onKeyUp={finishDrag}
          onBlur={finishDrag}
          className="chapter-range flex-1 cursor-pointer"
          style={{
            background: `linear-gradient(to right, #6366f1 0%, #818cf8 ${pct}%, #1b2436 ${pct}%, #1b2436 100%)`,
          }}
          aria-label="Chapter"
        />
        <span className="text-xs font-mono font-bold text-white bg-white/5 ring-1 ring-white/10 rounded-md px-2 py-0.5 min-w-[7ch] text-center">
          {shownChapter}/{totalChapters}
        </span>
      </div>

      {/* Next button */}
      <button
        onClick={() => onChange(clamp(currentChapter + 1))}
        disabled={disabled || currentChapter >= totalChapters}
        title="Next Chapter (→)"
        className={navBtn}
        aria-label="Next chapter"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Quick jump */}
      <div className="border-l border-white/10 pl-2.5">
        {showJump ? (
          <form onSubmit={handleJumpSubmit} className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={totalChapters}
              placeholder="Go to..."
              value={jumpVal}
              onChange={(e) => setJumpVal(e.target.value)}
              autoFocus
              className="w-16 px-2 py-1 text-xs bg-[#0b0f19] ring-1 ring-indigo-500/60 rounded-md text-white placeholder-slate-500 focus:outline-none"
            />
            <button
              type="submit"
              className="px-2.5 py-1 text-xs bg-indigo-500 hover:bg-[#818cf8] text-white rounded-md font-semibold transition-colors cursor-pointer"
            >
              Go
            </button>
            <button
              type="button"
              onClick={() => setShowJump(false)}
              className="text-slate-400 hover:text-white text-xs px-1 cursor-pointer"
              aria-label="Cancel jump"
            >
              ✕
            </button>
          </form>
        ) : (
          <button
            onClick={() => setShowJump(true)}
            title="Jump to specific chapter"
            className="text-xs font-semibold text-slate-400 hover:text-[#a5b4fc] px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 ring-1 ring-white/10 transition cursor-pointer"
          >
            Jump
          </button>
        )}
      </div>
    </div>
  );
}
