"use client";

import { useState, useEffect, useCallback } from "react";

interface Draft {
  id: string;
  mediaId: string;
  characterName: string;
  status: string;
  unresolvedNames: string[];
  parsedJson: ParsedCharacter;
  reviewedAt: string | null;
  createdAt: string;
}

interface ParsedCharacter {
  introducedAtChapter: number;
  descriptions: { text: string; validFrom: number; validUntil: number | null; isSensitive: boolean }[];
  statuses: { status: string; validFrom: number; validUntil: number | null; isSensitive: boolean }[];
  relationships: { targetName: string; relationType: string; validFrom: number; validUntil: number | null; isSensitive: boolean }[];
  factions: { factionName: string; validFrom: number; validUntil: number | null; isSensitive: boolean }[];
}

interface CharacterOption {
  id: string;
  name: string;
}

export default function ReviewPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [selected, setSelected] = useState<Draft | null>(null);
  const [editedJson, setEditedJson] = useState<ParsedCharacter | null>(null);
  const [characters, setCharacters] = useState<CharacterOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const loadDrafts = useCallback(async () => {
    const params = filterStatus ? `?status=${filterStatus}` : "";
    const res = await fetch(`/api/admin/drafts${params}`);
    setDrafts(await res.json());
  }, [filterStatus]);

  useEffect(() => { loadDrafts(); }, [loadDrafts]);

  async function selectDraft(draft: Draft) {
    setSelected(draft);
    setEditedJson(draft.parsedJson);
    setMessage("");
    // Load characters for name resolution
    const res = await fetch(`/api/admin/characters?mediaId=${draft.mediaId}`);
    if (res.ok) setCharacters(await res.json());
  }

  async function saveParsedJson() {
    if (!selected || !editedJson) return;
    setSaving(true);
    const res = await fetch(`/api/admin/drafts/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parsedJson: editedJson }),
    });
    if (res.ok) {
      setMessage("Saved");
      const updated = await res.json();
      setSelected(updated);
      loadDrafts();
    } else {
      const data = await res.json();
      setMessage(`Error: ${data.error}`);
    }
    setSaving(false);
  }

  async function handleResolve(name: string, action: "map" | "create" | "discard", characterId?: string) {
    if (!selected) return;
    setSaving(true);

    const resolution: Record<string, unknown> = { name, action };
    if (action === "map" && characterId) {
      resolution.characterId = characterId;
    }
    if (action === "create") {
      resolution.newCharacter = {
        name,
        imageUrl: "/images/placeholder.webp",
        introducedAtChapter: editedJson?.introducedAtChapter ?? 1,
      };
    }

    const res = await fetch(`/api/admin/drafts/${selected.id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolutions: [resolution] }),
    });

    if (res.ok) {
      const updated = await res.json();
      setSelected(updated);
      setEditedJson(updated.parsedJson);
      setMessage(`Resolved "${name}"`);
      loadDrafts();
    } else {
      const data = await res.json();
      setMessage(`Error: ${data.error}`);
    }
    setSaving(false);
  }

  async function handleApprove() {
    if (!selected) return;
    setSaving(true);
    const res = await fetch(`/api/admin/drafts/${selected.id}/approve`, { method: "POST" });
    if (res.ok) {
      setMessage("Approved! Data moved to active tables.");
      setSelected(null);
      loadDrafts();
    } else {
      const data = await res.json();
      setMessage(`Error: ${data.error}`);
    }
    setSaving(false);
  }

  async function handleReject() {
    if (!selected) return;
    setSaving(true);
    const res = await fetch(`/api/admin/drafts/${selected.id}/reject`, { method: "POST" });
    if (res.ok) {
      setMessage("Draft rejected.");
      setSelected(null);
      loadDrafts();
    } else {
      const data = await res.json();
      setMessage(`Error: ${data.error}`);
    }
    setSaving(false);
  }

  // --- Edit helpers ---
  function updateField<K extends keyof ParsedCharacter>(
    section: K,
    index: number,
    field: string,
    value: unknown,
  ) {
    if (!editedJson) return;
    const arr = [...(editedJson[section] as Record<string, unknown>[])];
    arr[index] = { ...arr[index], [field]: value };
    setEditedJson({ ...editedJson, [section]: arr });
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Review Drafts</h1>

      {message && (
        <div className={`p-3 mb-4 rounded border ${message.startsWith("Error") ? "bg-red-900/50 border-red-700 text-red-300" : "bg-green-900/50 border-green-700 text-green-300"}`}>
          {message}
        </div>
      )}

      <div className="flex gap-6">
        {/* Draft list */}
        <div className="w-72 shrink-0">
          <div className="mb-3">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full border rounded px-2 py-1 bg-gray-900 text-white border-gray-700 text-sm"
            >
              <option value="">All</option>
              <option value="PENDING">Pending</option>
              <option value="UNRESOLVED">Unresolved</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
          <div className="space-y-1">
            {drafts.map((d) => (
              <button
                key={d.id}
                onClick={() => selectDraft(d)}
                className={`w-full text-left p-2 rounded text-sm border ${
                  selected?.id === d.id ? "border-blue-500 bg-blue-900/30" : "border-gray-700 hover:bg-gray-800"
                }`}
              >
                <div className="font-medium truncate">{d.characterName}</div>
                <div className={`text-xs ${
                  d.status === "PENDING" ? "text-green-400" :
                  d.status === "UNRESOLVED" ? "text-yellow-400" :
                  d.status === "APPROVED" ? "text-blue-400" :
                  "text-red-400"
                }`}>
                  {d.status}
                  {d.unresolvedNames.length > 0 && ` (${d.unresolvedNames.length} unresolved)`}
                </div>
              </button>
            ))}
            {drafts.length === 0 && <p className="text-gray-500 text-sm">No drafts</p>}
          </div>
        </div>

        {/* Detail panel */}
        {selected && editedJson && (
          <div className="flex-1 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">{selected.characterName}</h2>
              <div className="flex gap-2">
                <button
                  onClick={saveParsedJson}
                  disabled={saving || !!selected.reviewedAt}
                  className="px-3 py-1 bg-gray-600 text-white rounded text-sm hover:bg-gray-500 disabled:opacity-50"
                >
                  Save Edits
                </button>
                <button
                  onClick={handleApprove}
                  disabled={saving || !!selected.reviewedAt || selected.unresolvedNames.length > 0}
                  className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
                  title={selected.unresolvedNames.length > 0 ? "Resolve all names first" : ""}
                >
                  Approve
                </button>
                <button
                  onClick={handleReject}
                  disabled={saving || !!selected.reviewedAt}
                  className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            </div>

            {/* Unresolved Names */}
            {selected.unresolvedNames.length > 0 && (
              <div className="p-4 bg-yellow-900/30 border border-yellow-700 rounded">
                <h3 className="font-semibold text-yellow-300 mb-2">Unresolved Names</h3>
                {selected.unresolvedNames.map((name) => (
                  <div key={name} className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-sm">{name}</span>
                    <select
                      onChange={(e) => {
                        if (e.target.value === "__create__") handleResolve(name, "create");
                        else if (e.target.value === "__discard__") handleResolve(name, "discard");
                        else if (e.target.value) handleResolve(name, "map", e.target.value);
                      }}
                      className="border rounded px-2 py-1 bg-gray-900 text-white border-gray-700 text-sm"
                      defaultValue=""
                    >
                      <option value="" disabled>Action...</option>
                      {characters.map((c) => (
                        <option key={c.id} value={c.id}>Map to: {c.name}</option>
                      ))}
                      <option value="__create__">Create new character</option>
                      <option value="__discard__">Discard entries</option>
                    </select>
                  </div>
                ))}
              </div>
            )}

            {/* Introduced at chapter */}
            <label className="block">
              <span className="text-sm text-gray-400">Introduced at Chapter</span>
              <input
                type="number"
                value={editedJson.introducedAtChapter}
                onChange={(e) => setEditedJson({ ...editedJson, introducedAtChapter: Number(e.target.value) })}
                className="mt-1 w-32 border rounded px-3 py-1 bg-gray-900 text-white border-gray-700"
                disabled={!!selected.reviewedAt}
              />
            </label>

            {/* Descriptions */}
            <Section title="Descriptions">
              {editedJson.descriptions.map((d, i) => (
                <TemporalRow key={i} disabled={!!selected.reviewedAt}>
                  <textarea
                    value={d.text}
                    onChange={(e) => updateField("descriptions", i, "text", e.target.value)}
                    className="w-full border rounded px-2 py-1 bg-gray-900 text-white border-gray-700 text-sm"
                    rows={2}
                    disabled={!!selected.reviewedAt}
                  />
                  <ChapterInputs
                    validFrom={d.validFrom}
                    validUntil={d.validUntil}
                    onChangeFrom={(v) => updateField("descriptions", i, "validFrom", v)}
                    onChangeUntil={(v) => updateField("descriptions", i, "validUntil", v)}
                    disabled={!!selected.reviewedAt}
                  />
                  <SensitiveToggle
                    value={d.isSensitive}
                    onChange={(v) => updateField("descriptions", i, "isSensitive", v)}
                    disabled={!!selected.reviewedAt}
                  />
                </TemporalRow>
              ))}
            </Section>

            {/* Statuses */}
            <Section title="Statuses">
              {editedJson.statuses.map((s, i) => (
                <TemporalRow key={i} disabled={!!selected.reviewedAt}>
                  <input
                    value={s.status}
                    onChange={(e) => updateField("statuses", i, "status", e.target.value)}
                    className="w-40 border rounded px-2 py-1 bg-gray-900 text-white border-gray-700 text-sm"
                    disabled={!!selected.reviewedAt}
                  />
                  <ChapterInputs
                    validFrom={s.validFrom}
                    validUntil={s.validUntil}
                    onChangeFrom={(v) => updateField("statuses", i, "validFrom", v)}
                    onChangeUntil={(v) => updateField("statuses", i, "validUntil", v)}
                    disabled={!!selected.reviewedAt}
                  />
                  <SensitiveToggle
                    value={s.isSensitive}
                    onChange={(v) => updateField("statuses", i, "isSensitive", v)}
                    disabled={!!selected.reviewedAt}
                  />
                </TemporalRow>
              ))}
            </Section>

            {/* Relationships */}
            <Section title="Relationships">
              {editedJson.relationships.map((r, i) => (
                <TemporalRow key={i} disabled={!!selected.reviewedAt}>
                  <span className="text-sm font-mono">{r.targetName}</span>
                  <input
                    value={r.relationType}
                    onChange={(e) => updateField("relationships", i, "relationType", e.target.value)}
                    className="w-32 border rounded px-2 py-1 bg-gray-900 text-white border-gray-700 text-sm"
                    disabled={!!selected.reviewedAt}
                  />
                  <ChapterInputs
                    validFrom={r.validFrom}
                    validUntil={r.validUntil}
                    onChangeFrom={(v) => updateField("relationships", i, "validFrom", v)}
                    onChangeUntil={(v) => updateField("relationships", i, "validUntil", v)}
                    disabled={!!selected.reviewedAt}
                  />
                  <SensitiveToggle
                    value={r.isSensitive}
                    onChange={(v) => updateField("relationships", i, "isSensitive", v)}
                    disabled={!!selected.reviewedAt}
                  />
                </TemporalRow>
              ))}
            </Section>

            {/* Factions */}
            <Section title="Factions">
              {editedJson.factions.map((f, i) => (
                <TemporalRow key={i} disabled={!!selected.reviewedAt}>
                  <span className="text-sm font-mono">{f.factionName}</span>
                  <ChapterInputs
                    validFrom={f.validFrom}
                    validUntil={f.validUntil}
                    onChangeFrom={(v) => updateField("factions", i, "validFrom", v)}
                    onChangeUntil={(v) => updateField("factions", i, "validUntil", v)}
                    disabled={!!selected.reviewedAt}
                  />
                  <SensitiveToggle
                    value={f.isSensitive}
                    onChange={(v) => updateField("factions", i, "isSensitive", v)}
                    disabled={!!selected.reviewedAt}
                  />
                </TemporalRow>
              ))}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Sub-components ---

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-400 mb-2">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function TemporalRow({ children, disabled }: { children: React.ReactNode; disabled: boolean }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 p-2 border border-gray-700 rounded ${disabled ? "opacity-60" : ""}`}>
      {children}
    </div>
  );
}

function ChapterInputs({
  validFrom,
  validUntil,
  onChangeFrom,
  onChangeUntil,
  disabled,
}: {
  validFrom: number;
  validUntil: number | null;
  onChangeFrom: (v: number) => void;
  onChangeUntil: (v: number | null) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-1 text-sm">
      <span className="text-gray-500">ch</span>
      <input
        type="number"
        value={validFrom}
        onChange={(e) => onChangeFrom(Number(e.target.value))}
        className="w-16 border rounded px-1 py-0.5 bg-gray-900 text-white border-gray-700"
        disabled={disabled}
      />
      <span className="text-gray-500">-</span>
      <input
        type="number"
        value={validUntil ?? ""}
        onChange={(e) => onChangeUntil(e.target.value ? Number(e.target.value) : null)}
        placeholder="null"
        className="w-16 border rounded px-1 py-0.5 bg-gray-900 text-white border-gray-700"
        disabled={disabled}
      />
    </div>
  );
}

function SensitiveToggle({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!value)}
      className={`px-2 py-0.5 rounded text-xs font-medium ${
        value ? "bg-red-900/50 text-red-300 border border-red-700" : "bg-gray-700 text-gray-300 border border-gray-600"
      }`}
      disabled={disabled}
    >
      {value ? "Sensitive" : "Public"}
    </button>
  );
}
