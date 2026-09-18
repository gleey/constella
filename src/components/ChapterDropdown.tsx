"use client";

import { useState } from "react";

interface ChapterDropdownProps {
  currentChapter: number;
  totalChapters: number;
  onChange: (chapter: number) => void;
  disabled?: boolean;
}

export default function ChapterDropdown({
  currentChapter,
  totalChapters,
  onChange,
  disabled = false,
}: ChapterDropdownProps) {
  const [jumpVal, setJumpVal] = useState("");
  const [showJump, setShowJump] = useState(false);

  const handleSelect = (val: string) => {
    const ch = parseInt(val, 10);
    if (!isNaN(ch) && ch >= 1 && ch <= totalChapters) {
      onChange(ch);
    }
  };

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
    <div className="flex items-center gap-2 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-xl px-3 py-1.5 shadow-xl text-white">
      {/* Prev Button */}
      <button
        onClick={() => onChange(Math.max(1, currentChapter - 1))}
        disabled={disabled || currentChapter <= 1}
        title="Previous Chapter"
        className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* Chapter Dropdown */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-purple-400">Chapter</span>
        <select
          value={currentChapter}
          onChange={(e) => handleSelect(e.target.value)}
          disabled={disabled}
          className="bg-slate-800 border border-slate-600 rounded-lg px-2.5 py-1 text-sm font-bold text-white focus:outline-none focus:border-purple-500 cursor-pointer min-w-[90px]"
        >
          {Array.from({ length: totalChapters }, (_, i) => i + 1).map((ch) => (
            <option key={ch} value={ch} className="bg-slate-900 text-white">
              Ch. {ch}
            </option>
          ))}
        </select>
        <span className="text-xs text-slate-400">/ {totalChapters}</span>
      </div>

      {/* Next Button */}
      <button
        onClick={() => onChange(Math.min(totalChapters, currentChapter + 1))}
        disabled={disabled || currentChapter >= totalChapters}
        title="Next Chapter"
        className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-300 transition-colors cursor-pointer"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Quick Jump Modal Trigger */}
      <div className="border-l border-slate-700 pl-2">
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
              className="w-16 px-1.5 py-0.5 text-xs bg-slate-950 border border-purple-500 rounded text-white focus:outline-none"
            />
            <button
              type="submit"
              className="px-2 py-0.5 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded font-medium"
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
            className="text-xs text-slate-400 hover:text-purple-300 px-1.5 py-1 rounded bg-slate-800/60 hover:bg-slate-800 transition"
          >
            Jump
          </button>
        )}
      </div>
    </div>
  );
}
