"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface MediaItem {
  id: string;
  anilistId?: number;
  title: string;
  totalChapters: number;
  coverImage: string;
  type?: string;
  chapterNumberingSource?: string;
}

interface BackgroundSyncStatus {
  isRunning: boolean;
  syncMode: "catalog" | "lore" | null;
  startedAt: string | null;
  finishedAt: string | null;
  progress: number;
  currentSeries: string;
  currentCharacter: string;
  totalSeries: number;
  completedSeries: number;
  logs: string[];
  lastError: string | null;
}

interface AniListSearchResult {
  id: number;
  title: string;
  coverImage: string;
  chapters: number | null;
  countryOfOrigin: string;
  format: string;
}

interface DraftItem {
  id: string;
  characterName: string;
  status: string;
  unresolvedNames: string[];
  reviewedAt: string | null;
  createdAt: string;
}

interface LiveRelationship {
  id: string;
  sourceCharacter: { id: string; name: string; imageUrl: string };
  targetCharacter: { id: string; name: string; imageUrl: string };
  relationType: string;
  validFrom: number;
  validUntil: number | null;
  isSensitive: boolean;
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<"catalog" | "ingest" | "review" | "live">("catalog");
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [catalogSearchQuery, setCatalogSearchQuery] = useState("");
  const [selectedMediaId, setSelectedMediaId] = useState<string>("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [bgStatus, setBgStatus] = useState<BackgroundSyncStatus | null>(null);
  const [deletingMediaId, setDeletingMediaId] = useState<string | null>(null);

  // Ingest state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AniListSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<AniListSearchResult | null>(null);
  const [wikiSubdomain, setWikiSubdomain] = useState("");
  const [chapterNumberingSource, setChapterNumberingSource] = useState<"official_en" | "raw_kr" | "raw_jp">("official_en");
  const [totalChapters, setTotalChapters] = useState(200);
  const [autoPublish, setAutoPublish] = useState(true);
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestLogs, setIngestLogs] = useState<string[]>([]);

  // Draft Review state
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(false);

  // Live Editor state
  const [relationships, setRelationships] = useState<LiveRelationship[]>([]);
  const [loadingRelationships, setLoadingRelationships] = useState(false);
  const [editingRelId, setEditingRelId] = useState<string | null>(null);
  const [relEditForm, setRelEditForm] = useState<{
    relationType: string;
    validFrom: number;
    validUntil: number | null;
    isSensitive: boolean;
  }>({ relationType: "", validFrom: 1, validUntil: null, isSensitive: false });

  // New relationship form
  const [characters, setCharacters] = useState<{ id: string; name: string }[]>([]);
  const [newRelForm, setNewRelForm] = useState({
    sourceCharacterId: "",
    targetCharacterId: "",
    relationType: "Ally",
    validFrom: 1,
    validUntil: null as number | null,
    isSensitive: false,
  });

