/**
 * Gemini API structured parsing.
 * PRD 4.C step 3: parse raw wikitext → structured character data JSON.
 *
 * Uses @google/genai SDK.
 */

import { GoogleGenAI } from "@google/genai";

// Model default list prioritizing active high-throughput models in 2026
export function getGeminiModels(): string[] {
  const envModel = process.env.GEMINI_MODEL || "gemini-3.5-flash,gemini-3.5-flash-lite,gemini-flash-lite-latest,gemini-3.1-flash-lite,gemini-3-flash-preview";
  return envModel
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

export interface GeminiParsedCharacter {
  introducedAtChapter: number;
  descriptions: {
    text: string;
    validFrom: number;
    validUntil: number | null;
    isSensitive: boolean;
  }[];
  statuses: {
    status: string;
    validFrom: number;
    validUntil: number | null;
    isSensitive: boolean;
  }[];
  relationships: {
    targetName: string;
    relationType: string;
    validFrom: number;
    validUntil: number | null;
    isSensitive: boolean;
  }[];
  factions: {
    factionName: string;
    validFrom: number;
    validUntil: number | null;
    isSensitive: boolean;
  }[];
}

const SYSTEM_INSTRUCTION = `You are an expert anime/manga/manhwa lore archivist and data extraction assistant for a temporal character relationship database.

Your task: parse raw Fandom wikitext about a character and produce ACCURATE, RICH, HIGHLY GRANULAR STRUCTURED JSON with chapter-based temporal progression.

CRITICAL RULES:
1. ALL CHAPTER NUMBERS MUST USE THE NUMBERING SYSTEM SPECIFIED BY THE USER.
2. "validUntil" is EXCLUSIVE — it means "valid UP TO BUT NOT INCLUDING this chapter":
   - If a character state/description is active from chapter 1 through chapter 25, write: validFrom: 1, validUntil: 26.
   - If a state/description is ongoing through the rest of the series, write: validUntil: null.
   - NEVER write validUntil <= validFrom. If unknown end, use null.
3. "introducedAtChapter": The very first chapter where this character debuts or is introduced. Must be >= 1.
4. "descriptions" — DYNAMIC STORY PROGRESSION (VERY IMPORTANT):
   - You MUST generate MULTIPLE (3 to 8) chronological description phases that capture the character's evolution across major story arcs or chapter milestones!
   - DO NOT provide just one single description for the entire series.
   - Example progression for a protagonist:
     * Phase 1 (Ch 1 - 25): Initial status, weakness, origin, or early struggles.
     * Phase 2 (Ch 25 - 60): First awakening, gaining power, joining first guild or dungeon raid.
     * Phase 3 (Ch 60 - 110): Mid-story evolution, new rank, major accomplishments.
     * Phase 4 (Ch 110 - 160): Climax or international recognition, true form or higher ascension.
     * Phase 5 (Ch 160 - null): Final endgame powers, ruler/monarch, ultimate destiny.
   - Each phase description should be 1 to 3 informative, spoiler-aware sentences.
5. "relationships" — SPECIFIC RELATION TYPES (VERY IMPORTANT):
   - Every relationship MUST use a specific, meaningful, lore-accurate relationship type.
   - ACCEPTABLE TYPES: "Enemy", "Rival", "Partner", "Love Interest", "Husband / Wife", "Friend", "Father / Son", "Mother / Son", "Brother / Sister", "Master / Disciple", "Subordinate", "Superior", "Sworn Brother", "Contractor", "Guild Member", "Allies".
   - STRICT PROHIBITION: NEVER use generic labels like "Connected", "Related", "Known", or "Associate".
   - Capture temporal changes in relationships (e.g. "Stranger" -> "Rival" -> "Ally" -> "Love Interest").
6. "statuses":
   - Allowed values: "Alive", "Deceased", "Imprisoned", "MIA", "Unknown".
   - If character dies mid-story at Chapter 110, create:
     * status: "Alive", validFrom: introducedAtChapter, validUntil: 110
     * status: "Deceased", validFrom: 110, validUntil: null
7. "isSensitive" guidelines:
   - true: Plot twists, deaths, betrayals, secret family relations, secret identities, major endgame power-ups.
   - false: Publicly known facts from their debut, initial rank, starting guild, general status.
8. OUTPUT FORMAT: Return ONLY valid JSON with no markdown fences, matching:
{
  "introducedAtChapter": <number>,
  "descriptions": [{ "text": "<string>", "validFrom": <number>, "validUntil": <number|null>, "isSensitive": <boolean> }],
  "statuses": [{ "status": "<string>", "validFrom": <number>, "validUntil": <number|null>, "isSensitive": <boolean> }],
  "relationships": [{ "targetName": "<string>", "relationType": "<string>", "validFrom": <number>, "validUntil": <number|null>, "isSensitive": <boolean> }],
  "factions": [{ "factionName": "<string>", "validFrom": <number>, "validUntil": <number|null>, "isSensitive": <boolean> }]
}`;

/**
 * Normalizes any schema variations returned by LLM into strict GeminiParsedCharacter format.
 */
export function normalizeGeminiOutput(raw: any, totalChapters: number): GeminiParsedCharacter {
  const introducedAtChapter = Math.max(
    1,
    Number.isInteger(raw.introducedAtChapter) ? raw.introducedAtChapter : 1
  );

  const rawDescriptions = Array.isArray(raw.descriptions) ? raw.descriptions : [];
  const descriptions = rawDescriptions.map((d: any, idx: number) => {
    const text = String(d.text || d.description || d.content || `Character arc ${idx + 1}`).trim();
    let validFrom = Number.isInteger(d.validFrom) ? Math.max(1, d.validFrom) : introducedAtChapter;
    let validUntil = Number.isInteger(d.validUntil) ? d.validUntil : null;
    if (validUntil !== null && validUntil <= validFrom) {
      validUntil = validFrom + 20;
    }
    return {
      text,
      validFrom,
      validUntil,
      isSensitive: typeof d.isSensitive === "boolean" ? d.isSensitive : validFrom > introducedAtChapter + 20,
    };
  });

  // Ensure at least one description exists
  if (descriptions.length === 0) {
    descriptions.push({
      text: "Debuted in the series.",
      validFrom: introducedAtChapter,
      validUntil: null,
      isSensitive: false,
    });
  }

  const rawStatuses = Array.isArray(raw.statuses) ? raw.statuses : [];
  const statuses = rawStatuses.map((s: any) => {
    let status = String(s.status || "Alive").trim();
    if (!["Alive", "Deceased", "Imprisoned", "MIA", "Unknown"].includes(status)) {
      status = "Alive";
    }
    let validFrom = Number.isInteger(s.validFrom) ? Math.max(1, s.validFrom) : introducedAtChapter;
    let validUntil = Number.isInteger(s.validUntil) ? s.validUntil : null;
    if (validUntil !== null && validUntil <= validFrom) {
      validUntil = null;
    }
    return {
      status,
      validFrom,
      validUntil,
      isSensitive: typeof s.isSensitive === "boolean" ? s.isSensitive : status !== "Alive",
    };
  });

  if (statuses.length === 0) {
    statuses.push({
      status: "Alive",
      validFrom: introducedAtChapter,
      validUntil: null,
      isSensitive: false,
    });
  }

  const rawRelationships = Array.isArray(raw.relationships) ? raw.relationships : [];
  const relationships = rawRelationships
    .map((r: any) => {
      const targetName = String(r.targetName || r.name || r.character || r.relatedCharacter || "").trim();
      let relationType = String(r.relationType || r.type || r.relation || "Ally").trim();
      if (relationType.toLowerCase() === "connected" || relationType.toLowerCase() === "related") {
        relationType = "Ally";
      }
      let validFrom = Number.isInteger(r.validFrom) ? Math.max(1, r.validFrom) : introducedAtChapter;
      let validUntil = Number.isInteger(r.validUntil) ? r.validUntil : null;
      if (validUntil !== null && validUntil <= validFrom) {
        validUntil = null;
      }
      return {
        targetName,
        relationType,
        validFrom,
        validUntil,
        isSensitive: typeof r.isSensitive === "boolean" ? r.isSensitive : false,
      };
    })
    .filter((r: any) => r.targetName.length > 0);

  const rawFactions = Array.isArray(raw.factions) ? raw.factions : [];
  const factions = rawFactions
    .map((f: any) => {
      const factionName = String(f.factionName || f.name || f.faction || "").trim();
      let validFrom = Number.isInteger(f.validFrom) ? Math.max(1, f.validFrom) : introducedAtChapter;
      let validUntil = Number.isInteger(f.validUntil) ? f.validUntil : null;
      if (validUntil !== null && validUntil <= validFrom) {
        validUntil = null;
      }
      return {
        factionName,
        validFrom,
        validUntil,
        isSensitive: typeof f.isSensitive === "boolean" ? f.isSensitive : false,
      };
    })
    .filter((f: any) => f.factionName.length > 0);

  return {
    introducedAtChapter,
    descriptions,
    statuses,
    relationships,
    factions,
  };
}

export async function parseCharacterWithGroq(
  wikitext: string,
  characterName: string,
  chapterNumberingSource: string,
  totalChapters: number,
): Promise<GeminiParsedCharacter> {
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey) throw new Error("GROQ_API_KEY not set");

  const groqModel = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  console.log(`[Groq-Fallback] Memproses ${characterName} menggunakan ${groqModel}...`);

  // Compact wikitext for Groq to stay within TPM rate limits
  const compactWikitext = wikitext.length > 3500 ? wikitext.slice(0, 3500) + "\n...(truncated for context)" : wikitext;

  const userPrompt = `Character: ${characterName}
Chapter numbering system: ${chapterNumberingSource}
Total chapters in series: ${totalChapters}

Raw wikitext:
${compactWikitext}`;

  // Retry up to 3 times if rate limited (429)
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: groqModel,
        messages: [
          { role: "system", content: SYSTEM_INSTRUCTION },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });

    if (response.status === 429) {
      const errJson = await response.json().catch(() => ({}));
      const waitMatch = errJson?.error?.message?.match(/in (\d+(?:\.\d+)?s)/);
      const waitSec = waitMatch ? Math.ceil(parseFloat(waitMatch[1])) + 2 : 15;
      console.log(`[Groq-RateLimit] TPM terlewati. Menunggu ${waitSec} detik sebelum retry (attempt ${attempt}/3)...`);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      continue;
    }

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq API error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    const normalized = normalizeGeminiOutput(parsed, totalChapters);
    console.log(`[Groq-Fallback] Berhasil: ${characterName} (${normalized.descriptions.length} desc phases, ${normalized.relationships.length} relations)`);
    return normalized;
  }

  throw new Error(`Groq rate limit terus terjadi untuk ${characterName}`);
}

