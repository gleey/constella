"use client";

import { useState, useEffect, type ReactNode } from "react";

interface Props {
  /** Content to show/hide. */
  content?: ReactNode;
  children?: ReactNode;
  /** Whether this content is sensitive. */
  isSensitive: boolean;
  /** Reset key — when this changes, revealed state resets. (Use chapter number.) */
  resetKey: number;
  /** Optional placeholder text when hidden. */
  placeholder?: string;
  /** Optional className. */
  className?: string;
}

/**
 * Renders content collapsed if isSensitive=true.
 * Click to reveal; state resets when resetKey changes.
 */
export default function SpoilerToggle({
  content,
  children,
  isSensitive,
  resetKey,
  placeholder = "[Spoiler ▼]",
  className = "",
}: Props) {
  const [revealed, setRevealed] = useState(false);
  const displayContent = content ?? children;

  // Reset on chapter change (PRD 4.B: reveal-state reset every chapter change)
  useEffect(() => {
    setRevealed(false);
  }, [resetKey]);

  if (!isSensitive) {
    return <span className={className}>{displayContent}</span>;
  }

  if (revealed) {
    return (
      <button
        type="button"
        onClick={() => setRevealed(false)}
        className={`inline-flex items-center gap-1.5 text-left cursor-pointer text-amber-300 hover:text-amber-200 transition ${className}`}
      >
        <span>{displayContent}</span>
        <span className="text-[10px] text-slate-400 font-mono">[Hide ▲]</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setRevealed(true)}
      className={`inline-flex items-center gap-1 text-slate-400 hover:text-purple-300 font-medium text-xs italic cursor-pointer transition ${className}`}
    >
      <span>{placeholder}</span>
    </button>
  );
}
