"use client";

interface Props {
  chapter: number;
  totalChapters: number;
  onChange: (chapter: number) => void;
}

export default function ChapterSlider({ chapter, totalChapters, onChange }: Props) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 bg-gray-900 rounded-lg border border-gray-800">
      <label htmlFor="chapter-slider" className="text-sm font-medium text-gray-300 whitespace-nowrap">
        Chapter
      </label>
      <input
        id="chapter-slider"
        type="range"
        min={1}
        max={totalChapters}
        value={chapter}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="flex-1 h-2 accent-indigo-500 cursor-pointer"
      />
      <span className="text-sm font-mono text-gray-200 min-w-[5ch] text-right">
        {chapter}/{totalChapters}
      </span>
    </div>
  );
}
