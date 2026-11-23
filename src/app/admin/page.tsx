"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

/**
 * Build the login URL for the CURRENT admin surface. When the admin UI is
 * served under a custom ADMIN_PATH (e.g. /console-x7k29q), the login page
 * lives under that same surface, so derive it from the current pathname
 * instead of hardcoding /admin/login.
 */
function adminLoginHref(): string {
  if (typeof window === "undefined") return "/admin/login";
  const segs = window.location.pathname.split("/").filter(Boolean);
  const base = segs.length > 0 ? `/${segs[0]}` : "/admin";
  return `${base}/login`;
}

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

/**
 * Parse a single background-sync log line into a timestamp + message and tint it
 * by severity, so a manual sync is legible at a glance instead of a wall of
 * identical grey text. Raw format from the server is "[hh:mm:ss] message".
 */
function SyncLogLine({ log }: { log: string }) {
  const match = log.match(/^(\[[^\]]*\])\s?(.*)$/);
  const timestamp = match ? match[1] : "";
  const message = match ? match[2] : log;

  let color = "text-slate-400";
  const lower = message.toLowerCase();
  if (/\berror\b|gagal|warning|warn/.test(lower)) {
    color = "text-rose-400";
  } else if (/selesai|berhasil|success|done/.test(lower)) {
    color = "text-emerald-400";
  } else if (/wiki|fandom|alternatif|wikipedia|kitsu|source/.test(lower)) {
    color = "text-sky-400";
  } else if (/dedup|gabung|merge|duplicate/.test(lower)) {
    color = "text-amber-400";
  } else if (/mulai|memulai|start/.test(lower)) {
    color = "text-[#c4b5fd]";
  }

  return (
    <div className="flex items-start gap-2 leading-relaxed">
      {timestamp && (
        <span className="shrink-0 select-none text-slate-600">{timestamp}</span>
      )}
      <span className={color}>{message}</span>
    </div>
  );
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<"catalog" | "ingest" | "review" | "live" | "pages">("catalog");
  const [mediaList, setMediaList] = useState<MediaItem[]>([]);
  const [catalogSearchQuery, setCatalogSearchQuery] = useState("");
  const [selectedMediaId, setSelectedMediaId] = useState<string>("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [bgStatus, setBgStatus] = useState<BackgroundSyncStatus | null>(null);
  const [deletingMediaId, setDeletingMediaId] = useState<string | null>(null);

  // Editable site pages (About)
  const [pageSlug, setPageSlug] = useState<"about" | "methodology">("about");
  const [pageTitle, setPageTitle] = useState("");
  const [pageContent, setPageContent] = useState("");
  const [pageStatus, setPageStatus] = useState<string | null>(null);
  const [loadingPage, setLoadingPage] = useState(false);
  const [savingPage, setSavingPage] = useState(false);

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

  const [isTokenSet, setIsTokenSet] = useState<boolean>(true);
  const [showTokenInput, setShowTokenInput] = useState<boolean>(false);

  useEffect(() => {
    // The session cookie is httpOnly — JS cannot read it. We only probe for a
    // legacy readable cookie / localStorage token so the UI can decide whether
    // to show the login prompt; actual authorization is enforced server-side.
    const match = document.cookie.match(/(?:^|;\s*)admin_token=([^;]+)/);
    const legacy = match ? decodeURIComponent(match[1]) : (typeof window !== "undefined" ? localStorage.getItem("admin_token") : "") || "";
    if (!legacy) {
      setIsTokenSet(false);
      setShowTokenInput(true);
    }
  }, []);

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

  // Load editable page content when the Pages tab is opened or the selected
  // page (about / methodology) changes.
  useEffect(() => {
    if (activeTab !== "pages") return;
    setLoadingPage(true);
    setPageStatus(null);
    fetch(`/api/pages/${pageSlug}`)
      .then((r) => r.json())
      .then((data) => {
        setPageTitle(data.title ?? "");
        setPageContent(data.content ?? "");
      })
      .catch(() => setPageStatus("Failed to load page content."))
      .finally(() => setLoadingPage(false));
  }, [activeTab, pageSlug]);

  const handleSavePage = async () => {
    setSavingPage(true);
    setPageStatus(null);
    try {
      const res = await fetch(`/api/pages/${pageSlug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: pageTitle, content: pageContent }),
      });
      const data = await res.json();
      if (res.ok) {
        setPageStatus(`Saved. The ${pageSlug === "about" ? "About" : "Methodology"} page is updated.`);
      } else {
        setPageStatus(`Save failed: ${data.error}`);
      }
    } catch (err) {
      setPageStatus(`Network error: ${err}`);
    } finally {
      setSavingPage(false);
    }
  };

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

  // Handle bulk catalog import (metadata only, no AI)
  const handleCatalogImport = async () => {
    setIsSyncing(true);
    setSyncStatus("Importing catalog from AniList (metadata only)...");
    try {
      const res = await fetch("/api/admin/catalog-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countries: ["KR", "JP"], maxPages: 6, perPage: 50 }),
      });
      const data = await res.json();
      if (res.ok) {
        setSyncStatus(
          `Catalog import done — ${data.imported} new, ${data.updated} updated, ${data.skipped} skipped across ${data.pages} page(s).`,
        );
        await loadMedia();
      } else {
        setSyncStatus(`Import error: ${data.error}`);
      }
    } catch (err) {
      setSyncStatus(`Network error: ${err}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle sync ongoing releases
  const handleSyncOngoing = async () => {
    setIsSyncing(true);
    setSyncStatus("Syncing ongoing manhwa/manga updates...");
    try {
      const res = await fetch("/api/admin/catalog-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "ongoing", maxPages: 3 }),
      });
      const data = await res.json();
      if (res.ok) {
        setSyncStatus(
          `Ongoing sync done — ${data.imported} new, ${data.updated} updated across ${data.pages} page(s).`,
        );
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
    <div className="min-h-screen bg-[#0b0f19] text-slate-200 aurora">
      {/* Header bar */}
      <header className="border-b border-white/5 bg-[#0b0f19]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-7">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div>
              <div className="flex items-center gap-2.5 mb-2">
                <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#a5b4fc] ring-1 ring-white/10">
                  Admin Dashboard
                </span>
                <span className="text-xs text-slate-500">Constella control room</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Studio &amp; Content Management
              </h1>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleCatalogImport}
                disabled={isSyncing || bgStatus?.isRunning}
                className="px-4 py-2 rounded-full bg-[#6366f1] hover:bg-[#818cf8] text-white text-xs sm:text-sm font-semibold transition-colors shadow-lg shadow-indigo-950/40 flex items-center gap-2 disabled:opacity-50"
                title="Tarik katalog manhwa & manga dari AniList (metadata saja, tanpa AI)."
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 12a9 9 0 1 1-9-9" />
                  <path d="M21 3v6h-6" />
                </svg>
                {isSyncing ? "Working..." : "Load Full Catalog"}
              </button>
              <button
                onClick={handleSyncOngoing}
                disabled={isSyncing || bgStatus?.isRunning}
                className="px-4 py-2 rounded-full bg-sky-400/10 hover:bg-sky-400/20 text-sky-300 text-xs sm:text-sm font-semibold ring-1 ring-sky-400/25 transition-colors flex items-center gap-2 disabled:opacity-50"
                title="Update chapter & rilis terbaru untuk seri ongoing/releasing."
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                Sync Ongoing
              </button>
              <button
                onClick={() => handleStartLoreSync()}
                disabled={isSyncing || bgStatus?.isRunning}
                className="px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-200 text-xs sm:text-sm font-semibold ring-1 ring-white/10 transition-colors flex items-center gap-2 disabled:opacity-50"
                title="AI-powered: ekstrak lore dari Fandom wiki via Gemini/Groq. MEMAKAN token AI."
              >
                {bgStatus?.isRunning ? (
                  <>
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Syncing ({bgStatus.progress}%)</span>
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 3v3M12 18v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M3 12h3M18 12h3M4.9 19.1 7 17M17 7l2.1-2.1" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                    AI Lore Sync
                  </>
                )}
              </button>
              <button
                onClick={handleStartCatalogSync}
                disabled={isSyncing || bgStatus?.isRunning}
                className="px-4 py-2 rounded-full bg-emerald-400/10 hover:bg-emerald-400/20 text-emerald-300 text-xs sm:text-sm font-medium ring-1 ring-emerald-400/25 transition-colors flex items-center gap-2 disabled:opacity-50"
                title="Tanpa AI: sync cover, karakter & gambar dari AniList + Fandom saja."
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                  <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
                </svg>
                Catalog Sync
              </button>
              <button
                onClick={handleFastSeedSync}
                disabled={isSyncing}
                className="px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-200 text-xs sm:text-sm font-medium ring-1 ring-white/10 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
                </svg>
                Fast Seed
              </button>
              <button
                onClick={() => setShowTokenInput((v) => !v)}
                className={`px-3 py-2 rounded-full text-xs font-semibold ring-1 transition-colors flex items-center gap-1.5 ${
                  isTokenSet
                    ? "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20 hover:bg-emerald-500/20"
                    : "bg-amber-500/10 text-amber-300 ring-amber-500/25 hover:bg-amber-500/20"
                }`}
                title="Login admin untuk otorisasi API"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isTokenSet ? "bg-emerald-400" : "bg-amber-400 animate-pulse"}`} />
                <span>{isTokenSet ? "Session Active" : "Login Admin"}</span>
              </button>
              <Link
                href="/"
                className="px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-300 text-xs sm:text-sm font-medium ring-1 ring-white/10 transition-colors"
              >
                Back to Site
              </Link>
            </div>
          </div>

          {showTokenInput && (
            <div className="mt-4 p-4 rounded-xl bg-white/[0.04] border border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs animate-fade-in">
              <div className="space-y-0.5">
                <p className="font-semibold text-white">Login diperlukan</p>
                <p className="text-slate-400 text-[11px]">
                  Masuk dengan username &amp; password admin. Sesi disimpan aman sebagai cookie (httpOnly), tanpa menyimpan token di browser.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={adminLoginHref()}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors"
                >
                  Buka Halaman Login
                </Link>
                <button
                  type="button"
                  onClick={() => setShowTokenInput(false)}
                  className="px-2 py-1.5 text-slate-400 hover:text-slate-200 text-xs cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          )}

          {syncStatus && (
            <div className="mt-5 rounded-xl bg-[#818cf8]/10 px-4 py-3 text-xs text-[#c7d2fe] ring-1 ring-[#818cf8]/25">
              {syncStatus}
            </div>
          )}

          {/* Active Background Sync Monitor */}
          {bgStatus && (bgStatus.isRunning || bgStatus.logs.length > 0) && (
            <div className="mt-5 p-4 rounded-2xl bg-white/[0.03] ring-1 ring-white/10">
              <div className="flex items-center justify-between gap-4 mb-3">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      bgStatus.isRunning ? "bg-emerald-400 animate-ping" : "bg-[#818cf8]"
                    }`}
                  />
                  <span className="text-xs font-bold uppercase tracking-wider text-white">
                    {bgStatus.isRunning
                      ? bgStatus.syncMode === "lore"
                        ? "AI Lore Sync Active (consumes AI tokens)"
                        : "Catalog Sync Active (no AI)"
                      : "Last Sync Results"}
                  </span>
                  {bgStatus.currentSeries && (
                    <span className="text-xs text-[#7dd3fc] px-2 py-0.5 rounded-full bg-[#38bdf8]/10 ring-1 ring-[#38bdf8]/20">
                      Series: {bgStatus.currentSeries}
                    </span>
                  )}
                  {bgStatus.currentCharacter && (
                    <span className="text-xs text-[#c4b5fd] px-2 py-0.5 rounded-full bg-[#a78bfa]/10 ring-1 ring-[#a78bfa]/20">
                      Character: {bgStatus.currentCharacter}
                    </span>
                  )}
                </div>
                <span className="text-xs font-mono text-slate-400 font-semibold">
                  {bgStatus.completedSeries} / {bgStatus.totalSeries} Series ({bgStatus.progress}%)
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-white/[0.06] rounded-full h-2 overflow-hidden mb-3">
                <div
                  className="bg-[#818cf8] h-2 rounded-full transition-all duration-300"
                  style={{ width: `${bgStatus.progress}%` }}
                />
              </div>

              {/* Live Terminal Log Viewer */}
              <div className="bg-black/40 rounded-xl p-3 max-h-56 overflow-y-auto font-mono text-[11px] space-y-0.5 ring-1 ring-white/5">
                {bgStatus.logs.length === 0 ? (
                  <div className="text-slate-500">Waiting for logs...</div>
                ) : (
                  bgStatus.logs.slice(-30).map((log, i) => <SyncLogLine key={i} log={log} />)
                )}
              </div>
            </div>
          )}

          {/* Tab navigation */}
          <div className="mt-6 flex flex-wrap gap-2">
            <button
              onClick={() => setActiveTab("catalog")}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "catalog"
                  ? "bg-white/[0.08] text-[#a5b4fc] ring-1 ring-white/10"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
              Manga Catalog ({mediaList.length})
            </button>
            <button
              onClick={() => setActiveTab("ingest")}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "ingest"
                  ? "bg-white/[0.08] text-[#a5b4fc] ring-1 ring-white/10"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12" />
                <path d="m7 10 5 5 5-5" />
                <path d="M5 21h14" />
              </svg>
              Ingest AniList &amp; Fandom
            </button>
            <button
              onClick={() => setActiveTab("live")}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "live"
                  ? "bg-white/[0.08] text-[#a5b4fc] ring-1 ring-white/10"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="5" cy="6" r="2.2" />
                <circle cx="19" cy="6" r="2.2" />
                <circle cx="12" cy="18" r="2.2" />
                <path d="M7.2 6h9.6M6.4 8.1l4.4 7.8M17.6 8.1l-4.4 7.8" />
              </svg>
              Live Relations Editor
            </button>
            <button
              onClick={() => setActiveTab("review")}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "review"
                  ? "bg-white/[0.08] text-[#a5b4fc] ring-1 ring-white/10"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="8" y="2" width="8" height="4" rx="1" />
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <path d="m9 14 2 2 4-4" />
              </svg>
              Draft Reviews
            </button>
            <button
              onClick={() => setActiveTab("pages")}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "pages"
                  ? "bg-white/[0.08] text-[#a5b4fc] ring-1 ring-white/10"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M8 13h8M8 17h5" />
              </svg>
              Site Pages
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Media Series Selector (for live editor and review tabs) */}
        {(activeTab === "live" || activeTab === "review") && (
          <div className="mb-6 p-4 rounded-2xl bg-white/[0.03] ring-1 ring-white/10 flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <label className="text-sm font-semibold text-slate-300">Active Media Series:</label>
              <select
                value={selectedMediaId}
                onChange={(e) => setSelectedMediaId(e.target.value)}
                className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-[#818cf8]"
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
                className="text-xs text-[#7dd3fc] hover:text-[#7dd3fc] transition-colors inline-flex items-center gap-1"
              >
                Open Live Graph Page
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 17 17 7M9 7h8v8" />
                </svg>
              </Link>
            )}
          </div>
        )}