export async function parseCharacterWikitext(
  wikitext: string,
  characterName: string,
  chapterNumberingSource: string,
  totalChapters: number,
): Promise<GeminiParsedCharacter> {
  const apiKey = process.env.GEMINI_API_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;

  if (!apiKey && !groqApiKey) {
    throw new Error("Neither GEMINI_API_KEY nor GROQ_API_KEY is configured");
  }

  const models = getGeminiModels();
  const userPrompt = `Character: ${characterName}
Chapter numbering system: ${chapterNumberingSource}
Total chapters in series: ${totalChapters}

Raw wikitext:
${wikitext}`;

  let geminiFailed = false;
  let lastError: unknown;

  if (apiKey) {
    const ai = new GoogleGenAI({ apiKey });
    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          console.log(`[Gemini] Ekstraksi untuk ${characterName} dengan ${model} (attempt ${attempt})...`);
          const response = await ai.models.generateContent({
            model,
            contents: userPrompt,
            config: {
              systemInstruction: SYSTEM_INSTRUCTION,
              temperature: 0.2,
            },
          });

          const text = response.text?.trim() ?? "";
          const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
          const parsed = JSON.parse(cleaned);
          const normalized = normalizeGeminiOutput(parsed, totalChapters);
          console.log(`[Gemini] Berhasil: ${characterName} (${normalized.descriptions.length} desc phases, ${normalized.relationships.length} relations)`);
          return normalized;
        } catch (err: any) {
          console.warn(`[Gemini] Model ${model} attempt ${attempt} gagal: ${err.message || String(err)}`);
          lastError = err;
          // If quota rate limit (429), break early to Groq fallback
          if (err?.message?.includes("429") || err?.message?.includes("RESOURCE_EXHAUSTED") || String(err).includes("429")) {
            console.log(`[Gemini-Quota] Kuota Gemini habis (429). Langsung beralih ke Groq fallback...`);
            geminiFailed = true;
            break;
          }
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 1500));
          }
        }
      }
      if (geminiFailed) break;
    }
  } else {
    geminiFailed = true;
  }

  // Fallback to Groq if Gemini failed or quota exceeded
  if (groqApiKey) {
    console.log(`[LLM-Fallback] Mengalihkan ke Groq (${process.env.GROQ_MODEL || "openai/gpt-oss-120b"})...`);
    try {
      return await parseCharacterWithGroq(wikitext, characterName, chapterNumberingSource, totalChapters);
    } catch (groqErr: any) {
      console.error(`[Groq-Fallback] Gagal memproses dengan Groq: ${groqErr.message}`);
      throw groqErr;
    }
  }

  throw new Error(`Semua provider LLM (Gemini & Groq) gagal. Error terakhir: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}
