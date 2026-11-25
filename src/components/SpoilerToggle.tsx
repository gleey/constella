"use client";

import { useState, type ReactNode } from "react";

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
  placeholder = "Spoiler — tap to reveal",
  className = "",
}: Props) {
  // Reset automatically whenever resetKey changes (PRD 4.B) without an effect.
  const [revealedKey, setRevealedKey] = useState<number | null>(null);
  const revealed = revealedKey === resetKey;
  const displayContent = content ?? children;

  if (!isSensitive) {
    return <span className={className}>{displayContent}</span>;
  }

  if (revealed) {
    return (
      <button
        type="button"
        onClick={() => setRevealedKey(null)}
        className={`inline-flex items-center gap-1.5 text-left cursor-pointer text-amber-300 hover:text-amber-200 transition ${className}`}
      >
        <span>{displayContent}</span>
        <span className="text-[10px] text-slate-400 font-semibold">Hide</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setRevealedKey(resetKey)}
      className={`inline-flex items-center gap-1 text-slate-400 hover:text-purple-300 font-medium text-xs italic cursor-pointer transition ${className}`}
    >
      <span>{placeholder}</span>
    </button>
  );
}
