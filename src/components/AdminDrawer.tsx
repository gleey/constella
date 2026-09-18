"use client";

import { useState, useEffect } from "react";

interface AdminDrawerProps {
  open: boolean;
  onClose: () => void;
}

interface MediaItem {
  id: string;
  title: string;
  totalChapters: number;
  coverImage: string;
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

export default function AdminDrawer({ open, onClose }: AdminDrawerProps) {
  const [activeTab, setActiveTab] = useState<"ingest" | "review" | "live">("ingest");
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [selectedMediaId, setSelectedMediaId] = useState<string>("");

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

  // Load media list on open
  useEffect(() => {
    if (!open) return;
    fetch("/api/media")
      .then((r) => r.json())
      .then((list: MediaItem[]) => {
        setMediaList(list);
        if (list.length > 0 && !selectedMediaId) {
          setSelectedMediaId(list[0].id);
        }
      })
      .catch(console.error);
  }, [open, selectedMediaId]);

  // Load characters and relationships when media selected in Live Editor
  useEffect(() => {
    if (activeTab === "live" && selectedMediaId) {
      loadLiveEntities(selectedMediaId);
    }
    if (activeTab === "review" && selectedMediaId) {
      loadDrafts(selectedMediaId);
    }
  }, [activeTab, selectedMediaId]);

  const loadDrafts = async (mId: string) => {
    setLoadingDrafts(true);
    try {
      const res = await fetch(`/api/admin/drafts?mediaId=${mId}`);
      if (res.ok) {
        const data = await res.json();
        setDrafts(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDrafts(false);
    }
  };

  const loadLiveEntities = async (mId: string) => {
    setLoadingRelationships(true);
    try {
      const [charRes, relRes] = await Promise.all([
        fetch(`/api/admin/characters?mediaId=${mId}`),
        fetch(`/api/admin/relationships?mediaId=${mId}`),
      ]);
      if (charRes.ok) {
        const charData = await charRes.json();
        setCharacters(charData);
      }
      if (relRes.ok) {
        const relData = await relRes.json();
        setRelationships(relData);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingRelationships(false);
    }
  };

  // AniList search
  const handleSearchAniList = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await fetch(`/api/admin/anilist/search?q=${encodeURIComponent(searchQuery)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  };

  // Run Auto Ingestion
  const handleStartIngest = async () => {
    if (!selectedMedia) return;
    setIsIngesting(true);
    setIngestLogs([`Starting ingestion for "${selectedMedia.title}"...`]);

    try {
      const res = await fetch("/api/admin/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anilistId: selectedMedia.id,
          chapterNumberingSource,
          totalChapters: totalChapters || selectedMedia.chapters || 100,
          wikiSubdomain: wikiSubdomain.trim() || selectedMedia.title.toLowerCase().replace(/[^a-z0-9]/g, "-"),
          autoPublish,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setIngestLogs((prev) => [...prev, `Error: ${data.error || "Unknown error"}`]);
      } else {
        setIngestLogs((prev) => [
          ...prev,
          `Ingestion completed for Media ID: ${data.mediaId}`,
          `Processed ${data.results?.length || 0} characters.`,
          ...(data.results?.map((r: { characterName: string; status: string }) => `• ${r.characterName}: ${r.status}`) || []),
        ]);
        // Refresh media list
        const mRes = await fetch("/api/media");
        if (mRes.ok) {
          const list = await mRes.json();
          setMediaList(list);
          setSelectedMediaId(data.mediaId);
        }
      }
    } catch (err) {
      setIngestLogs((prev) => [...prev, `Network error: ${String(err)}`]);
    } finally {
      setIsIngesting(false);
    }
  };

  // Approve Draft
  const handleApproveDraft = async (draftId: string) => {
    try {
      const res = await fetch(`/api/admin/drafts/${draftId}/approve`, { method: "POST" });
      if (res.ok) {
        loadDrafts(selectedMediaId);
      } else {
        const d = await res.json();
        alert(d.error || "Failed to approve draft");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Update Live Relationship
  const handleSaveRelationship = async (relId: string) => {
    try {
      const res = await fetch(`/api/admin/relationships/${relId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(relEditForm),
      });
      if (res.ok) {
        setEditingRelId(null);
        loadLiveEntities(selectedMediaId);
      } else {
        const err = await res.json();
        alert(err.error || "Failed to update relationship");
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Delete Live Relationship
  const handleDeleteRelationship = async (relId: string) => {
    if (!confirm("Are you sure you want to delete this relationship?")) return;
    try {
      const res = await fetch(`/api/admin/relationships/${relId}`, { method: "DELETE" });
      if (res.ok) {
        loadLiveEntities(selectedMediaId);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Add Live Relationship
  const handleAddRelationship = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRelForm.sourceCharacterId || !newRelForm.targetCharacterId) {
      alert("Select both source and target character");
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
        setNewRelForm({
          sourceCharacterId: "",
          targetCharacterId: "",
          relationType: "Ally",
          validFrom: 1,
          validUntil: null,
          isSensitive: false,
        });
        loadLiveEntities(selectedMediaId);
      } else {
        const err = await res.json();
        alert(err.error || "Failed to create relationship");
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-3xl bg-[var(--card)] border-l border-[var(--card-border)] h-full flex flex-col shadow-2xl animate-slide-in-right">
        {/* Header */}
        <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 text-xs font-semibold uppercase tracking-wider bg-indigo-500/20 text-indigo-400 rounded-md border border-indigo-500/30">
              Admin Portal
            </span>
            <h2 className="text-lg font-bold text-white">Database & Ingestion Studio</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--card-border)] bg-gray-950/40 px-4">
          <button
            onClick={() => setActiveTab("ingest")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "ingest"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            1. Auto Ingest & Publish
          </button>
          <button
            onClick={() => setActiveTab("review")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "review"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            2. Draft Reviews
          </button>
          <button
            onClick={() => setActiveTab("live")}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "live"
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            3. Live Relations Editor
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* TAB 1: AUTO INGEST */}
          {activeTab === "ingest" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-white mb-1">
                  Ingest Manga/Manhwa from AniList & Fandom
                </h3>
                <p className="text-xs text-gray-400">
                  Search on AniList, match with Fandom Wiki characters, extract temporal data via Gemini AI, and optionally auto-publish directly to the graph.
                </p>
              </div>

              {/* Search AniList */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                  Search Manga / Manhwa Title
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearchAniList()}
                    placeholder="e.g. Solo Leveling, Omniscient Reader, Tower of God..."
                    className="flex-1 px-3 py-2 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    onClick={handleSearchAniList}
                    disabled={isSearching}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {isSearching ? "Searching..." : "Search"}
                  </button>
                </div>
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && !selectedMedia && (
                <div className="space-y-2">
                  <div className="text-xs text-gray-400">Select a title to ingest:</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto pr-1">
                    {searchResults.map((m) => (
                      <div
                        key={m.id}
                        onClick={() => {
                          setSelectedMedia(m);
                          if (m.chapters) setTotalChapters(m.chapters);
                        }}
                        className="flex gap-3 p-2.5 rounded-lg border border-gray-800 bg-gray-900/60 hover:border-indigo-500/60 hover:bg-gray-800/60 cursor-pointer transition-all"
                      >
                        <img
                          src={m.coverImage}
                          alt={m.title}
                          className="w-12 h-16 object-cover rounded shadow"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm text-white truncate">{m.title}</div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {m.format} • {m.countryOfOrigin}
                          </div>
                          <div className="text-xs text-indigo-400 mt-1">
                            {m.chapters ? `${m.chapters} ch` : "Ongoing"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Selected Media Settings */}
              {selectedMedia && (
                <div className="p-4 rounded-xl border border-indigo-500/40 bg-indigo-950/10 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <img
                        src={selectedMedia.coverImage}
                        alt={selectedMedia.title}
                        className="w-12 h-16 object-cover rounded shadow"
                      />
                      <div>
                        <div className="text-sm font-bold text-white">{selectedMedia.title}</div>
                        <div className="text-xs text-gray-400">AniList ID: {selectedMedia.id}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedMedia(null)}
                      className="text-xs text-gray-400 hover:text-white underline"
                    >
                      Change
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-gray-300 block mb-1">
                        Fandom Wiki Subdomain
                      </label>
                      <input
                        type="text"
                        value={wikiSubdomain}
                        onChange={(e) => setWikiSubdomain(e.target.value)}
                        placeholder="e.g. solo-leveling (from *.fandom.com)"
                        className="w-full px-3 py-1.5 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white"
                      />
                      <span className="text-[10px] text-gray-500">Subdomain wiki fandom.com tanpa https://</span>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-300 block mb-1">
                        Chapter Numbering Source
                      </label>
                      <select
                        value={chapterNumberingSource}
                        onChange={(e) =>
                          setChapterNumberingSource(
                            e.target.value as "official_en" | "raw_kr" | "raw_jp",
                          )
                        }
                        className="w-full px-3 py-1.5 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white"
                      >
                        <option value="official_en">Official English Translation</option>
                        <option value="raw_kr">Raw Korean (Manhwa)</option>
                        <option value="raw_jp">Raw Japanese (Manga)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-300 block mb-1">
                        Total Chapters
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={totalChapters}
                        onChange={(e) => setTotalChapters(parseInt(e.target.value, 10) || 1)}
                        className="w-full px-3 py-1.5 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white"
                      />
                    </div>

                    <div className="flex items-center gap-3 pt-4">
                      <input
                        type="checkbox"
                        id="autopublish"
                        checked={autoPublish}
                        onChange={(e) => setAutoPublish(e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 accent-indigo-500"
                      />
                      <label htmlFor="autopublish" className="text-xs font-medium text-gray-200 cursor-pointer">
                        Direct Publish (Auto-Publish to Graph)
                      </label>
                    </div>
                  </div>

                  <button
                    onClick={handleStartIngest}
                    disabled={isIngesting}
                    className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 disabled:opacity-50 text-white font-semibold text-sm rounded-lg shadow-lg transition-all"
                  >
                    {isIngesting ? "Extracting & Processing via Gemini AI..." : "Start Pipeline: Ingest, Parse & Publish"}
                  </button>
                </div>
              )}

              {/* Logs */}
              {ingestLogs.length > 0 && (
                <div className="p-3 bg-gray-950 border border-gray-800 rounded-xl space-y-1 font-mono text-xs max-h-48 overflow-y-auto">
                  {ingestLogs.map((log, i) => (
                    <div key={i} className="text-gray-300">
                      {log}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: REVIEW DRAFTS */}
          {activeTab === "review" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-300 font-medium">
                  Select Media to View Drafts:
                </div>
                <select
                  value={selectedMediaId}
                  onChange={(e) => setSelectedMediaId(e.target.value)}
                  className="px-3 py-1.5 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white"
                >
                  {mediaList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </div>

              {loadingDrafts ? (
                <div className="text-center py-8 text-gray-400 text-sm">Loading drafts...</div>
              ) : drafts.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  No drafts pending review for this media.
                </div>
              ) : (
                <div className="space-y-3">
                  {drafts.map((d) => (
                    <div
                      key={d.id}
                      className="p-4 bg-gray-900 border border-gray-800 rounded-xl flex items-center justify-between gap-4"
                    >
                      <div>
                        <div className="font-semibold text-white text-sm">{d.characterName}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span
                            className={`px-2 py-0.5 text-[10px] rounded font-bold uppercase ${
                              d.status === "APPROVED"
                                ? "bg-green-900/60 text-green-300"
                                : d.status === "UNRESOLVED"
                                ? "bg-amber-900/60 text-amber-300"
                                : "bg-blue-900/60 text-blue-300"
                            }`}
                          >
                            {d.status}
                          </span>
                          {d.unresolvedNames.length > 0 && (
                            <span className="text-xs text-amber-400">
                              Unresolved: {d.unresolvedNames.join(", ")}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {d.status !== "APPROVED" && (
                          <button
                            onClick={() => handleApproveDraft(d.id)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg"
                          >
                            Approve
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: LIVE EDITOR */}
          {activeTab === "live" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-300 font-medium">Active Media:</div>
                <select
                  value={selectedMediaId}
                  onChange={(e) => setSelectedMediaId(e.target.value)}
                  className="px-3 py-1.5 text-sm bg-gray-900 border border-gray-700 rounded-lg text-white"
                >
                  {mediaList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Add New Relationship */}
              <form
                onSubmit={handleAddRelationship}
                className="p-4 bg-gray-900/80 border border-gray-800 rounded-xl space-y-3"
              >
                <div className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                  + Add New Relationship
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">Source Character</label>
                    <select
                      value={newRelForm.sourceCharacterId}
                      onChange={(e) =>
                        setNewRelForm((p) => ({ ...p, sourceCharacterId: e.target.value }))
                      }
                      className="w-full px-2.5 py-1.5 text-xs bg-gray-950 border border-gray-700 rounded text-white"
                    >
                      <option value="">Select Character...</option>
                      {characters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">Target Character</label>
                    <select
                      value={newRelForm.targetCharacterId}
                      onChange={(e) =>
                        setNewRelForm((p) => ({ ...p, targetCharacterId: e.target.value }))
                      }
                      className="w-full px-2.5 py-1.5 text-xs bg-gray-950 border border-gray-700 rounded text-white"
                    >
                      <option value="">Select Character...</option>
                      {characters.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-gray-400 block mb-1">Relation Type</label>
                    <input
                      type="text"
                      value={newRelForm.relationType}
                      onChange={(e) =>
                        setNewRelForm((p) => ({ ...p, relationType: e.target.value }))
                      }
                      placeholder="e.g. Ally, Enemy, Mentor, Secret Sibling..."
                      className="w-full px-2.5 py-1.5 text-xs bg-gray-950 border border-gray-700 rounded text-white"
                    />
                  </div>

                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[11px] text-gray-400 block mb-1">Valid From (Ch)</label>
                      <input
                        type="number"
                        min={1}
                        value={newRelForm.validFrom}
                        onChange={(e) =>
                          setNewRelForm((p) => ({
                            ...p,
                            validFrom: parseInt(e.target.value, 10) || 1,
                          }))
                        }
                        className="w-full px-2.5 py-1.5 text-xs bg-gray-950 border border-gray-700 rounded text-white"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[11px] text-gray-400 block mb-1">Valid Until</label>
                      <input
                        type="number"
                        min={1}
                        value={newRelForm.validUntil ?? ""}
                        onChange={(e) =>
                          setNewRelForm((p) => ({
                            ...p,
                            validUntil: e.target.value ? parseInt(e.target.value, 10) : null,
                          }))
                        }
                        placeholder="null (forever)"
                        className="w-full px-2.5 py-1.5 text-xs bg-gray-950 border border-gray-700 rounded text-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newRelForm.isSensitive}
                      onChange={(e) =>
                        setNewRelForm((p) => ({ ...p, isSensitive: e.target.checked }))
                      }
                      className="rounded text-indigo-600 accent-indigo-500"
                    />
                    Mark as Sensitive / Spoiler
                  </label>

                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow"
                  >
                    Save Relation
                  </button>
                </div>
              </form>

              {/* List of Relationships */}
              <div className="space-y-3">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Active Relationships ({relationships.length})
                </div>

                {loadingRelationships ? (
                  <div className="text-center py-6 text-gray-400 text-sm">Loading relations...</div>
                ) : relationships.length === 0 ? (
                  <div className="text-center py-6 text-gray-500 text-sm">No relationships found.</div>
                ) : (
                  <div className="space-y-2">
                    {relationships.map((rel) => (
                      <div
                        key={rel.id}
                        className="p-3 bg-gray-900 border border-gray-800 rounded-xl flex items-center justify-between gap-3 text-xs"
                      >
                        {editingRelId === rel.id ? (
                          <div className="flex-1 space-y-2">
                            <div className="font-semibold text-white">
                              {rel.sourceCharacter.name} ➔ {rel.targetCharacter.name}
                            </div>
                            <div className="flex gap-2 items-center flex-wrap">
                              <input
                                type="text"
                                value={relEditForm.relationType}
                                onChange={(e) =>
                                  setRelEditForm((p) => ({ ...p, relationType: e.target.value }))
                                }
                                className="px-2 py-1 bg-gray-950 border border-gray-700 rounded text-white text-xs"
                              />
                              <span className="text-gray-400">Ch:</span>
                              <input
                                type="number"
                                min={1}
                                value={relEditForm.validFrom}
                                onChange={(e) =>
                                  setRelEditForm((p) => ({
                                    ...p,
                                    validFrom: parseInt(e.target.value, 10) || 1,
                                  }))
                                }
                                className="w-16 px-1.5 py-1 bg-gray-950 border border-gray-700 rounded text-white text-xs"
                              />
                              <span className="text-gray-400">to</span>
                              <input
                                type="number"
                                min={1}
                                value={relEditForm.validUntil ?? ""}
                                onChange={(e) =>
                                  setRelEditForm((p) => ({
                                    ...p,
                                    validUntil: e.target.value ? parseInt(e.target.value, 10) : null,
                                  }))
                                }
                                placeholder="null"
                                className="w-16 px-1.5 py-1 bg-gray-950 border border-gray-700 rounded text-white text-xs"
                              />
                              <label className="flex items-center gap-1.5 text-gray-300">
                                <input
                                  type="checkbox"
                                  checked={relEditForm.isSensitive}
                                  onChange={(e) =>
                                    setRelEditForm((p) => ({ ...p, isSensitive: e.target.checked }))
                                  }
                                />
                                Spoiler
                              </label>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleSaveRelationship(rel.id)}
                                className="px-2.5 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-[11px] font-medium"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingRelId(null)}
                                className="px-2.5 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-[11px]"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-semibold text-white">{rel.sourceCharacter.name}</span>
                              <span className="text-gray-500">➔</span>
                              <span className="font-semibold text-white">{rel.targetCharacter.name}</span>
                              <span className="px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 font-medium">
                                {rel.relationType}
                              </span>
                              <span className="text-gray-400">
                                (Ch {rel.validFrom} - {rel.validUntil ? rel.validUntil : "∞"})
                              </span>
                              {rel.isSensitive && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-950 text-amber-400 text-[10px]">
                                  Spoiler
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => {
                                  setEditingRelId(rel.id);
                                  setRelEditForm({
                                    relationType: rel.relationType,
                                    validFrom: rel.validFrom,
                                    validUntil: rel.validUntil,
                                    isSensitive: rel.isSensitive,
                                  });
                                }}
                                className="px-2 py-1 text-gray-300 hover:text-white hover:bg-gray-800 rounded"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteRelationship(rel.id)}
                                className="px-2 py-1 text-red-400 hover:text-red-300 hover:bg-red-950/40 rounded"
                              >
                                Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
