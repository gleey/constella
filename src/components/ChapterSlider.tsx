"use client";

import { useState } from "react";

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

  return (
    <div className="flex items-center gap-2 bg-[#111827]/90 backdrop-blur-md border border-[#27354f] rounded-xl px-3 py-1.5 shadow-xl">
      {/* Prev Button */}
      <button
        onClick={() => onChange(clamp(currentChapter - 1))}
        disabled={disabled || currentChapter <= 1}
        title="Previous Chapter (←)"
        className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#161f30] hover:bg-[#1e293b] disabled:opacity-40 text-slate-300 hover:text-white transition-colors cursor-pointer"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Slider + Counter */}
      <div className="flex items-center gap-2 min-w-[180px] sm:min-w-[240px]">
        <input
          id="chapter-slider"
          type="range"
          min={1}
          max={totalChapters}
          value={currentChapter}
          disabled={disabled}
          onChange={(e) => onChange(parseInt(e.target.value, 10))}
          className="flex-1 h-1.5 accent-[#818cf8] cursor-pointer"
        />
        <span className="text-xs font-mono font-bold text-white min-w-[6ch] text-right">
          {currentChapter}/{totalChapters}
        </span>
      </div>

      {/* Next Button */}
      <button
        onClick={() => onChange(clamp(currentChapter + 1))}
        disabled={disabled || currentChapter >= totalChapters}
        title="Next Chapter (→)"
        className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#161f30] hover:bg-[#1e293b] disabled:opacity-40 text-slate-300 hover:text-white transition-colors cursor-pointer"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Quick Jump */}
      <div className="border-l border-[#27354f] pl-2">
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
              className="w-16 px-1.5 py-0.5 text-xs bg-[#0b0f19] border border-[#818cf8] rounded text-white focus:outline-none"
            />
            <button
              type="submit"
              className="px-2 py-0.5 text-xs bg-[#6366f1] hover:bg-[#818cf8] text-white rounded font-medium"
            >
              Go
            </button>
            <button
              type="button"
              onClick={() => setShowJump(false)}
              className="text-slate-400 hover:text-white text-xs px-1"
            >
              ✕
            </button>
          </form>
        ) : (
          <button
            onClick={() => setShowJump(true)}
            title="Jump to specific chapter"
            className="text-xs text-slate-400 hover:text-[#a5b4fc] px-1.5 py-1 rounded bg-[#161f30]/60 hover:bg-[#161f30] transition"
          >
            Jump
          </button>
        )}
      </div>
    </div>
  );
}