  const loadMedia = async () => {
    try {
      const res = await fetch("/api/media");
      const list: MediaItem[] = await res.json();
      setMediaList(list);
      if (list.length > 0 && !selectedMediaId) {
        setSelectedMediaId(list[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteMedia = async (mediaId: string, mediaTitle: string) => {
    if (!confirm(`Delete "${mediaTitle}" and all its characters, relationships, and factions? This cannot be undone.`)) {
      return;
    }
    setDeletingMediaId(mediaId);
    try {
      const res = await fetch(`/api/media/${mediaId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (res.ok) {
        setSyncStatus(`Deleted "${mediaTitle}"`);
        await loadMedia();
      } else {
        alert(`Failed to delete: ${data.error}`);
      }
    } catch (err) {
      alert(`Network error: ${err}`);
    } finally {
      setDeletingMediaId(null);
    }
  };

  const checkBgStatus = async () => {
    try {
      const res = await fetch("/api/admin/sync");
      if (res.ok) {
        const data: BackgroundSyncStatus = await res.json();
        setBgStatus(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadMedia();
    checkBgStatus();
  }, []);

  // Poll background sync every 2.5s if running
  useEffect(() => {
    if (!bgStatus?.isRunning) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/admin/sync");
        if (res.ok) {
          const data: BackgroundSyncStatus = await res.json();
          setBgStatus(data);
          if (!data.isRunning) {
            await loadMedia(); // refresh list when complete
          }
        }
      } catch {}
    }, 2500);
    return () => clearInterval(interval);
  }, [bgStatus?.isRunning]);

  // Handle AI Lore Sync (Tier 2 — CONSUMES Gemini/Groq tokens)
  const handleStartLoreSync = async (anilistId?: number) => {
    const scope = anilistId ? "1 series ini" : "SEMUA series (±6 karakter/series)";
    if (!confirm(`Jalankan AI Lore Sync untuk ${scope}?\n\nIni MEMAKAN token AI (Gemini/Groq) untuk ekstrak deskripsi, status, relasi, dan faksi dari Fandom wiki.`)) {
      return;
    }
    setIsSyncing(true);
    setSyncStatus("Starting AI lore sync (memakan token AI)...");
    try {
      const res = await fetch("/api/admin/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "lore", anilistId }),
      });
      const data = await res.json();
      if (res.ok) {
        setSyncStatus(data.message || "AI lore sync started!");
        setBgStatus(data.status);
      } else {
        setSyncStatus(`Sync error: ${data.error}`);
      }
    } catch (err) {
      setSyncStatus(`Network error: ${err}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle Catalog Sync (Tier 1 — NO AI, cached AniList + Fandom only)
  const handleStartCatalogSync = async () => {
    setIsSyncing(true);
    setSyncStatus("Starting catalog sync (tanpa AI)...");
    try {
      const res = await fetch("/api/admin/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "catalog" }),
      });
      const data = await res.json();
      if (res.ok) {
        setSyncStatus(data.message || "Catalog sync started!");
        setBgStatus(data.status);
      } else {
        setSyncStatus(`Sync error: ${data.error}`);
      }
    } catch (err) {
      setSyncStatus(`Network error: ${err}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle 1-click Fast Seed Sync
  const handleFastSeedSync = async () => {
    setIsSyncing(true);
    setSyncStatus("Seeding database with curated catalog...");
    try {
      const res = await fetch("/api/admin/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "instant" }),
      });
      const data = await res.json();
      if (res.ok) {
        setSyncStatus(`Fast sync complete! Loaded ${data.results?.length || 0} media series.`);
        await loadMedia();
      } else {
        setSyncStatus(`Sync error: ${data.error}`);
      }
    } catch (err) {
      setSyncStatus(`Network error: ${err}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Search AniList
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/admin/anilist/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        setSearchResults(data);
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load drafts when review tab active
  useEffect(() => {
    if (activeTab !== "review") return;
    setLoadingDrafts(true);
    const url = selectedMediaId ? `/api/admin/drafts?mediaId=${selectedMediaId}` : "/api/admin/drafts";
    fetch(url)
      .then((r) => r.json())
      .then((data) => setDrafts(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoadingDrafts(false));
  }, [activeTab, selectedMediaId]);

  // Load live relationships & characters
  useEffect(() => {
    if (activeTab !== "live" || !selectedMediaId) return;
    setLoadingRelationships(true);

    Promise.all([
      fetch(`/api/admin/relationships?mediaId=${selectedMediaId}`).then((r) => r.json()),
      fetch(`/api/admin/characters?mediaId=${selectedMediaId}`).then((r) => r.json()),
    ])
      .then(([rels, chars]) => {
        setRelationships(Array.isArray(rels) ? rels : []);
        setCharacters(Array.isArray(chars) ? chars : []);
      })
      .catch(console.error)
      .finally(() => setLoadingRelationships(false));
  }, [activeTab, selectedMediaId]);

  // Handle Ingest
  const handleStartIngest = async () => {
    if (!selectedMedia) return;
    setIsIngesting(true);
    setIngestLogs(["Starting ingestion from AniList and Fandom API..."]);

    try {
      const res = await fetch("/api/admin/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anilistId: selectedMedia.id,
          chapterNumberingSource,
          totalChapters,
          wikiSubdomain: wikiSubdomain || selectedMedia.title.toLowerCase().replace(/[^a-z0-9]/g, "-"),
          autoPublish,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setIngestLogs((prev) => [...prev, `Error: ${data.error || "Ingestion failed"}`]);
      } else {
        setIngestLogs((prev) => [
          ...prev,
          `Media: ${data.media?.title || "OK"}`,
          `Characters processed: ${data.charactersCount || 0}`,
          `Drafts created: ${data.draftsCount || 0}`,
          autoPublish ? "Data automatically parsed with Gemini & published live to graph!" : "Drafts saved for review.",
        ]);
        await loadMedia();
      }
    } catch (err) {
      setIngestLogs((prev) => [...prev, `Failed: ${err instanceof Error ? err.message : String(err)}`]);
    } finally {
      setIsIngesting(false);
    }
  };

  // Handle Edit Relationship
  const handleSaveRelEdit = async (relId: string) => {
    try {
      const res = await fetch(`/api/admin/relationships/${relId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(relEditForm),
      });
      if (res.ok) {
        setEditingRelId(null);
        // Refresh relationships
        const updated = await fetch(`/api/admin/relationships?mediaId=${selectedMediaId}`).then((r) => r.json());
        setRelationships(updated);
      } else {
        const err = await res.json();
        alert(`Failed to save: ${err.error}`);
      }
    } catch (err) {
      alert(`Network error: ${err}`);
    }
  };

  // Handle Delete Relationship
  const handleDeleteRel = async (relId: string) => {
    if (!confirm("Delete this relationship?")) return;
    try {
      const res = await fetch(`/api/admin/relationships/${relId}`, { method: "DELETE" });
      if (res.ok) {
        setRelationships((prev) => prev.filter((r) => r.id !== relId));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Handle Create Relationship
  const handleCreateRel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRelForm.sourceCharacterId || !newRelForm.targetCharacterId) {
      alert("Please select both source and target characters");
      return;
    }
    if (newRelForm.sourceCharacterId === newRelForm.targetCharacterId) {
      alert("Source and target characters cannot be the same");
      return;
    }

    try {
      const res = await fetch("/api/admin/relationships", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaId: selectedMediaId,
          ...newRelForm,
        }),
      });

      if (res.ok) {
        const updated = await fetch(`/api/admin/relationships?mediaId=${selectedMediaId}`).then((r) => r.json());
        setRelationships(updated);
        // Reset form
        setNewRelForm({
          sourceCharacterId: "",
          targetCharacterId: "",
          relationType: "Ally",
          validFrom: 1,
          validUntil: null,
          isSensitive: false,
        });
      } else {
        const err = await res.json();
        alert(`Failed to create: ${err.error}`);
      }
    } catch (err) {
      alert(`Network error: ${err}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f19] text-gray-200">
      {/* Header bar */}
      <header className="border-b border-[#1e293b] bg-[#111827]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded text-xs font-semibold bg-[#818cf8]/15 text-[#818cf8] border border-[#818cf8]/30">
                  ADMIN DASHBOARD
                </span>
                <span className="text-xs text-gray-400">Spoiler-Free Temporal Map Engine</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Studio &amp; Content Management
              </h1>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                onClick={() => handleStartLoreSync()}
                disabled={isSyncing || bgStatus?.isRunning}
                className="px-3.5 py-2 bg-[#818cf8]/20 hover:bg-[#818cf8]/30 text-[#818cf8] border border-[#818cf8]/40 rounded-lg text-xs sm:text-sm font-semibold transition-colors flex items-center gap-2 disabled:opacity-50"
                title="AI-powered: ekstrak lore dari Fandom wiki via Gemini/Groq. MEMAKAN token AI."
              >
                {bgStatus?.isRunning ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-[#34d399] animate-pulse" />
                    <span>Syncing ({bgStatus.progress}%)</span>
                  </>
                ) : (
                  <>
                    <span>🤖 AI Lore Sync (pakai token AI)</span>
                  </>
                )}
              </button>
              <button
                onClick={handleStartCatalogSync}
                disabled={isSyncing || bgStatus?.isRunning}
                className="px-3.5 py-2 bg-[#34d399]/15 hover:bg-[#34d399]/25 text-[#34d399] border border-[#34d399]/30 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                title="Tanpa AI: sync cover, karakter & gambar dari AniList + Fandom saja."
              >
                📚 Catalog Sync (gratis)
              </button>
              <button
                onClick={handleFastSeedSync}
                disabled={isSyncing}
                className="px-3.5 py-2 bg-[#38bdf8]/15 hover:bg-[#38bdf8]/25 text-[#38bdf8] border border-[#38bdf8]/30 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                ⚡ Fast Seed Sync
              </button>
              <Link
                href="/"
                className="px-3.5 py-2 bg-[#1e293b] hover:bg-[#334155] text-gray-200 rounded-lg text-xs sm:text-sm font-medium transition-colors"
              >
                Back to Site
              </Link>
            </div>
          </div>

          {syncStatus && (
            <div className="mt-4 p-3 rounded-lg bg-[#1a2333] border border-[#38bdf8]/30 text-xs text-[#38bdf8]">
              {syncStatus}
            </div>
          )}

          {/* Active Background Sync Monitor */}
          {bgStatus && (bgStatus.isRunning || bgStatus.logs.length > 0) && (
            <div className="mt-5 p-4 rounded-xl bg-[#0e1526] border border-[#1e293b]">
              <div className="flex items-center justify-between gap-4 mb-3">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      bgStatus.isRunning ? "bg-[#34d399] animate-ping" : "bg-[#818cf8]"
                    }`}
                  />
                  <span className="text-xs font-bold uppercase tracking-wider text-white">
                    {bgStatus.isRunning
                      ? bgStatus.syncMode === "lore"
                        ? "🤖 AI Lore Sync Active (pakai token AI)"
                        : "📚 Catalog Sync Active (tanpa AI)"
                      : "Last Sync Results"}
                  </span>
                  {bgStatus.currentSeries && (
                    <span className="text-xs text-[#38bdf8] px-2 py-0.5 rounded bg-[#38bdf8]/10 border border-[#38bdf8]/20">
                      Series: {bgStatus.currentSeries}
                    </span>
                  )}
                  {bgStatus.currentCharacter && (
                    <span className="text-xs text-[#a78bfa] px-2 py-0.5 rounded bg-[#a78bfa]/10 border border-[#a78bfa]/20">
                      Character: {bgStatus.currentCharacter}
                    </span>
                  )}
                </div>
                <span className="text-xs font-mono text-gray-400 font-semibold">
                  {bgStatus.completedSeries} / {bgStatus.totalSeries} Series ({bgStatus.progress}%)
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-[#1e293b] rounded-full h-2 overflow-hidden mb-3">
                <div
                  className="bg-[#818cf8] h-2 rounded-full transition-all duration-300"
                  style={{ width: `${bgStatus.progress}%` }}
                />
              </div>

              {/* Live Terminal Log Viewer */}
              <div className="bg-[#070a12] border border-[#1e293b] rounded-lg p-3 max-h-36 overflow-y-auto font-mono text-[11px] text-gray-400 space-y-1">
                {bgStatus.logs.length === 0 ? (
                  <div>Waiting for logs...</div>
                ) : (
                  bgStatus.logs.slice(-15).map((log, i) => (
                    <div key={i} className="leading-relaxed">
                      {log}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Tab navigation */}
          <div className="flex gap-2 mt-6 border-b border-[#1e293b] -mb-px">
            <button
              onClick={() => setActiveTab("catalog")}
              className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "catalog"
                  ? "border-[#818cf8] text-[#818cf8]"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              📚 Manga Catalog ({mediaList.length})
            </button>
            <button
              onClick={() => setActiveTab("ingest")}
              className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "ingest"
                  ? "border-[#818cf8] text-[#818cf8]"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              🚀 Ingest AniList &amp; Fandom
            </button>
            <button
              onClick={() => setActiveTab("live")}
              className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "live"
                  ? "border-[#818cf8] text-[#818cf8]"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              🕸️ Live Relations Editor
            </button>
            <button
              onClick={() => setActiveTab("review")}
              className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "review"
                  ? "border-[#818cf8] text-[#818cf8]"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              📝 Draft Reviews
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Media Series Selector (for live editor and review tabs) */}
        {(activeTab === "live" || activeTab === "review") && (
          <div className="mb-6 p-4 rounded-xl bg-[#131b2e] border border-[#1e293b] flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <label className="text-sm font-semibold text-gray-300">Active Media Series:</label>
              <select
                value={selectedMediaId}
                onChange={(e) => setSelectedMediaId(e.target.value)}
                className="bg-[#0b0f19] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#818cf8]"
              >
                {mediaList.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title} ({m.totalChapters} Ch.)
                  </option>
                ))}
              </select>
            </div>

            {selectedMediaId && (
              <Link
                href={`/media/${selectedMediaId}`}
                className="text-xs text-[#38bdf8] hover:underline flex items-center gap-1"
              >
                Open Live Graph Page ↗
              </Link>
            )}
          </div>
        )}

{/* TAB 1: CATALOG OVERVIEW */}
        {activeTab === "catalog" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Active Manga & Manhwa Series</h2>
                <p className="text-xs text-gray-400">
                  Series loaded into the database with temporal character graphs.
                </p>
              </div>
              <button
                onClick={handleFastSeedSync}
                disabled={isSyncing}
                className="px-3 py-1.5 bg-[#818cf8]/15 hover:bg-[#818cf8]/25 text-[#818cf8] border border-[#818cf8]/30 rounded text-xs font-semibold transition-colors"
              >
                Refresh / Re-sync
              </button>
            </div>

            {/* Search/Filter Bar */}
            <div className="p-4 rounded-xl bg-[#131b2e] border border-[#1e293b]">
              <label className="block text-xs font-semibold text-gray-300 mb-2">Search Series</label>
              <input
                type="text"
                value={catalogSearchQuery}
                onChange={(e) => setCatalogSearchQuery(e.target.value)}
                placeholder="Filter by title..."
                className="w-full bg-[#0b0f19] border border-[#1e293b] rounded-lg px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-[#818cf8]"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mediaList
                .filter((m) =>
                  m.title.toLowerCase().includes(catalogSearchQuery.toLowerCase())
                )
                .map((m) => (
                <div
                  key={m.id}
                  className="p-4 rounded-xl bg-[#131b2e] border border-[#1e293b] flex gap-4 items-center"
                >
                  <img
                    src={m.coverImage}
                    alt={m.title}
                    className="w-16 h-24 object-cover rounded-lg bg-[#0b0f19] shrink-0 border border-[#1e293b]"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-white text-base truncate">{m.title}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Chapters: <span className="text-gray-200 font-semibold">{m.totalChapters}</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Source: <span className="text-[#38bdf8]">{m.chapterNumberingSource || "official_en"}</span>
                    </p>
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/media/${m.id}`}
                        className="px-2.5 py-1 rounded bg-[#38bdf8]/15 text-[#38bdf8] border border-[#38bdf8]/30 text-xs font-medium hover:bg-[#38bdf8]/25 transition-colors"
                      >
                        View Graph
                      </Link>
                      <button
                        onClick={() => {
                          setSelectedMediaId(m.id);
                          setActiveTab("live");
                        }}
                        className="px-2.5 py-1 rounded bg-[#1e293b] text-gray-300 text-xs hover:bg-[#334155] transition-colors"
                      >
                        Edit Relations
                      </button>
                      {m.anilistId && (
                        <button
                          onClick={() => handleStartLoreSync(m.anilistId)}
                          disabled={bgStatus?.isRunning}
                          className="px-2.5 py-1 rounded bg-[#818cf8]/15 text-[#818cf8] border border-[#818cf8]/30 text-xs font-medium hover:bg-[#818cf8]/25 transition-colors disabled:opacity-50"
                        >
                          ⚡ AI Lore Sync
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteMedia(m.id, m.title)}
                        disabled={deletingMediaId === m.id}
                        className="px-2.5 py-1 rounded bg-[#f87171]/15 text-[#f87171] border border-[#f87171]/30 text-xs font-medium hover:bg-[#f87171]/25 transition-colors disabled:opacity-50"
                      >
                        {deletingMediaId === m.id ? "Deleting..." : "🗑 Delete"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: INGESTION */}
        {activeTab === "ingest" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-white">Search &amp; Import from AniList</h2>
                <p className="text-xs text-gray-400">
                  Search manga/manhwa by title. Filters strictly to English and Raw translations.
                </p>
              </div>

              {/* Search input */}
              <div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Type title (e.g. Solo Leveling, Omniscient Reader)..."
                  className="w-full bg-[#131b2e] border border-[#1e293b] rounded-lg px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-[#818cf8]"
                />
              </div>

              {/* Search results dropdown */}
              {isSearching ? (
                <div className="p-4 text-center text-xs text-gray-400">Searching AniList...</div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {searchResults.map((res) => (
                    <div
                      key={res.id}
                      onClick={() => {
                        setSelectedMedia(res);
                        setTotalChapters(res.chapters || 200);
                        setWikiSubdomain(res.title.toLowerCase().replace(/[^a-z0-9]/g, "-"));
                      }}
                      className={`p-3 rounded-lg border flex gap-3 items-center cursor-pointer transition-colors ${
                        selectedMedia?.id === res.id
                          ? "bg-[#818cf8]/10 border-[#818cf8]"
                          : "bg-[#131b2e] border-[#1e293b] hover:bg-[#1a233a]"
                      }`}
                    >
                      <img
                        src={res.coverImage}
                        alt={res.title}
                        className="w-10 h-14 object-cover rounded bg-[#0b0f19] shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-white truncate">{res.title}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {res.format} • {res.countryOfOrigin} • {res.chapters ? `${res.chapters} ch` : "Ongoing"}
                        </div>
                      </div>
                      {selectedMedia?.id === res.id && (
                        <span className="text-xs font-bold text-[#818cf8]">Selected ✓</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : searchQuery.length >= 2 ? (
                <div className="p-4 text-center text-xs text-gray-500">No matching series found</div>
              ) : null}
            </div>

            {/* Ingestion Parameters */}
            <div className="p-6 rounded-xl bg-[#131b2e] border border-[#1e293b] space-y-5">
              <h3 className="font-bold text-white text-base">Ingestion Settings</h3>

              {selectedMedia ? (
                <div className="p-3 rounded-lg bg-[#0b0f19] border border-[#1e293b] flex gap-3 items-center">
                  <img
                    src={selectedMedia.coverImage}
                    alt={selectedMedia.title}
                    className="w-12 h-16 object-cover rounded"
                  />
                  <div>
                    <div className="font-bold text-white text-sm">{selectedMedia.title}</div>
                    <div className="text-xs text-gray-400">AniList ID: {selectedMedia.id}</div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-[#0b0f19] border border-[#1e293b] text-xs text-gray-500 text-center">
                  Select a manga/manhwa from the left panel to configure ingestion
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Fandom Wiki Subdomain
                </label>
                <input
                  type="text"
                  value={wikiSubdomain}
                  onChange={(e) => setWikiSubdomain(e.target.value)}
                  placeholder="e.g. solo-leveling"
                  className="w-full bg-[#0b0f19] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#818cf8]"
                />
                <span className="text-[11px] text-gray-500 mt-1 block">
                  Scrapes character pages from https://&#123;subdomain&#125;.fandom.com
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Chapter Numbering Baseline
                </label>
                <select
                  value={chapterNumberingSource}
                  onChange={(e) => setChapterNumberingSource(e.target.value as any)}
                  className="w-full bg-[#0b0f19] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#818cf8]"
                >
                  <option value="official_en">Official English Translation (Webtoon/Tapas)</option>
                  <option value="raw_kr">Raw Korean (Kakao/Naver)</option>
                  <option value="raw_jp">Raw Japanese (Shueisha/Kodansha)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">
                  Total Chapters
                </label>
                <input
                  type="number"
                  value={totalChapters}
                  onChange={(e) => setTotalChapters(Number(e.target.value))}
                  min={1}
                  className="w-full bg-[#0b0f19] border border-[#1e293b] rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#818cf8]"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="autoPublish"
                  checked={autoPublish}
                  onChange={(e) => setAutoPublish(e.target.checked)}
                  className="rounded border-[#1e293b] bg-[#0b0f19] text-[#818cf8] focus:ring-0"
                />
                <label htmlFor="autoPublish" className="text-xs text-gray-300 cursor-pointer">
                  Direct Publish (parse with Gemini &amp; immediately promote clean data to graph)
                </label>
              </div>

              <button
                onClick={handleStartIngest}
                disabled={!selectedMedia || isIngesting}
                className="w-full py-2.5 rounded-lg bg-[#818cf8] hover:bg-[#a78bfa] text-white font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isIngesting ? "Ingesting & Processing..." : "Start Ingestion Pipeline"}
              </button>

              {/* Logs */}
              {ingestLogs.length > 0 && (
                <div className="p-3 rounded-lg bg-[#0b0f19] border border-[#1e293b] space-y-1 text-xs font-mono max-h-48 overflow-y-auto">
                  {ingestLogs.map((log, i) => (
                    <div key={i} className="text-gray-300">
                      {log}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: LIVE RELATIONS EDITOR */}
        {activeTab === "live" && (
          <div className="space-y-8">
            {/* Create New Relationship Form */}
            <div className="p-6 rounded-xl bg-[#131b2e] border border-[#1e293b]">
              <h3 className="font-bold text-white text-base mb-4">Add New Relationship</h3>
              <form onSubmit={handleCreateRel} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1">Source Character</label>
                  <select
                    value={newRelForm.sourceCharacterId}
                    onChange={(e) => setNewRelForm({ ...newRelForm, sourceCharacterId: e.target.value })}
                    required
                    className="w-full bg-[#0b0f19] border border-[#1e293b] rounded-lg px-3 py-2 text-xs text-gray-200"
                  >
                    <option value="">Select source...</option>
                    {characters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1">Target Character</label>
                  <select
                    value={newRelForm.targetCharacterId}
                    onChange={(e) => setNewRelForm({ ...newRelForm, targetCharacterId: e.target.value })}
                    required
                    className="w-full bg-[#0b0f19] border border-[#1e293b] rounded-lg px-3 py-2 text-xs text-gray-200"
                  >
                    <option value="">Select target...</option>
                    {characters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1">Relation Type</label>
                  <input
                    type="text"
                    value={newRelForm.relationType}
                    onChange={(e) => setNewRelForm({ ...newRelForm, relationType: e.target.value })}
                    required
                    placeholder="e.g. Ally, Enemy, Mentor"
                    className="w-full bg-[#0b0f19] border border-[#1e293b] rounded-lg px-3 py-2 text-xs text-gray-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1">Valid From (Ch.)</label>
                  <input
                    type="number"
                    value={newRelForm.validFrom}
                    onChange={(e) => setNewRelForm({ ...newRelForm, validFrom: Number(e.target.value) })}
                    min={1}
                    required
                    className="w-full bg-[#0b0f19] border border-[#1e293b] rounded-lg px-3 py-2 text-xs text-gray-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1">Valid Until (Ch. / null)</label>
                  <input
                    type="number"
                    value={newRelForm.validUntil ?? ""}
                    onChange={(e) =>
                      setNewRelForm({
                        ...newRelForm,
                        validUntil: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                    placeholder="Ongoing (null)"
                    className="w-full bg-[#0b0f19] border border-[#1e293b] rounded-lg px-3 py-2 text-xs text-gray-200"
                  />
                </div>

                <div className="flex flex-col justify-end">
                  <button
                    type="submit"
                    className="w-full py-2 bg-[#818cf8] hover:bg-[#a78bfa] text-white rounded-lg text-xs font-semibold transition-colors"
                  >
                    + Add Relationship
                  </button>
                </div>
              </form>
            </div>

            {/* Existing Relationships Table */}
            <div className="rounded-xl bg-[#131b2e] border border-[#1e293b] overflow-hidden">
              <div className="p-4 border-b border-[#1e293b] flex items-center justify-between">
                <h3 className="font-bold text-white text-sm">
                  Active Relationships ({relationships.length})
                </h3>
              </div>

              {loadingRelationships ? (
                <div className="p-8 text-center text-xs text-gray-400">Loading relationships...</div>
              ) : relationships.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-500">No relationships found for this series.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-gray-300">
                    <thead className="bg-[#0b0f19] text-gray-400 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="p-3">Source Character</th>
                        <th className="p-3">Target Character</th>
                        <th className="p-3">Relation Type</th>
                        <th className="p-3">Valid From</th>
                        <th className="p-3">Valid Until</th>
                        <th className="p-3">Sensitive?</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e293b]">
                      {relationships.map((r) => {
                        const isEditing = editingRelId === r.id;
                        return (
                          <tr key={r.id} className="hover:bg-[#1a233a] transition-colors">
                            <td className="p-3 font-medium text-white flex items-center gap-2">
                              <img
                                src={r.sourceCharacter.imageUrl}
                                alt={r.sourceCharacter.name}
                                className="w-6 h-6 rounded-full object-cover bg-gray-800"
                              />
                              {r.sourceCharacter.name}
                            </td>
                            <td className="p-3 font-medium text-white">
                              <div className="flex items-center gap-2">
                                <img
                                  src={r.targetCharacter.imageUrl}
                                  alt={r.targetCharacter.name}
                                  className="w-6 h-6 rounded-full object-cover bg-gray-800"
                                />
                                {r.targetCharacter.name}
                              </div>
                            </td>

                            <td className="p-3">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={relEditForm.relationType}
                                  onChange={(e) => setRelEditForm({ ...relEditForm, relationType: e.target.value })}
                                  className="bg-[#0b0f19] border border-[#1e293b] rounded px-2 py-1 text-xs text-white"
                                />
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-[#818cf8]/15 text-[#818cf8] border border-[#818cf8]/20 font-medium">
                                  {r.relationType}
                                </span>
                              )}
                            </td>

                            <td className="p-3">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={relEditForm.validFrom}
                                  onChange={(e) => setRelEditForm({ ...relEditForm, validFrom: Number(e.target.value) })}
                                  className="w-16 bg-[#0b0f19] border border-[#1e293b] rounded px-2 py-1 text-xs text-white"
                                />
                              ) : (
                                `Ch. ${r.validFrom}`
                              )}
                            </td>

                            <td className="p-3">
                              {isEditing ? (
                                <input
                                  type="number"
                                  value={relEditForm.validUntil ?? ""}
                                  onChange={(e) =>
                                    setRelEditForm({
                                      ...relEditForm,
                                      validUntil: e.target.value ? Number(e.target.value) : null,
                                    })
                                  }
                                  placeholder="null"
                                  className="w-16 bg-[#0b0f19] border border-[#1e293b] rounded px-2 py-1 text-xs text-white"
                                />
                              ) : r.validUntil ? (
                                `Ch. ${r.validUntil}`
                              ) : (
                                <span className="text-gray-500">Ongoing</span>
                              )}
                            </td>

                            <td className="p-3">
                              {isEditing ? (
                                <input
                                  type="checkbox"
                                  checked={relEditForm.isSensitive}
                                  onChange={(e) => setRelEditForm({ ...relEditForm, isSensitive: e.target.checked })}
                                  className="rounded border-[#1e293b] bg-[#0b0f19] text-[#818cf8]"
                                />
                              ) : r.isSensitive ? (
                                <span className="text-[#fcd34d] font-semibold">Yes (Spoiler)</span>
                              ) : (
                                <span className="text-gray-400">No</span>
                              )}
                            </td>

                            <td className="p-3 text-right">
                              {isEditing ? (
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => handleSaveRelEdit(r.id)}
                                    className="px-2 py-1 bg-[#34d399]/20 text-[#34d399] rounded text-[11px] font-semibold hover:bg-[#34d399]/30"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setEditingRelId(null)}
                                    className="px-2 py-1 bg-[#1e293b] text-gray-400 rounded text-[11px] hover:text-white"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => {
                                      setEditingRelId(r.id);
                                      setRelEditForm({
                                        relationType: r.relationType,
                                        validFrom: r.validFrom,
                                        validUntil: r.validUntil,
                                        isSensitive: r.isSensitive,
                                      });
                                    }}
                                    className="px-2 py-1 bg-[#1e293b] text-gray-300 rounded text-[11px] hover:bg-[#334155]"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDeleteRel(r.id)}
                                    className="px-2 py-1 bg-[#f87171]/15 text-[#f87171] rounded text-[11px] hover:bg-[#f87171]/25"
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: DRAFT REVIEWS */}
        {activeTab === "review" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white">Draft Reviews &amp; Name Resolution</h2>
              <p className="text-xs text-gray-400">
                Manage ingestion drafts generated by Gemini before promoting them to active tables.
              </p>
            </div>

            {loadingDrafts ? (
              <div className="p-8 text-center text-xs text-gray-400">Loading drafts...</div>
            ) : drafts.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-500">No pending drafts found for this media.</div>
            ) : (
              <div className="space-y-3">
                {drafts.map((d) => (
                  <div
                    key={d.id}
                    className="p-4 rounded-xl bg-[#131b2e] border border-[#1e293b] flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-white text-sm">{d.characterName}</div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        Status:{" "}
                        <span
                          className={`font-semibold ${
                            d.status === "APPROVED"
                              ? "text-[#34d399]"
                              : d.status === "UNRESOLVED"
                              ? "text-[#fcd34d]"
                              : "text-[#38bdf8]"
                          }`}
                        >
                          {d.status}
                        </span>{" "}
                        • Unresolved names: {d.unresolvedNames.length}
                      </div>
                    </div>

                    <Link
                      href={`/admin/review`}
                      className="px-3 py-1.5 bg-[#818cf8]/15 hover:bg-[#818cf8]/25 text-[#818cf8] border border-[#818cf8]/30 rounded text-xs font-semibold transition-colors"
                    >
                      Open Full Reviewer ↗
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
