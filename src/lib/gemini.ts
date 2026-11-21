/**
 * Gemini API structured parsing.
 * PRD 4.C step 3: parse raw wikitext → structured character data JSON.
 *
 * Uses @google/genai SDK.
 */

import { GoogleGenAI, Type } from "@google/genai";

// Model default list prioritizing active high-throughput models in 2026
export function getGeminiModels(): string[] {
  const envModel = process.env.GEMINI_MODEL || "gemini-3.5-flash,gemini-3.5-flash-lite,gemini-flash-lite-latest,gemini-3.1-flash-lite,gemini-3-flash-preview";
  return envModel
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

// Groq model chain: comma-separated in GROQ_MODEL, tried in order.
// If the first model is decommissioned / errors, the next one is attempted.
export function getGroqModels(): string[] {
  const envModel = process.env.GROQ_MODEL || "openai/gpt-oss-120b,llama-3.3-70b-versatile";
  return envModel
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

// Gemma models via Gemini API (Order 4 fallback, using same GEMINI_API_KEY).
// Automatically strips "gemini/" or "models/" prefixes if present.
export function getGemmaModels(): string[] {
  const envModel = process.env.GEMMA_MODEL || "gemini/gemma-4-31b-it, gemini/gemma-4-26b-a4b-it";
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
8. OUTPUT FORMAT: Return ONLY valid JSON matching the provided schema.`;

/**
 * Gemini native responseJsonSchema for GeminiParsedCharacter.
 * Guarantees valid JSON output matching the interface without markdown fence stripping.
 */
const GEMINI_CHARACTER_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    introducedAtChapter: {
      type: Type.INTEGER,
      description: "First chapter where this character appears. Must be >= 1.",
    },
    descriptions: {
      type: Type.ARRAY,
      description: "3-8 chronological description phases capturing the character's story arc evolution.",
      items: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING, description: "1-3 sentence description of this story phase." },
          validFrom: { type: Type.INTEGER, description: "Chapter number where this phase starts." },
          validUntil: { type: Type.INTEGER, description: "Exclusive upper bound chapter. Omit or set 0 for ongoing." },
          isSensitive: { type: Type.BOOLEAN, description: "True if this reveals plot twists, deaths, or major spoilers." },
        },
        required: ["text", "validFrom", "isSensitive"],
        propertyOrdering: ["text", "validFrom", "validUntil", "isSensitive"],
      },
    },
    statuses: {
      type: Type.ARRAY,
      description: "Character life statuses across chapters.",
      items: {
        type: Type.OBJECT,
        properties: {
          status: { type: Type.STRING, description: "One of: Alive, Deceased, Imprisoned, MIA, Unknown." },
          validFrom: { type: Type.INTEGER },
          validUntil: { type: Type.INTEGER, description: "Exclusive upper bound. Omit or set 0 for ongoing." },
          isSensitive: { type: Type.BOOLEAN },
        },
        required: ["status", "validFrom", "isSensitive"],
        propertyOrdering: ["status", "validFrom", "validUntil", "isSensitive"],
      },
    },
    relationships: {
      type: Type.ARRAY,
      description: "Lore-accurate relationships with other characters, with temporal bounds.",
      items: {
        type: Type.OBJECT,
        properties: {
          targetName: { type: Type.STRING, description: "Full name of the related character." },
          relationType: { type: Type.STRING, description: "Specific relationship type (Enemy, Rival, Partner, Friend, etc.)." },
          validFrom: { type: Type.INTEGER },
          validUntil: { type: Type.INTEGER, description: "Exclusive upper bound. Omit or set 0 for ongoing." },
          isSensitive: { type: Type.BOOLEAN },
        },
        required: ["targetName", "relationType", "validFrom", "isSensitive"],
        propertyOrdering: ["targetName", "relationType", "validFrom", "validUntil", "isSensitive"],
      },
    },
    factions: {
      type: Type.ARRAY,
      description: "Guilds, organizations, or factions the character belongs to.",
      items: {
        type: Type.OBJECT,
        properties: {
          factionName: { type: Type.STRING, description: "Name of the faction or guild." },
          validFrom: { type: Type.INTEGER },
          validUntil: { type: Type.INTEGER, description: "Exclusive upper bound. Omit or set 0 for ongoing." },
          isSensitive: { type: Type.BOOLEAN },
        },
        required: ["factionName", "validFrom", "isSensitive"],
        propertyOrdering: ["factionName", "validFrom", "validUntil", "isSensitive"],
      },
    },
  },
  required: ["introducedAtChapter", "descriptions", "statuses", "relationships", "factions"],
  propertyOrdering: ["introducedAtChapter", "descriptions", "statuses", "relationships", "factions"],
} as const;

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
    let validUntil = Number.isInteger(d.validUntil) && d.validUntil > 0 ? d.validUntil : null;
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
    let validUntil = Number.isInteger(s.validUntil) && s.validUntil > 0 ? s.validUntil : null;
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
      let validUntil = Number.isInteger(r.validUntil) && r.validUntil > 0 ? r.validUntil : null;
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
      let validUntil = Number.isInteger(f.validUntil) && f.validUntil > 0 ? f.validUntil : null;
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

  const groqModels = getGroqModels();

  // Compact wikitext for Groq to stay within TPM rate limits
  const compactWikitext = wikitext.length > 3500 ? wikitext.slice(0, 3500) + "\n...(truncated for context)" : wikitext;

  const userPrompt = `Character: ${characterName}
Chapter numbering system: ${chapterNumberingSource}
Total chapters in series: ${totalChapters}

Raw wikitext:
${compactWikitext}`;

  let lastModelError: unknown = null;

  for (const groqModel of groqModels) {
    console.log(`[Groq-Fallback] Memproses ${characterName} menggunakan ${groqModel}...`);

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
        console.log(`[Groq-RateLimit] TPM terlewati. Menunggu ${waitSec} detik sebelum retry (${groqModel} attempt ${attempt}/3)...`);
        await new Promise((r) => setTimeout(r, waitSec * 1000));
        continue;
      }

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[Groq-Fallback] Model ${groqModel} gagal (${response.status}). Beralih ke model berikutnya...`);
        lastModelError = new Error(`Groq API error (${response.status}) on ${groqModel}: ${errText}`);
        break; // non-429 error (e.g. model decommissioned) → try next model
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "{}";
      const parsed = JSON.parse(content);
      const normalized = normalizeGeminiOutput(parsed, totalChapters);
      console.log(`[Groq-Fallback] Berhasil: ${characterName} (${normalized.descriptions.length} desc phases, ${normalized.relationships.length} relations)`);
      return normalized;
    }
  }

  throw new Error(`Semua model Groq gagal untuk ${characterName}. Error terakhir: ${lastModelError instanceof Error ? lastModelError.message : String(lastModelError)}`);
}