{/* TAB 1: CATALOG OVERVIEW */}
        {activeTab === "catalog" && (
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-bold text-white">Active Manga &amp; Manhwa Series</h2>
                <p className="text-xs text-slate-400">
                  Series loaded into the database with temporal character graphs.
                </p>
              </div>
              <button
                onClick={handleFastSeedSync}
                disabled={isSyncing}
                className="rounded-full bg-white/5 hover:bg-white/10 px-4 py-2 text-xs font-semibold text-slate-200 ring-1 ring-white/10 transition-colors disabled:opacity-50"
              >
                Refresh / Re-sync
              </button>
            </div>

            {/* Search/Filter Bar */}
            <div className="p-4 rounded-2xl bg-white/[0.03] ring-1 ring-white/10">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Search Series
              </label>
              <input
                type="text"
                value={catalogSearchQuery}
                onChange={(e) => setCatalogSearchQuery(e.target.value)}
                placeholder="Filter by title..."
                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#818cf8]"
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
                  className="p-4 rounded-2xl bg-white/[0.03] ring-1 ring-white/10 hover:ring-[#6366f1]/50 transition-colors flex gap-4 items-center"
                >
                  <img
                    src={m.coverImage}
                    alt={m.title}
                    className="w-16 h-24 object-cover rounded-xl bg-black/30 shrink-0 ring-1 ring-white/10"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-white text-base truncate">{m.title}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Chapters: <span className="text-slate-200 font-semibold">{m.totalChapters}</span>
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Source: <span className="text-[#7dd3fc]">{m.chapterNumberingSource || "official_en"}</span>
                    </p>
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/media/${m.id}`}
                        className="px-2.5 py-1 rounded-full bg-[#38bdf8]/10 text-[#7dd3fc] ring-1 ring-[#38bdf8]/25 text-xs font-medium hover:bg-[#38bdf8]/20 transition-colors"
                      >
                        View Graph
                      </Link>
                      <button
                        onClick={() => {
                          setSelectedMediaId(m.id);
                          setActiveTab("live");
                        }}
                        className="px-2.5 py-1 rounded-full bg-white/5 text-slate-300 ring-1 ring-white/10 text-xs hover:bg-white/10 transition-colors"
                      >
                        Edit Relations
                      </button>
                      {m.anilistId && (
                        <button
                          onClick={() => handleStartLoreSync(m.anilistId)}
                          disabled={bgStatus?.isRunning}
                          className="px-2.5 py-1 rounded-full bg-[#818cf8]/10 text-[#a5b4fc] ring-1 ring-[#818cf8]/25 text-xs font-medium hover:bg-[#818cf8]/20 transition-colors disabled:opacity-50"
                        >
                          AI Lore Sync
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteMedia(m.id, m.title)}
                        disabled={deletingMediaId === m.id}
                        className="px-2.5 py-1 rounded-full bg-rose-400/10 text-[#fda4af] ring-1 ring-rose-400/25 text-xs font-medium hover:bg-rose-400/20 transition-colors disabled:opacity-50"
                      >
                        {deletingMediaId === m.id ? "Deleting..." : "Delete"}
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
                <p className="text-xs text-slate-400">
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
                  className="w-full bg-white/[0.03] ring-1 ring-white/10 rounded-lg px-4 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-[#818cf8]"
                />
              </div>

              {/* Search results dropdown */}
              {isSearching ? (
                <div className="p-4 text-center text-xs text-slate-400">Searching AniList...</div>
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
                          : "bg-white/[0.03] border-white/10 hover:bg-[#1a233a]"
                      }`}
                    >
                      <img
                        src={res.coverImage}
                        alt={res.title}
                        className="w-10 h-14 object-cover rounded bg-[#0b0f19] shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-white truncate">{res.title}</div>
                        <div className="text-xs text-slate-400 mt-0.5">
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
                <div className="p-4 text-center text-xs text-slate-500">No matching series found</div>
              ) : null}
            </div>

            {/* Ingestion Parameters */}
            <div className="p-6 rounded-xl bg-white/[0.03] ring-1 ring-white/10 space-y-5">
              <h3 className="font-bold text-white text-base">Ingestion Settings</h3>

              {selectedMedia ? (
                <div className="p-3 rounded-lg bg-[#0b0f19] ring-1 ring-white/10 flex gap-3 items-center">
                  <img
                    src={selectedMedia.coverImage}
                    alt={selectedMedia.title}
                    className="w-12 h-16 object-cover rounded"
                  />
                  <div>
                    <div className="font-bold text-white text-sm">{selectedMedia.title}</div>
                    <div className="text-xs text-slate-400">AniList ID: {selectedMedia.id}</div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-[#0b0f19] ring-1 ring-white/10 text-xs text-slate-500 text-center">
                  Select a manga/manhwa from the left panel to configure ingestion
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Fandom Wiki Subdomain
                </label>
                <input
                  type="text"
                  value={wikiSubdomain}
                  onChange={(e) => setWikiSubdomain(e.target.value)}
                  placeholder="e.g. solo-leveling"
                  className="w-full bg-[#0b0f19] ring-1 ring-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#818cf8]"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Scrapes character pages from https://&#123;subdomain&#125;.fandom.com
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Chapter Numbering Baseline
                </label>
                <select
                  value={chapterNumberingSource}
                  onChange={(e) => setChapterNumberingSource(e.target.value as any)}
                  className="w-full bg-[#0b0f19] ring-1 ring-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#818cf8]"
                >
                  <option value="official_en">Official English Translation (Webtoon/Tapas)</option>
                  <option value="raw_kr">Raw Korean (Kakao/Naver)</option>
                  <option value="raw_jp">Raw Japanese (Shueisha/Kodansha)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Total Chapters
                </label>
                <input
                  type="number"
                  value={totalChapters}
                  onChange={(e) => setTotalChapters(Number(e.target.value))}
                  min={1}
                  className="w-full bg-[#0b0f19] ring-1 ring-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#818cf8]"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="autoPublish"
                  checked={autoPublish}
                  onChange={(e) => setAutoPublish(e.target.checked)}
                  className="rounded border-white/10 bg-[#0b0f19] text-[#818cf8] focus:ring-0"
                />
                <label htmlFor="autoPublish" className="text-xs text-slate-300 cursor-pointer">
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
                <div className="p-3 rounded-lg bg-[#0b0f19] ring-1 ring-white/10 space-y-1 text-xs font-mono max-h-48 overflow-y-auto">
                  {ingestLogs.map((log, i) => (
                    <div key={i} className="text-slate-300">
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
            <div className="p-6 rounded-xl bg-white/[0.03] ring-1 ring-white/10">
              <h3 className="font-bold text-white text-base mb-4">Add New Relationship</h3>
              <form onSubmit={handleCreateRel} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Source Character</label>
                  <select
                    value={newRelForm.sourceCharacterId}
                    onChange={(e) => setNewRelForm({ ...newRelForm, sourceCharacterId: e.target.value })}
                    required
                    className="w-full bg-[#0b0f19] ring-1 ring-white/10 rounded-lg px-3 py-2 text-xs text-gray-200"
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
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Target Character</label>
                  <select
                    value={newRelForm.targetCharacterId}
                    onChange={(e) => setNewRelForm({ ...newRelForm, targetCharacterId: e.target.value })}
                    required
                    className="w-full bg-[#0b0f19] ring-1 ring-white/10 rounded-lg px-3 py-2 text-xs text-gray-200"
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
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Relation Type</label>
                  <input
                    type="text"
                    value={newRelForm.relationType}
                    onChange={(e) => setNewRelForm({ ...newRelForm, relationType: e.target.value })}
                    required
                    placeholder="e.g. Ally, Enemy, Mentor"
                    className="w-full bg-[#0b0f19] ring-1 ring-white/10 rounded-lg px-3 py-2 text-xs text-gray-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Valid From (Ch.)</label>
                  <input
                    type="number"
                    value={newRelForm.validFrom}
                    onChange={(e) => setNewRelForm({ ...newRelForm, validFrom: Number(e.target.value) })}
                    min={1}
                    required
                    className="w-full bg-[#0b0f19] ring-1 ring-white/10 rounded-lg px-3 py-2 text-xs text-gray-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Valid Until (Ch. / null)</label>
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
                    className="w-full bg-[#0b0f19] ring-1 ring-white/10 rounded-lg px-3 py-2 text-xs text-gray-200"
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
            <div className="rounded-xl bg-white/[0.03] ring-1 ring-white/10 overflow-hidden">
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <h3 className="font-bold text-white text-sm">
                  Active Relationships ({relationships.length})
                </h3>
              </div>

              {loadingRelationships ? (
                <div className="p-8 text-center text-xs text-slate-400">Loading relationships...</div>
              ) : relationships.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">No relationships found for this series.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-[#0b0f19] text-slate-400 uppercase tracking-wider text-[10px]">
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
                                  className="bg-[#0b0f19] ring-1 ring-white/10 rounded px-2 py-1 text-xs text-white"
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
                                  className="w-16 bg-[#0b0f19] ring-1 ring-white/10 rounded px-2 py-1 text-xs text-white"
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
                                  className="w-16 bg-[#0b0f19] ring-1 ring-white/10 rounded px-2 py-1 text-xs text-white"
                                />
                              ) : r.validUntil ? (
                                `Ch. ${r.validUntil}`
                              ) : (
                                <span className="text-slate-500">Ongoing</span>
                              )}
                            </td>

                            <td className="p-3">
                              {isEditing ? (
                                <input
                                  type="checkbox"
                                  checked={relEditForm.isSensitive}
                                  onChange={(e) => setRelEditForm({ ...relEditForm, isSensitive: e.target.checked })}
                                  className="rounded border-white/10 bg-[#0b0f19] text-[#818cf8]"
                                />
                              ) : r.isSensitive ? (
                                <span className="text-amber-300 font-semibold">Yes (Spoiler)</span>
                              ) : (
                                <span className="text-slate-400">No</span>
                              )}
                            </td>

                            <td className="p-3 text-right">
                              {isEditing ? (
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => handleSaveRelEdit(r.id)}
                                    className="px-2 py-1 bg-[#34d399]/20 text-emerald-300 rounded text-[11px] font-semibold hover:bg-[#34d399]/30"
                                  >
                                    Save
                                  </button>
                                  <button
                                    onClick={() => setEditingRelId(null)}
                                    className="px-2 py-1 bg-white/10 text-slate-400 rounded text-[11px] hover:text-white"
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
                                    className="px-2 py-1 bg-white/10 text-slate-300 rounded text-[11px] hover:bg-[#334155]"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDeleteRel(r.id)}
                                    className="px-2 py-1 bg-[#f87171]/15 text-[#fda4af] rounded text-[11px] hover:bg-[#f87171]/25"
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
              <p className="text-xs text-slate-400">
                Manage ingestion drafts generated by Gemini before promoting them to active tables.
              </p>
            </div>

            {loadingDrafts ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading drafts...</div>
            ) : drafts.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">No pending drafts found for this media.</div>
            ) : (
              <div className="space-y-3">
                {drafts.map((d) => (
                  <div
                    key={d.id}
                    className="p-4 rounded-xl bg-white/[0.03] ring-1 ring-white/10 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-white text-sm">{d.characterName}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Status:{" "}
                        <span
                          className={`font-semibold ${
                            d.status === "APPROVED"
                              ? "text-emerald-300"
                              : d.status === "UNRESOLVED"
                              ? "text-amber-300"
                              : "text-[#7dd3fc]"
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

        {activeTab === "pages" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white">Site Pages</h2>
              <p className="text-xs text-slate-400">
                Edit static pages that are rendered on the public site. Changes go live as soon as
                you save.
              </p>
            </div>

            <div className="rounded-2xl bg-white/[0.03] p-5 ring-1 ring-white/10 space-y-4">
              <div className="flex items-center gap-2">
                {(["about", "methodology"] as const).map((slug) => (
                  <button
                    key={slug}
                    onClick={() => setPageSlug(slug)}
                    className={`px-4 py-1.5 rounded-full text-xs font-semibold capitalize transition-colors ${
                      pageSlug === slug
                        ? "bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40"
                        : "bg-white/5 text-slate-400 ring-1 ring-white/10 hover:bg-white/10 hover:text-slate-200"
                    }`}
                  >
                    {slug}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-white capitalize">{pageSlug} page</h3>
                  <p className="text-xs text-slate-500">Shown at /{pageSlug}</p>
                </div>
                {pageStatus && (
                  <span
                    className={`text-xs rounded-full px-3 py-1 ring-1 ${
                      pageStatus.startsWith("Saved")
                        ? "text-emerald-300 bg-emerald-400/10 ring-emerald-400/25"
                        : "text-[#fda4af] bg-rose-400/10 ring-rose-400/25"
                    }`}
                  >
                    {pageStatus}
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Page title
                </label>
                <input
                  value={pageTitle}
                  onChange={(e) => setPageTitle(e.target.value)}
                  disabled={loadingPage}
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-[#818cf8] disabled:opacity-50"
                  placeholder="About Constella"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Content
                </label>
                <textarea
                  value={pageContent}
                  onChange={(e) => setPageContent(e.target.value)}
                  rows={16}
                  disabled={loadingPage}
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm leading-relaxed text-slate-100 focus:outline-none focus:border-[#818cf8] disabled:opacity-50 resize-y"
                  placeholder="Write the page content here..."
                />
                <p className="text-[11px] text-slate-500">
                  Blank lines separate paragraphs. Plain text only.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSavePage}
                  disabled={savingPage || loadingPage}
                  className="rounded-full bg-[#6366f1] hover:bg-[#818cf8] disabled:opacity-50 disabled:hover:bg-[#6366f1] px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-950/40 transition-colors"
                >
                  {savingPage ? "Saving..." : "Save page"}
                </button>
                <span className="text-xs text-slate-500">
                  {loadingPage
                    ? "Loading current content..."
                    : `Public ${pageSlug === "about" ? "About" : "Methodology"} page updates on save.`}
                </span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
