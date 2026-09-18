"use client";

import { useState } from "react";

interface SearchResult {
  id: number;
  title: string;
  coverImage: string;
  chapters: number | null;
  countryOfOrigin: string;
  format: string;
}

interface IngestResult {
  characterName: string;
  status: string;
  draftId: string;
}

export default function IngestPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [chapterNumberingSource, setChapterNumberingSource] = useState("official_en");
  const [totalChapters, setTotalChapters] = useState("");
  const [wikiSubdomain, setWikiSubdomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [ingestResults, setIngestResults] = useState<IngestResult[]>([]);
  const [error, setError] = useState("");

  async function handleSearch() {
    if (!query.trim()) return;
    const res = await fetch(`/api/admin/anilist/search?q=${encodeURIComponent(query)}`);
    setResults(await res.json());
  }

  function handleSelect(r: SearchResult) {
    setSelected(r);
    setTotalChapters(String(r.chapters ?? ""));
    // Guess wiki subdomain from title
    setWikiSubdomain(r.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, ""));
  }

  async function handleIngest() {
    if (!selected) return;
    setLoading(true);
    setError("");
    setIngestResults([]);

    try {
      const res = await fetch("/api/admin/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anilistId: selected.id,
          chapterNumberingSource,
          totalChapters: Number(totalChapters),
          wikiSubdomain,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Ingest failed");
        return;
      }

      const data = await res.json();
      setIngestResults(data.results);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Ingest Media</h1>

      {/* Search */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Search AniList..."
          className="flex-1 border rounded px-3 py-2 bg-gray-900 text-white border-gray-700"
        />
        <button onClick={handleSearch} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          Search
        </button>
      </div>

      {/* Results */}
      {results.length > 0 && !selected && (
        <div className="space-y-2 mb-6">
          {results.map((r) => (
            <button
              key={r.id}
              onClick={() => handleSelect(r)}
              className="w-full flex items-center gap-3 p-3 border border-gray-700 rounded hover:bg-gray-800 text-left"
            >
              <img src={r.coverImage} alt="" className="w-12 h-16 object-cover rounded" />
              <div>
                <div className="font-medium">{r.title}</div>
                <div className="text-sm text-gray-400">
                  {r.format} · {r.countryOfOrigin} · {r.chapters ?? "?"} chapters
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Config */}
      {selected && (
        <div className="space-y-4 mb-6 p-4 border border-gray-700 rounded">
          <div className="flex items-center gap-3">
            <img src={selected.coverImage} alt="" className="w-16 h-20 object-cover rounded" />
            <div>
              <div className="font-bold text-lg">{selected.title}</div>
              <div className="text-sm text-gray-400">AniList ID: {selected.id}</div>
            </div>
            <button onClick={() => { setSelected(null); setResults([]); }} className="ml-auto text-sm text-red-400 hover:text-red-300">
              Change
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm text-gray-400">Chapter Numbering Source</span>
              <select
                value={chapterNumberingSource}
                onChange={(e) => setChapterNumberingSource(e.target.value)}
                className="mt-1 w-full border rounded px-3 py-2 bg-gray-900 text-white border-gray-700"
              >
                <option value="official_en">Official EN</option>
                <option value="raw_kr">Raw KR</option>
                <option value="raw_jp">Raw JP</option>
                <option value="scanlation">Scanlation</option>
              </select>
            </label>

            <label className="block">
              <span className="text-sm text-gray-400">Total Chapters</span>
              <input
                type="number"
                value={totalChapters}
                onChange={(e) => setTotalChapters(e.target.value)}
                className="mt-1 w-full border rounded px-3 py-2 bg-gray-900 text-white border-gray-700"
              />
            </label>

            <label className="block col-span-2">
              <span className="text-sm text-gray-400">Fandom Wiki Subdomain</span>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-gray-500">https://</span>
                <input
                  type="text"
                  value={wikiSubdomain}
                  onChange={(e) => setWikiSubdomain(e.target.value)}
                  className="flex-1 border rounded px-3 py-2 bg-gray-900 text-white border-gray-700"
                />
                <span className="text-gray-500">.fandom.com</span>
              </div>
            </label>
          </div>

          <button
            onClick={handleIngest}
            disabled={loading || !totalChapters}
            className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? "Ingesting..." : "Start Ingestion"}
          </button>
        </div>
      )}

      {/* Error */}
      {error && <div className="p-3 bg-red-900/50 border border-red-700 rounded text-red-300 mb-4">{error}</div>}

      {/* Ingest Results */}
      {ingestResults.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Ingestion Results</h2>
          {ingestResults.map((r, i) => (
            <div key={i} className="flex justify-between p-2 border border-gray-700 rounded">
              <span>{r.characterName}</span>
              <span className={
                r.status === "PENDING" ? "text-green-400" :
                r.status === "UNRESOLVED" ? "text-yellow-400" :
                r.status === "SKIPPED" ? "text-gray-400" :
                "text-red-400"
              }>
                {r.status}
              </span>
            </div>
          ))}
          <a href="/admin/review" className="inline-block mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            Go to Review
          </a>
        </div>
      )}
    </div>
  );
}