/**
 * Pemanggilan Google GenAI SDK (Gemini & Gemma).
 * Digunakan untuk order 1 (Gemini utama) dan order 4 (Gemini Gemma).
 */
async function parseWithGoogleGenAI(
  ai: GoogleGenAI,
  models: string[],
  characterName: string,
  userPrompt: string,
  totalChapters: number,
  label: string,
): Promise<GeminiParsedCharacter> {
  let lastErr: unknown = null;
  for (let i = 0; i < models.length; i++) {
    const rawModel = models[i];
    const model = rawModel.replace(/^(gemini\/|models\/)/, "");
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[${label}] Ekstraksi untuk ${characterName} dengan ${model} (attempt ${attempt})...`);
        const response = await ai.models.generateContent({
          model,
          contents: userPrompt,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            temperature: 0.2,
            responseMimeType: "application/json",
            responseJsonSchema: GEMINI_CHARACTER_SCHEMA,
          },
        });

        const text = response.text?.trim() ?? "";
        const parsed = JSON.parse(text);
        const normalized = normalizeGeminiOutput(parsed, totalChapters);
        console.log(`[${label}] Berhasil: ${characterName} (${normalized.descriptions.length} desc phases, ${normalized.relationships.length} relations)`);
        return normalized;
      } catch (err: any) {
        console.warn(`[${label}] Model ${model} attempt ${attempt} gagal: ${err.message || String(err)}`);
        lastErr = err;
        if (err?.message?.includes("429") || err?.message?.includes("RESOURCE_EXHAUSTED") || String(err).includes("429")) {
          console.log(`[${label}-Quota] Model ${model} kena 429. Lanjut ke model berikut...`);
          await new Promise((r) => setTimeout(r, 2000));
          break;
        }
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    }
  }
  throw new Error(`Semua model ${label} gagal untuk ${characterName}. Error terakhir: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

/**
 * Pemanggilan OpenRouter dengan rantai model (Order 3).
 */
async function parseWithOpenRouter(
  models: string[],
  apiKey: string,
  characterName: string,
  userPrompt: string,
  totalChapters: number,
): Promise<GeminiParsedCharacter> {
  for (const model of models) {
    console.log(`[OpenRouter-Fallback] Memproses ${characterName} menggunakan ${model}...`);
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_INSTRUCTION },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`[OpenRouter-Fallback] Model ${model} gagal (${response.status}). Beralih ke model berikutnya...`);
      continue;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(content);
    const normalized = normalizeGeminiOutput(parsed, totalChapters);
    console.log(`[OpenRouter-Fallback] Berhasil: ${characterName} (${normalized.descriptions.length} desc phases, ${normalized.relationships.length} relations)`);
    return normalized;
  }

  throw new Error(`Semua model OpenRouter gagal untuk ${characterName}.`);
}

export async function parseCharacterWikitext(
  wikitext: string,
  characterName: string,
  chapterNumberingSource: string,
  totalChapters: number,
): Promise<GeminiParsedCharacter> {
  const apiKey = process.env.GEMINI_API_KEY;
  const groqApiKey = process.env.GROQ_API_KEY;
  const openrouterApiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey && !groqApiKey && !openrouterApiKey) {
    throw new Error("Neither GEMINI_API_KEY nor GROQ_API_KEY nor OPENROUTER_API_KEY is configured");
  }

  const userPrompt = `Character: ${characterName}
Chapter numbering system: ${chapterNumberingSource}
Total chapters in series: ${totalChapters}

Raw wikitext:
${wikitext}`;

  let lastError: unknown;
  const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

  // 1. Order 1: Primary Gemini models via GEMINI_API_KEY
  if (ai) {
    const models = getGeminiModels();
    try {
      return await parseWithGoogleGenAI(ai, models, characterName, userPrompt, totalChapters, "Gemini");
    } catch (err: any) {
      console.warn(`[Gemini] Semua model Gemini utama gagal. Beralih ke fallback...`);
      lastError = err;
    }
  }

  // 2. Order 2: Groq model chain via GROQ_API_KEY
  if (groqApiKey) {
    const groqModels = getGroqModels();
    console.log(`[LLM-Fallback] Mengalihkan ke Groq (${groqModels.join(" -> ")})...`);
    try {
      return await parseCharacterWithGroq(wikitext, characterName, chapterNumberingSource, totalChapters);
    } catch (groqErr: any) {
      console.warn(`[Groq-Fallback] Gagal memproses dengan Groq: ${groqErr.message}`);
      lastError = groqErr;
    }
  }

  // 3. Order 3: OpenRouter model chain via OPENROUTER_API_KEY
  if (openrouterApiKey) {
    const openrouterModels = (process.env.OPENROUTER_MODEL || "openrouter/free")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
    console.log(`[LLM-Fallback] Mengalihkan ke OpenRouter (${openrouterModels.join(" -> ")})...`);
    try {
      return await parseWithOpenRouter(openrouterModels, openrouterApiKey, characterName, userPrompt, totalChapters);
    } catch (openrouterErr: any) {
      console.warn(`[OpenRouter-Fallback] Gagal memproses dengan OpenRouter: ${openrouterErr.message}`);
      lastError = openrouterErr;
    }
  }

  // 4. Order 4: Gemini Gemma models via GEMINI_API_KEY (same Gemini API key).
  // Only valid as order 4 — skip if orders 2/3 were never configured,
  // otherwise Gemma silently becomes the de-facto first fallback.
  if (ai && groqApiKey && openrouterApiKey) {
    const gemmaModels = getGemmaModels();
    console.log(`[LLM-Fallback] Mengalihkan ke Gemini Gemma (${gemmaModels.join(" -> ")})...`);
    try {
      return await parseWithGoogleGenAI(ai, gemmaModels, characterName, userPrompt, totalChapters, "Gemini-Gemma");
    } catch (gemmaErr: any) {
      console.warn(`[Gemma-Fallback] Gagal memproses dengan Gemini Gemma: ${gemmaErr.message}`);
      lastError = gemmaErr;
    }
  } else if (ai && (!groqApiKey || !openrouterApiKey)) {
    console.warn(`[LLM-Fallback] Gemma (order 4) dilewati: GROQ_API_KEY / OPENROUTER_API_KEY belum terkonfigurasi di process ini. Restart server/daemon setelah mengisi .env.`);
  }

  throw new Error(`Semua provider LLM (1. Gemini, 2. Groq, 3. OpenRouter, 4. Gemini Gemma) gagal. Error terakhir: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}
